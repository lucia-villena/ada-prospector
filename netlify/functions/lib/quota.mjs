// Tope diario de consultas por código de acceso. Usa Netlify Blobs (incluido en el sitio: no hay que instalar
// ni configurar ninguna base de datos aparte). Es una segunda defensa además del límite de gasto de Anthropic:
// si un código se filtra o alguien lo usa de más, esto lo frena por código sin afectar a los demás alumnos.
//
// Si Netlify Blobs fallara por algún motivo, la consulta se deja pasar (no se rompe la herramienta por esto):
// el límite de gasto de la consola de Anthropic sigue siendo la protección de fondo.
// (Import dinámico adentro de registrarUso: así este archivo se puede probar en el navegador sin necesitar el paquete.)

export function hoyArg() {
  try {
    // "en-CA" da el formato AAAA-MM-DD directo.
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function claveUso(code) {
  return `${hoyArg()}:${code}`;
}

// Devuelve { ok:false, count } si el código ya llegó al límite de hoy (no incrementa),
// o { ok:true, count } habiendo sumado uno. Si Blobs no responde, devuelve { ok:true, fallback:true }.
export async function registrarUso(code, limite) {
  try {
    const { getStore } = await import("@netlify/blobs");
    const store = getStore("uso-diario");
    const key = claveUso(code);
    const actual = Number((await store.get(key)) || 0);
    if (actual >= limite) return { ok: false, count: actual };
    const nuevo = actual + 1;
    await store.set(key, String(nuevo));
    return { ok: true, count: nuevo };
  } catch (e) {
    console.error(JSON.stringify({ evt: "quota_error", msg: String(e?.message || "").slice(0, 200) }));
    return { ok: true, fallback: true };
  }
}
