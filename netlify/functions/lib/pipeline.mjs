// Orquestador de la respuesta: borrador -> control de calidad -> (correccion) -> respuesta.
// No importa el SDK: recibe el cliente por parametro (asi se puede probar con un cliente falso).
//
// Eventos que emite (todos objetos simples, el handler los convierte a SSE):
//   {t:'fase', d:'leyendo'|'redactando'|'verificando'|'ajustando'}
//   {t:'text', d:'...'}          texto de la respuesta (ya validada)
//   {t:'meta', control, ms, truncada}
//   {t:'refusal'}
import { lint } from "./lint.mjs";

export const MODEL_MAIN = "claude-opus-5";
export const MODEL_VERIFY = "claude-sonnet-5";
const BETA_FALLBACK = "server-side-fallback-2026-07-01";
const DEFAULT_MAX_TOKENS = 4000;
const MAX_VERIFY_CHARS = 400_000;

const fallbackRejected = (e) => !!e && e.status === 400 && /fallback|beta/i.test(String(e.message || ""));
const sleep0 = () => new Promise((r) => setTimeout(r, 0));

// ---- Llamada con streaming (con fallbacks de rechazo por defecto; si la API los rechaza, reintenta sin ellos)
async function streamOnce(client, params, cb, withFallbacks) {
  const p = { ...params };
  let stream;
  if (withFallbacks) {
    p.betas = [BETA_FALLBACK];
    p.fallbacks = "default";
    stream = client.beta.messages.stream(p, { signal: cb.signal });
  } else {
    stream = client.messages.stream(p, { signal: cb.signal });
  }
  let text = "";
  for await (const ev of stream) {
    if (ev.type === "content_block_start" && ev.content_block?.type === "thinking") cb.onThinking?.();
    else if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
      text += ev.delta.text;
      cb.onText?.(ev.delta.text);
    }
  }
  const final = await stream.finalMessage();
  return { text, stopReason: final.stop_reason, usage: final.usage };
}

async function runStream(client, params, cb) {
  let emitted = false;
  const wrapped = { ...cb, onText: (d) => { emitted = true; cb.onText?.(d); } };
  try {
    return await streamOnce(client, params, wrapped, true);
  } catch (e) {
    if (!emitted && fallbackRejected(e)) return await streamOnce(client, params, wrapped, false);
    throw e;
  }
}

// ---- Contexto para el verificador
function blocksText(content) {
  return content
    .map((b) => (b.type === "text" ? b.text : b.type === "image" ? "[imagen adjunta]" : b.type === "document" ? "[PDF adjunto]" : ""))
    .filter(Boolean)
    .join("\n");
}

export function contextText({ mode, perfil, memoria, sim, messages }) {
  const lines = [`Modo: ${mode}`];
  lines.push(`Perfil del alumno: ${JSON.stringify(perfil || {})}`);
  lines.push(`Memoria del alumno: ${JSON.stringify(memoria || [])}`);
  if (sim) lines.push(`Configuración de simulación: ${JSON.stringify(sim)}`);
  lines.push("\nConversación hasta ahora (el último mensaje es el del alumno al que responde el borrador):");
  for (const m of messages) lines.push(`[${m.role === "user" ? "alumno" : "mentor"}]\n${blocksText(m.content)}`);
  return lines.join("\n");
}

export function parseVerdict(text) {
  const m = String(text || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const v = JSON.parse(m[0]);
    const problemas = Array.isArray(v.problemas) ? v.problemas.filter((p) => p && typeof p === "object") : [];
    return {
      aprobada: v.aprobada !== false,
      falta_informacion: v.falta_informacion === true,
      problemas: problemas.map((p) => ({
        criterio: String(p.criterio || ""),
        severidad: p.severidad === "bloqueante" ? "bloqueante" : "menor",
        detalle: String(p.detalle || ""),
        correccion: String(p.correccion || ""),
      })),
      preguntas: Array.isArray(v.preguntas) ? v.preguntas.map(String).slice(0, 3) : [],
    };
  } catch {
    return null;
  }
}

