// ADA Prospector · interfaz. Conecta conversación, adjuntos, voz, perfil/memoria y prospectos.
import { TOOLS, toolById, phaseLabel, SIM, icon, TOOL_ICON, FOLLOWUPS } from "./modes.js";
import { store } from "./store.js";
import * as api from "./api.js";
import { processFile, isAudio, MAX_ATTACHMENTS, attLabel, attSize } from "./attach.js";
import { md, extractMemoria, copyText } from "./render.js";
import { createVoice, liveSupported, recordSupported } from "./voice.js";
import { initProspectos, renderProspectos } from "./prospectos.js";
import { renderBiblioteca } from "./biblioteca.js";

const $ = (id) => document.getElementById(id);
const DEFAULT_PLACEHOLDER = "Contame qué pasó con el prospecto y lo vemos.";
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
const isCoarse = matchMedia("(pointer: coarse)").matches;

// Ahorro de tokens: un adjunto de texto de un mensaje viejo (no el último) se manda resumido, no completo.
// El resumen del chat (attach.js) + la cola reciente alcanzan para seguir la charla; "Reanalizar completo" es la salida.
const OLD_TEXT_KEEP_FULL = 2500;
const TAIL_CHARS = 1800;
function tailText(text, n) {
  if (text.length <= n) return text;
  const cut = text.slice(-n);
  const nl = cut.indexOf("\n");
  return nl > 0 && nl < 200 ? cut.slice(nl + 1) : cut;
}

const el = {
  gate: $("gate"), gateForm: $("gate-form"), gateCode: $("gate-code"), gateError: $("gate-error"),
  app: $("app"), stage: $("view-chat"), hero: $("hero"), tools: $("tools"), simSetup: $("sim-setup"), dia: $("dia"),
  messages: $("messages"), input: $("input"), chips: $("chips"), notice: $("notice"),
  modebar: $("modebar"), modebarLabel: $("modebar-label"), hintbar: $("hintbar"),
  btnAttach: $("btn-attach"), btnFull: $("btn-full"), btnMic: $("btn-mic"), btnEval: $("btn-eval"), btnSend: $("btn-send"), file: $("file"),
  drawer: $("drawer"), scrim: $("scrim"), perfilForm: $("perfil-form"), memList: $("mem-list"), saved: $("perfil-saved"),
  viewChat: $("view-chat"), viewProsp: $("view-prospectos"), viewBib: $("view-biblioteca"), composer: $("composer"),
  navProsp: $("nav-prospectos"), navPerfil: $("nav-perfil"), navNueva: $("nav-nueva"), foot: $("foot"),
};

const state = {
  code: "", transcripcion: false,
  mode: "libre", sim: null, simActive: false, hint: false,
  messages: [], pending: [], fullResend: false,
  perfil: {}, memoria: [],
  busy: false, abort: null, autoScroll: true, view: "chat",
};

// ---------------------------------------------------------------------------------------------
// Persistencia
// ---------------------------------------------------------------------------------------------
function compactMessages() {
  let textBudget = 300_000;
  return state.messages
    .filter((m) => !(m.role === "assistant" && !m.text && !m.fase))
    .map((m) => ({
      ...m,
      fase: undefined,
      atts: (m.atts || []).map((a) => {
        const base = { id: a.id, kind: a.kind, name: a.name, size: a.size, chat: a.chat, resumen: a.resumen };
        if (a.kind === "text" && a.text && a.text.length <= textBudget) {
          textBudget -= a.text.length;
          return { ...base, text: a.text };
        }
        return base;
      }),
    }));
}

function persist() {
  store.setConv({ mode: state.mode, sim: state.sim, simActive: state.simActive, messages: compactMessages() });
}

// ---------------------------------------------------------------------------------------------
// Avisos
// ---------------------------------------------------------------------------------------------
let noticeTimer = null;
function notify(msg, { sticky = false } = {}) {
  clearTimeout(noticeTimer);
  el.notice.textContent = msg;
  el.notice.hidden = false;
  if (!sticky) noticeTimer = setTimeout(clearNotice, 9000);
}
function clearNotice() {
  clearTimeout(noticeTimer);
  el.notice.hidden = true;
  el.notice.textContent = "";
}

// ---------------------------------------------------------------------------------------------
// Acceso
// ---------------------------------------------------------------------------------------------
function showGate(msg) {
  el.app.hidden = true;
  el.gate.hidden = false;
  el.gateError.hidden = !msg;
  el.gateError.textContent = msg || "";
  el.gateCode.focus();
}

