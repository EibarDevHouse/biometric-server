Eres un ingeniero backend senior especializado en protocolos HTTP de bajo nivel y hardware IoT. Vas a implementar, dentro de este proyecto Next.js recién creado (App Router, TypeScript, Tailwind), un servidor que se comunica con dispositivos biométricos de asistencia mediante un protocolo HTTP push, MÁS un simulador del dispositivo para poder testear todo sin el hardware real.

## Contexto crítico del protocolo (fuente de verdad — no inventes nada fuera de esto)

Los dispositivos son CLIENTES HTTP: hacen POST a la raíz "/" del servidor a intervalos regulares. El servidor NUNCA inicia conexiones hacia ellos. Cada dispositivo se identifica por su número de serie en el header `dev_id` (string, máx 24 chars) — ese es su identificador único, nunca la IP.

Los dispositivos usan HTTP/1.0 con `Connection: close` y ponen campos de protocolo como HEADERS HTTP personalizados (no en el body). Body: string JSON UTF-8, opcionalmente seguido de bloques binarios concatenados. Cuando el JSON contiene "BIN_1", "BIN_2"... significa que ese campo es el bloque binario N ubicado después del JSON, en orden.

### Tipos de petición del dispositivo (header `request_code`):

1. `receive_cmd` — el dispositivo pregunta si hay comandos pendientes.
   Headers: request_code, dev_id, Content-Type: application/octet-stream, Content-Length.
   Body JSON: {"fk_name": string, "fk_time": "YYMMDDhhmmss", "fk_info": {"supported_enroll_data": string[], "fk_bin_data_lib": string, "firmware": string}}
   Respuesta del servidor SI HAY comando pendiente — headers: response_code: OK, trans_id: <id de tarea, máx 16 chars>, cmd_code: <código del comando>, Content-Type: application/octet-stream, Content-Length. Body: JSON de parámetros del comando (+ binarios si aplica).
   SI NO HAY comando: responder response_code: OK sin cmd_code ni trans_id, body vacío. IMPORTANTE: este caso no está 100% documentado, así que hazlo configurable vía env var NO_CMD_STRATEGY con valores "ok_empty" (default) | "error" (response_code: ERROR) para poder ajustar cuando probemos con el equipo real.

2. `send_cmd_result` — el dispositivo sube el resultado de un comando ejecutado.
   Headers: request_code, dev_id, trans_id, cmd_return_code (OK o string de error), blk_no (opcional).
   Fragmentación: si el resultado supera ~10KB llega en varios POST con blk_no = 1, 2, 3... y el ÚLTIMO bloque lleva blk_no = 0. El servidor debe acumular bloques por (dev_id + trans_id) en un buffer y ensamblar el resultado completo al recibir blk_no = 0. Sin blk_no = resultado completo en un solo POST.
   Respuesta del servidor — headers: response_code: OK, trans_id.

3. `realtime_glog` — marcación de asistencia en tiempo real (iniciativa del dispositivo).
   Body: {"user_id": string, "verify_mode": <valor o array como ["FP","PASSWORD"]>, "io_mode": number, "io_time": "YYYYMMDDhhmmss", "log_image": "BIN_1"} + binario opcional de imagen.
   Respuesta: header response_code: OK.

4. `realtime_enroll_data` — el dispositivo envía un usuario recién registrado.
   Body: {"user_id", "user_name", "user_privilege", "user_photo": "BIN_1", "enroll_data_array": [{"backup_number": n, "enroll_data": "BIN_2"}, ...]} + binarios.
   Respuesta: header response_code: OK.

### Catálogo de comandos que el servidor puede encolar (cmd_code → parámetros en body):

- GET_ENROLL_DATA → {"user_id": "...", "backup_number": n} (backup_number: 0-9 dedos, 10 password, 11 tarjeta ID, 12 rostro). Resultado: {"enroll_data":"BIN_1"} + binario, posiblemente fragmentado.
- SET_ENROLL_DATA → {"user_id", "backup_number", "enroll_data":"BIN_1"} + binario.
- SET_TIME → {"time": "YYYYMMDDhhmmss"}
- RESET_FK → sin parámetros (caso especial: se envía como response_code: RESET_FK)
- DELETE_USER → {"user_id": "..."}
- SET_USER_NAME → {"user_id", "user_name"}
- SET_USER_PRIVILEGE → {"user_id", "user_privilege": "MANAGER"|"REGISTER"|"OPERATOR"|"USER"}
- GET_USER_ID_LIST → sin parámetros. Resultado fragmentado: {"user_id_count", "one_user_id_size", "user_id_array":"BIN_1"}
- GET_LOG_DATA → {"begin_time", "end_time"} (vacíos = todos). Resultado fragmentado: {"log_count", "one_log_size", "log_array":"BIN_1"}
- SET_FK_NAME → {"fk_name": "..."}
- CLEAR_LOG_DATA, CLEAR_ENROLL_DATA, GET_DEVICE_STATUS → sin parámetros. GET_DEVICE_STATUS devuelve JSON con total_user_count, user_count, manager_count, fp_count, face_count, password_count, idcard_count, total_log_count.
- SET_USER_INFO → {"user_id","user_name","user_privilege","user_photo":"BIN_1","enroll_data_array":[...]} + múltiples binarios.
- GET_USER_INFO → {"user_id"}. Resultado: mismo formato que SET_USER_INFO.
- SET_WEB_SERVER_INFO → {"server_ip": "x.x.x.x", "server_port": n}

