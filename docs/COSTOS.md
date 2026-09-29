# ADA Prospector · diseño para minimizar el costo por consulta

Estado: **implementada la fase 1 (la que más ahorra y menos riesgo tiene).** Quedan pendientes, diseñadas pero no construidas, la fase 2 (router barato, Biblioteca, buscador del método) y la fase 3 (topes de gasto). Los números siguen siendo estimaciones: sin clave de Anthropic no pude medir el gasto real. La app ya registra por consulta `input`, `output`, `cache_read` y `cache_write`; con una semana de uso real se calibra todo lo de abajo.

## Qué queda implementado hoy (código, no solo diseño)

1. **El chat y los archivos de texto ya no se reenvían completos en cada pregunta.** [`public/js/main.js`](../public/js/main.js) (`toApi`, `OLD_TEXT_KEEP_FULL`, `tailText`): un adjunto de texto de un mensaje que ya no es el último se manda como el resumen (participantes, fechas, cantidad de mensajes, ya generado por `attach.js`) más sus últimas ~1.800 letras. La respuesta anterior del mentor (que sí queda completa en el historial) hace de memoria del caso. Botón **"Reanalizar completo"** en el compositor para forzar el envío entero cuando haga falta.
2. **Tope de salida por modo.** [`knowledge/manifest.json`](../knowledge/manifest.json) → `maxTokens` por modo → [`netlify/functions/lib/prompt.mjs`](../netlify/functions/lib/prompt.mjs) (`modeConfig`) → [`chat.mjs`](../netlify/functions/chat.mjs) → [`pipeline.mjs`](../netlify/functions/lib/pipeline.mjs). El personaje del simulador (muchos turnos cortos) quedó en 800 tokens de salida en vez de los 12.000 que se usaban para todo.
3. **Verificador de citas, determinista y gratis.** [`lint.mjs`](../netlify/functions/lib/lint.mjs) (`checkCitas`): compara cada cita entre comillas del borrador contra lo que efectivamente se mandó en ese turno (no contra el chat completo, que puede estar resumido) y fuerza corrección si una cita no aparece. Cubre exactamente el riesgo que abre el punto 1: que el mentor invente una cita de un tramo que ya no ve completo.
4. **El mentor sabe que puede recibir el chat resumido.** [`knowledge/local/certeza.md`](../knowledge/local/certeza.md) ("Adjuntos ya analizados"): usa su propia respuesta anterior como memoria, no inventa sobre el tramo viejo, y si necesita releerlo le pide al alumno que toque "Reanalizar completo" en vez de simular que lo tiene.
5. **91 pruebas pasan** (61 de lógica del servidor + 30 de navegador) verificando `maxTokens` por modo, `checkCitas` y la tarjeta de resumen, sin necesitar la clave de Anthropic.

Esto ya reduce lo más caro (adjuntos reenviados y salida sin tope) sin tocar el modelo ni el control de calidad existente. Lo de abajo es lo que sigue diseñado para cuando se decida construirlo.

## 1. Dónde se va el gasto hoy (lectura del código actual)

Una consulta de análisis hace hasta **tres llamadas**, y cada una vuelve a enviar casi todo:

| Llamada | Modelo | Qué envía |
|---|---|---|
| Borrador | Opus 5 | ADA (~31.000 tokens: núcleo 8.600 + servicio 4.600 + captación 9.500 + conversación 6.200 + objeciones 2.300) + **toda la conversación** + historial + perfil y memoria |
| Control de calidad | Sonnet 5 | ADA otra vez (~32.000) + **toda la conversación otra vez** + el borrador. Las imágenes y PDF también viajan por segunda vez |
| Corrección (si el control marca algo) | Opus 5 | Todo lo del borrador + el borrador + las observaciones |

Problemas concretos, en orden de peso:

1. **El chat de WhatsApp se paga en cada pregunta y en cada llamada.** Se guarda en el navegador y se reenvía entero en cada turno (hasta 300.000 caracteres persistidos). En una charla de 4 preguntas, el chat es más de la mitad de todos los tokens de entrada.
2. **El control de calidad reenvía el chat completo** solo para revisar un borrador.
3. **El cache de ADA se rompe entre modos.** El segundo bloque en cache mezcla los módulos con la instrucción del modo, así que cada modo tiene su propio cache y comparten menos entre alumnos. Además el cache dura 5 minutos: con poco tráfico se paga la escritura (1,25 veces) y casi nunca la lectura (0,1 veces).
4. **La conversación no tiene punto de cache**: el chat largo nunca se lee a precio de cache.
5. **Los tokens de salida** (respuesta y pensamiento adaptativo de Opus) valen varias veces más que los de entrada y hoy `max_tokens` es 12.000 para todo. No lo medí; puede ser el mayor gasto.
6. **Todo va a Opus**, incluso "hacelo más corto" o el personaje del simulador, que son turnos de muchos mensajes.

