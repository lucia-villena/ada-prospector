// Armado del prompt de sistema por modo.
// Estructura (pensada para el cache de prompts, que es un prefijo estable):
//   bloque 1  -> nucleo (personalidad + certeza + reglas + prohibiciones)      [cache]
//   bloque 2  -> modulos del modo + instrucciones del modo                     [cache]
//   bloque 3  -> perfil, memoria, configuracion y fecha (cambia por pedido)    [sin cache]
import { MODULES, MODES } from "./knowledge.generated.mjs";

const wrap = (tag, id, text) => `<${tag} id="${id}">\n${text}\n</${tag}>`;

export function getMode(modeId) {
  return MODES[modeId] ? modeId : "libre";
}

export function modeConfig(modeId, evaluar) {
  const id = getMode(modeId);
  const m = MODES[id];
  const evaluando = id === "simulador" && !!evaluar;
  return {
    id,
    verificar: evaluando ? !!m.verificarEvaluacion : !!m.verificar,
    esfuerzo: evaluando ? m.esfuerzoEvaluacion || m.esfuerzo : m.esfuerzo,
    maxTokens: (evaluando ? m.maxTokensEvaluacion || m.maxTokens : m.maxTokens) || 4000,
  };
}

function modeModulesText(id) {
  const m = MODES[id];
  return m.modulos.map((k) => wrap("modulo", k, MODULES[k])).join("\n\n");
}

const CIERRE =
  "Recordatorio final: certeza antes que velocidad. Solo afirmá lo que esté en el conocimiento o en lo que el alumno te dio. " +
  "Separá hecho, inferencia e hipótesis, pero primero la acción: abrí con el bloque <resumen> y el mensaje o la decisión, y después el análisis. " +
  "Si falta información, no frenes: recomendá con el supuesto declarado en una línea y no inventes el dato. Preguntá solo lo que evita un daño, una vez y al final. " +
  "Español rioplatense, directo, sin muletillas de IA.";

function fechaHoy() {
  try {
    return new Date().toLocaleDateString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

const PERFIL_ETIQUETAS = {
  nombre: "Nombre",
  etapa: "Etapa en el programa",
  experiencia: "Experiencia",
  objetivo: "Objetivo",
  tipo_cliente: "Tipo de cliente que busca",
  canales: "Canales que usa",
  capacidad: "Capacidad operativa declarada",
  ticket: "Ticket máximo por operación (USDT)",
  horas: "Horas por día",
  clientes: "Clientes actuales",
  notas: "Otras notas del alumno",
};

function perfilTexto(perfil) {
  const filas = [];
  for (const [k, etiqueta] of Object.entries(PERFIL_ETIQUETAS)) {
    const v = perfil?.[k];
    if (v === undefined || v === null || v === "") continue;
    filas.push(`- ${etiqueta}: ${Array.isArray(v) ? v.join(", ") : v}`);
  }
  return filas.length ? filas.join("\n") : "(el alumno todavía no completó su perfil)";
}

function memoriaTexto(memoria) {
  return memoria?.length ? memoria.map((t) => `- ${t}`).join("\n") : "(sin notas todavía)";
}

function simTexto(cfg, evaluar) {
  if (!cfg) return "";
  const filas = [
    cfg.tipo && `- Tipo de cliente: ${cfg.tipo}`,
    cfg.dificultad && `- Dificultad: ${cfg.dificultad}`,
    cfg.canal && `- Canal: ${cfg.canal}`,
    cfg.objetivo && `- Objetivo del alumno: ${cfg.objetivo}`,
  ].filter(Boolean);
  const orden = evaluar
    ? "El alumno terminó la simulación: salí del personaje y evaluá la conversación como se indica en el modo."
    : "Si el último mensaje del alumno es la orden de iniciar la simulación, escribí la tarjeta de escena fuera del personaje y terminá con \"Empezá vos.\". Si no, seguí en personaje.";
  return `<configuracion_simulacion>\n${filas.join("\n")}\n${orden}\n</configuracion_simulacion>`;
}

export function buildSystem({ mode, evaluar, perfil, memoria, sim }) {
  const id = getMode(mode);
  const m = MODES[id];
  const dinamico = [
    `<contexto>\nFecha de hoy: ${fechaHoy()} (Argentina).\nModo activo: ${id}.\n</contexto>`,
    `<perfil_del_alumno>\n${perfilTexto(perfil)}\n</perfil_del_alumno>`,
    `<memoria_del_alumno>\n${memoriaTexto(memoria)}\n</memoria_del_alumno>`,
    id === "simulador" ? simTexto(sim, evaluar) : "",
    CIERRE,
  ]
    .filter(Boolean)
    .join("\n\n");

  return [
    {
      type: "text",
      text: `${wrap("conocimiento_core", "core", MODULES.core)}`,
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text:
        `${modeModulesText(id)}\n\n` +
        `<instrucciones_del_modo id="${id}">\n${m.instruccion}\n</instrucciones_del_modo>\n\n` +
        "Si las instrucciones del modo difieren de una descripción general del conocimiento, mandan las instrucciones del modo.",
      cache_control: { type: "ephemeral" },
    },
    { type: "text", text: dinamico },
  ];
}

// Sistema del verificador: sus criterios + el conocimiento con el que debe contrastar.
export function buildVerifierSystem(mode) {
  const id = getMode(mode);
  return [
    { type: "text", text: MODULES.verificador },
    {
      type: "text",
      text: `${wrap("conocimiento_core", "core", MODULES.core)}\n\n${modeModulesText(id)}`,
      cache_control: { type: "ephemeral" },
    },
  ];
}