Ciclo de vida de un comando en la cola: WAIT (creado) → RUN (entregado al dispositivo) → RESULT (resultado recibido y guardado).

## Stack y decisiones fijas (no las cambies)

- Base de datos: SQLite con better-sqlite3 (sin ORM). Archivo en ./data/biometric.db. Migración automática al arrancar.
- El route handler raíz debe ser app/route.ts con runtime nodejs (export const runtime = "nodejs"; export const dynamic = "force-dynamic"). ATENCIÓN: Next.js NO permite page.tsx y route.ts en el mismo segmento — ELIMINA app/page.tsx y monta toda la UI bajo app/admin. En app/route.ts exporta también un GET que devuelva texto "Biometric server OK" para verificar en navegador.
- Lee el body SIEMPRE como bytes crudos: Buffer.from(await request.arrayBuffer()). NUNCA uses request.json().
- Simulador y scripts se ejecutan con tsx.

## Implementa en este orden, con checkpoint al final de cada fase

### FASE 1 — Infraestructura

1. Instala better-sqlite3, tsx y sus types.
2. lib/db.ts: conexión singleton + migración que crea tablas:
   - devices(dev_id PK, fk_name, firmware, fk_bin_data_lib, supported_enroll_data, last_seen_at, created_at)
   - commands(trans_id PK autoincremental, dev_id, cmd_code, cmd_param TEXT, cmd_binary BLOB NULL, status TEXT CHECK IN ('WAIT','RUN','RESULT','ERROR'), result_json TEXT NULL, result_binary BLOB NULL, cmd_return_code TEXT NULL, created_at, updated_at)
   - attendance_logs(id PK, dev_id, user_id, verify_mode TEXT, io_mode, io_time, log_image BLOB NULL, received_at)
   - users(id PK, dev_id, user_id, user_name, user_privilege, user_photo BLOB NULL, updated_at, UNIQUE(dev_id, user_id))
   - enroll_data(id PK, dev_id, user_id, backup_number, data BLOB, updated_at, UNIQUE(dev_id, user_id, backup_number))
   - block_buffer(dev_id, trans_id, blk_no, data BLOB, received_at, PRIMARY KEY(dev_id, trans_id, blk_no))
   - raw_traffic(id PK, direction TEXT, dev_id, request_code, headers_json TEXT, body_preview TEXT, body_size, binary_size, created_at) — el "modo espía": TODA petición y respuesta se registra aquí SIEMPRE, con los primeros 2000 chars del body como preview.
     ✅ Checkpoint: `npm run dev` arranca sin errores y el .db se crea con todas las tablas.

### FASE 2 — Parser del protocolo (con tests)

3. lib/protocol.ts con funciones puras:
   - parseBody(buf: Buffer): { json: object | null, binaries: Buffer[] } — encuentra el final del JSON contando llaves balanceadas RESPETANDO strings y escapes (una llave dentro de un string JSON no cuenta). Lo que sigue al JSON es binario. Los límites entre BIN_1, BIN_2... no vienen delimitados: para múltiples binarios devuelve el buffer restante completo como binaries[0] salvo que el JSON permita inferir tamaños; documenta esta limitación en un comentario.
   - buildResponse({responseCode, transId?, cmdCode?, bodyJson?, binary?}): { headers: Record<string,string>, body: Buffer }
   - Helpers de fecha: toDeviceTime(date): "YYYYMMDDhhmmss" y parseDeviceTime.
4. Tests unitarios con node:test (script "npm test" usando tsx --test): JSON solo, JSON+binario, JSON con llaves dentro de strings, body vacío, JSON malformado (no debe lanzar excepción, devuelve json: null).
   ✅ Checkpoint: npm test pasa todos los tests.

### FASE 3 — Route handler