el.gateForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = el.gateCode.value.trim();
  if (!code) return;
  el.gateError.hidden = true;
  try {
    const r = await api.ping(code);
    if (r.status === 200) {
      store.setCode(code);
      state.code = code;
      state.transcripcion = !!r.transcripcion;
      el.gateCode.value = "";
      enter();
    } else if (r.status === 401) showGate("Código incorrecto.");
    else showGate(r.message || "No pude validar el código. Probá de nuevo.");
  } catch {
    showGate("No pude conectar. Revisá tu internet y probá de nuevo.");
  }
});

async function boot() {
  state.perfil = store.getPerfil();
  state.memoria = store.getMemoria();
  const conv = store.getConv();
  if (conv) {
    state.mode = conv.mode || "libre";
    state.sim = conv.sim || null;
    state.simActive = !!conv.simActive;
    state.messages = Array.isArray(conv.messages) ? conv.messages : [];
  }
  if (api.DEMO) {
    state.code = "demo";
    state.transcripcion = true;
    enter();
    return;
  }
  const code = store.getCode();
  if (code) {
    try {
      const r = await api.ping(code);
      if (r.status === 200) {
        state.code = code;
        state.transcripcion = !!r.transcripcion;
        enter();
        return;
      }
      if (r.status !== 401) return showGate(r.message || "");
    } catch {
      /* sin conexión: se pide el código igual */
    }
  }
  showGate();
}

function enter() {
  el.gate.hidden = true;
  el.app.hidden = false;
  renderTools();
  setupVoiceButton();
  updateModeUI();
  el.btnFull.hidden = !hasCompactableHistory();
  renderDia();
  renderMessages();
  showView("chat");
  el.input.focus({ preventScroll: true });
}

// ---------------------------------------------------------------------------------------------
// Vistas
// ---------------------------------------------------------------------------------------------
function showView(v) {
  state.view = v;
  el.viewChat.hidden = v !== "chat";
  el.viewProsp.hidden = v !== "prospectos";
  el.viewBib.hidden = v !== "biblioteca";
  el.composer.hidden = v !== "chat";
  el.navProsp.setAttribute("aria-current", v === "prospectos" ? "page" : "false");
  if (v === "prospectos") renderProspectos();
  else if (v === "biblioteca") {
    renderBiblioteca($("biblioteca-root"), {
      onUse: (texto) => {
        showView("chat");
        setMode("mejorar_mensaje");
        el.input.value = texto;
        autosize();
        el.input.focus();
      },
    });
  } else {
    if (v === "chat") renderDia();
    scrollToEnd(true);
  }
}

// "Tu día": si hay prospectos cargados, un resumen chico arriba de los accesos (no reemplaza a "Mis prospectos").
function renderDia() {
  const lista = store.getProspectos();
  if (!lista.length) { el.dia.hidden = true; return; }
  const hoy = new Date().toISOString().slice(0, 10);
  const activos = lista.filter((p) => !["Cliente", "No interesado", "No calificado"].includes(p.estado));
  const vencidos = activos.filter((p) => p.proximoSeguimiento && p.proximoSeguimiento <= hoy);
  el.dia.replaceChildren();
  el.dia.hidden = false;
  const pill = (n, singular, plural) => {
    const s = document.createElement("span");
    s.className = "diapill";
    const b = document.createElement("b");
    b.textContent = String(n);
    s.append(b, ` ${n === 1 ? singular : plural}`);
    return s;
  };
  el.dia.append(pill(activos.length, "prospecto activo", "prospectos activos"));
  if (vencidos.length) el.dia.append(pill(vencidos.length, "seguimiento para hoy", "seguimientos para hoy"));
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "linkbtn";
  btn.textContent = "Ver mis prospectos →";
  btn.addEventListener("click", () => showView("prospectos"));
  el.dia.append(btn);
  updateModeUI();
}

initProspectos({
  root: $("prospectos-root"),
  onBack: () => showView("chat"),
  onAnalyze: (texto) => {
    showView("chat");
    setMode("analizar_prospecto");
    el.input.value = texto;
    autosize();
    el.input.focus();
  },
});