## 2. Qué se envía siempre, qué se cachea, qué se resume, qué se guarda estructurado

| Información | Tratamiento | Cómo |
|---|---|---|
| Identidad, certeza, reglas invariables y prohibiciones (núcleo, ~8.600) | **Siempre. En cache.** | Primer bloque, idéntico para todos y todos los modos |
| Módulos de método (servicio, captación, conversación, objeciones, plan, ~26.000) | **Siempre. En cache, en el mismo bloque compartido** | Un único bloque para todos los modos, así hay **un solo cache** que usan todos los alumnos. Leer de más a 0,1 cuesta menos que escribir un cache distinto por modo a 1,25 |
| Instrucción del modo (~700) | Siempre, **después** del punto de cache | Cambia por modo sin invalidar lo anterior |
| Perfil del alumno | Siempre, pero **compacto** (una línea, ~150 tokens) | Solo los campos que el modo usa |
| Memoria del alumno (hasta 30 notas) | **Solo las 8 más relevantes** | Selección local por modo y palabras clave; el resto queda guardado y no se envía |
| Chat de WhatsApp | **Primera vez completo y compactado; después, ficha + cola + fragmentos** | Ver sección 3 |
| Historial de respuestas del mentor | **Resumido** | Las dos últimas completas; las anteriores reducidas a su tarjeta `resumen` (etapa y paso) y el mensaje sugerido |
| Imágenes y PDF | **Solo en el turno en que se suben** | Ya se hace para el mensaje activo; falta que el control de calidad no las reciba y que el resultado quede en la ficha |
| Borrador para el control de calidad | Siempre que haya control | Es chico |

## 3. Ficha del caso: contexto estructurado en lugar de reenviar el chat

Tras el primer análisis de una conversación, el mentor devuelve junto con la respuesta una **ficha del caso** (etiqueta `<caso>`, como ya funciona la memoria). La interfaz la guarda en el navegador y no la muestra. Tamaño objetivo: 400 a 700 tokens. Contenido:

- participantes y quién es el alumno (con el supuesto, si lo hubo);
- etapa actual y la anterior;
- línea de tiempo en 8 a 12 hechos con fecha y hora y **cita corta textual** (para poder verificar cada uno);
- necesidad detectada, objeciones y señales de interés;
- errores del alumno ya marcados, con su cita;
- lo pendiente y el próximo paso acordado.

En las preguntas siguientes se envía:

1. la ficha (~600);
2. **la cola del chat**: los últimos 25 mensajes textuales (~1.500), porque lo último es lo que define qué responder;
3. si la pregunta lo pide, **fragmentos del chat recuperados en el navegador** (búsqueda por palabra o fecha sobre el chat guardado, sin modelo ni embeddings): la ventana de mensajes alrededor de cada coincidencia;
4. el pedido del alumno.

Protecciones de certeza (lo que se pierde al resumir y cómo se compensa):
- La ficha se arma con citas, así que se puede comprobar por código que cada cita existe en el chat.
- La cola textual siempre viaja, y lo último es lo más importante.
- Botón **"Reanalizar con el chat completo"**: manda todo de nuevo (a precio de cache si pasaron menos de 5 minutos). El mentor lo ofrece solo cuando una pregunta necesita evidencia que no está en la ficha ni en los fragmentos.
- Si el chat cambia (el alumno adjunta uno nuevo o un tramo nuevo), la ficha se regenera.

### Compactado sin pérdida al leer el chat (sin modelo)

El export de WhatsApp repite fecha y hora en cada línea. Al leerlo en el navegador se transforma en encabezados por día y hora corta, se quitan los avisos del sistema y se colapsan los "Multimedia omitido" repetidos. Se conservan hora, autor y texto (hacen falta para medir tiempos de respuesta). Ahorro estimado: **20 a 30 %** del tamaño del chat, sin perder información.

## 4. Control de calidad más barato y más seguro

