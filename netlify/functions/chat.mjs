// Netlify Function: /api/chat
// Navegador -> esta funcion -> API de Anthropic -> respuesta por SSE.
// La ANTHROPIC_API_KEY vive solo como variable de entorno de Netlify. No se guarda ni se registra contenido de las conversaciones.
import Anthropic from "@anthropic-ai/sdk";
import { timingSafeEqual } from "node:crypto";
import { sanitizeRequest } from "./lib/validate.mjs";
import { buildSystem, buildVerifierSystem, modeConfig } from "./lib/prompt.mjs";
import { runPipeline } from "./lib/pipeline.mjs";
import { registrarUso } from "./lib/quota.mjs";
import { BUILT_AT } from "./lib/knowledge.generated.mjs";

export const config = { path: "/api/chat" };

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

function codigosValidos() {
  return (process.env.ACCESS_CODES || process.env.ACCESS_CODE || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function igual(a, b) {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  return A.length === B.length && timingSafeEqual(A, B);
}

function autorizar(req) {
  const codes = codigosValidos();
  if (!codes.length) return { status: "sin_config" };
  const recibido = req.headers.get("x-ada-code") || "";
  const match = codes.find((c) => igual(c, recibido));
  return match ? { status: "ok", code: match } : { status: "no" };
}

function describirError(e) {
  const status = e?.status;
  if (e?.name === "APIUserAbortError" || /deadline|abort/i.test(String(e?.message || ""))) {
    return { code: "timeout", message: "La respuesta tardó demasiado. Probá con un pedido más corto o mandame menos material de una vez." };
  }
  if (status === 401 || status === 403) return { code: "config", message: "La clave de Anthropic no es válida. Avisale a quien administra la herramienta." };
  if (status === 429) return { code: "demanda", message: "Hay mucha demanda ahora. Probá de nuevo en un minuto." };
  if (status === 529 || (status >= 500 && status < 600)) return { code: "servicio", message: "El servicio de IA no responde en este momento. Probá de nuevo en un rato." };
  if (status === 400) return { code: "pedido", message: "No pude procesar el pedido. Probá con menos adjuntos o un texto más corto." };
  return { code: "error", message: "Algo salió mal. Probá de nuevo." };
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "metodo" }, 405);

  const auth = autorizar(req);
  if (auth.status === "sin_config") return json({ error: "config", message: "Falta configurar el código de acceso (ACCESS_CODES) en Netlify." }, 503);
  if (auth.status === "no") return json({ error: "auth", message: "Código incorrecto." }, 401);

  let raw;
  try {
    raw = await req.text();
  } catch {
    return json({ error: "lectura", message: "No pude leer el pedido." }, 400);
  }
  if (raw.length > 6_500_000) return json({ error: "tamano", message: "El pedido es demasiado grande. Mandá menos archivos." }, 413);

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "json", message: "Pedido inválido." }, 400);
  }

  if (body?.ping) return json({ ok: true, transcripcion: !!process.env.OPENAI_API_KEY, version: BUILT_AT });

  if (!process.env.ANTHROPIC_API_KEY) return json({ error: "config", message: "Falta ANTHROPIC_API_KEY en Netlify." }, 503);

  const s = sanitizeRequest(body);
  if (s.error) return json({ error: "pedido", message: s.error }, 400);
  const v = s.value;

  const limiteDiario = Number(process.env.DAILY_LIMIT) || 40;
  const uso = await registrarUso(auth.code, limiteDiario);
  if (!uso.ok) {
    return json(
      { error: "limite", message: `Este código ya usó sus ${limiteDiario} consultas de hoy. Probá mañana, o avisale a quien administra la herramienta si necesitás más.` },
      429,
    );
  }

  const cfg = modeConfig(v.mode, v.evaluar);
  const system = buildSystem({ mode: cfg.id, evaluar: v.evaluar, perfil: v.perfil, memoria: v.memoria, sim: v.sim });
  const verifierSystem = cfg.verificar ? buildVerifierSystem(cfg.id) : null;
  const client = new Anthropic({ maxRetries: 1 });
  const enc = new TextEncoder();
  const budgetMs = Number(process.env.PIPELINE_BUDGET_MS) || 55000;

  const stream = new ReadableStream({
    async start(controller) {
      let cerrado = false;
      const emit = (o) => {
        if (cerrado) return;
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`));
        } catch {
          cerrado = true;
        }
      };
      const latido = setInterval(() => {
        try {
          controller.enqueue(enc.encode(": ka\n\n"));
        } catch {
          /* cliente desconectado */
        }
      }, 10000);

      try {
        const r = await runPipeline({
          client,
          system,
          verifierSystem,
          ctx: { mode: cfg.id, perfil: v.perfil, memoria: v.memoria, sim: v.sim, messages: v.messages },
          verificar: cfg.verificar,
          esfuerzo: cfg.esfuerzo,
          maxTokens: cfg.maxTokens,
          emit,
          signal: req.signal,
          budgetMs,
        });
        emit({ t: "done" });
        // Solo metricas: nunca el contenido de la conversacion.
        console.log(JSON.stringify({ evt: "chat", mode: cfg.id, control: r.control, usage: r.usage }));
      } catch (e) {
        emit({ t: "error", ...describirError(e) });
        console.error(JSON.stringify({ evt: "chat_error", mode: cfg.id, status: e?.status, name: e?.name, msg: String(e?.message || "").slice(0, 200) }));
      } finally {
        clearInterval(latido);
        cerrado = true;
        try {
          controller.close();
        } catch {
          /* ya cerrado */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
    },
  });
};
