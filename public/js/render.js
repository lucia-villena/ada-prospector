// Renderizador mínimo y seguro de las respuestas (se escapa todo el HTML antes de darle formato).
// Sin cursiva (regla de la marca). Los bloques de cita son mensajes listos para copiar.
import { ETAPAS } from "./modes.js";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const unesc = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

// La memoria propuesta viaja dentro de la respuesta como <memoria>…</memoria> y no se muestra como texto.
export function stripMemoria(text, streaming = false) {
  let t = text.replace(/<memoria>[\s\S]*?<\/memoria>/g, "");
  if (streaming) {
    t = t.replace(/<memoria>[\s\S]*$/, "").replace(/<(?:m|me|mem|memo|memor|memori|memoria)?$/, "");
  }
  return t.trimEnd();
}

export function extractMemoria(text) {
  const m = text.match(/<memoria>([\s\S]*?)<\/memoria>/);
  if (!m) return "";
  return m[1].replace(/\s+/g, " ").trim().slice(0, 160);
}

// El resumen (etapa + próximo paso) viaja como <resumen>etapa: …\npaso: …</resumen> y se muestra como tarjeta.
const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9/ ]/g, " ").replace(/\s+/g, " ").trim();

export function etapaIndex(nombre) {
  const n = norm(nombre || "");
  if (!n) return -1;
  return ETAPAS.findIndex((e) => norm(e) === n);
}

export function extractResumen(text) {
  const m = text.match(/<resumen>([\s\S]*?)<\/resumen>/);
  if (!m) return null;
  const grab = (k) => {
    const r = m[1].match(new RegExp(`^\s*${k}\s*:\s*(.*)$`, "im"));
    return r ? r[1].replace(/\s+/g, " ").trim() : "";
  };
  const etapa = grab("etapa").slice(0, 60);
  const paso = grab("paso").slice(0, 260);
  if (!paso && !etapa) return null;
  return { etapa, paso, idx: etapaIndex(etapa) };
}

export function stripResumen(text, streaming = false) {
  let t = text.replace(/<resumen>[\s\S]*?<\/resumen>/g, "");
  if (streaming) t = t.replace(/<resumen>[\s\S]*$/, "").replace(/<(?:r|re|res|resu|resum|resume|resumen)?$/, "");
  return t.trim();
}

function resumenHtml(r) {
  const total = ETAPAS.length;
  let head = "";
  if (r.etapa) {
    const pos = r.idx >= 0 ? `<small>${r.idx + 1} de ${total}</small>` : "";
    head = `<div class="v-stage"><span class="lab">ETAPA</span><b>${esc(r.etapa)}</b>${pos}</div>`;
    if (r.idx >= 0) {
      let seg = "";
      for (let i = 0; i < total; i++) seg += `<i class="${i < r.idx ? "past" : i === r.idx ? "cur" : ""}"></i>`;
      head += `<div class="track" role="img" aria-label="Etapa ${r.idx + 1} de ${total}">${seg}</div>`;
    }
  }
  const next = r.paso ? `<div class="v-next"><span class="lab gold">HACÉ ESTO AHORA</span><p>${esc(r.paso)}</p></div>` : "";
  return `<div class="verdict">${head}${next}</div>`;
}

const TAGS = {
  hecho: ["t-hecho", "Hecho"],
  inferencia: ["t-inferencia", "Inferencia"],
  hipotesis: ["t-hipotesis", "Hipótesis"],
};

function inline(s) {
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, (_, t) => {
    const k = t.replace(/[.:]+$/, "").trim().toLowerCase().replace("ó", "o");
    if (TAGS[k]) return `<span class="tag ${TAGS[k][0]}">${TAGS[k][1]}</span>`;
    return `<strong>${t}</strong>`;
  });
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2"); // sin cursiva
  return s;
}

function quoteHtml(lines) {
  const paras = [];
  let cur = [];
  for (const l of lines) {
    if (!l.trim()) {
      if (cur.length) paras.push(cur);
      cur = [];
    } else cur.push(l);
  }
  if (cur.length) paras.push(cur);
  const html = paras.map((p) => `<p>${p.map(inline).join("<br>")}</p>`).join("");
  const plain = unesc(paras.map((p) => p.join("\n")).join("\n\n")).replace(/\*\*/g, "");
  const wa = `https://wa.me/?text=${encodeURIComponent(plain)}`;
  return (
    `<div class="quote"><div class="qlab">MENSAJE PARA ENVIAR</div><div class="q">${html}</div>` +
    `<div class="qact"><button type="button" class="copy" data-copy>Copiar</button>` +
    `<a class="copy wa" href="${wa}" target="_blank" rel="noopener noreferrer">WhatsApp</a></div></div>`
  );
}

const RE_QUOTE = /^&gt;\s?/;
const RE_UL = /^\s*[-*]\s+/;
const RE_OL = /^\s*\d+[.)]\s+/;
const RE_H = /^#{1,4}\s+/;
const RE_HR = /^\s*---+\s*$/;
const RE_SEC = /^\*\*([^*]+?)\*\*\s*$/; // párrafo que es solo un título en negrita

export function md(raw, { streaming = false } = {}) {
  const resumen = extractResumen(raw);
  const body = stripResumen(stripMemoria(raw, streaming), streaming);
  const lines = esc(body).split(/\r?\n/);
  const out = resumen ? [resumenHtml(resumen)] : [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (RE_QUOTE.test(line)) {
      const q = [];
      while (i < lines.length && RE_QUOTE.test(lines[i])) { q.push(lines[i].replace(RE_QUOTE, "")); i++; }
      out.push(quoteHtml(q));
      continue;
    }
    if (RE_HR.test(line)) { out.push("<hr>"); i++; continue; }
    if (RE_H.test(line)) { out.push(`<h4 class="sec">${inline(line.replace(RE_H, ""))}</h4>`); i++; continue; }
    if (RE_UL.test(line)) {
      const items = [];
      while (i < lines.length && RE_UL.test(lines[i])) { items.push(lines[i].replace(RE_UL, "")); i++; }
      out.push(`<ul>${items.map((x) => `<li>${inline(x)}</li>`).join("")}</ul>`);
      continue;
    }
    if (RE_OL.test(line)) {
      const items = [];
      while (i < lines.length && RE_OL.test(lines[i])) { items.push(lines[i].replace(RE_OL, "")); i++; }
      out.push(`<ol>${items.map((x) => `<li>${inline(x)}</li>`).join("")}</ol>`);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !RE_QUOTE.test(lines[i]) && !RE_UL.test(lines[i]) && !RE_OL.test(lines[i]) && !RE_H.test(lines[i]) && !RE_HR.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    if (!para.length) { para.push(lines[i]); i++; }
    const sec = para.length === 1 && para[0].match(RE_SEC);
    if (sec && !TAGS[sec[1].replace(/[.:]+$/, "").trim().toLowerCase().replace("ó", "o")]) {
      out.push(`<h4 class="sec">${sec[1].replace(/[:.]+$/, "")}</h4>`);
    } else out.push(`<p>${para.map(inline).join("<br>")}</p>`);
  }
  return out.join("");
}

// Copiar al portapapeles (con alternativa para navegadores sin la API moderna)
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}
