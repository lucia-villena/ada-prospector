// Netlify Function: /api/transcribe  (OPCIONAL)
// Transcribe audios subidos o grabados. La API de Anthropic no transcribe audio, asi que esto usa un
// servicio de transcripcion aparte y solo se activa si en Netlify existe la variable OPENAI_API_KEY.
// Sin esa variable la herramienta funciona igual: el dictado en vivo del navegador no la necesita.
import { timingSafeEqual } from "node:crypto";

export const config = { path: "/api/transcribe" };

const MAX_BYTES = 4_500_000;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

function autorizado(req) {
  const codes = (process.env.ACCESS_CODES || process.env.ACCESS_CODE || "").split(",").map((s) => s.trim()).filter(Boolean);
  const recibido = Buffer.from(req.headers.get("x-ada-code") || "");
  return codes.some((c) => {
    const b = Buffer.from(c);
    return b.length === recibido.length && timingSafeEqual(b, recibido);
  });
}

async function pedir(modelo, file, key) {
  const fd = new FormData();
  fd.append("file", file, file.name || "audio.webm");
  fd.append("model", modelo);
  fd.append("language", "es");
  fd.append("response_format", "json");
  return fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: fd,
  });
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "metodo" }, 405);
  if (!autorizado(req)) return json({ error: "auth", message: "Código incorrecto." }, 401);

  const key = process.env.OPENAI_API_KEY;
  if (!key) return json({ error: "no_configurado", message: "La transcripción de audios no está activada." }, 501);

  let file;
  try {
    const form = await req.formData();
    file = form.get("audio");
  } catch {
    return json({ error: "pedido", message: "No pude leer el audio." }, 400);
  }
  if (!file || typeof file === "string") return json({ error: "pedido", message: "Falta el audio." }, 400);
  if (file.size > MAX_BYTES) return json({ error: "tamano", message: "El audio pesa demasiado (máximo 4,5 MB)." }, 413);
  if (file.type && !file.type.startsWith("audio/") && !file.type.startsWith("video/")) return json({ error: "tipo", message: "El archivo no es un audio." }, 400);

  try {
    const modelo = process.env.TRANSCRIBE_MODEL || "gpt-4o-transcribe";
    let r = await pedir(modelo, file, key);
    if (r.status === 400 || r.status === 404) r = await pedir("whisper-1", file, key); // por si el modelo elegido no existe
    if (!r.ok) return json({ error: "servicio", message: "No pude transcribir el audio. Probá de nuevo." }, 502);
    const data = await r.json();
    const text = String(data?.text || "").trim();
    if (!text) return json({ error: "vacio", message: "No se entendió nada en el audio." }, 422);
    return json({ text });
  } catch {
    return json({ error: "servicio", message: "No pude transcribir el audio. Probá de nuevo." }, 502);
  }
};
