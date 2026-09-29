// Mis prospectos: lista simple, guardada solo en este navegador. El contacto (teléfono, mail) nunca se envía a la IA.
import { store } from "./store.js";
import { ESTADOS, ETAPAS, CANALES, TIPOS_CLIENTE } from "./modes.js";

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
const hoy = () => new Date().toISOString().slice(0, 10);
const fmt = (iso) => (iso ? iso.split("-").reverse().join("/") : "");

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (v === true) n.setAttribute(k, "");
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null) n.append(c);
  return n;
}

const ctx = { root: null, onAnalyze: () => {}, onBack: () => {}, filtro: "Todos", editando: null, formAbierto: false };

export function initProspectos({ root, onAnalyze, onBack }) {
  ctx.root = root;
  ctx.onAnalyze = onAnalyze;
  ctx.onBack = onBack;
}

function guardar(list) {
  store.setProspectos(list);
}

function textoParaAnalizar(p) {
  const filas = [
    ["Nombre", p.nombre],
    ["Negocio", p.negocio],
    ["Canal", p.canal],
    ["Tipo de cliente", p.tipo],
    ["Etapa (según yo)", p.etapa],
    ["Estado", p.estado],
    ["Primer contacto", fmt(p.primerContacto)],
    ["Último contacto", fmt(p.ultimoContacto)],
    ["Próximo seguimiento", fmt(p.proximoSeguimiento)],
    ["Necesidad detectada", p.necesidad],
    ["Objeciones", p.objeciones],
    ["Notas", p.notas],
  ].filter(([, v]) => v);
  return `Analizame este prospecto y decime qué hacer ahora. Uso solo lo que te paso.\n\n${filas.map(([k, v]) => `${k}: ${v}`).join("\n")}`;
}

function campo(label, control, full = false) {
  return el("div", { class: full ? "full" : "" }, el("label", { class: "lab", text: label }), control);
}

function select(name, opts, value) {
  const s = el("select", { class: "field", name });
  for (const o of opts) s.append(el("option", { value: o, text: o, selected: o === value }));
  return s;
}

function formulario(p) {
  const nuevo = !p;
  p = p || { estado: "Nuevo", etapa: "Prospecto identificado", canal: "WhatsApp", tipo: "Sin definir", primerContacto: "", ultimoContacto: "", proximoSeguimiento: "" };
  const f = el("form", { class: "pform2", autocomplete: "off" });
  f.append(
    el("div", { class: "lab gold", text: nuevo ? "NUEVO PROSPECTO" : "EDITAR PROSPECTO" }),
    el("h2", { text: nuevo ? "Sumá un prospecto" : p.nombre || "Prospecto" }),
  );
  const g = el("div", { class: "pgrid" });
  g.append(
    campo("NOMBRE", el("input", { class: "field", name: "nombre", value: p.nombre || "", maxlength: 80, required: true })),
    campo("NEGOCIO", el("input", { class: "field", name: "negocio", value: p.negocio || "", maxlength: 80 })),
    campo("CANAL", select("canal", CANALES, p.canal)),
    campo("CONTACTO (no se envía a la IA)", el("input", { class: "field", name: "contacto", value: p.contacto || "", maxlength: 80 })),
    campo("TIPO DE CLIENTE", select("tipo", TIPOS_CLIENTE, p.tipo)),
    campo("ETAPA", select("etapa", ETAPAS, p.etapa)),
    campo("ESTADO", select("estado", ESTADOS, p.estado)),
    campo("PRIMER CONTACTO", el("input", { class: "field", type: "date", name: "primerContacto", value: p.primerContacto || "" })),
    campo("ÚLTIMO CONTACTO", el("input", { class: "field", type: "date", name: "ultimoContacto", value: p.ultimoContacto || "" })),
    campo("PRÓXIMO SEGUIMIENTO", el("input", { class: "field", type: "date", name: "proximoSeguimiento", value: p.proximoSeguimiento || "" })),
    campo("NECESIDAD DETECTADA", el("textarea", { class: "field", name: "necesidad", rows: 2, maxlength: 400, text: p.necesidad || "" }), true),
    campo("OBJECIONES", el("textarea", { class: "field", name: "objeciones", rows: 2, maxlength: 400, text: p.objeciones || "" }), true),
    campo("NOTAS", el("textarea", { class: "field", name: "notas", rows: 3, maxlength: 600, text: p.notas || "" }), true),
  );
  f.append(g);
  const acciones = el("div", { class: "actions-l" }, el("button", { class: "btn primary", type: "submit", text: "Guardar" }), el("button", { class: "btn", type: "button", "data-cancel": true, text: "Cancelar" }));
  acciones.style.marginTop = "16px";
  f.append(acciones);

  f.addEventListener("submit", (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f).entries());
    const lista = store.getProspectos();
    if (nuevo) {
      lista.unshift({ id: uid(), creado: hoy(), ...d });
    } else {
      const i = lista.findIndex((x) => x.id === p.id);
      if (i >= 0) lista[i] = { ...lista[i], ...d };
    }
    guardar(lista);
    ctx.formAbierto = false;
    ctx.editando = null;
    renderProspectos();
  });
  f.querySelector("[data-cancel]").addEventListener("click", () => {
    ctx.formAbierto = false;
    ctx.editando = null;
    renderProspectos();
  });
  return f;
}

