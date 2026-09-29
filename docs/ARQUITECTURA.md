# ADA Prospector · auditoría y arquitectura

## 1. Auditoría del material de ADA

Fuentes revisadas: `CLAUDE.md`, `LEEME.md`, `MAESTRO-ARBITRAJE-DISENO.md` (fuente de verdad), `pruebas/examen-5-preguntas.md`, `ejemplo/tres-arquetipos.html` y sus capturas (identidad visual), `capturas.sh`, y el compendio de clases `ADA_PROSPECTOR_NUCLEO_CONOCIMIENTO.md` (fuente secundaria, ya curada en `ADA_PROSPECTOR_NUCLEO_CURADO.md`; el detalle del filtrado está en `REGISTRO_CURADURIA.md`).

**Qué está definido oficialmente (Maestro):** los cuatro límites (unidireccionalidad, recompra primero, origen de fondos, planilla), el instrumento (USDT), el servicio como porcentaje anclado a referencia pública, los tres arquetipos y tres tipos de necesidad, los canales y la cuenta de captación (50–100 mensajes por día, unos 3.000 contactos al mes, unos 5 clientes grandes), "a quién no", el guion del "no", el puntaje de contactos, el paso del primer contacto a la primera operación, el límite fiscal (solo cedular y certificación), y 34 prohibiciones (Parte C).

**Comportamiento de la IA:** mentor comercial de ADA, en voseo, directo y con evidencia; deriva lo que no está documentado; no da asesoría fiscal.

**Obligatorio:** USDT y no "dólares"; fee siempre en %; sin promesas de instantaneidad; sin negar el miedo; unidireccionalidad; recompra primero; origen de fondos; sin cifras inventadas.

**Fuera de alcance:** operativa de brechas, planilla, billeteras, verificados, bloqueos, retiros, límites, comisiones y datos de plataformas, impuestos.

**Contradicciones detectadas y cómo se resolvieron**
- Cálculo de precio de las clases (margen y brecha) vs. porcentaje anclado del Maestro: gana el Maestro.
- Comercios que cobran en USDT y "recepción de pagos" (clases 2025): obsoleto desde mayo 2026 (B.2); se retiró.
- "Unidad patrimonial en pesos" (clase): contradice B.1; se retiró.
- Órdenes fantasma (Maestro B.11) vs. principios de las clases: el equipo de producto decidió no captar con engaño; la app las rechaza (diferencia consciente con B.11).
- Lista de etapas: se usa la definida por el equipo de producto (13 etapas) en lugar de la propuesta anterior.
- Identidad visual: el kit define "Cripto-terminal" (E.3.1, visible en las capturas del ejemplo) y "Interfaz ADA HQ" (E.3.6) para herramientas internas. Se usó E.3.1 porque es lo que muestran las capturas y lo que se pidió mantener.

**Información insuficientemente respaldada (la app no la afirma):** datos de plataformas (comisiones, límites, requisitos), precios de mercado, cifras de ingresos, textos literales del Maestro para "dejame pensarlo", "ya tengo quien me lo hace" y "¿es legal?" (armados por el equipo, no vienen del Maestro; ver `knowledge/local` y sección N8.4 del núcleo).

## 2. Arquitectura

```
Navegador ── POST /api/chat (código de acceso) ──> Netlify Function ──> API de Anthropic
   │                                                   │  1. borrador (Claude Opus 5, no se muestra)
   │                                                   │  2. control de calidad (Claude Sonnet 5)
   │                                                   │  3. si falla: corrección (Opus 5) o pedido de contexto
   └─────────────── SSE: fases + respuesta ───────────┘
```

- **Frontend estático** (HTML/CSS/JS sin dependencias ni build), servido por Netlify.
- **Backend** en Netlify Functions (`/api/chat`, `/api/transcribe`). La `ANTHROPIC_API_KEY` es una variable de entorno de Netlify: nunca llega al navegador.
- **Servicio de IA separado de la interfaz:** `lib/pipeline.mjs` no conoce el SDK ni la interfaz (recibe el cliente y un `emit`); `lib/prompt.mjs` arma el prompt; la interfaz solo habla SSE.
- **Modelos:** Claude Opus 5 con pensamiento adaptativo para el borrador y la corrección (`effort` medio; bajo en el personaje del simulador); Claude Sonnet 5 para el control de calidad. Rechazos de seguridad con `fallbacks: "default"` (si la API no lo acepta, reintenta sin él).
- **Cache de prompts:** el prompt se arma en tres bloques (núcleo, módulos del modo, contexto del alumno). Los dos primeros se cachean, así que el conocimiento se paga una vez y se reutiliza entre alumnos.