async function verificar({ client, verifierSystem, ctx, draft, lintRes, signal }) {
  const last = ctx.messages[ctx.messages.length - 1];
  const media = last.content.filter((b) => b.type === "image" || b.type === "document");
  const hint = lintRes.hard.length || lintRes.style.length
    ? `\nChequeos automáticos: ${[...lintRes.hard, ...lintRes.style].map((x) => x.detalle).join(" ")}`
    : "";
  const content = [
    ...media,
    {
      type: "text",
      text: `<contexto_del_pedido>\n${contextText(ctx)}\n</contexto_del_pedido>\n\n<borrador>\n${draft}\n</borrador>${hint}\n\nDevolvé solo el JSON.`,
    },
  ];
  const res = await client.messages.create(
    {
      model: MODEL_VERIFY,
      max_tokens: 1500,
      thinking: { type: "disabled" },
      system: verifierSystem,
      messages: [{ role: "user", content }],
    },
    { signal },
  );
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return { verdict: parseVerdict(text), usage: res.usage };
}

function instruccionDeRevision(verdict, lintRes) {
  const items = [
    ...(verdict?.problemas || []).filter((p) => p.severidad === "bloqueante").map((p) => `- ${p.detalle}${p.correccion ? ` → ${p.correccion}` : ""}`),
    ...lintRes.hard.map((x) => `- ${x.detalle}`),
  ];
  if (!items.length && lintRes.style.length) items.push(...lintRes.style.map((x) => `- ${x.detalle}`));
  const falta = verdict?.falta_informacion
    ? "\nUsaste como cierto algo que el contexto no respalda. Sacalo o declaralo como supuesto en una línea, y mantené una recomendación concreta: si hace falta un dato, preguntalo al final (una sola pregunta) después de dar la respuesta."
    : "";
  return (
    "[CONTROL DE CALIDAD INTERNO. El alumno no ve este mensaje ni tu borrador anterior.]\n" +
    `Tu borrador tiene estos problemas:\n${items.join("\n")}${falta}\n` +
    "Reescribí la respuesta completa para el alumno corrigiéndolos, con el mismo formato del modo. No menciones este control ni que estás reescribiendo."
  );
}

export function pedirContexto(verdict) {
  const preguntas = verdict?.preguntas?.length ? verdict.preguntas : ["¿Qué le mandaste exactamente y qué te contestó?"];
  return `No tengo suficiente evidencia para darte un consejo firme todavía. Me falta esto:\n\n${preguntas.map((q) => `- ${q}`).join("\n")}\n\nPasámelo y lo vemos.`;
}

async function emitirTexto(emit, text) {
  for (let i = 0, n = 0; i < text.length; i += 80, n++) {
    emit({ t: "text", d: text.slice(i, i + 80) });
    if (n % 8 === 7) await sleep0();
  }
}

const sumUsage = (acc, u) => {
  if (!u) return;
  acc.input += u.input_tokens || 0;
  acc.output += u.output_tokens || 0;
  acc.cache_read += u.cache_read_input_tokens || 0;
  acc.cache_write += u.cache_creation_input_tokens || 0;
};

