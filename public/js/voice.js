// Voz. Dos caminos:
//  - Dictado en vivo: reconocimiento de voz del navegador (Chrome, Edge, Safari). No necesita ninguna clave.
//  - Grabación: MediaRecorder + transcripción en el servidor (solo si está activada en Netlify).
// En ambos casos el texto cae en el cuadro de mensaje para que el alumno lo edite antes de enviar.

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const liveSupported = !!SR;
export const recordSupported = !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

export function createVoice({ onLive, onState, onRecorded, onError }) {
  let rec = null;
  let mr = null;
  let stream = null;
  let chunks = [];
  let active = false;

  const setActive = (v) => {
    active = v;
    onState(v);
  };

  function startLive() {
    rec = new SR();
    rec.lang = "es-AR";
    rec.continuous = true;
    rec.interimResults = true;
    let finalTxt = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalTxt += r[0].transcript + " ";
        else interim += r[0].transcript;
      }
      onLive(finalTxt, interim);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") onError("Permití el micrófono en el navegador para dictar.");
      else if (e.error !== "no-speech" && e.error !== "aborted") onError("No pude escuchar. Probá de nuevo.");
    };
    rec.onend = () => setActive(false);
    rec.start();
    setActive(true);
  }

  async function startRecord() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError("Permití el micrófono en el navegador para grabar.");
      return;
    }
    const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((t) => MediaRecorder.isTypeSupported?.(t)) || "";
    mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    chunks = [];
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mr.onstop = () => {
      stream?.getTracks().forEach((t) => t.stop());
      const mime = mr.mimeType || "audio/webm";
      const blob = new Blob(chunks, { type: mime });
      setActive(false);
      if (blob.size) onRecorded(blob, mime.includes("mp4") ? "audio.m4a" : "audio.webm");
    };
    mr.start();
    setActive(true);
  }

  return {
    get active() { return active; },
    start(mode) {
      if (active) return;
      if (mode === "live") startLive();
      else startRecord();
    },
    stop() {
      if (!active) return;
      try { rec?.stop(); } catch { /* ya detenido */ }
      try { if (mr && mr.state !== "inactive") mr.stop(); } catch { /* ya detenido */ }
    },
  };
}