## 3. Sistema de conocimiento

No es un prompt gigante: es un conjunto de módulos que se ensamblan por modo.

| Módulo | Contiene (fuente) |
|---|---|
| `core` (siempre) | Personalidad y reglas de certeza (`local`), invariantes N1 (núcleo), Parte C, A.4, A.8, B.2 y glosario (Maestro) |
| `servicio` | A.1, A.3, A.5, B.12 (Maestro); N4, N5 (núcleo) |
| `captacion` | A.6, A.10, B.11, B.13 (Maestro); N2, N3, N6 (núcleo) |
| `conversacion` | Etapas, errores y respuesta (`local`); N7, N9, N10, N11 (núcleo); B.9, B.17 (Maestro) |
| `objeciones` | N8 (núcleo) |
| `simulador`, `plan` | N13; N14 + B.15, B.16, B.19 |
| `verificador` | Criterios del control de calidad (`local`) |

`knowledge/manifest.json` dice qué módulos usa cada modo (`analizar_conversacion`, `que_respondo`, `buscar_clientes`, `analizar_prospecto`, `mejorar_mensaje`, `analizar_captura`, `simulador`, `libre`). El script `tools/build-knowledge.ps1` extrae las secciones por encabezado, quita las referencias internas de origen y la receta de las órdenes fantasma, y falla si falta una sección (así no se rompe en silencio).

Ejemplos, casos y más objeciones se suman como archivos en `knowledge/local/` y una línea en el manifiesto.

## 4. Control de calidad de las respuestas

Ninguna respuesta se muestra sin pasar por esto (excepto el personaje del simulador, que es actuación):

1. **Borrador** oculto de Opus.
2. **Chequeos automáticos** (`lint.mjs`): "como IA", negar el miedo, fee en pesos, "te paso dólares", órdenes fantasma.
3. **Verificador** (Sonnet) contra siete criterios: respaldo en el conocimiento, uso del contexto, invención, especificidad sin evidencia, alcance, contradicción con el método y tono genérico. Devuelve problemas *bloqueantes* o *menores*; solo los bloqueantes obligan a corregir.
4. **Corrección:** si falla, Opus reescribe con los problemas señalados y esa versión es la que se muestra.
5. **Sin tiempo o sin evidencia:** si el límite de 60 s no permite corregir, y el problema es de invención o de falta de información, la respuesta pasa a ser un pedido de contexto con las preguntas del verificador, en lugar de un consejo dudoso.
6. La interfaz muestra "Verificada contra el método de ADA" solo cuando el control se hizo y aprobó (o se corrigió).

Cobertura: 54 pruebas de la lógica del servidor y 24 del navegador (`tools/test-logic.html`, `tools/test-front.html`) corren sin instalar nada.

## 5. Privacidad y seguridad

- **Nada de los alumnos se guarda en el servidor.** Perfil, memoria, conversación y prospectos viven en el `localStorage` de cada navegador; por eso no se mezclan entre alumnos.
- Los adjuntos se leen y se achican en el navegador y viajan solo dentro del pedido; el servidor no los guarda.
- Los registros de Netlify contienen únicamente métricas (modo, control y uso de tokens), nunca el contenido de las conversaciones.
- El teléfono o mail de un prospecto cargado en "Mis prospectos" no se envía a la IA.
- La memoria se guarda solo si el alumno la aprueba.
- Acceso por código (`ACCESS_CODES`), comparación en tiempo constante; pedido validado y saneado (solo tipos de contenido permitidos, tamaños acotados); cabeceras de seguridad y CSP.
- El contenido que el alumno envía a la IA está sujeto a la política de datos de Anthropic para la API.

## 6. Diseño

Identidad del kit ADA (sistema "Cripto-terminal" de las capturas): fondo `#0A0908` con grilla técnica muy tenue, dorado `#FFC93D` como único acento, Space Grotesk en títulos (una palabra en dorado), Inter Tight en el cuerpo y JetBrains Mono en etiquetas. Sin serif, sin cursiva, sin emojis, sin gradientes, sin tarjetas repetidas: los accesos son una lista con filetes. Probado en escritorio y celular.