function fila(p) {
  const vence = p.proximoSeguimiento && p.proximoSeguimiento <= hoy() && !["Cliente", "No interesado", "No calificado"].includes(p.estado);
  const row = el("div", { class: "pitem" });
  row.append(
    el("div", { class: "pname" }, el("b", { text: p.nombre || "Sin nombre" }), el("span", { text: [p.negocio, p.canal].filter(Boolean).join(" · ") })),
    el("div", { class: "pcell" }, el("span", { class: "lab", text: "ETAPA · ESTADO" }), el("span", { text: [p.etapa, p.estado].filter(Boolean).join(" · ") })),
    el("div", { class: "pcell" }, el("span", { class: "lab", text: "PRÓXIMO SEGUIMIENTO" }), el("span", { class: vence ? "due" : "", text: p.proximoSeguimiento ? fmt(p.proximoSeguimiento) + (vence ? " · toca hoy" : "") : "Sin fecha" })),
    el(
      "div",
      { class: "pact" },
      el("button", { class: "btn small primary", type: "button", "data-analizar": p.id, text: "Analizar con ADA" }),
      el("button", { class: "btn small", type: "button", "data-editar": p.id, text: "Editar" }),
      el("button", { class: "btn small", type: "button", "data-borrar": p.id, text: "Borrar" }),
    ),
  );
  return row;
}

export function renderProspectos() {
  const root = ctx.root;
  root.replaceChildren();
  const lista = store.getProspectos();

  const top = el("div", { class: "ptop" });
  const h1 = el("h1");
  h1.append("Mis ", el("em", { text: "prospectos" }), ".");
  top.append(
    h1,
    el("div", { class: "actions-l" }, el("button", { class: "btn primary", type: "button", "data-nuevo": true, text: "Agregar prospecto" }), el("button", { class: "btn", type: "button", "data-volver": true, text: "Volver a la conversación" })),
  );
  root.append(top);

  if (ctx.formAbierto) root.append(formulario(ctx.editando ? lista.find((x) => x.id === ctx.editando) : null));

  const filtros = el("div", { class: "pfilters" });
  for (const f of ["Todos", ...ESTADOS]) {
    const n = f === "Todos" ? lista.length : lista.filter((p) => p.estado === f).length;
    if (f !== "Todos" && n === 0 && ctx.filtro !== f) continue;
    filtros.append(el("button", { class: "pf" + (ctx.filtro === f ? " on" : ""), type: "button", "data-filtro": f, text: `${f} ${n}` }));
  }
  if (lista.length) root.append(filtros);

  const visibles = ctx.filtro === "Todos" ? lista : lista.filter((p) => p.estado === ctx.filtro);
  if (!lista.length) {
    root.append(el("div", { class: "pempty", text: "Todavía no cargaste prospectos. Sumá el primero y ADA te ayuda a decidir qué hacer con cada uno." }));
  } else {
    const l = el("div", { class: "plist" });
    // los que tienen seguimiento vencido, primero
    visibles
      .slice()
      .sort((a, b) => (a.proximoSeguimiento || "9999") .localeCompare(b.proximoSeguimiento || "9999"))
      .forEach((p) => l.append(fila(p)));
    root.append(l);
  }

  root.onclick = (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if ("nuevo" in t.dataset) { ctx.formAbierto = true; ctx.editando = null; renderProspectos(); root.querySelector("input")?.focus(); }
    else if ("volver" in t.dataset) ctx.onBack();
    else if (t.dataset.filtro) { ctx.filtro = t.dataset.filtro; renderProspectos(); }
    else if (t.dataset.editar) { ctx.formAbierto = true; ctx.editando = t.dataset.editar; renderProspectos(); }
    else if (t.dataset.borrar) {
      if (confirm("¿Borrar este prospecto?")) { guardar(store.getProspectos().filter((x) => x.id !== t.dataset.borrar)); renderProspectos(); }
    } else if (t.dataset.analizar) {
      const p = store.getProspectos().find((x) => x.id === t.dataset.analizar);
      if (p) ctx.onAnalyze(textoParaAnalizar(p));
    }
  };
}