// ---------------------------------------------------------------------------------------------
// Herramientas y modos
// ---------------------------------------------------------------------------------------------
function renderTools() {
  el.tools.replaceChildren();
  for (const t of TOOLS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tool";
    b.dataset.tool = t.id;
    b.innerHTML = icon(TOOL_ICON[t.id] || "chat", 22);
    const tx = document.createElement("span");
    tx.className = "tx";
    const title = document.createElement("b");
    title.textContent = t.title;
    const desc = document.createElement("span");
    desc.textContent = t.desc;
    tx.append(title, desc);
    b.append(tx);
    el.tools.append(b);
  }
}
el.tools.addEventListener("click", (e) => {
  const b = e.target.closest("[data-tool]");
  if (b) setMode(b.dataset.tool);
});

function visibleMessages() {
  return state.messages.filter((m) => !m.hidden && (m.role === "user" || m.text || m.fase));
}

function updateModeUI() {
  const t = toolById(state.mode);
  const inMode = state.mode !== "libre" && t && t.special !== "view";
  el.modebar.hidden = !inMode;
  el.modebarLabel.textContent = inMode ? `MODO · ${t.label}` : "";
  el.hintbar.hidden = !(inMode && state.hint && t.hint);
  el.hintbar.textContent = inMode && t.hint ? t.hint : "";
  el.input.placeholder = (inMode && t.placeholder) || DEFAULT_PLACEHOLDER;
  el.btnEval.hidden = !(state.mode === "simulador" && state.simActive);
  const simSetupOpen = !el.simSetup.hidden;
  el.hero.hidden = visibleMessages().length > 0 || simSetupOpen;
}

function setMode(id) {
  const t = toolById(id);
  if (!t) return;
  if (t.special === "view") return showView(t.view || "prospectos");
  state.mode = id;
  state.hint = true;
  if (t.special === "sim") {
    if (!state.simActive) openSimSetup();
  } else {
    el.simSetup.hidden = true;
    state.simActive = false;
  }
  persist();
  updateModeUI();
  if (t.special !== "sim") el.input.focus();
}

function exitMode() {
  state.mode = "libre";
  state.simActive = false;
  state.hint = false;
  el.simSetup.hidden = true;
  persist();
  updateModeUI();
}
$("modebar-exit").addEventListener("click", exitMode);

// ---- Simulador
function selectHtml(id, label, opts) {
  return `<div><label class="lab" for="${id}">${label}</label><select class="field" id="${id}">${opts.map((o) => `<option>${o}</option>`).join("")}</select></div>`;
}
function openSimSetup() {
  el.simSetup.hidden = false;
  el.simSetup.innerHTML =
    `<div class="lab gold">SIMULADOR</div><h2>Armá al <em>cliente</em>.</h2>` +
    `<div class="simgrid">${selectHtml("sim-tipo", "TIPO DE CLIENTE", SIM.tipos)}${selectHtml("sim-dif", "DIFICULTAD", SIM.dificultades)}` +
    `${selectHtml("sim-canal", "CANAL", SIM.canales)}${selectHtml("sim-obj", "OBJETIVO", SIM.objetivos)}</div>` +
    `<div class="actions-l"><button class="btn primary" id="sim-start" type="button">Empezar simulación</button><button class="btn" id="sim-cancel" type="button">Cancelar</button></div>`;
  $("sim-start").addEventListener("click", startSim);
  $("sim-cancel").addEventListener("click", exitMode);
  updateModeUI();
}
function startSim() {
  state.sim = { tipo: $("sim-tipo").value, dificultad: $("sim-dif").value, canal: $("sim-canal").value, objetivo: $("sim-obj").value };
  state.simActive = true;
  el.simSetup.hidden = true;
  updateModeUI();
  send("[Iniciar simulación]", { hidden: true });
}
el.btnEval.addEventListener("click", () => {
  if (state.busy) return;
  send("[Terminar la simulación y evaluar]", { hidden: true, evaluar: true });
});

// ---------------------------------------------------------------------------------------------
// Render de mensajes
// ---------------------------------------------------------------------------------------------
function scrollToEnd(force = false) {
  if (force || state.autoScroll) el.stage.scrollTop = el.stage.scrollHeight;
}
el.stage.addEventListener("scroll", () => {
  state.autoScroll = el.stage.scrollHeight - el.stage.scrollTop - el.stage.clientHeight < 90;
});

function hasAttsInLastUser() {
  for (let i = state.messages.length - 1; i >= 0; i--) if (state.messages[i].role === "user") return !!state.messages[i].atts?.length;
  return false;
}

function statusEl(m) {
  const wrap = document.createElement("div");
  wrap.className = "status";
  const lab = document.createElement("div");
  lab.className = "lab";
  lab.textContent = phaseLabel(state.mode, m.fase, hasAttsInLastUser());
  wrap.append(lab);
  for (let i = 0; i < 3; i++) {
    const s = document.createElement("div");
    s.className = "sk";
    wrap.append(s);
  }
  return wrap;
}

