// Cliente de la API. Las llamadas van a las funciones de Netlify: la clave de Anthropic nunca llega al navegador.

export const DEMO = new URLSearchParams(location.search).has("demo");

function headers(code, extra = {}) {
  return { "x-ada-code": code, ...extra };
}

export async function ping(code) {
  if (DEMO) return { status: 200, ok: true, transcripcion: true };
  const r = await fetch("/api/chat", {
    method: "POST",
    headers: headers(code, { "content-type": "application/json" }),
    body: JSON.stringify({ ping: true }),
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ...j };
}

export async function transcribe(code, blob, name) {
  if (DEMO) {
    await new Promise((r) => setTimeout(r, 700));
    return "Le mandé el mensaje a un dueño de una distribuidora y me dejó en visto. No sé si insistir.";
  }
  const fd = new FormData();
  fd.append("audio", blob, name || "audio.webm");
  const r = await fetch("/api/transcribe", { method: "POST", headers: headers(code), body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.message || "No pude transcribir el audio."), { status: r.status });
  return j.text;
}

// Lee la respuesta por SSE y llama onEvent con cada evento del servidor.
export async function streamChat({ code, payload, signal, onEvent }) {
  if (DEMO) return demoStream(payload, signal, onEvent);

  const r = await fetch("/api/chat", {
    method: "POST",
    headers: headers(code, { "content-type": "application/json" }),
    body: JSON.stringify(payload),
    signal,
  });
  if (!r.ok || !r.body) {
    const j = await r.json().catch(() => ({}));
    throw Object.assign(new Error(j.message || "No pude conectar con el servidor."), { status: r.status, code: j.error });
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      try {
        onEvent(JSON.parse(line.slice(6)));
      } catch {
        /* evento mal formado: se ignora */
      }
    }
  }
}

// ---- Modo demo (?demo): simula el servidor para revisar la interfaz sin API key.
const DEMO_TEXT = {
  analizar_conversacion:
    "<resumen>etapa: Propuesta presentada\npaso: Frená la propuesta y volvé a preguntar cómo resguarda hoy la recaudación antes de cotizar de nuevo.</resumen>\n\n**Qué mandarle ahora**\n\n> Marcos, te paso lo básico después. Antes: hoy, cuando entra la recaudación del día, ¿cómo la resguardás?\n\n**Por qué:** vuelve a la necesidad y le da una pregunta que se contesta en una línea.\n\n**Lo que veo**\n\n**Hecho.** Le escribiste el lunes a las 10:14: \"Hola Marcos, te escribo porque manejás una distribuidora y quería contarte cómo trabajo con USDT\". Contestó a las 16:40: \"Pasame info\".\n\n**Hecho.** Tu segundo mensaje tiene siete renglones y cotiza 1,5% antes de preguntarle cómo resuelve hoy.\n\n**Qué necesita el prospecto**\n\n**Inferencia.** \"Pasame info\" puede indicar interés, pero no se puede asegurar: también es una forma corta de sacarse la conversación de encima.\n\n**Hipótesis.** Puede que ya resuelva esto con otra financiera; convendría preguntarlo.\n\n**Qué corregir**\n\n- Vendiste antes de entender. Tu mensaje: \"Trabajo con USDT y cobro 1,5% sobre el total\". Cotizaste sin saber cuánto mueve ni cómo lo resuelve hoy.\n- Mandaste demasiado de golpe: siete renglones a alguien que contestó tres palabras.\n\n<memoria>Tiende a cotizar antes de detectar la necesidad.</memoria>",
  simulador:
    "Escena: sos vos escribiendo por WhatsApp a Marcos, dueño de una distribuidora de gaseosas. Es la primera vez que hablan. Objetivo: detectar la necesidad.\n\nEmpezá vos.",
  default:
    "Contame qué pasó con el prospecto: qué le mandaste y qué te contestó exactamente. Con eso te digo en qué etapa está y qué conviene hacer.",
};

// El demo no llama a ningún modelo, así que el simulador no puede "actuar" de verdad: para que probar varios
// turnos no se vea repetido (mismo texto todo el tiempo), rota entre estas réplicas fijas después de la escena inicial.
// En la app real cada turno lo genera el modelo y responde a lo que escribió el alumno.
const DEMO_SIM_REPLIES = [
  "Hola, ¿quién habla? No tengo este número agendado.",
  "Ah, bueno. ¿Y vos cómo trabajás eso exactamente?",
  "No sé, la verdad, es la primera vez que hablamos y no te conozco de nada.",
  "¿Y cuánto me cobrarías por manejarlo así?",
  "Dejame pensarlo, después te escribo.",
];
const DEMO_SIM_EVAL =
  "**Evaluación de la simulación**\n\n**Qué hiciste bien:** te presentaste y sostuviste el intercambio sin sonar a chatbot.\n\n**Qué corregir:** en algún momento ofreciste el servicio antes de preguntar cómo resuelve hoy la necesidad.\n\n**Para la próxima:** arrancá siempre con una pregunta que detecte el dolor concreto, antes de nombrar el servicio.\n\n*(Esta evaluación es de ejemplo, del modo demo. La real la arma ADA en base a tu conversación completa.)*";

function demoText(payload) {
  if (payload.mode !== "simulador") return DEMO_TEXT[payload.mode] || DEMO_TEXT.default;
  if (payload.evaluar) return DEMO_SIM_EVAL;
  const turno = (payload.messages || []).filter((m) => m.role === "user").length; // 1 = arranque de la escena
  return turno <= 1 ? DEMO_TEXT.simulador : DEMO_SIM_REPLIES[(turno - 2) % DEMO_SIM_REPLIES.length];
}

async function demoStream(payload, signal, onEvent) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const text = demoText(payload);
  onEvent({ t: "fase", d: "leyendo" });
  await wait(700);
  onEvent({ t: "fase", d: "redactando" });
  await wait(700);
  if (payload.mode !== "simulador" || payload.evaluar) {
    onEvent({ t: "fase", d: "verificando" });
    await wait(600);
  }
  for (let i = 0; i < text.length; i += 24) {
    if (signal?.aborted) throw Object.assign(new Error("abort"), { name: "AbortError" });
    onEvent({ t: "text", d: text.slice(i, i + 24) });
    await wait(12);
  }
  onEvent({ t: "meta", control: payload.mode === "simulador" && !payload.evaluar ? "sin_control" : "ok", ms: 2000 });
  onEvent({ t: "done" });
}
