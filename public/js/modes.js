// Herramientas (accesos rápidos), textos de guía y configuración del simulador.

export const TOOLS = [
  {
    id: "analizar_conversacion",
    title: "Analizar conversación",
    desc: "Subí el chat de WhatsApp y te digo etapa, errores y próximo paso.",
    label: "Analizar conversación",
    placeholder: "Pegá la conversación o contame qué pasó. También podés adjuntar el chat.",
    hint: "Adjuntá el chat de WhatsApp (.txt o .zip), pegalo acá o subí capturas. Si no me decís cuál sos vos, lo deduzco del chat y te aviso qué asumí.",
  },
  {
    id: "que_respondo",
    title: "¿Qué le respondo?",
    desc: "Pegá el último mensaje del prospecto y armamos la respuesta.",
    label: "¿Qué le respondo?",
    placeholder: "Pegá la conversación o el último mensaje del prospecto.",
    hint: "Pegá el último mensaje del prospecto y te doy qué mandarle. Si sumás lo que ofreciste antes, lo afino.",
  },
  {
    id: "buscar_clientes",
    title: "Buscar clientes",
    desc: "A quién apuntar, dónde encontrarlo y cómo calificarlo.",
    label: "Buscar clientes",
    placeholder: "Contame qué tipo de clientes podés atender y por dónde estás buscando.",
    hint: "No tengo acceso a internet ni a bases de contactos: te ayudo a definir a quién buscar, dónde y cómo calificarlo.",
  },
  {
    id: "analizar_prospecto",
    title: "Analizar prospecto",
    desc: "Contame o mostrame quién es y te digo cómo abordarlo.",
    label: "Analizar prospecto",
    placeholder: "Describí al prospecto (negocio, rubro, qué viste) o adjuntá una captura de su perfil.",
    hint: "Analizo solo lo que me des: no completo datos que no aparecen.",
  },
  {
    id: "mejorar_mensaje",
    title: "Mejorar mi mensaje",
    desc: "Pegá lo que mandaste y lo revisamos.",
    label: "Mejorar mi mensaje",
    placeholder: "Pegá el mensaje y decime a quién va y por qué canal.",
    hint: "Si me decís a quién va dirigido y en qué etapa está, te lo mejoro sin inventar contexto.",
  },
  {
    id: "simulador",
    title: "Simular cliente",
    desc: "Practicá una conversación y recibí una evaluación.",
    label: "Simulador",
    placeholder: "Escribí tu mensaje al cliente.",
    hint: "Estás en una simulación: escribí como si fuera el cliente real. Cuando termines, tocá “Terminar y evaluar”.",
    special: "sim",
  },
  {
    id: "analizar_captura",
    title: "Analizar captura",
    desc: "Subí un chat, perfil o publicación y te digo qué se ve.",
    label: "Analizar captura",
    placeholder: "Subí las capturas y contame qué querés saber.",
    hint: "Puede ser un chat, un perfil de Instagram, una publicación o un anuncio. Describo solo lo que se ve.",
  },
  {
    id: "prospectos",
    title: "Mis prospectos",
    desc: "Tu lista con etapa y próximo seguimiento.",
    label: "Prospectos",
    special: "view",
    view: "prospectos",
  },
  {
    id: "biblioteca",
    title: "Biblioteca",
    desc: "Primeros mensajes y respuestas a objeciones, para copiar o adaptar.",
    label: "Biblioteca",
    special: "view",
    view: "biblioteca",
  },
];

export const toolById = (id) => TOOLS.find((t) => t.id === id);

// Íconos de línea (SVG, sin dependencias). Se dibujan con el color de texto.
const P = {
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 13h5"/>',
  reply: '<path d="M9 14 4 9l5-5"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5V21h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
};
export const icon = (name, size = 20) =>
  `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ""}</svg>`;

export const TOOL_ICON = {
  analizar_conversacion: "chat",
  que_respondo: "reply",
  buscar_clientes: "search",
  analizar_prospecto: "user",
  mejorar_mensaje: "pen",
  simulador: "target",
  analizar_captura: "image",
  prospectos: "list",
  biblioteca: "book",
};