function attChip(a) {
  const c = document.createElement("span");
  c.className = "att";
  const k = document.createElement("em");
  k.textContent = attLabel(a);
  const n = document.createElement("span");
  n.textContent = a.name;
  c.append(k, n);
  return c;
}

function msgEl(m) {
  const art = document.createElement("article");
  art.className = `msg ${m.role === "user" ? "user" : "ada"}`;
  art.dataset.id = m.id;
  const who = document.createElement("div");
  who.className = "who";
  if (m.role === "user") who.textContent = "Vos";
  else {
    who.append(document.createElement("i"));
    who.append("ADA");
  }
  const body = document.createElement("div");
  body.className = "body";
  if (m.role === "user") {
    if (m.atts?.length) {
      const box = document.createElement("div");
      box.className = "atts";
      m.atts.forEach((a) => box.append(attChip(a)));
      body.append(box);
    }
    if (m.text) {
      const t = document.createElement("div");
      t.textContent = m.text;
      body.append(t);
    }
  } else if (m.fase && !m.text) {
    body.append(statusEl(m));
  } else {
    body.innerHTML = md(m.text, { streaming: !!m.fase });
  }
  art.append(who, body);

  if (m.role === "assistant" && !m.fase) {
    const label = { ok: "Verificada contra el método de ADA", ajustada: "Verificada y ajustada contra el método de ADA" }[m.control];
    if (m.stopped) art.append(metaEl("Detenida"));
    else if (m.truncada) art.append(metaEl("La respuesta quedó cortada. Pedime que siga."));
    else if (label) art.append(metaEl(label));
    if (m.memoria && m.memoriaEstado === "pendiente") art.append(memNoteEl(m));
  }
  return art;
}

function metaEl(text) {
  const d = document.createElement("div");
  d.className = "meta";
  d.textContent = text;
  return d;
}

function memNoteEl(m) {
  const box = document.createElement("div");
  box.className = "memnote";
  const lab = document.createElement("div");
  lab.className = "lab gold";
  lab.textContent = "PARA RECORDAR";
  const p = document.createElement("p");
  p.textContent = m.memoria;
  const row = document.createElement("div");
  row.className = "row";
  const save = document.createElement("button");
  save.className = "btn small primary";
  save.type = "button";
  save.dataset.mem = "save";
  save.dataset.id = m.id;
  save.textContent = "Guardar en mi memoria";
  const skip = document.createElement("button");
  skip.className = "btn small";
  skip.type = "button";
  skip.dataset.mem = "skip";
  skip.dataset.id = m.id;
  skip.textContent = "Descartar";
  row.append(save, skip);
  box.append(lab, p, row);
  return box;
}

function followupsEl(list) {
  const wrap = document.createElement("div");
  wrap.className = "followups";
  for (const [label, texto] of list) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "fchip";
    b.textContent = label;
    b.addEventListener("click", () => { if (!state.busy) send(texto); });
    wrap.append(b);
  }
  return wrap;
}

function renderMessages() {
  el.messages.replaceChildren();
  for (const m of state.messages) {
    if (m.hidden) continue;
    if (m.role === "assistant" && !m.text && !m.fase) continue;
    el.messages.append(msgEl(m));
  }
  const last = [...state.messages].reverse().find((m) => !m.hidden);
  if (last && last.role === "assistant" && !last.fase && last.text && !state.busy) {
    const list = FOLLOWUPS[state.mode];
    if (list) el.messages.append(followupsEl(list));
  }
  updateModeUI();
  scrollToEnd(true);
}

let rafPending = false;
function renderStreaming(m) {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    const node = el.messages.querySelector(`[data-id="${m.id}"] .body`);
    if (!node) return;
    node.replaceChildren();
    if (m.text) node.innerHTML = md(m.text, { streaming: true });
    else node.append(statusEl(m));
    scrollToEnd();
  });
}

