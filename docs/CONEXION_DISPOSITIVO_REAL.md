# Guía: Conexión de Dispositivo Biométrico Real

**Última actualización:** 2026-07-29  
**Versión:** 1.0

---

## 📋 Contenido

1. [Requisitos previos](#requisitos-previos)
2. [Configuración del dispositivo](#configuración-del-dispositivo)
3. [Verificación de conectividad](#verificación-de-conectividad)
4. [Primeros pasos](#primeros-pasos)
5. [Troubleshooting](#troubleshooting)
6. [Monitoreo en tiempo real](#monitoreo-en-tiempo-real)

---

## Requisitos previos

### Hardware
- ✅ Dispositivo biométrico compatible (ej: FK725HS, ZKTeco, etc.)
- ✅ Conexión Ethernet o WiFi
- ✅ Cable de alimentación

### Software en servidor
- ✅ Servidor biométrico ejecutándose (`npm run dev`)
- ✅ IP accesible desde la red del dispositivo
- ✅ Puerto 3000 abierto (o el que hayas configurado)

### Información del dispositivo
Antes de conectar, recolecta esta información:
- Número de serie (dev_id) — típicamente en la etiqueta del dispositivo
- Modelo y firmware
- Dirección IP que usará en la red

### Red
- ✅ Dispositivo y servidor en la **misma red** (o rutas configuradas)
- ✅ Sin firewall bloqueando puerto 3000
- ✅ Prueba con `ping <server_ip>` desde el dispositivo si es posible

---

## Configuración del dispositivo

### 1. Acceso a la interfaz de administración

**Método típico (depende del modelo):**
- Presiona los botones de función durante el booteo
- O accede via web: `http://<device_ip>:8080` (varía según modelo)
- Credenciales default: admin/admin (verificar manual del dispositivo)

### 2. Configurar dirección del servidor

**Campo a buscar en la interfaz de administración:**
```
Network Settings → Web Server
  Server IP: <tu_ip_servidor>
  Server Port: 3000
  Protocol: HTTP
```

**O via comando del servidor (después de conectado):**

Desde panel admin:
```
Device: <dev_id>
Command: SET_WEB_SERVER_INFO
Parameters: {
  "server_ip": "192.168.1.100",
  "server_port": 3000
}
```

### 3. Sincronizar reloj del dispositivo

**Muy importante** — los logs necesitan timestamps correctos:

Desde panel admin:
```
Device: <dev_id>
Command: SET_TIME
Parameters: {
  "time": "20260729143045"
}
```

Formato: `YYYYMMDDhhmmss`

### 4. Configurar nombre del dispositivo (opcional)

```
Device: <dev_id>
Command: SET_FK_NAME
Parameters: {
  "fk_name": "Puerta Entrada - Piso 1"
}
```

---

## Verificación de conectividad

### 1. Verificar que el servidor está escuchando

```bash
# En el servidor
netstat -an | grep 3000
# Output esperado: Listening on 0.0.0.0:3000
```

### 2. Verificar que el dispositivo puede alcanzar el servidor

**Desde el dispositivo (si tiene terminal):**
```bash
ping <server_ip>
telnet <server_ip> 3000
```

**Desde el servidor (simular conexión):**
```bash
curl -X POST http://localhost:3000/ \
  -H "dev_id: TEST_DEVICE" \
  -H "request_code: receive_cmd" \
  -H "Content-Type: application/octet-stream" \
  -d '{}'
```

**Resultado esperado:**
```http
HTTP/1.1 200 OK
response_code: OK
```

### 3. Ver en el panel admin

Accede a `http://localhost:3000/admin/`:
- **Dashboard:** ¿Aparece el dispositivo en la tabla "Connected Devices"?
- **Traffic:** ¿Aparecen peticiones del dispositivo en `/admin/traffic`?

---

## Primeros pasos

### Fase 1: Registro de usuarios (0-1 horas)

**Opción A — Via dispositivo (recomendado):**
1. Accede a interfaz del dispositivo
2. Selecciona "Enroll User"
3. Escanea finger/rostro de usuarios
4. El dispositivo enviará `realtime_enroll_data` automáticamente

**Opción B — Via servidor (sin interface del dispositivo):**
```
Device: <dev_id>
Command: SET_USER_INFO
Parameters: {
  "user_id": "U001",
  "user_name": "Juan Pérez",
  "user_privilege": "USER"
}
```

**Verificar que llegó:**
```
Device: <dev_id>
Command: GET_USER_ID_LIST
Parameters: {}
```

### Fase 2: Prueba de asistencia (15 mins)

1. Usuario se acerca al dispositivo
2. Escanea dedo/rostro
3. Dispositivo hace `realtime_glog`
4. Verifica en `/admin/logs` — ¿Aparece el log?

### Fase 3: Sincronización de datos (30 mins)

**Hacer backup de datos antes de limpiar:**

```
Device: <dev_id>
Command: GET_USER_ID_LIST
Parameters: {}
→ Guarda lista de usuarios
```

```
Device: <dev_id>
Command: GET_LOG_DATA
Parameters: {}
→ Guarda todos los logs (fragmentado si >25KB)
```

```
Device: <dev_id>
Command: GET_USER_INFO
Parameters: {"user_id": "U001"}
→ Repite para cada usuario
```

---

## Troubleshooting

### El dispositivo no conecta al servidor

**Verificaciones (en orden):**

| Síntoma | Verificar | Solución |
|---------|-----------|----------|
| Peticiones no llegan | ¿Firewall del servidor abierto? | `ufw allow 3000` (Linux) o abrir en Windows Firewall |
| Peticiones no llegan | ¿IP correcta en dispositivo? | Ejecuta `ipconfig` / `hostname -I` en servidor |
| Timeout al conectar | ¿Dispositivo puede hacer ping al servidor? | Verificar conexión de red, rutas, DNS |
| Error 500 del servidor | Ver logs en `/admin/traffic` | Expandir petición y revisar errores |

### El dispositivo conecta pero no es reconocido

**Problema:** El dispositivo aparece offline en dashboard

**Causas comunes:**
1. `last_seen_at` es NULL → No ha enviado petición aún
2. Dispositivo configurado con IP incorrecta → Cambiar en interfaz del dispositivo
3. Puerto incorrecto → SET_WEB_SERVER_INFO con puerto correcto

**Solución:**
```
Device: <dev_id>
Command: GET_DEVICE_STATUS
Parameters: {}
→ Si falla: dispositivo no puede conectar
→ Si funciona: dispositivo conectó en algún momento
```

### Los logs no se sincronizan

**Verificar:**
1. ¿Hay marcaciones? → `/admin/logs` con filtro por dispositivo
2. ¿El reloj está sincronizado? → SET_TIME con fecha actual
3. ¿El dispositivo está en modo offline? → Hacer GET_LOG_DATA

**Si los logs están >25KB:**
```
Device: <dev_id>
Command: GET_LOG_DATA
Parameters: {}
→ Se fragmenta en bloques de 8KB
→ Ver en /admin/traffic → últimas peticiones
→ Estado debe ser RESULT cuando termine
```

### El dispositivo se desconecta

**Causas:**
- Reinicio del dispositivo (normal después de firmware update)
- Pérdida de red (revisa conectividad)
- Timeout del servidor (revisar logs)

**Acción:**
- Normal: esperar que reconecte automáticamente (próximo poll)
- Forzar reconexión: apagar/encender el dispositivo
- Debug: ver en `/admin/traffic` qué sucede

---

## Monitoreo en tiempo real

### Dashboard de tiempo real

**URL:** `http://localhost:3000/admin/`

Información que ves:
- **Dispositivos conectados:** Verde si `last_seen_at < 30s`
- **Comandos pendientes:** Número en azul
- **Logs totales:** Contador general

**Refresco:** Automático cada 3 segundos

### Inspector de tráfico

**URL:** `http://localhost:3000/admin/traffic`

Ver:
- ← IN: Peticiones del dispositivo
- → OUT: Respuestas del servidor
- Headers exactos intercambiados
- Body completo (JSON + binario)

**Uso:** Debug cuando algo no funciona

### Cola de comandos

**URL:** `http://localhost:3000/admin/commands`

Estados:
- 🟡 **WAIT** — Esperando que dispositivo lo ejecute
- 🔵 **RUN** — Dispositivo recibió el comando
- 🟢 **RESULT** — Completado con éxito
- 🔴 **ERROR** — Falló en ejecución

**Expandir fila** para ver:
- Parámetros enviados
- Respuesta JSON del dispositivo
- Timestamps

---

## Flujo típico de una marcación

```
1. Usuario se acerca al dispositivo
   ↓
2. Dispositivo captura biométrico
   ↓
3. Dispositivo verifica y reconoce usuario
   ↓
4. Dispositivo hace POST realtime_glog:
   - dev_id: <serial del dispositivo>
   - request_code: realtime_glog
   - user_id: U001
   - verify_mode: FP
   - io_time: 20260729143045
   ↓
5. Servidor recibe y guarda en attendance_logs
   ↓
6. Aparece en /admin/logs
   ↓
7. ¡Listo!
```

---

## Flujo típico de sincronización

```
Servidor inicia (por horario o manual):
   ↓
GET_USER_ID_LIST → Lista de usuarios
   ↓
Para cada usuario:
  GET_USER_INFO → Datos completos
   ↓
GET_LOG_DATA → Todos los logs (puede fragmentarse)
   ↓
[Guardar en base de datos central]
   ↓
CLEAR_LOG_DATA → Liberar memoria del dispositivo
   ↓
✓ Sincronización completa
```

---

## Checklist de implementación

### Antes de conectar
- [ ] Servidor corriendo: `npm run dev`
- [ ] IP del servidor documentada
- [ ] Puerto 3000 abierto en firewall
- [ ] Dispositivo en misma red

### Conectar dispositivo
- [ ] Configurar IP del servidor en dispositivo
- [ ] Sincronizar hora: SET_TIME
- [ ] Dar nombre: SET_FK_NAME (opcional)
- [ ] Verificar en dashboard que aparece

### Registrar usuarios
- [ ] Escanear/registrar usuarios en dispositivo
- [ ] GET_USER_ID_LIST para verificar
- [ ] GET_USER_INFO para cada usuario

### Pruebas
- [ ] Usuario se acerca y marca
- [ ] Log aparece en /admin/logs
- [ ] Timestamp es correcto
- [ ] GET_DEVICE_STATUS devuelve datos correctos

### Producción
- [ ] Backup inicial: GET_LOG_DATA + GET_USER_ID_LIST
- [ ] Sincronización programada (diaria recomendado)
- [ ] Monitoreo: revisar /admin/traffic regularmente
- [ ] Alertas si `last_seen_at > 30 minutos`

---

## Casos especiales

### Dispositivo con múltiples localizaciones

Crear un dispositivo por ubicación:
```
Dispositivo 1: DEV_PUERTA_1 (Entrada)
Dispositivo 2: DEV_PUERTA_2 (Salida)
Dispositivo 3: DEV_OFICINA (Oficina central)
```

Cada uno reporta independientemente.

### Migración de dispositivo antiguo

```
1. GET_LOG_DATA (backup completo)
2. GET_USER_ID_LIST → obtener usuarios
3. Para cada usuario: GET_USER_INFO
4. Configurar nuevo dispositivo
5. SET_USER_INFO en nuevo dispositivo
6. CLEAR_LOG_DATA en dispositivo antiguo
7. Apagar dispositivo antiguo
```

### Reset de dispositivo

```
Device: <dev_id>
Command: CLEAR_ENROLL_DATA
Parameters: {}
→ Elimina todos los usuarios y biométricos
→ LOG DATA se mantiene
```

---

## Soporte y debugging

### Logs del servidor

En terminal donde corre `npm run dev`:
```
[next] GET /admin/traffic
[next] POST / (realtime_glog)
[next] GET /admin/commands
```

### Inspeccionar petición HTTP cruda

En `/admin/traffic`, expandir una petición:
```
Headers:
  dev_id: DEV001
  request_code: receive_cmd
  Content-Type: application/octet-stream
  Content-Length: 256

Body (JSON):
{
  "fk_name": "FK725HS001",
  "fk_time": "260729140000",
  "fk_info": {...}
}
```

### Simular petición desde línea de comandos

```bash
# Simular receive_cmd
curl -X POST http://localhost:3000/ \
  -H "dev_id: DEV001" \
  -H "request_code: receive_cmd" \
  -H "Content-Type: application/octet-stream" \
  -d '{"fk_name":"Test"}'

# Simular send_cmd_result
curl -X POST http://localhost:3000/ \
  -H "dev_id: DEV001" \
  -H "request_code: send_cmd_result" \
  -H "trans_id: 1" \
  -H "cmd_return_code: OK" \
  -d '{"status":"ok"}'
```

---

## Contacto y ayuda

Si algo no funciona:

1. **Revisa en `/admin/traffic`** — ¿qué exactamente envía el dispositivo?
2. **Expande un comando en `/admin/commands`** — ¿cuál es la respuesta?
3. **Verifica timestamp en logs** — ¿la hora es correcta?
4. **Consulta el manual del dispositivo** — parámetros pueden variar por modelo

---

## Recursos adicionales

- [COMANDOS.md](COMANDOS.md) — Catálogo completo de comandos
- [README.md](README.md) — Arquitectura y flujo general
- `/admin/traffic` — Visor de tráfico en tiempo real
- `/admin/logs` — Historial de marcaciones
