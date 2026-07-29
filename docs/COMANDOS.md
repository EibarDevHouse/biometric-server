# Catálogo Completo de Comandos - Servidor Biométrico

**Última actualización:** 2026-07-29  
**Versión:** 1.0

---

## 📋 Índice de comandos

1. [Gestión de dispositivos](#gestión-de-dispositivos)
2. [Gestión de usuarios](#gestión-de-usuarios)
3. [Gestión de datos biométricos](#gestión-de-datos-biométricos)
4. [Gestión de logs](#gestión-de-logs)
5. [Gestión de información del servidor](#gestión-de-información-del-servidor)

---

## Gestión de dispositivos

### GET_DEVICE_STATUS
**Descripción:** Obtiene el estado actual del dispositivo (conteos de usuarios, logs, etc.)

**Parámetros JSON:** (vacío)
```json
{}
```

**Ejemplo en panel admin:**
- **Device:** SIM001
- **Command:** GET_DEVICE_STATUS
- **Parameters:** `{}`

**Respuesta esperada:**
```json
{
  "totalUserCount": 15,
  "userCount": 12,
  "managerCount": 2,
  "fpCount": 24,
  "faceCount": 0,
  "passwordCount": 5,
  "idcardCount": 3,
  "totalLogCount": 1250
}
```

**Campos de respuesta:**
| Campo | Tipo | Significado |
|-------|------|------------|
| `totalUserCount` | number | Total de usuarios en dispositivo |
| `userCount` | number | Usuarios activos (excluye managers) |
| `managerCount` | number | Usuarios con privilegio MANAGER |
| `fpCount` | number | Fingerprints registrados |
| `faceCount` | number | Rostros registrados |
| `passwordCount` | number | Contraseñas registradas |
| `idcardCount` | number | Tarjetas ID registradas |
| `totalLogCount` | number | Total de marcaciones de asistencia |

**Notas:**
- Útil para verificar estado del dispositivo antes de operaciones masivas
- No modifica estado del dispositivo
- Respuesta es inmediata (no requiere fragmentación)

---

### SET_FK_NAME
**Descripción:** Asigna un nombre/identificador al dispositivo

**Parámetros JSON:**
```json
{
  "fk_name": "Puerta Entrada Principal"
}
```

**Campos requeridos:**
| Campo | Tipo | Máx | Descripción |
|-------|------|-----|------------|
| `fk_name` | string | 64 | Nombre descriptivo del dispositivo |

**Ejemplo en panel admin:**
```
Device: SIM001
Command: SET_FK_NAME
Parameters: {"fk_name":"Oficina Piso 3"}
```

**Respuesta esperada:**
```json
{"status": "ok"}
```

**Notas:**
- Puramente informativo
- Se usa para identificar dispositivos en reportes
- No afecta funcionalidad

---

### SET_WEB_SERVER_INFO
**Descripción:** Configura la dirección del servidor web (no usado en arquitectura push)

**Parámetros JSON:**
```json
{
  "server_ip": "192.168.1.100",
  "server_port": 3000
}
```

**Campos requeridos:**
| Campo | Tipo | Formato | Descripción |
|-------|------|---------|------------|
| `server_ip` | string | x.x.x.x | IP del servidor |
| `server_port` | number | 1-65535 | Puerto del servidor |

**Ejemplo en panel admin:**
```
Device: SIM001
Command: SET_WEB_SERVER_INFO
Parameters: {"server_ip":"10.0.0.50","server_port":3000}
```

**Respuesta esperada:**
```json
{"status": "ok"}
```

**Notas:**
- En arquitectura actual (push), el dispositivo ya conoce la dirección
- Se usa para reconfiguración remota
- El dispositivo se conectará a esta dirección en próximos polls

---

### SET_TIME
**Descripción:** Sincroniza el reloj del dispositivo

**Parámetros JSON:**
```json
{
  "time": "20260729143045"
}
```

**Campos requeridos:**
| Campo | Tipo | Formato | Descripción |
|-------|------|---------|------------|
| `time` | string | YYYYMMDDhhmmss | Fecha/hora a establecer |

**Desglose del formato:**
- `YYYY`: Año (2026)
- `MM`: Mes (01-12)
- `DD`: Día (01-31)
- `hh`: Hora (00-23)
- `mm`: Minuto (00-59)
- `ss`: Segundo (00-59)

**Ejemplo en panel admin:**
```
Device: SIM001
Command: SET_TIME
Parameters: {"time":"20260729143045"}
```

**Ejemplo práctico (ahora):**
```json
{"time":"20260729153000"}
```

**Respuesta esperada:**
```json
{"status": "ok"}
```

**Notas:**
- Crítico para que los logs tengan timestamps correctos
- Se recomienda sincronizar diariamente o cuando cambia zona horaria
- Mejor hacerlo en horario de poco uso para no afectar operaciones

---

## Gestión de usuarios

### SET_USER_NAME
**Descripción:** Cambia el nombre de un usuario existente

**Parámetros JSON:**
```json
{
  "user_id": "U001",
  "user_name": "Juan Pérez García"
}
```

**Campos requeridos:**
| Campo | Tipo | Máx | Descripción |
|-------|------|-----|------------|
| `user_id` | string | 32 | ID único del usuario (ej: U001, EMP123) |
| `user_name` | string | 128 | Nombre completo |

**Ejemplo en panel admin:**
```
Device: SIM001
Command: SET_USER_NAME
Parameters: {"user_id":"U042","user_name":"María López"}
```

**Respuesta esperada:**
```json
{"status": "ok"}
```

**Notas:**
- No requiere que el usuario exista previamente
- Si no existe, lo crea
- Útil para corregir errores de entrada o cambios de nombre

---

### SET_USER_PRIVILEGE
**Descripción:** Asigna nivel de privilegios a un usuario

**Parámetros JSON:**
```json
{
  "user_id": "U001",
  "user_privilege": "MANAGER"
}
```

**Campos requeridos:**
| Campo | Tipo | Opciones | Descripción |
|-------|------|----------|------------|
| `user_id` | string | — | ID único del usuario |
| `user_privilege` | string | MANAGER, REGISTER, OPERATOR, USER | Nivel de acceso |

**Niveles de privilegio:**
| Privilegio | Descripción | Uso típico |
|-----------|------------|-----------|
| `USER` | Usuario regular, solo marcación | Empleados estándar |
| `OPERATOR` | Puede ver logs, reportes | Supervisores, RH |
| `REGISTER` | Puede registrar nuevos usuarios | Administradores de registros |
| `MANAGER` | Acceso total al dispositivo | Administrador del dispositivo |

**Ejemplo en panel admin:**
```
Device: SIM001
Command: SET_USER_PRIVILEGE
Parameters: {"user_id":"U010","user_privilege":"OPERATOR"}
```

**Respuesta esperada:**
```json
{"status": "ok"}
```

**Notas:**
- Los cambios aplican inmediatamente
- Es el único comando que afecta permisos en el dispositivo
- MANAGER tiene acceso a funciones administrativas del dispositivo

---

### DELETE_USER
**Descripción:** Elimina un usuario del dispositivo (y todos sus datos biométricos)

**Parámetros JSON:**
```json
{
  "user_id": "U999"
}
```

**Campos requeridos:**
| Campo | Tipo | Descripción |
|-------|------|------------|
| `user_id` | string | ID del usuario a eliminar |

**Ejemplo en panel admin:**
```
Device: SIM001
Command: DELETE_USER
Parameters: {"user_id":"U050"}
```

**Respuesta esperada:**
```json
{"status": "ok"}
```

**⚠️ Advertencia:**
- **Esta acción es irreversible**
- Elimina toda información del usuario (nombre, datos biométricos, foto)
- Los logs históricos se mantienen
- Se recomienda hacer backup antes de borrar usuarios importantes

---

### GET_USER_INFO
**Descripción:** Obtiene información completa de un usuario

**Parámetros JSON:**
```json
{
  "user_id": "U001"
}
```

**Campos requeridos:**
| Campo | Tipo | Descripción |
|-------|------|------------|
| `user_id` | string | ID del usuario |

**Ejemplo en panel admin:**
```
Device: SIM001
Command: GET_USER_INFO
Parameters: {"user_id":"U025"}
```

**Respuesta esperada:**
```json
{
  "user_id": "U025",
  "user_name": "Carlos Rodríguez",
  "user_privilege": "USER",
  "user_photo": "BIN_1",
  "enroll_data_array": [
    {"backup_number": 0},
    {"backup_number": 1},
    {"backup_number": 10}
  ]
}
```

**Campos de respuesta:**
| Campo | Tipo | Descripción |
|-------|------|------------|
| `user_id` | string | ID del usuario |
| `user_name` | string | Nombre completo |
| `user_privilege` | string | Nivel de privilegios |
| `user_photo` | BIN_1 | Foto binaria (opcional) |
| `enroll_data_array` | array | Array de datos biométricos registrados |

**Backup numbers (enroll_data_array):**
| Número | Tipo | Descripción |
|--------|------|------------|
| 0-9 | Fingerprint | 10 dedos (0=pulgar derecho, etc) |
| 10 | Password | Contraseña |
| 11 | ID Card | Tarjeta de identificación |
| 12 | Face | Reconocimiento facial |

**Notas:**
- Puede retornar >25KB si hay mucha data biométrica
- Se fragmenta automáticamente en bloques de 8KB si es necesario
- user_photo es binario, no se muestra en panel admin

---

### SET_USER_INFO
**Descripción:** Crea o actualiza un usuario completo con todos sus datos

**Parámetros JSON:**
```json
{
  "user_id": "U050",
  "user_name": "Laura Martínez",
  "user_privilege": "OPERATOR",
  "user_photo": "BIN_1",
  "enroll_data_array": [
    {"backup_number": 0},
    {"backup_number": 1},
    {"backup_number": 10}
  ]
}
```

**Campos requeridos:**
| Campo | Tipo | Descripción |
|-------|------|------------|
| `user_id` | string | ID único del usuario |
| `user_name` | string | Nombre completo |
| `user_privilege` | string | MANAGER, REGISTER, OPERATOR, USER |

**Campos opcionales:**
| Campo | Tipo | Descripción |
|-------|------|------------|
| `user_photo` | BIN_1 | Foto binaria (JPG/PNG) |
| `enroll_data_array` | array | Array de datos biométricos |

**Ejemplo en panel admin (sin foto/biométricos):**
```
Device: SIM001
Command: SET_USER_INFO
Parameters: {
  "user_id": "U100",
  "user_name": "Nuevo Usuario",
  "user_privilege": "USER"
}
```

**Ejemplo en panel admin (completo):**
```
Device: SIM001
Command: SET_USER_INFO
Parameters: {
  "user_id": "U101",
  "user_name": "Usuario Completo",
  "user_privilege": "OPERATOR",
  "enroll_data_array": [
    {"backup_number": 0},
    {"backup_number": 1}
  ]
}
```

**Respuesta esperada:**
```json
{"status": "ok"}
```

**Notas:**
- Es el comando más completo para crear/actualizar usuarios
- Si el usuario ya existe, lo actualiza (excepto datos biométricos)
- Los datos biométricos deben enviarse por separado con SET_ENROLL_DATA
- Puede requefrir fragmentación si hay mucha data

---

## Gestión de datos biométricos

### GET_ENROLL_DATA
**Descripción:** Obtiene datos biométricos de un usuario (fingerprint, contraseña, etc)

**Parámetros JSON:**
```json
{
  "user_id": "U001",
  "backup_number": 0
}
```

**Campos requeridos:**
| Campo | Tipo | Descripción |
|-------|------|------------|
| `user_id` | string | ID del usuario |
| `backup_number` | number | Tipo de dato (0-12) |

**Backup numbers:**
| Número | Tipo | Descripción | Ejemplo |
|--------|------|------------|---------|
| 0-9 | Fingerprint | 10 dedos | 0=pulgar derecho |
| 10 | Password | Contraseña | "password123" |
| 11 | ID Card | Tarjeta ID | Número de tarjeta |
| 12 | Face | Rostro | Datos faciales |

**Ejemplo en panel admin (obtener fingerprint del dedo 0):**
```
Device: SIM001
Command: GET_ENROLL_DATA
Parameters: {"user_id":"U025","backup_number":0}
```

**Ejemplo (obtener contraseña):**
```
Device: SIM001
Command: GET_ENROLL_DATA
Parameters: {"user_id":"U025","backup_number":10}
```

**Respuesta esperada:**
```json
{
  "enroll_data": "BIN_1",
  "status": "ok"
}
```

**Notas:**
- Retorna datos binarios del biométrico
- Si el dato no existe, retorna error
- Útil para verificar qué datos están registrados
- Puede ser >25KB para datos de rostro (se fragmenta)

---

### SET_ENROLL_DATA
**Descripción:** Registra datos biométricos para un usuario

**Parámetros JSON:**
```json
{
  "user_id": "U001",
  "backup_number": 0,
  "enroll_data": "BIN_1"
}
```

**Campos requeridos:**
| Campo | Tipo | Descripción |
|-------|------|------------|
| `user_id` | string | ID del usuario |
| `backup_number` | number | Tipo de dato (0-12) |
| `enroll_data` | BIN_1 | Datos binarios |

**Backup numbers y tipos de datos:**
| Número | Tipo | Tamaño típico | Descripción |
|--------|------|--------------|------------|
| 0-9 | Fingerprint | 500-2000 bytes | Template del dedo |
| 10 | Password | 100-500 bytes | Hash de contraseña |
| 11 | ID Card | 100 bytes | Número/datos de tarjeta |
| 12 | Face | 5000-10000 bytes | Template facial |

**Ejemplo en panel admin:**
```
Device: SIM001
Command: SET_ENROLL_DATA
Parameters: {
  "user_id": "U050",
  "backup_number": 0
}
(+ datos binarios del fingerprint capturados)
```

**Respuesta esperada:**
```json
{"status": "ok"}
```

**Notas:**
- Los datos binarios deben ser capturados del dispositivo biométrico real
- No es posible capturar desde el panel admin (requeriría hardware)
- Generalmente usado por scripts de migración o sincronización
- Los datos se almacenan en enroll_data tabla

---

## Gestión de logs

### GET_LOG_DATA
**Descripción:** Obtiene registros de asistencia (marcaciones) del dispositivo

**Parámetros JSON:**
```json
{
  "begin_time": "20260701000000",
  "end_time": "20260731235959"
}
```

**Campos opcionales:**
| Campo | Tipo | Formato | Descripción |
|-------|------|---------|------------|
| `begin_time` | string | YYYYMMDDhhmmss | Fecha/hora inicio (vacío = desde siempre) |
| `end_time` | string | YYYYMMDDhhmmss | Fecha/hora fin (vacío = hasta ahora) |

**Ejemplo en panel admin (todos los logs):**
```
Device: SIM001
Command: GET_LOG_DATA
Parameters: {}
```

**Ejemplo (rango específico):**
```
Device: SIM001
Command: GET_LOG_DATA
Parameters: {
  "begin_time": "20260720000000",
  "end_time": "20260729235959"
}
```

**Respuesta esperada:**
```json
{
  "logCount": 1250,
  "oneLogSize": 64,
  "log_array": "BIN_1"
}
```

**Campos de respuesta:**
| Campo | Tipo | Descripción |
|-------|------|------------|
| `logCount` | number | Total de logs en rango |
| `oneLogSize` | number | Bytes por log |
| `log_array` | BIN_1 | Datos binarios de todos los logs |

**Estructura de cada log (64 bytes típicamente):**
```
[user_id (4 bytes)] [timestamp (8 bytes)] [verify_mode (1 byte)] [io_mode (1 byte)] [...]
```

**Notas:**
- Puede retornar MUCHA data (>100MB para un año completo)
- Se **fragmenta automáticamente** en bloques de 8KB
- El servidor ensambla automáticamente los bloques
- Muy útil para sincronización con servidores centrales
- Mejor hacerlo en horario de poco uso

---

### CLEAR_LOG_DATA
**Descripción:** Elimina TODOS los logs de asistencia del dispositivo

**Parámetros JSON:** (vacío)
```json
{}
```

**Ejemplo en panel admin:**
```
Device: SIM001
Command: CLEAR_LOG_DATA
Parameters: {}
```

**Respuesta esperada:**
```json
{"status": "ok"}
```

**⚠️ Advertencia CRÍTICA:**
- **Esta acción es irreversible**
- Borra TODOS los logs de asistencia del dispositivo
- Se recomienda FUERTEMENTE hacer backup con GET_LOG_DATA primero
- Es normal hacerlo después de sincronizar logs con servidor central
- Libera espacio en memoria del dispositivo

**Recomendación:** Siempre hacer esto:
1. GET_LOG_DATA (backup a servidor)
2. Verificar que los logs llegaron correctamente
3. Recién entonces CLEAR_LOG_DATA

---

## Gestión de datos biométricos completa

### CLEAR_ENROLL_DATA
**Descripción:** Elimina TODOS los datos biométricos del dispositivo

**Parámetros JSON:** (vacío)
```json
{}
```

**Ejemplo en panel admin:**
```
Device: SIM001
Command: CLEAR_ENROLL_DATA
Parameters: {}
```

**Respuesta esperada:**
```json
{"status": "ok"}
```

**⚠️ Advertencia CRÍTICA:**
- **Esta acción es irreversible**
- Borra TODOS los fingerprints, contraseñas, rostros, tarjetas ID
- **Los usuarios siguen existiendo pero sin datos biométricos**
- No se pueden hacer marcaciones sin re-registrar biométricos
- Útil después de migración masiva a nuevo sistema

**Casos de uso:**
- Actualización masiva de firmware
- Migración de datos a servidor central
- Limpieza de datos corruptos
- Reset completo del dispositivo

---

### GET_USER_ID_LIST
**Descripción:** Obtiene listado de todos los usuarios registrados

**Parámetros JSON:** (vacío)
```json
{}
```

**Ejemplo en panel admin:**
```
Device: SIM001
Command: GET_USER_ID_LIST
Parameters: {}
```

**Respuesta esperada:**
```json
{
  "userIdCount": 250,
  "oneUserIdSize": 16,
  "user_id_array": "BIN_1"
}
```

**Campos de respuesta:**
| Campo | Tipo | Descripción |
|-------|------|------------|
| `userIdCount` | number | Total de usuarios |
| `oneUserIdSize` | number | Bytes por user_id |
| `user_id_array` | BIN_1 | Datos binarios con IDs |

**Notas:**
- Retorna lista binaria de todos los IDs
- Puede ser >25KB (se fragmenta automáticamente)
- Útil para sincronización de usuarios con servidor central
- No incluye datos del usuario, solo IDs
- Para obtener datos usar GET_USER_INFO por cada usuario

---

## Resumen de uso en panel admin

### Template: Cómo usar cada comando

Todos los comandos se usan igual en el panel admin:

1. Accede a `http://localhost:3000/admin/commands`
2. Selecciona **Device:** (el dispositivo)
3. Selecciona **Command:** (de la lista)
4. Escribe **Parameters:** (JSON)
5. Haz clic en **"Queue Command"**
6. Ve a `/admin/commands` para ver el estado (WAIT → RUN → RESULT)

### Tabla rápida de referencia

| Comando | Tipo | Parámetros mínimos | Ejemplo |
|---------|------|-------------------|---------|
| GET_DEVICE_STATUS | Info | `{}` | `{}` |
| SET_FK_NAME | Config | fk_name | `{"fk_name":"Puerta 1"}` |
| SET_TIME | Config | time | `{"time":"20260729143000"}` |
| SET_USER_NAME | Usuario | user_id, user_name | `{"user_id":"U1","user_name":"Juan"}` |
| SET_USER_PRIVILEGE | Usuario | user_id, user_privilege | `{"user_id":"U1","user_privilege":"MANAGER"}` |
| DELETE_USER | Usuario | user_id | `{"user_id":"U999"}` |
| GET_USER_INFO | Usuario | user_id | `{"user_id":"U1"}` |
| SET_USER_INFO | Usuario | user_id, user_name, user_privilege | `{"user_id":"U2","user_name":"María","user_privilege":"USER"}` |
| GET_ENROLL_DATA | Biometría | user_id, backup_number | `{"user_id":"U1","backup_number":0}` |
| SET_ENROLL_DATA | Biometría | user_id, backup_number, enroll_data | `{"user_id":"U1","backup_number":0}` |
| GET_LOG_DATA | Logs | (vacío o rango) | `{}` o `{"begin_time":"20260701","end_time":"20260731"}` |
| CLEAR_LOG_DATA | Logs | `{}` | `{}` |
| GET_USER_ID_LIST | Listado | `{}` | `{}` |
| CLEAR_ENROLL_DATA | Biometría | `{}` | `{}` |
| SET_WEB_SERVER_INFO | Config | server_ip, server_port | `{"server_ip":"192.168.1.1","server_port":3000}` |

---

## Ejemplos prácticos completos

### Caso 1: Crear un nuevo usuario desde cero

```
Step 1: Crear usuario básico
  Device: SIM001
  Command: SET_USER_INFO
  Parameters: {
    "user_id": "U_NUEVO_001",
    "user_name": "Pedro González",
    "user_privilege": "USER"
  }
  → Estado: WAIT → RUN → RESULT ✓

Step 2: Asignar datos biométricos
  (Esto requiere captura real del dispositivo)
  Device: SIM001
  Command: SET_ENROLL_DATA
  Parameters: {
    "user_id": "U_NUEVO_001",
    "backup_number": 0
  }
  + datos binarios del fingerprint

Step 3: Verificar
  Device: SIM001
  Command: GET_USER_INFO
  Parameters: {"user_id": "U_NUEVO_001"}
  → Debería retornar usuario con enroll_data_array
```

### Caso 2: Sincronizar datos con servidor central

```
Step 1: Obtener todos los usuarios
  Device: SIM001
  Command: GET_USER_ID_LIST
  Parameters: {}
  → Retorna lista de IDs (fragmentado si >25KB)

Step 2: Para cada usuario, obtener detalles
  Device: SIM001
  Command: GET_USER_INFO
  Parameters: {"user_id": "U001"}
  
  Device: SIM001
  Command: GET_USER_INFO
  Parameters: {"user_id": "U002"}
  
  ... etc

Step 3: Obtener todos los logs
  Device: SIM001
  Command: GET_LOG_DATA
  Parameters: {}
  → Retorna fragmentado en bloques de 8KB

Step 4: Guardar en servidor central y limpiar
  Device: SIM001
  Command: CLEAR_LOG_DATA
  Parameters: {}
  ✓ Logs borrados del dispositivo
```

### Caso 3: Actualizar privilegios masivos

```
Cambiar múltiples usuarios de USER a OPERATOR:

  Device: SIM001
  Command: SET_USER_PRIVILEGE
  Parameters: {"user_id": "U050", "user_privilege": "OPERATOR"}

  Device: SIM001
  Command: SET_USER_PRIVILEGE
  Parameters: {"user_id": "U051", "user_privilege": "OPERATOR"}

  Device: SIM001
  Command: SET_USER_PRIVILEGE
  Parameters: {"user_id": "U052", "user_privilege": "OPERATOR"}
  
  ... (repetir para cada usuario)
```

---

## Notas importantes

### Formato de fechas
- Siempre usar: **YYYYMMDDhhmmss**
- Ejemplo: 2026-07-29 14:30:45 → `20260729143045`
- Validación: El servidor verifica que sea fecha válida

### Fragmentación automática
- Resultados >8192 bytes se fragmentan automáticamente
- El servidor ensambla bloques automáticamente
- En panel admin verás estado normal (RESULT) cuando esté completo

### Errores comunes
- ❌ `{"time":"20260729"}` → Falta formato completo (needs hhmmss)
- ❌ `{"user_id":"U1","user_name":""}` → Nombre vacío rechazado
- ❌ `{"user_privilege":"admin"}` → Debe ser MANAGER, REGISTER, OPERATOR o USER
- ✅ Usar siempre comillas dobles en JSON
- ✅ Validar JSON antes de enviar (uso de validador JSON online)

### Mejores prácticas
1. **Antes de DELETE_USER o CLEAR_LOG_DATA:** hacer backup con GET
2. **Sincronizar SET_TIME** al menos diariamente
3. **Limpiar logs regularmente** para evitar que se llene la memoria
4. **Usar MANAGER privilege** solo para administradores
5. **Validar respuestas** en `/admin/traffic` para debugging

---

## Soporte

Para más detalles técnicos, ver:
- [README.md](README.md) — Arquitectura general
- `/admin/traffic` — Inspector de tráfico HTTP
- `/admin/logs` — Logs de asistencia
- `scripts/e2e.ts` — Ejemplos de uso en código
