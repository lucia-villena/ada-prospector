// Biblioteca: primeros mensajes y respuestas a objeciones ya redactados según el método de ADA (núcleo N6.7 y N8.4).
// Es referencia estática: no llama a la IA ni gasta tokens. "Usar y adaptar" manda el texto a "Mejorar mi mensaje"
// para que, si el alumno lo pide, ADA lo ajuste al caso concreto (eso sí consulta al modelo).
import { copyText } from "./render.js";

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

export const PRIMEROS_MENSAJES = [
  {
    arquetipo: "Acumula pesos",
    sub: "comercio, fábrica, distribuidora",
    variantes: [
      { label: "A · pregunta cómo resguarda hoy", texto: "Hola {nombre}, ¿cómo andás? Vi que {señal}. Me dedico a operar USDT para negocios que cobran todos los días en pesos. Te pregunto por curiosidad: ¿cómo resguardás hoy esa plata? ¿La pasás a dólar billete o la dejás en pesos?" },
      { label: "B · abre por el dolor", texto: "Hola {nombre}, ¿cómo andás? Vi que {señal}. En negocios con recaudación diaria es común tener que retirar los pesos, comprar billete e ir vendiéndolo a medida que se necesita. Yo resuelvo eso con USDT, en una sola transferencia. ¿Cómo lo manejan hoy ustedes?" },
    ],
  },
  {
    arquetipo: "Necesita pagar afuera",
    sub: "insumos, proveedor del exterior que acepta USDT",
    variantes: [
      { label: "A · califica primero", texto: "Hola {nombre}, ¿cómo andás? Vi que {señal}. Me dedico a operar USDT y ayudo a empresas a resolver el pago a proveedores del exterior. ¿Alguno de tus proveedores acepta cobrar en USDT?" },
      { label: "B · abre por el pago", texto: "Hola {nombre}, ¿cómo andás? Vi que {señal}. Cuando hay que pagarle a un proveedor de afuera, ¿cómo lo resolvés hoy? Si tu proveedor acepta USDT, te lo puedo resolver de forma directa." },
    ],
  },
  {
    arquetipo: "Tiene USDT y necesita pesos",
    sub: "exportador, cobra desde afuera, paga sueldos locales",
    variantes: [
      { label: "A · pregunta cómo lo hace hoy", texto: "Hola {nombre}, ¿cómo andás? Vi que {señal}. Me dedico a operar USDT y a quienes cobran desde afuera les resuelvo pasarlo a pesos. ¿Cómo lo hacés hoy cuando te toca cobrar?" },
      { label: "B · abre por la fricción", texto: "Hola {nombre}, ¿cómo andás? Vi que {señal}. Quien cobra en USDT suele tener que buscar contrapartes y armarse cuentas cada vez que necesita pesos. Yo te compro los USDT y te pago en pesos, directo a tu cuenta. ¿Necesitás pesos seguido?" },
    ],
  },
];

export const GUION_DEL_NO =
  "Te lo hago sin problema, pero la plata tiene que entrar y salir de la misma persona. Es la forma en la que yo opero para que quede todo prolijo y trazable, tanto para vos como para mí. Si tu socio lo necesita, lo armamos como una operación aparte a su nombre y listo.";