1. **Verificador determinista de citas (nuevo, gratis).** El servidor extrae de la respuesta todo lo que va entre comillas o marcado como cita y comprueba que exista en el chat (ignorando mayúsculas y signos). Si una cita no está, se corrige. Es **más certero que el modelo** para este defecto y no cuesta nada. También verifica presencia de la tarjeta `resumen`, largo del mensaje sugerido y los chequeos ya existentes (fee en pesos, "dólares", negar el miedo).
2. **El verificador con modelo (Sonnet) no recibe el chat completo.** Recibe ficha + cola + borrador. Con el cache compartido, el conocimiento le cuesta lectura y no escritura.
3. **Verificación por niveles.**
   - Siempre con modelo: la **primera respuesta de cada caso**, cualquier respuesta con alerta de seguridad, cualquier mensaje sugerido que mencione porcentaje, precio o monto, y cuando los chequeos deterministas marcan algo.
   - Solo chequeos deterministas: transformaciones mecánicas de algo ya verificado ("más corto", "otra opción", "más directo") y la evaluación de simulaciones de menos de 6 mensajes.
   - Muestreo del 15 % de las respuestas sin control, para monitorear que no se cuele nada; los resultados van a los registros.

   Es la decisión que más toca tu prioridad de certeza: por eso es una decisión tuya (sección 8).

## 5. Elegir el modelo y el esfuerzo según la tarea

| Tarea | Modelo | Pensamiento | `max_tokens` |
|---|---|---|---|
| Primer análisis de conversación, captura, prospecto | Opus 5 | adaptativo, medio | 4.000 |
| ¿Qué le respondo? con contexto corto | Opus 5 | adaptativo, bajo | 2.000 |
| Transformaciones ("más corto", "otra opción") | Sonnet 5 | sin pensamiento | 1.200 |
| Buscar clientes, mejorar mensaje | Sonnet 5 primero; si el control lo rechaza, Opus | bajo | 2.500 |
| **Personaje del simulador** (muchos turnos) | **Sonnet 5** | sin pensamiento | 700 |
| Evaluación del simulador | Opus 5 | medio | 3.000 |

Condición: **no se cambia ningún modelo sin probarlo antes** con 15 a 20 casos reales de alumnos (yo armo el set y comparo). Si Sonnet 5 no alcanza en un modo, ese modo queda en Opus.

Un tope de `max_tokens` por modo también limita el peor caso de gasto por consulta.

## 6. Consultas que se resuelven sin llamar al modelo

| Consulta | Cómo se resuelve | Costo |
|---|---|---|
| Primer mensaje por tipo de cliente (3 tipos, 2 variantes) | **Biblioteca** con campos `{nombre}` y `{señal}` que el alumno completa en pantalla | 0 |
| Respuesta a objeciones tipificadas (es caro, lo pienso, ya tengo quien, Binance, legal, bajame) | **Biblioteca** con el texto, "qué pasa en realidad" y "qué no decir". Si el alumno pega una objeción, la app **sugiere** el texto de la biblioteca (por palabras clave) con el botón "Adaptar a mi caso" que sí usa IA | 0 sin adaptar |
| Guion del "no" y reglas fijas del método | **Buscador del método**: búsqueda por palabras sobre las secciones, en una función del servidor con código de acceso (no se envía toda la doctrina al navegador). Devuelve el texto literal con su título | 0 |
| Las 13 etapas y sus reglas | Pantalla de referencia | 0 |
| Seguimientos de hoy, contadores, cambio de etapa, filtros | Todo local (ya es así) | 0 |
| Consulta libre fuera de alcance (bloqueos, retiros, impuestos) | **Router con Haiku 4.5** con un prompt de ~300 tokens sin el conocimiento de ADA: clasifica "dentro / fuera de alcance" y el tipo de pedido. Si está fuera, responde la derivación al canal privado sin llamar a Opus | fracción de centavo |
| Pedido repetido (doble clic, reintento por corte de red) | El navegador reusa la última respuesta si el pedido es idéntico | 0 |
| Chat muy largo | Aviso previo con el tamaño estimado y sugerencia de mandar solo el tramo relevante | evita gasto |

No se comparte cache de **respuestas** entre alumnos: serían conversaciones de otras personas. Solo se comparte el cache del conocimiento de ADA, que es igual para todos.

## 7. Estimación (supuestos: sistema 33.000 tokens, chat 20.000, 4 preguntas seguidas; "eq." = tokens de entrada ponderados por el precio del cache: escritura 1,25, lectura 0,1, normal 1)

| | Hoy | Propuesto |
|---|---|---|
| Opus, entrada, turno 1 | ~61.000 eq. (cache frío) | ~18.000 con cache compartido tibio; ~56.000 si está frío |
| Opus, entrada, turnos 2 a 4 | ~27.000 cada uno | ~7.000 cada uno (ficha + cola) |
| **Opus, entrada, total de 4 turnos** | **~142.000** | **~39.000 a ~77.000** (−45 % a −72 %) |
| Sonnet (control), entrada, total | ~144.000 | ~26.000 (−80 %), con control solo en respuestas que lo necesitan |
| Salida | sin tope (12.000) | tope por modo; el simulador pasa a Sonnet |