// Botones de seguimiento que aparecen debajo de la última respuesta (cada uno manda ese texto como pedido del alumno).
const SEG_CONV = [
  ["Otra opción", "Dame otra opción para responderle, con otro enfoque."],
  ["Más corto", "Hacelo más corto y más natural."],
  ["¿Y si no contesta?", "¿Y si no me contesta? Decime cuándo y cómo le vuelvo a escribir."],
  ["¿Qué hice mal?", "¿Qué hice mal en esta conversación? Solo con evidencia del chat."],
];
export const FOLLOWUPS = {
  analizar_conversacion: SEG_CONV,
  que_respondo: SEG_CONV,
  analizar_captura: SEG_CONV,
  libre: SEG_CONV,
  mejorar_mensaje: [
    ["Otra versión", "Dame otra versión con otro enfoque."],
    ["Más corto", "Hacelo todavía más corto."],
    ["Más directo", "Hacelo más directo, sin perder lo natural."],
  ],
  buscar_clientes: [
    ["Armame el primer mensaje", "Armame el primer mensaje para ese tipo de cliente. Si falta una señal real, dejala como {señal}."],
    ["¿Cómo lo califico?", "¿Cómo califico a un prospecto de esos con el puntaje? Dame las preguntas concretas."],
  ],
  analizar_prospecto: [
    ["Armame el primer mensaje", "Armame el primer mensaje para este prospecto. Si falta una señal real, decime cuál mirar primero."],
    ["¿Qué le pregunto primero?", "¿Cuál es la primera pregunta que le haría para detectar la necesidad?"],
  ],
};

// Etiquetas de las fases reales del proceso (las emite el servidor).
export function phaseLabel(mode, fase, hasAtts) {
  const analisis = mode === "analizar_conversacion" || mode === "que_respondo" || mode === "analizar_captura" || (mode === "libre" && hasAtts);
  switch (fase) {
    case "leyendo":
      if (mode === "analizar_captura") return "Leyendo la captura…";
      if (mode === "analizar_prospecto") return "Analizando prospecto…";
      if (analisis) return "Analizando conversación…";
      return "Leyendo el contexto…";
    case "redactando":
      return analisis || mode === "analizar_prospecto" ? "Preparando diagnóstico…" : "Armando la respuesta…";
    case "verificando":
      return "Verificando contra el método de ADA…";
    case "ajustando":
      return "Ajustando la respuesta…";
    default:
      return "Trabajando…";
  }
}

export const SIM = {
  tipos: [
    "Acumula pesos (comercio, fábrica, distribuidora)",
    "Necesita pagar afuera (proveedor que acepta USDT)",
    "Tiene USDT y necesita pesos (exportador, cobra de afuera)",
    "Usuario del P2P que compara precio",
    "Dueño de negocio desconfiado",
  ],
  dificultades: ["Fácil", "Media", "Difícil"],
  canales: ["WhatsApp", "Mensaje directo de Instagram", "Presencial"],
  objetivos: ["Primer contacto", "Detectar la necesidad", "Manejar una objeción", "Cerrar la primera operación", "Hacer seguimiento"],
};

export const ESTADOS = ["Nuevo", "Contactado", "Conversando", "Propuesta", "Seguimiento", "Cliente", "No interesado", "No calificado"];

export const ETAPAS = [
  "Prospecto identificado",
  "Primer contacto",
  "Conversación iniciada",
  "Necesidad detectada",
  "Propuesta presentada",
  "Objeción",
  "Negociación",
  "Cierre pendiente",
  "Primer cliente / operación",
  "Seguimiento",
  "Cliente recurrente",
  "Sin respuesta",
  "Perdido / no calificado",
];

export const CANALES = ["P2P", "WhatsApp", "Instagram", "Presencial", "Otro"];
export const TIPOS_CLIENTE = ["Acumula pesos", "Necesita pagar afuera", "Tiene USDT y necesita pesos", "Sin definir"];