export const OBJECIONES = [
  { objecion: '"Es caro"', texto: "El porcentaje no es por el USDT, es por lo que te saco de encima: no creás cuentas, no le transferís a nadie que no conocés y tenés a una persona con nombre y apellido que se hace cargo. Antes de hablar de números, ¿cuánto tiempo o plata te cuesta hoy resolverlo por tu cuenta?", limite: "No hay problema, yo ya estoy operando a este porcentaje. Si a vos no te sirve, ya tengo clientes que sí. El servicio es este.", noDecir: '"Es lo más barato", "te lo dejo en menos", el fee en pesos.' },
  { objecion: '"¿Por qué te compro a vos a 1.600 si puedo a 1.580?"', texto: "Puede ser, y si te querés armar las cuentas y estar comprando vos, es una opción. Yo te ofrezco otra cosa: hacés una sola transferencia desde tu cuenta, sin exponerte a gente que no conocés, y los USDT te llegan a la tuya. Lo que pagás es ese servicio. ¿Te sirve más resolverlo vos o que te lo resuelvan?", noDecir: "Que tu precio es mejor, o justificar la diferencia en pesos." },
  { objecion: '"En Binance lo hago yo"', texto: "Seguro que podés. La diferencia es que hacerlo implica crearte las cuentas, estar pendiente del precio y transferirle a personas que no conocés. Mucha gente prefiere no hacerlo, sobre todo cuando son montos grandes o todos los días. Si en tu caso te sirve hacerlo vos, perfecto. ¿Cuántas veces por mes lo tenés que hacer?", nota: "Si hace pocas veces por mes o por montos chicos, probablemente busca precio: no insistas." },
  { objecion: '"¿Cómo sé que es confiable?"', texto: "Justamente por eso arrancamos con una operación chica: así ves cómo trabajo antes de mover algo importante. La plata siempre entra y sale de la misma persona, o sea de vos, cada operación queda registrada y yo también te pido el origen de los fondos. Si querés, te paso quién soy, dónde opero y mis perfiles con su reputación, y lo hablamos por llamada.", noDecir: '"No es una estafa", "es seguro", "confiá en mí", "tranquilo", "sin riesgo".', nota: "Solo agregá lo que sea cierto de vos (certificación, perfiles, comunidad). Si todavía no lo tenés, se omite: no se inventa." },
  { objecion: '"Dejame pensarlo"', texto: "Dale, sin apuro. Para que lo pienses con todo claro: ¿hay algo puntual que te genere duda o que te gustaría que te explique mejor? Y si querés, te escribo el {día} para ver cómo lo viste.", noDecir: '"La oferta vence", "hay poco cupo", ni bajar el precio para cerrar.' },
  { objecion: '"Ya tengo quien me lo hace"', texto: "Perfecto, entonces ya sabés cómo funciona. Para ver si yo te sirvo: ¿cuánto te sale hoy y cuánto tardan en resolvértelo? Si lo mío te mejora eso, lo vemos. Si no, te quedás con lo que ya tenés y listo.", noDecir: "Nada malo de su proveedor actual, ni cifras de lo que cobran otros." },
  { objecion: '"Bajame el porcentaje" / "otro me da mejor precio" / "te volaste"', texto: "Con volumen: \"Te puedo bajar de {X}% a {Y}%, pero a cambio de volumen. ¿Cuánto me movés por mes? A partir de {monto} te bajo {0,25} puntos más.\"\nSi compara con otro: \"Entiendo. Este es el porcentaje del servicio y no lo muevo porque sí. Si con otro te cierra mejor, no pasa nada. Yo te ofrezco {beneficio concreto}.\"", limite: "Hasta acá me sirve. Más abajo pierdo o empato, y eso no lo hago.", nota: "El piso nunca baja de 0,5%. Los datos entre {llaves} los define el alumno: nunca se inventan, nunca en pesos." },
  { objecion: '"¿Esto es legal?"', texto: "Yo trabajo uno a uno: me comprás o me vendés a mí, la plata entra y sale de la misma persona y cada operación queda registrada. {Solo si es cierto: opero con certificación de ingresos y estoy inscripto en el impuesto cedular.} Lo impositivo de tu lado lo confirmás con tu contador.", noDecir: '"Es legal", "es ilegal", "no hay riesgo", "no pasa nada". No dar consejo fiscal ni legal.' },
  { objecion: 'Pide wallet o cuenta de un tercero ("te transfiere mi cuñado", "dividímelo en cinco transferencias")', texto: GUION_DEL_NO, nota: "No es mala fe: no sabe. Se responde tranquilo, sin dramatizar, ofreciendo la salida en la misma frase." },
];

function bloqueTexto(texto, label, onUse) {
  const wrap = el("div", { class: "quote" }, el("div", { class: "qlab", text: label }));
  const q = el("div", { class: "q" });
  texto.split("\n").forEach((linea) => q.append(el("p", { text: linea })));
  wrap.append(q);
  const btnCopy = el("button", { class: "copy", type: "button", text: "Copiar" });
  const btnUse = el("button", { class: "copy", type: "button", text: "Usar y adaptar" });
  btnCopy.addEventListener("click", async () => {
    const ok = await copyText(texto);
    btnCopy.textContent = ok ? "Copiado" : "No se pudo";
    setTimeout(() => (btnCopy.textContent = "Copiar"), 1600);
  });
  btnUse.addEventListener("click", () => onUse?.(texto));
  wrap.append(el("div", { class: "qact" }, btnCopy, btnUse));
  return wrap;
}

export function renderBiblioteca(root, { onUse } = {}) {
  root.replaceChildren();
  const h1 = el("h1");
  h1.append("Bibliote", el("em", { text: "ca" }), ".");
  root.append(
    el("div", { class: "ptop" }, h1),
    el("p", { class: "sub", text: 'Textos ya redactados según el método de ADA. "Copiar" no consulta a la IA; "Usar y adaptar" sí, para ajustarlo a tu caso.' }),
  );

  root.append(el("h2", { class: "bsec" }, "Primer mensaje en frío, por arquetipo"));
  for (const g of PRIMEROS_MENSAJES) {
    const grupo = el("div", { class: "bgroup" }, el("div", { class: "bgtitle" }, el("b", { text: g.arquetipo }), el("span", { text: g.sub })));
    for (const v of g.variantes) grupo.append(bloqueTexto(v.texto, v.label, onUse));
    root.append(grupo);
  }

  root.append(el("h2", { class: "bsec" }, "Objeciones"));
  for (const o of OBJECIONES) {
    const grupo = el("div", { class: "bgroup" }, el("div", { class: "bgtitle" }, el("b", { text: o.objecion })));
    grupo.append(bloqueTexto(o.texto, "RESPUESTA", onUse));
    if (o.limite) grupo.append(bloqueTexto(o.limite, "SI INSISTE, LÍMITE CLARO", onUse));
    if (o.noDecir) grupo.append(el("p", { class: "bnota", text: `No decir: ${o.noDecir}` }));
    if (o.nota) grupo.append(el("p", { class: "bnota", text: o.nota }));
    root.append(grupo);
  }
}