export async function runPipeline({ client, system, verifierSystem, ctx, verificar: debeVerificar, esfuerzo, maxTokens = DEFAULT_MAX_TOKENS, emit, signal, budgetMs = 55000, now = Date.now }) {
  const t0 = now();
  const left = () => budgetMs - (now() - t0);
  const usage = { input: 0, output: 0, cache_read: 0, cache_write: 0 };
  let fasePuesta = false;
  const fase = (d) => emit({ t: "fase", d });
  fase("leyendo");
  const redactando = () => { if (!fasePuesta) { fasePuesta = true; fase("redactando"); } };

  const ac = new AbortController();
  const onAbort = () => ac.abort(signal.reason);
  if (signal) signal.aborted ? ac.abort() : signal.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => ac.abort(new Error("deadline")), budgetMs);

  const baseParams = {
    model: MODEL_MAIN,
    max_tokens: maxTokens,
    thinking: { type: "adaptive" },
    output_config: { effort: esfuerzo },
    system,
  };

  try {
    const mustVerify = debeVerificar && contextText(ctx).length <= MAX_VERIFY_CHARS;

    // --- Sin verificacion (por ejemplo, el personaje del simulador): se muestra en vivo.
    if (!mustVerify) {
      const r = await runStream(client, { ...baseParams, messages: ctx.messages }, {
        signal: ac.signal,
        onThinking: redactando,
        onText: (d) => { redactando(); emit({ t: "text", d }); },
      });
      sumUsage(usage, r.usage);
      if (r.stopReason === "refusal") emit({ t: "refusal" });
      emit({ t: "meta", control: debeVerificar ? "omitido_por_tamano" : "sin_control", ms: now() - t0, truncada: r.stopReason === "max_tokens" });
      return { control: "sin_control", usage };
    }

    // --- 1. Borrador (no se muestra)
    const draft = await runStream(client, { ...baseParams, messages: ctx.messages }, { signal: ac.signal, onThinking: redactando });
    sumUsage(usage, draft.usage);
    redactando();
    if (draft.stopReason === "refusal") { emit({ t: "refusal" }); emit({ t: "meta", control: "rechazo", ms: now() - t0 }); return { control: "rechazo", usage }; }
    const draftText = draft.text.trim();
    if (!draftText) { emit({ t: "error", code: "vacio", message: "No pude armar una respuesta. Probá reformular." }); return { control: "vacio", usage }; }
    const truncada = draft.stopReason === "max_tokens";

    // --- 2. Control de calidad
    const lastMsg = ctx.messages[ctx.messages.length - 1];
    const evidencia = lastMsg?.role === "user" ? blocksText(lastMsg.content) : "";
    const lintRes = lint(draftText, evidencia);
    let verdict = null;
    if (left() > 14000) {
      fase("verificando");
      // El control tiene su propio limite de tiempo, dentro del presupuesto total.
      const vac = new AbortController();
      const vtimer = setTimeout(() => vac.abort(), Math.max(4000, left() - 6000));
      const relay = () => vac.abort();
      ac.signal.addEventListener("abort", relay, { once: true });
      try {
        const v = await verificar({ client, verifierSystem, ctx, draft: draftText, lintRes, signal: vac.signal });
        verdict = v.verdict;
        sumUsage(usage, v.usage);
      } catch (e) {
        if (ac.signal.aborted) throw e;
        verdict = null; // el control fallo o tardo: no bloquea la respuesta
      } finally {
        clearTimeout(vtimer);
        ac.signal.removeEventListener("abort", relay);
      }
    }

    const bloqueante = !!verdict && (!verdict.aprobada || verdict.problemas.some((p) => p.severidad === "bloqueante"));
    const necesitaRevision = bloqueante || lintRes.requiereRevision;

    // --- 3. Todo bien: se muestra el borrador
    if (!necesitaRevision) {
      await emitirTexto(emit, draftText);
      const control = verdict ? "ok" : "sin_veredicto";
      emit({ t: "meta", control, ms: now() - t0, truncada });
      return { control, usage };
    }

    // --- 4. Correccion (con tiempo) o pedido de contexto (sin tiempo)
    if (left() > 22000) {
      fase("ajustando");
      const messages = [
        ...ctx.messages,
        { role: "assistant", content: [{ type: "text", text: draftText }] },
        { role: "user", content: [{ type: "text", text: instruccionDeRevision(verdict, lintRes) }] },
      ];
      const r = await runStream(client, { ...baseParams, messages }, { signal: ac.signal, onText: (d) => emit({ t: "text", d }) });
      sumUsage(usage, r.usage);
      emit({ t: "meta", control: "ajustada", ms: now() - t0, truncada: r.stopReason === "max_tokens" });
      return { control: "ajustada", usage };
    }
    if (bloqueante && (verdict.falta_informacion || verdict.problemas.some((p) => p.criterio === "invencion" || p.criterio === "especificidad"))) {
      await emitirTexto(emit, pedirContexto(verdict));
      emit({ t: "meta", control: "pedido_de_contexto", ms: now() - t0 });
      return { control: "pedido_de_contexto", usage };
    }
    await emitirTexto(emit, draftText);
    emit({ t: "meta", control: "sin_tiempo_para_ajustar", ms: now() - t0, truncada });
    return { control: "sin_tiempo_para_ajustar", usage };
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener?.("abort", onAbort);
  }
}