Lo más probable es que el mayor ahorro absoluto salga de la salida y del pensamiento, que hoy no tienen tope real. Eso se confirma con la primera semana de registros.

Riesgo de la estimación: el cache dura 5 minutos. Si el uso es esporádico, el primer turno paga escritura. Si los registros muestran `cache_write` mucho mayor que `cache_read`, pasamos el bloque compartido a cache de **1 hora** (la escritura cuesta 2 veces, pero se amortiza con pocas lecturas por hora entre todos los alumnos).

## 8. Límites de gasto (protección, no ahorro)

**Implementado:**
- **Tope diario de consultas por código de acceso**, guardado en Netlify Blobs (viene con Netlify, sin servicios extra) — variable `DAILY_LIMIT`, por defecto 40. Ver [`lib/quota.mjs`](../netlify/functions/lib/quota.mjs). Un código filtrado o mal usado deja de gastar al llegar al tope, sin afectar a los demás alumnos. Si Blobs falla por algún motivo, la consulta se deja pasar (no se rompe la herramienta por esto): el límite de gasto de Anthropic sigue siendo la protección de fondo.
- **Tamaño de adjuntos de texto bajado a 150.000 caracteres** (antes 550.000), en el navegador y en el servidor.

**Pendiente, acción manual del administrador (no se puede hacer desde el código):**
- **Límite de gasto mensual en la consola de Anthropic** (Billing → Usage limit). Es lo único que corta el gasto de verdad de punta a punta; hay que cargarlo a mano ahí, no hay forma de hacerlo desde Netlify ni desde este repositorio. Recomendado para arrancar: 100 USD.
- Un código de acceso **por alumno** (no uno compartido): ya es posible hoy (separar `ACCESS_CODES` por coma), falta que el administrador efectivamente emita uno distinto por alumno en vez de repartir el mismo.
- Un registro de métricas por consulta (modo, modelo, tokens, cache, nivel de control) para calcular el costo real por alumno — el servidor ya loguea esto (`console.log` con `evt:"chat"`), falta un tablero que lo lea.

## 9. Orden de implementación propuesto

**Fase 1 (bajo riesgo, se nota enseguida):** un solo bloque de cache compartido con la instrucción después; punto de cache en el chat; `max_tokens` y esfuerzo por modo; compactado del chat de WhatsApp; historial resumido; control de calidad sin reenviar el chat cuando hay ficha; aviso de tamaño antes de enviar.

**Fase 2 (más ahorro, toca la calidad, se prueba con casos):** ficha del caso + cola + fragmentos; verificador de citas determinista; control por niveles; Sonnet en simulador y transformaciones; router con Haiku; Biblioteca y buscador del método.

**Fase 3 (operación):** códigos por alumno con tope diario; ajuste a cache de 1 hora; tablero simple de costo por alumno leyendo los registros.

## 10. Decisiones tomadas y las que siguen abiertas

Ya decidí y construí el punto 2 (versión liviana: resumen determinista + cola, no una ficha generada por el modelo) y el tope de salida del punto 3 solo para el simulador, porque no tocan la calidad de las respuestas nuevas, solo cuánto se reenvía de lo viejo. No cambié de modelo en ningún modo (sigue todo en Opus/Sonnet como estaba): eso sí puede tocar la calidad y no lo voy a hacer sin que lo veas funcionar primero con casos reales.

Lo que sigue siendo tu decisión:

1. **Sonnet para el personaje del simulador y para transformaciones ("más corto", "otra opción").** Ahorra bastante porque son turnos frecuentes y cortos, pero hay que probarlo con 15–20 casos reales antes de dejarlo así. ¿Lo probamos apenas tengamos la clave cargada en Netlify?
2. **Verificación por niveles** (saltear el control con modelo en transformaciones mecánicas, apoyándose en que el texto de origen ya fue verificado). Ahorra, pero es la pieza que más toca tu prioridad de certeza si algo se me escapó en el diseño.
3. **Tope diario por alumno y límite mensual.** Falta implementar (Netlify Blobs + límite en la consola de Anthropic). ¿Qué presupuesto mensual querés como techo?
4. **Un código por alumno o uno compartido.** Sin códigos individuales no hay forma de cortarle el paso a uno solo si se filtra o se excede.
5. **Biblioteca de primeros mensajes y objeciones, y buscador del método** (fase 2): quitan llamadas al modelo por completo en esos casos. Las armo cuando confirmes que quieres esa superficie nueva en la interfaz (una pantalla más).