// Delegación: copiar mensajes sugeridos y guardar/descartar memoria
document.addEventListener("click", async (e) => {
  const c = e.target.closest("[data-copy]");
  if (c) {
    const q = c.closest(".quote").querySelector(".q");
    const ok = await copyText(q.innerText.trim());
    c.textContent = ok ? "Copiado" : "No se pudo";
    setTimeout(() => (c.textContent = "Copiar"), 1600);
    return;
  }
  const b = e.target.closest("[data-mem]");
  if (b) {
    const m = state.messages.find((x) => x.id === b.dataset.id);
    if (!m) return;
    if (b.dataset.mem === "save" && m.memoria) {
      if (!state.memoria.some((x) => x.t === m.memoria)) {
        state.memoria.push({ t: m.memoria, fecha: new Date().toISOString().slice(0, 10) });
        state.memoria = state.memoria.slice(-30);
        store.setMemoria(state.memoria);
      }
      m.memoriaEstado = "guardada";
    } else m.memoriaEstado = "descartada";
    persist();
    renderMessages();
  }
});

// ---------------------------------------------------------------------------------------------
// Adjuntos
// ---------------------------------------------------------------------------------------------
function renderChips() {
  el.chips.replaceChildren();
  for (const a of state.pending) {
    const chip = document.createElement("span");
    chip.className = "chip";
    const k = document.createElement("em");
    k.textContent = attLabel(a);
    const n = document.createElement("span");
    n.textContent = a.name;
    const s = document.createElement("small");
    s.textContent = attSize(a);
    const x = document.createElement("button");
    x.type = "button";
    x.textContent = "Quitar";
    x.setAttribute("aria-label", `Quitar ${a.name}`);
    x.addEventListener("click", () => {
      state.pending = state.pending.filter((p) => p.id !== a.id);
      renderChips();
    });
    chip.append(k, n, s, x);
    el.chips.append(chip);
    if (a.kind === "text" && a.chat) {
      /* el resumen del chat se le pasa a la IA, no se muestra */
    }
  }
}

async function handleAudio(file) {
  if (!state.transcripcion) {
    notify("La transcripción de audios subidos no está activada. Podés usar “Dictar” o escribir el texto.");
    return;
  }
  if (file.size > 4_500_000) return notify("El audio pesa demasiado (máximo 4,5 MB).");
  notify("Transcribiendo audio…", { sticky: true });
  try {
    const text = await api.transcribe(state.code, file, file.name);
    insertText(text);
    notify("Transcripción lista. Revisala y editala antes de enviar.");
  } catch (e) {
    notify(e.message || "No pude transcribir el audio.");
  }
}

function insertText(text) {
  el.input.value = (el.input.value.trim() ? el.input.value.replace(/\s*$/, "\n\n") : "") + text;
  autosize();
  el.input.focus();
}

async function handleFiles(files) {
  for (const f of files) {
    if (isAudio(f)) {
      await handleAudio(f);
      continue;
    }
    if (state.pending.length >= MAX_ATTACHMENTS) {
      notify(`Podés adjuntar hasta ${MAX_ATTACHMENTS} archivos por mensaje.`);
      break;
    }
    try {
      notify(`Leyendo ${f.name}…`, { sticky: true });
      const atts = await processFile(f);
      for (const a of atts) if (state.pending.length < MAX_ATTACHMENTS) state.pending.push(a);
      if (atts[0]?.chat) notify("Chat de WhatsApp listo. Antes de enviar, contame cuál sos vos en la conversación.");
      else clearNotice();
    } catch (e) {
      notify(e.message || "No pude leer ese archivo.");
    }
  }
  renderChips();
}

el.btnAttach.addEventListener("click", () => el.file.click());
el.btnFull.addEventListener("click", () => {
  state.fullResend = true;
  notify("Listo: tu próximo mensaje incluye el chat completo de nuevo (solo esa vez).");
});
el.file.addEventListener("change", async () => {
  const files = [...el.file.files];
  el.file.value = "";
  await handleFiles(files);
});
el.input.addEventListener("paste", (e) => {
  const files = [...(e.clipboardData?.files || [])];
  if (files.length) {
    e.preventDefault();
    handleFiles(files);
  }
});
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => {
  e.preventDefault();
  if (e.dataTransfer?.files?.length && state.view === "chat") handleFiles([...e.dataTransfer.files]);
});

