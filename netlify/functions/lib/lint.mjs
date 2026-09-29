// Chequeos deterministas sobre el borrador (baratos y sin falsos positivos raros).
// "hard" fuerza una revision; "style" solo suma si hay varios.

const HARD = [
  {
    id: "como-ia",
    re: /\bcomo (una )?(ia|inteligencia artificial|modelo de lenguaje|asistente de ia)\b/i,
    detalle: 'Habla "como IA".',
  },
  {
    id: "niega-miedo",
    re: /sin compromiso|no es (una )?estafa|es (totalmente |100 ?% )?seguro\b|no te preocupes|quedate tranquilo/i,
    detalle: "Niega el miedo del prospecto o promete seguridad.",
  },
  {
    id: "fee-en-pesos",
    re: /(comisi[oó]n|fee|costo del servicio)[^.\n]{0,30}\$\s?\d|\$\s?\d[\d.,]*[^.\n]{0,20}(de )?(comisi[oó]n|fee)\b/i,
    detalle: "Muestra el fee en pesos: tiene que ir siempre como porcentaje.",
  },
  {
    id: "dolares-entregados",
    re: /te (paso|vendo|doy|convierto|cambio|entrego) (los )?d[oó]lares/i,
    detalle: 'Dice "dólares" como lo que se entrega: es USDT.',
  },
  {
    id: "orden-fantasma",
    re: /orden(es)? fantasma/i,
    detalle: "Sugiere órdenes fantasma: la herramienta no capta con engaño.",
  },
];

const STYLE = [
  { id: "cortesia", re: /^\s*(¡?claro[,!.]|por supuesto|excelente pregunta|buena pregunta|con gusto|entiendo (tu|que))/i, detalle: "Abre con cortesía vacía." },
  { id: "relleno", re: /es importante destacar|en resumen[,:]|en conclusi[oó]n|espero que (te )?sirva|no dudes en|estoy aqu[ií] para/i, detalle: "Usa muletillas de relleno." },
  { id: "manual", re: /te recomiendo considerar|hay varias posibilidades|depende de muchos factores/i, detalle: "Frase de manual genérica." },
  { id: "emoji", re: /\p{Extended_Pictographic}/u, detalle: "Usa emojis." },
];

// ---- Citas: la respuesta no puede citar como textual algo que no está en lo que se le mandó esta vez.
// Gratis (sin modelo). Cubre el defecto de certeza más caro de corregir con IA (invención en criterio "contexto"/"invencion").
const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function quotesEnDraft(text) {
  // Se excluyen los bloques de cita ("> "): son el mensaje que el mentor compone, no una cita del chat.
  const sinBloques = String(text || "")
    .split(/\r?\n/)
    .filter((l) => !/^\s*>/.test(l))
    .join("\n");
  const out = [];
  const re = /["“]([^"”\n]{12,140})["”]/g;
  let m;
  while ((m = re.exec(sinBloques))) out.push(m[1]);
  return out;
}

export function checkCitas(text, evidencia) {
  const ev = norm(evidencia);
  if (ev.length < 40) return []; // sin evidencia real cargada en este turno: no se puede chequear
  const problemas = [];
  for (const q of quotesEnDraft(text)) {
    const nq = norm(q);
    if (nq.length < 12) continue;
    if (!ev.includes(nq)) problemas.push({ id: "cita-no-encontrada", detalle: `La cita "${q.trim()}" no aparece en lo que se envió en este turno.` });
  }
  return problemas.slice(0, 5);
}

export function lint(text, evidencia = "") {
  const t = String(text || "");
  const hard = HARD.filter((r) => r.re.test(t)).map((r) => ({ id: r.id, detalle: r.detalle }));
  const citas = checkCitas(t, evidencia);
  const style = STYLE.filter((r) => r.re.test(t)).map((r) => ({ id: r.id, detalle: r.detalle }));
  return { hard: [...hard, ...citas], style, requiereRevision: hard.length > 0 || citas.length > 0 || style.length >= 2 };
}