5. app/route.ts: POST que (a) loguea la petición cruda en raw_traffic, (b) despacha según header request_code a handlers en lib/handlers/:
   - handleReceiveCmd: upsert del device con su info y last_seen; busca el comando WAIT más antiguo de ese dev_id; si existe lo marca RUN y responde con trans_id + cmd_code + params (+ binario si el comando lo tiene); si no, aplica NO_CMD_STRATEGY.
   - handleSendCmdResult: si trae blk_no ≠ 0 guarda en block_buffer y responde OK; si blk_no = 0 o no trae blk_no, ensambla (buffer ordenado + bloque final), parsea, guarda result_json/result_binary/cmd_return_code, marca el comando RESULT (o ERROR si cmd_return_code ≠ OK), limpia el buffer. Además: si el comando era GET_DEVICE_STATUS, GET_USER_INFO o GET_USER_ID_LIST, procesa el resultado hacia las tablas users/enroll_data cuando aplique.
   - handleRealtimeGlog: inserta en attendance_logs (binario = log_image si viene) y responde OK.
   - handleRealtimeEnrollData: upsert en users y enroll_data, responde OK.
   - request_code desconocido → response_code: ERROR + log.
     Toda respuesta también se registra en raw_traffic con direction "out". Manejo de errores: nunca lanzar 500 sin capturar; ante excepción responde response_code: ERROR y loguea el stack.
     ✅ Checkpoint: curl POST a "/" con headers y body de ejemplo de receive_cmd devuelve los headers correctos.

### FASE 4 — Simulador del dispositivo

6. scripts/simulator.ts (npm run simulator): simula un biométrico real contra http://localhost:3000.
   - Config por flags/env: DEV_ID (default "SIM001"), intervalo de polling (default 5s), SERVER_URL.
   - Estado en memoria: 3 usuarios fake con enroll_data binario aleatorio (fingerprints falsos de ~1KB), reloj interno.
   - Loop: cada intervalo hace receive_cmd con el body documentado (firmware "FK725HS001", supported ["FP","PASSWORD"], fk_bin_data_lib "FKDataHS001"). Si la respuesta trae cmd_code, lo "ejecuta" contra su estado fake y sube el resultado con send_cmd_result. Implementa TODOS los comandos del catálogo. GET_LOG_DATA y GET_USER_ID_LIST deben generar >25KB de datos fake para forzar la subida fragmentada en bloques de 8KB (blk_no 1..n, último = 0).
   - Comando interactivo: al presionar tecla "m" en la terminal, envía un realtime_glog simulando una marcación de un usuario aleatorio. Tecla "e": envía realtime_enroll_data.
   - Log en consola de todo lo que envía y recibe.
     ✅ Checkpoint: con dev server corriendo, el simulador aparece en la tabla devices y una marcación con "m" aparece en attendance_logs.

### FASE 5 — Panel admin (app/admin)

7. Páginas server-rendered con revalidación cada 3s o refresco manual, estilo simple con Tailwind:
   - /admin: dashboard con dispositivos (dev_id, nombre, firmware, last_seen con indicador online si <30s), contadores de logs y comandos pendientes.
   - /admin/commands: cola de comandos con estado y resultado; formulario para encolar un comando a un dispositivo (select de dev_id, select de cmd_code, textarea JSON de parámetros con placeholder según comando, validación). Server Actions, no API routes extra.
   - /admin/logs: marcaciones con filtro por dispositivo y fecha.
   - /admin/traffic: visor del raw_traffic (modo espía) con los últimos 200 registros, expandibles.
     ✅ Checkpoint: encolar SET_TIME desde la UI → el simulador lo recibe en su siguiente poll → el estado pasa WAIT → RUN → RESULT visible en la UI.

### FASE 6 — Verificación end-to-end

8. scripts/e2e.ts (npm run e2e): asume dev server corriendo; lanza el simulador programáticamente; encola SET_TIME, GET_DEVICE_STATUS y GET_LOG_DATA (este último para probar fragmentación); espera y verifica en la DB que los 3 llegaron a RESULT y que el resultado fragmentado se ensambló completo; dispara un realtime_glog y verifica el insert. Imprime PASS/FAIL por cada aserción y sale con código ≠ 0 si algo falla.
   ✅ Checkpoint final: npm run e2e imprime todo PASS.

## Reglas de trabajo

- Solo implementa lo especificado aquí. NO agregues autenticación, Docker, websockets, ni features extra.
- Después de cada fase reporta: ✅ [qué se completó] + cómo verificarlo manualmente.
- DETENTE Y PREGUNTA antes de: eliminar cualquier archivo distinto de app/page.tsx, cambiar el stack, o desviarte del esquema de DB.
- Si el protocolo es ambiguo en algún punto, elige la interpretación más literal de esta spec, márcalo con un comentario // AMBIGUO: y continúa — no inventes comportamiento fuera de la spec.
- Criterio de éxito: npm test pasa, npm run e2e imprime todo PASS, y el flujo UI → cola → simulador → resultado funciona de punta a punta.
