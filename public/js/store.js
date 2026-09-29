// Todo se guarda solo en este navegador (localStorage). El servidor no guarda nada de los alumnos.
// Cada alumno, en su navegador, tiene su propio perfil, memoria, conversación y prospectos: nunca se mezclan.

const K = {
  code: "ada.code",
  perfil: "ada.perfil.v1",
  memoria: "ada.memoria.v1",
  conv: "ada.conv.v1",
  prospectos: "ada.prospectos.v1",
};

function get(key, def) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : def;
  } catch {
    return def;
  }
}
function set(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
    return true;
  } catch {
    return false;
  }
}
function del(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* sin almacenamiento */
  }
}

export const store = {
  getCode: () => get(K.code, ""),
  setCode: (c) => set(K.code, c),
  getPerfil: () => get(K.perfil, {}),
  setPerfil: (p) => set(K.perfil, p),
  getMemoria: () => get(K.memoria, []),
  setMemoria: (m) => set(K.memoria, m),
  getConv: () => get(K.conv, null),
  setConv: (c) => set(K.conv, c),
  getProspectos: () => get(K.prospectos, []),
  setProspectos: (p) => set(K.prospectos, p),
  clearAll() {
    Object.values(K).forEach(del);
  },
  clearSession() {
    del(K.code);
  },
};