// ---------------------------------------------------------------------------------------------
// Voz
// ---------------------------------------------------------------------------------------------
let voiceMode = null;
let voiceBase = "";
const voice = createVoice({
  onLive: (fin, inter) => {
    el.input.value = voiceBase + fin + inter;
    autosize();
  },
  onState: (on) => {
    el.btnMic.classList.toggle("on", on);
    el.btnMic.textContent = on ? "Detener" : voiceMode === "live" ? "Dictar" : "Grabar";
  },
  onRecorded: async (blob, name) => {
    notify("Transcribiendo audio…", { sticky: true });
    try {
      insertText(await api.transcribe(state.code, blob, name));
      notify("Transcripción lista. Revisala y editala antes de enviar.");
    } catch (e) {
      notify(e.message || "No pude transcribir el audio.");
    }
  },
  onError: (m) => notify(m),
});
function setupVoiceButton() {
  voiceMode = liveSupported ? "live" : recordSupported && state.transcripcion ? "record" : null;
  el.btnMic.hidden = !voiceMode;
  el.btnMic.textContent = voiceMode === "record" ? "Grabar" : "Dictar";
}
el.btnMic.addEventListener("click", () => {
  if (voice.active) return voice.stop();
  voiceBase = el.input.value ? el.input.value.replace(/\s*$/, " ") : "";
  voice.start(voiceMode);
});

// ---------------------------------------------------------------------------------------------
// Envío
// ---------------------------------------------------------------------------------------------
function autosize() {
  const max = Math.round(innerHeight * 0.4);
  el.input.style.height = "auto";
  el.input.style.height = `${Math.min(el.input.scrollHeight, max)}px`;
  el.input.style.overflowY = el.input.scrollHeight > max ? "auto" : "hidden";
}
el.input.addEventListener("input", autosize);
el.input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !isCoarse) {
    e.preventDefault();
    onSendClick();
  }
});
el.btnSend.addEventListener("click", onSendClick);

function onSendClick() {
  if (state.busy) {
    state.abort?.abort();
    return;
  }
  send(el.input.value);
}

function setBusyUI(on) {
  el.btnSend.textContent = on ? "Detener" : "Enviar";
  el.btnEval.disabled = on;
  el.btnAttach.disabled = on;
  el.btnFull.disabled = on;
}

// Convierte el historial en mensajes para la API. Solo el último mensaje del alumno lleva imágenes y PDF.
// Los adjuntos de texto de mensajes viejos van resumidos (ya los vio el mentor y ya quedaron en su respuesta anterior):
// ahorra tokens en cada pregunta siguiente sin perder la evidencia reciente. "Reanalizar completo" fuerza el envío entero.
function toApi(m, lastUserIdx, idx, fullResend) {
  if (m.role === "assistant") return { role: "assistant", content: [{ type: "text", text: m.text.replace(/<memoria>[\s\S]*?<\/memoria>/g, "").trim() }] };
  const blocks = [];
  const esUltimo = idx === lastUserIdx;
  (m.atts || []).forEach((a, i) => {
    const etiqueta = `[Adjunto ${i + 1} de ${m.atts.length}: ${a.name}]`;
    if (a.kind === "text" && a.text && !esUltimo && !fullResend && a.text.length > OLD_TEXT_KEEP_FULL) {
      const resumen = a.chat ? a.resumen : `Texto adjunto (${attSize(a)}).`;
      blocks.push({
        type: "text",
        text:
          `${etiqueta} Ya se analizó antes en esta conversación: no se reenvía completo para no gastar de más. ${resumen}\n` +
          `Últimas líneas, de referencia:\n${tailText(a.text, TAIL_CHARS)}\n` +
          `(Si necesitás un tramo anterior que no está acá, pedile al alumno que toque "Reanalizar completo".)`,
      });
    } else if (a.kind === "text" && a.text) {
      const intro = a.chat ? `${etiqueta} ${a.resumen}` : `${etiqueta} (texto)`;
      blocks.push({ type: "text", text: `${intro}\n\n${a.text}` });
    } else if ((a.kind === "image" || a.kind === "pdf") && a.data && esUltimo) {
      blocks.push({ type: "text", text: `${etiqueta} (${a.kind === "image" ? "imagen" : "PDF"})` });
      blocks.push(a.kind === "image" ? { type: "image", media: a.media, data: a.data } : { type: "pdf", data: a.data });
    } else {
      blocks.push({ type: "text", text: `${etiqueta} (${a.kind === "image" ? "imagen" : a.kind === "pdf" ? "PDF" : "texto"}) — ya no está disponible en esta conversación; se analizó en un mensaje anterior.` });
    }
  });
  if (m.text) blocks.push({ type: "text", text: m.text });
  return { role: "user", content: blocks };
}

function hasCompactableHistory() {
  let lastUserIdx = -1;
  state.messages.forEach((m, i) => { if (m.role === "user") lastUserIdx = i; });
  return state.messages.some(
    (m, i) => m.role === "user" && i !== lastUserIdx && (m.atts || []).some((a) => a.kind === "text" && a.text && a.text.length > OLD_TEXT_KEEP_FULL),
  );
}

