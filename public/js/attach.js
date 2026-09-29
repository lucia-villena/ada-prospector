// Adjuntos: se procesan en el navegador (las imágenes se achican, los chats de WhatsApp se leen y resumen).
// Nada se sube a ningún lado hasta que el alumno envía el mensaje.

export const MAX_ATTACHMENTS = 6;
const MAX_IMG_SIDE = 1568;
const MAX_PIECES = 5;
const MAX_PDF_BYTES = 3_300_000;
const MAX_TEXT_CHARS = 150_000;
const AUDIO_EXT = /\.(opus|ogg|oga|m4a|mp3|wav|aac|webm)$/i;

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
const kb = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

export const isAudio = (f) => f.type.startsWith("audio/") || AUDIO_EXT.test(f.name);

// ---- WhatsApp -------------------------------------------------------------------------------
const WA_RE = /^[‎‏]*\[?(\d{1,2}[/.]\d{1,2}[/.]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[ap]\.?\s?m\.?)?)\]?\s*[-–]?\s*([^:\n]{1,60}?):\s/i;

export function parseWhatsApp(text) {
  const counts = new Map();
  let first = null;
  let last = null;
  let total = 0;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(WA_RE);
    if (!m) continue;
    const name = m[3].trim();
    if (/["“”]/.test(name) || name.split(/\s+/).length > 5) continue; // mensaje del sistema, no un participante
    counts.set(name, (counts.get(name) || 0) + 1);
    total++;
    if (!first) first = `${m[1]} ${m[2]}`;
    last = `${m[1]} ${m[2]}`;
  }
  if (total < 5 || counts.size === 0) return null;
  const participantes = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return {
    total,
    participantes,
    resumen:
      `Chat de WhatsApp exportado. Participantes: ${participantes.map(([n, c]) => `${n} (${c} mensajes)`).join(", ")}. ` +
      `Desde ${first} hasta ${last}. Total: ${total} mensajes. Los archivos multimedia figuran como omitidos.`,
  };
}

// ---- Lectura de archivos ---------------------------------------------------------------------
function readB64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(",")[1] || "");
    fr.onerror = () => reject(new Error("No pude leer el archivo."));
    fr.readAsDataURL(blob);
  });
}

async function loadImage(file) {
  if (window.createImageBitmap) {
    try {
      return await createImageBitmap(file);
    } catch {
      /* se prueba con <img> */
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("No pude leer esa imagen. Probá con una captura en JPG o PNG.")); };
    img.src = url;
  });
}

function canvasToJpeg(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
}

// Achica la imagen; si es una captura muy larga (un chat entero), la corta en partes legibles.
async function processImage(file) {
  const img = await loadImage(file);
  const w = img.width;
  const h = img.height;
  if (!w || !h) throw new Error("No pude leer esa imagen.");
  const out = [];
  const tall = h / w > 2.2;
  const pieceH = tall ? Math.ceil(w * 2) : h;
  const n = tall ? Math.min(MAX_PIECES, Math.ceil(h / pieceH)) : 1;
  if (tall && Math.ceil(h / pieceH) > MAX_PIECES) {
    throw new Error("La captura es demasiado larga. Cortala en partes o mandá el chat exportado.");
  }
  for (let p = 0; p < n; p++) {
    const sy = p * pieceH;
    const sh = Math.min(pieceH, h - sy);
    const scale = Math.min(1, MAX_IMG_SIDE / Math.max(w, sh));
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(sh * scale));
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, 0, sy, w, sh, 0, 0, cw, ch);
    const blob = await canvasToJpeg(canvas);
    const data = await readB64(blob);
    out.push({
      id: uid(),
      kind: "image",
      name: n > 1 ? `${file.name} (parte ${p + 1} de ${n})` : file.name,
      size: blob.size,
      media: "image/jpeg",
      data,
    });
  }
  if (img.close) img.close();
  return out;
}

async function readTextFile(file) {
  const text = (await file.text()).replace(/^﻿/, "");
  if (text.length > MAX_TEXT_CHARS) throw new Error("El archivo es muy largo. Mandalo por tramos (por ejemplo, un mes por vez).");
  return text;
}

function textAttachment(name, size, text) {
  const wa = parseWhatsApp(text);
  return {
    id: uid(),
    kind: "text",
    name,
    size,
    text,
    chat: !!wa,
    resumen: wa ? wa.resumen : "",
  };
}

async function processZip(file) {
  if (!window.JSZip) throw new Error("No pude abrir el .zip en este momento. Descomprimilo y adjuntá el .txt.");
  const zip = await window.JSZip.loadAsync(file);
  const txts = Object.values(zip.files).filter((f) => !f.dir && /\.txt$/i.test(f.name));
  if (!txts.length) throw new Error("El .zip no tiene un chat de texto (.txt). Exportá el chat de WhatsApp y volvé a probar.");
  const pick = txts.find((f) => /chat/i.test(f.name)) || txts[0];
  const text = (await pick.async("string")).replace(/^﻿/, "");
  if (text.length > MAX_TEXT_CHARS) throw new Error("El chat es muy largo. Exportalo por tramos.");
  return textAttachment(pick.name.split("/").pop(), text.length, text);
}

const decodeXml = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

async function processDocx(file) {
  if (!window.JSZip) throw new Error("No pude abrir el documento en este momento.");
  const zip = await window.JSZip.loadAsync(file);
  const entry = zip.file("word/document.xml");
  if (!entry) throw new Error("No pude leer ese documento de Word.");
  const xml = await entry.async("string");
  const text = decodeXml(
    xml.replace(/<w:tab\/>/g, "\t").replace(/<w:br\/>/g, "\n").replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, ""),
  ).replace(/\n{3,}/g, "\n\n").trim();
  if (!text) throw new Error("El documento no tiene texto.");
  if (text.length > MAX_TEXT_CHARS) throw new Error("El documento es muy largo.");
  return textAttachment(file.name, file.size, text);
}

// Devuelve una lista de adjuntos (una imagen larga puede dar varios). Lanza Error con un mensaje claro.
export async function processFile(file) {
  const name = file.name || "archivo";
  const lower = name.toLowerCase();
  if (file.type.startsWith("image/")) return processImage(file);
  if (file.type === "application/pdf" || lower.endsWith(".pdf")) {
    if (file.size > MAX_PDF_BYTES) throw new Error("El PDF pesa más de 3,3 MB. Mandame las páginas que importan o adjuntalas como capturas.");
    return [{ id: uid(), kind: "pdf", name, size: file.size, data: await readB64(file) }];
  }
  if (lower.endsWith(".zip") || file.type === "application/zip" || file.type === "application/x-zip-compressed") return [await processZip(file)];
  if (lower.endsWith(".docx")) return [await processDocx(file)];
  if (lower.endsWith(".doc")) throw new Error("El formato .doc viejo no se puede leer. Guardalo como .docx o PDF.");
  if (/\.(txt|md|csv)$/.test(lower) || file.type.startsWith("text/")) return [textAttachment(name, file.size, await readTextFile(file))];
  throw new Error(`No puedo leer archivos ${lower.includes(".") ? "." + lower.split(".").pop() : "de ese tipo"}. Podés adjuntar imágenes, PDF, .txt, .docx, .zip de WhatsApp o audios.`);
}

export const KIND_LABEL = { image: "Imagen", pdf: "PDF", text: "Texto", chat: "Chat" };
export const attLabel = (a) => (a.kind === "text" && a.chat ? KIND_LABEL.chat : KIND_LABEL[a.kind] || "Archivo");
export const attSize = (a) => kb(a.size || 0);
