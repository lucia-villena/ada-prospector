# ADA Prospector

Mentor de prospección para alumnos de la Academia de Arbitraje (ADA). Analiza conversaciones de WhatsApp y capturas, detecta la etapa del prospecto y los errores del alumno, sugiere el próximo paso, arma y mejora mensajes, responde objeciones y simula clientes.

Funciona **100% en Netlify**. No hace falta instalar nada en ninguna computadora.

## Cómo se despliega en Netlify

### Opción A: arrastrar la carpeta (la más simple)
1. Entrá a Netlify con tu cuenta y abrí <https://app.netlify.com/drop>.
2. Arrastrá la carpeta `ada-prospector` (o el `.zip`, sin `node_modules`). Netlify instala las dependencias y publica el sitio y las funciones.
3. Cargá las variables de entorno (más abajo) en **Site configuration → Environment variables**.
4. Hacé un nuevo deploy (**Deploys → Trigger deploy**) para que las funciones lean las variables.

### Opción B: desde GitHub
1. Subí esta carpeta a un repositorio.
2. En Netlify: **Add new site → Import an existing project** y elegí el repositorio. No hace falta comando de build; el directorio a publicar es `public` (ya está en `netlify.toml`).

## Variables de entorno (en Netlify, nunca en el código)

| Variable | Obligatoria | Para qué sirve |
|---|---|---|
| `ANTHROPIC_API_KEY` | Sí | Clave de la API de Anthropic. Vive solo en Netlify; el navegador nunca la ve |
| `ACCESS_CODES` | Sí | Código(s) de acceso, separados por coma (`codigo-alumno1,codigo-alumno2`). Recomendado: **un código por alumno**, no uno compartido — así se puede dar de baja uno solo si se filtra, sin afectar a los demás. Para dar de baja un código, se lo saca de la lista y se hace un nuevo deploy |
| `DAILY_LIMIT` | No | Cuántas consultas puede hacer **cada código** por día (por defecto 40). Al llegar al tope, ese código tiene que esperar al día siguiente; los demás códigos no se ven afectados |
| `OPENAI_API_KEY` | No | Activa la transcripción de **audios subidos o grabados**. Sin esta variable, el dictado con el micrófono del navegador igual funciona |
| `TRANSCRIBE_MODEL` | No | Modelo de transcripción (por defecto `gpt-4o-transcribe`; si no existe, prueba `whisper-1`) |
| `PIPELINE_BUDGET_MS` | No | Tiempo máximo por respuesta en milisegundos (por defecto 55000; Netlify corta a los 60 s) |

Recomendación: en la consola de Anthropic (**Billing → Usage limit**), poné un **límite de gasto mensual** para la clave (para arrancar, con el uso real de esta primera etapa, 100 USD alcanza). El tope diario por código (`DAILY_LIMIT`) es una segunda defensa, pero no reemplaza este límite: es el que de verdad corta el gasto si algo se descontrola.

El tope diario usa **Netlify Blobs**, que viene incluido en cualquier sitio de Netlify — no hay que instalar ni configurar nada aparte.

## Qué hace cada parte

```
public/                     Interfaz (HTML, CSS, JS). Todo lo del alumno vive en su navegador.
netlify/functions/
  chat.mjs                  /api/chat: valida el acceso y el pedido, y arma la respuesta por SSE
  transcribe.mjs            /api/transcribe: audio a texto (opcional)
  lib/pipeline.mjs          borrador -> control de calidad -> corrección -> respuesta
  lib/prompt.mjs            arma el prompt de cada modo (con cache de prompts)
  lib/validate.mjs          valida y sanea lo que llega del navegador
  lib/lint.mjs              chequeos automáticos (fee en pesos, "dólares", negar el miedo…)
  lib/quota.mjs             tope diario de consultas por código de acceso (Netlify Blobs)
  lib/knowledge.generated.mjs   conocimiento compilado (se genera, no se edita a mano)
knowledge/
  manifest.json             qué secciones del Maestro y del núcleo entran en cada módulo y modo
  local/*.md                personalidad, reglas de certeza, etapas, errores, instrucciones de cada modo, verificador
tools/                      utilidades de desarrollo (no se usan en Netlify)
```

## Cómo crece el conocimiento

El Maestro (`Kit Producto ADA/MAESTRO-ARBITRAJE-DISENO.md`) y el núcleo (`ADA_PROSPECTOR_NUCLEO_CURADO.md`) son la fuente. La app no los copia a mano: los compila.

1. Editá el Maestro, el núcleo o un archivo de `knowledge/local/`.
2. Si sumás una sección nueva a un módulo, agregala en `knowledge/manifest.json`.
3. Ejecutá `tools/build-knowledge.ps1` (PowerShell de Windows; no requiere instalar nada) o pedile a Claude Code que lo haga.
4. Volvé a desplegar.

## Límites conocidos

- **Respuestas de hasta 60 segundos** (límite de Netlify). Un chat larguísimo con adjuntos pesados puede no llegar; en ese caso la app avisa y se puede mandar por tramos.
- **Tamaño del pedido: unos 5 MB.** Las imágenes se achican solas; los PDF se aceptan hasta 3,3 MB; los chats de texto hasta unos 150.000 caracteres (mandalos por tramos si son más largos).
- **Tope diario por código de acceso** (`DAILY_LIMIT`, por defecto 40 consultas). Si un alumno lo llega a necesitar, se le puede subir el número a él solo dándole un segundo código, o subiendo el valor general.
- **La memoria y los prospectos viven en el navegador del alumno.** Si cambia de dispositivo o borra los datos del navegador, no los recupera. Sincronizarlos entre dispositivos requiere cuentas por alumno (es la próxima etapa natural).
- **Dictado por voz:** usa el reconocimiento del navegador (Chrome, Edge y Safari). Firefox no lo trae.
- No tiene acceso a internet ni a bases de contactos: ayuda a definir a quién buscar, pero no genera listas de personas.