function buildPayload({ evaluar }) {
  const src = state.messages.filter((m) => !(m.role === "assistant" && !m.text));
  let lastUserIdx = -1;
  src.forEach((m, i) => { if (m.role === "user") lastUserIdx = i; });
  const fullResend = state.fullResend;
  let messages = src.map((m, i) => toApi(m, lastUserIdx, i, fullResend));
  const size = () => JSON.stringify(messages).length;
  // Si pesa demasiado, se reemplazan los adjuntos de texto más viejos por una nota.
  for (let i = 0; i < src.length - 1 && size() > 5_400_000; i++) {
    if (src[i].role === "user" && src[i].atts?.some((a) => a.kind === "text")) {
      messages[i] = { role: "user", content: [{ type: "text", text: `[Adjuntos anteriores omitidos por tamaño] ${src[i].text || ""}`.trim() }] };
    }
  }
  if (size() > 5_400_000) return { error: "Los adjuntos pesan demasiado. Mandame menos por vez." };
  return {
    payload: {
      mode: state.mode,
      evaluar: !!evaluar,
      sim: state.mode === "simulador" ? state.sim : undefined,
      perfil: state.perfil,
      memoria: state.memoria.map((x) => x.t),
      messages,
    },
  };
}

async function send(rawText, { hidden = false, evaluar = false } = {}) {
  if (state.busy) return;
  if (voice.active) voice.stop();
  const text = (rawText || "").trim();
  const atts = hidden ? [] : state.pending.slice();
  if (!text && !atts.length) return;
  if (!hidden && state.mode === "simulador" && !state.simActive) {
    notify("Primero armá al cliente y tocá “Empezar simulación”.");
    return;
  }
  clearNotice();

  const userMsg = { id: uid(), role: "user", text, atts, hidden };
  state.messages.push(userMsg);
  const built = buildPayload({ evaluar });
  state.fullResend = false;
  el.btnFull.hidden = !hasCompactableHistory();
  if (built.error) {
    state.messages.pop();
    notify(built.error, { sticky: true });
    return;
  }
  const adaMsg = { id: uid(), role: "assistant", text: "", fase: "leyendo" };
  state.messages.push(adaMsg);
  state.pending = [];
  renderChips();
  if (!hidden) {
    el.input.value = "";
    autosize();
  }
  state.hint = false;
  state.busy = true;
  setBusyUI(true);
  state.autoScroll = true;
  renderMessages();

  state.abort = new AbortController();
  let fallo = null;
  try {
    await api.streamChat({
      code: state.code,
      payload: built.payload,
      signal: state.abort.signal,
      onEvent: (ev) => {
        if (ev.t === "fase") { adaMsg.fase = ev.d; if (!adaMsg.text) renderStreaming(adaMsg); }
        else if (ev.t === "text") { adaMsg.text += ev.d; renderStreaming(adaMsg); }
        else if (ev.t === "meta") { adaMsg.control = ev.control; adaMsg.truncada = !!ev.truncada; }
        else if (ev.t === "refusal") { adaMsg.text ||= "No puedo ayudarte con eso desde acá. Si es sobre un cliente y una conversación, contame qué pasó."; }
        else if (ev.t === "error") { fallo = ev; }
      },
    });
  } catch (e) {
    if (e.name === "AbortError") adaMsg.stopped = true;
    else if (e.status === 401) { fallo = { code: "auth", message: "El código de acceso ya no es válido." }; }
    else fallo = { code: e.code || "red", message: e.message || "No pude conectar con el servidor. Probá de nuevo." };
  }

  adaMsg.fase = null;
  state.busy = false;
  setBusyUI(false);
  state.abort = null;

  const mem = extractMemoria(adaMsg.text);
  if (mem && !state.memoria.some((x) => x.t === mem)) {
    adaMsg.memoria = mem;
    adaMsg.memoriaEstado = "pendiente";
  }
  if (!adaMsg.text && !fallo && !adaMsg.stopped) adaMsg.text = "No pude armar una respuesta. Probá reformular.";
  if (evaluar && !fallo) {
    state.simActive = false;
    state.mode = "libre";
  }
  persist();
  renderMessages();
  updateModeUI();
  if (fallo) {
    if (fallo.code === "auth") {
      store.clearSession();
      showGate(fallo.message);
    } else notify(fallo.message, { sticky: true });
  }
}

