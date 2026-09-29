// Validacion y saneamiento del pedido que llega del navegador.
// Solo se aceptan los tipos de bloque conocidos: el cliente nunca decide la forma del pedido a la API.

export const LIMITS = {
  maxMessages: 60,
  maxBlocksPerMessage: 14,
  maxTextChars: 150_000,
  maxTotalTextChars: 1_200_000,
  maxImageB64: 3_000_000,
  maxPdfB64: 4_500_000,
  maxTotalB64: 5_000_000,
};

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const B64 = /^[A-Za-z0-9+/=]+$/;

const PERFIL_KEYS = ["nombre", "etapa", "experiencia", "objetivo", "tipo_cliente", "capacidad", "ticket", "horas", "clientes", "notas"];
const CANALES = new Set(["P2P", "Redes", "Presencial", "Prospección en frío"]);
const SIM_KEYS = ["tipo", "dificultad", "canal", "objetivo"];

const clip = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export function sanitizePerfil(p) {
  const out = {};
  if (!p || typeof p !== "object") return out;
  for (const k of PERFIL_KEYS) {
    const v = clip(p[k], k === "notas" ? 400 : 200);
    if (v) out[k] = v;
  }
  if (Array.isArray(p.canales)) {
    const c = p.canales.filter((x) => CANALES.has(x));
    if (c.length) out.canales = c;
  }
  return out;
}

export function sanitizeMemoria(m) {
  if (!Array.isArray(m)) return [];
  return m
    .slice(0, 30)
    .map((x) => clip(typeof x === "string" ? x : x?.t, 200))
    .filter(Boolean);
}

export function sanitizeSim(s) {
  if (!s || typeof s !== "object") return null;
  const out = {};
  for (const k of SIM_KEYS) {
    const v = clip(s[k], 120);
    if (v) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

// Devuelve { error } o { messages } (formato de la API de Anthropic).
export function sanitizeMessages(input) {
  if (!Array.isArray(input) || input.length === 0) return { error: "Faltan los mensajes." };
  if (input.length > LIMITS.maxMessages) return { error: "La conversación es demasiado larga. Empezá una nueva." };
  if (input[input.length - 1]?.role !== "user") return { error: "El último mensaje tiene que ser del alumno." };

  let totalText = 0;
  let totalB64 = 0;
  const out = [];

  for (const msg of input) {
    if (msg?.role !== "user" && msg?.role !== "assistant") return { error: "Mensaje inválido." };
    const blocks = Array.isArray(msg.content) ? msg.content : [];
    if (blocks.length > LIMITS.maxBlocksPerMessage) return { error: "Demasiados adjuntos en un mismo mensaje." };
    const content = [];

    for (const b of blocks) {
      if (b?.type === "text") {
        const text = typeof b.text === "string" ? b.text : "";
        if (!text.trim()) continue;
        if (text.length > LIMITS.maxTextChars) return { error: "Un texto adjunto es demasiado largo. Mandalo por tramos." };
        totalText += text.length;
        content.push({ type: "text", text });
      } else if (msg.role === "user" && b?.type === "image") {
        if (!IMAGE_TYPES.has(b.media) || typeof b.data !== "string" || !B64.test(b.data)) return { error: "Imagen inválida." };
        if (b.data.length > LIMITS.maxImageB64) return { error: "Una imagen es demasiado pesada." };
        totalB64 += b.data.length;
        content.push({ type: "image", source: { type: "base64", media_type: b.media, data: b.data } });
      } else if (msg.role === "user" && b?.type === "pdf") {
        if (typeof b.data !== "string" || !B64.test(b.data)) return { error: "PDF inválido." };
        if (b.data.length > LIMITS.maxPdfB64) return { error: "El PDF es demasiado pesado." };
        totalB64 += b.data.length;
        content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b.data } });
      } else {
        return { error: "Tipo de contenido no permitido." };
      }
    }

    if (content.length === 0) content.push({ type: "text", text: "(sin texto)" });
    out.push({ role: msg.role, content });
  }

  if (totalText > LIMITS.maxTotalTextChars) return { error: "Hay demasiado texto en la conversación. Empezá una nueva o mandá menos." };
  if (totalB64 > LIMITS.maxTotalB64) return { error: "Los adjuntos pesan demasiado en total." };
  return { messages: out };
}

export function sanitizeRequest(body) {
  if (!body || typeof body !== "object") return { error: "Pedido inválido." };
  const m = sanitizeMessages(body.messages);
  if (m.error) return { error: m.error };
  return {
    value: {
      mode: typeof body.mode === "string" ? body.mode : "libre",
      evaluar: body.evaluar === true,
      perfil: sanitizePerfil(body.perfil),
      memoria: sanitizeMemoria(body.memoria),
      sim: sanitizeSim(body.sim),
      messages: m.messages,
    },
  };
}