// ---------------------------------------------------------------------------------------------
// Perfil y memoria
// ---------------------------------------------------------------------------------------------
function openDrawer() {
  const f = el.perfilForm;
  for (const k of ["nombre", "etapa", "experiencia", "objetivo", "tipo_cliente", "capacidad", "ticket", "horas", "clientes", "notas"]) {
    if (f.elements[k]) f.elements[k].value = state.perfil[k] || "";
  }
  f.querySelectorAll('input[name="canales"]').forEach((c) => (c.checked = !!state.perfil.canales?.includes(c.value)));
  renderMem();
  el.saved.hidden = true;
  el.drawer.hidden = false;
  el.scrim.hidden = false;
}
function closeDrawer() {
  el.drawer.hidden = true;
  el.scrim.hidden = true;
}
function renderMem() {
  el.memList.replaceChildren();
  if (!state.memoria.length) {
    const li = document.createElement("li");
    li.className = "memempty";
    li.textContent = "Todavía no hay notas. ADA te propone una cuando detecta algo que conviene recordar.";
    el.memList.append(li);
    return;
  }
  state.memoria.forEach((m, i) => {
    const li = document.createElement("li");
    const t = document.createElement("span");
    t.textContent = m.t;
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = "Quitar";
    b.addEventListener("click", () => {
      state.memoria.splice(i, 1);
      store.setMemoria(state.memoria);
      renderMem();
    });
    li.append(t, b);
    el.memList.append(li);
  });
}
el.perfilForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const fd = new FormData(el.perfilForm);
  const p = {};
  for (const [k, v] of fd.entries()) if (k !== "canales" && String(v).trim()) p[k] = String(v).trim();
  const canales = fd.getAll("canales");
  if (canales.length) p.canales = canales;
  state.perfil = p;
  store.setPerfil(p);
  el.saved.hidden = false;
  setTimeout(() => (el.saved.hidden = true), 2200);
});
el.navPerfil.addEventListener("click", openDrawer);
$("drawer-close").addEventListener("click", closeDrawer);
el.scrim.addEventListener("click", closeDrawer);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !el.drawer.hidden) closeDrawer(); });
$("btn-exportar").addEventListener("click", () => {
  const data = {
    version: 1,
    exportado: new Date().toISOString(),
    perfil: store.getPerfil(),
    memoria: store.getMemoria(),
    prospectos: store.getProspectos(),
    conv: store.getConv(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ada-prospector-copia-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});
$("btn-importar").addEventListener("click", () => $("file-importar").click());
$("file-importar").addEventListener("change", async () => {
  const f = $("file-importar").files[0];
  $("file-importar").value = "";
  if (!f) return;
  if (!confirm("¿Importar esta copia? Se reemplazan tu perfil, memoria, prospectos y la conversación actual de este navegador.")) return;
  try {
    const data = JSON.parse(await f.text());
    if (data.perfil && typeof data.perfil === "object") store.setPerfil(data.perfil);
    if (Array.isArray(data.memoria)) store.setMemoria(data.memoria);
    if (Array.isArray(data.prospectos)) store.setProspectos(data.prospectos);
    if (data.conv && typeof data.conv === "object") store.setConv(data.conv);
    location.reload();
  } catch {
    notify("No pude leer ese archivo. ¿Es una copia exportada desde acá?", { sticky: true });
  }
});
$("btn-borrar").addEventListener("click", () => {
  if (confirm("¿Borrar tu perfil, memoria, conversación y prospectos de este navegador? No se puede deshacer.")) {
    store.clearAll();
    location.reload();
  }
});
$("btn-salir").addEventListener("click", () => {
  store.clearSession();
  location.reload();
});

// ---------------------------------------------------------------------------------------------
// Navegación
// ---------------------------------------------------------------------------------------------
el.navProsp.addEventListener("click", () => showView(state.view === "prospectos" ? "chat" : "prospectos"));
el.navNueva.addEventListener("click", () => {
  if (state.busy) return;
  if (visibleMessages().length && !confirm("¿Empezar una conversación nueva? Se borra la actual de este navegador.")) return;
  state.messages = [];
  state.pending = [];
  state.mode = "libre";
  state.sim = null;
  state.simActive = false;
  state.hint = false;
  state.fullResend = false;
  el.simSetup.hidden = true;
  el.btnFull.hidden = true;
  persist();
  renderChips();
  renderMessages();
  updateModeUI();
  showView("chat");
  clearNotice();
});

boot();
