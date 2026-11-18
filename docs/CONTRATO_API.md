# Contrato de la API — JN Reclamaciones (antes ReclamoClaro)

Fuente única de verdad entre el backend (`src/worker/`) y la interfaz (`src/web/`). Si algo debe cambiar, se cambia aquí primero.

- Base: mismo origen, prefijo `/api`. Todo en JSON (`Content-Type: application/json`).
- Fechas: ISO-8601 en UTC. La interfaz las muestra en hora de Lima (UTC−5).
- Errores: `{ "error": "mensaje en español", "campos"?: { "ruta.del.campo": "motivo" } }`.
- Códigos: 400 validación · 401 sin sesión · 403 sin permiso o CSRF · 404 no existe · 409 conflicto · 429 demasiados intentos · 500 error interno.
- Sesión: cookie `__Host-rc_sesion` (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`). En desarrollo local sin HTTPS se usa el nombre `rc_sesion` sin `Secure`.
- CSRF: toda petición con sesión que no sea `GET` debe enviar la cabecera `X-CSRF-Token` con el valor `token_csrf` recibido al iniciar sesión, y su `Origin` debe ser el del propio servicio.

## Tipos comunes

```ts
type Rol = 'admin' | 'encargado';
type Tipo = 'reclamo' | 'queja';
type Estado = 'registrado' | 'en_atencion' | 'respondido';
type Semaforo = 'verde' | 'ambar' | 'rojo' | 'vencido' | 'cerrado';

// Número visible de la hoja: código de tienda, año y correlativo de 6 dígitos.
// Ejemplo: "HYO-01-2026-000001"
type NumeroHoja = string;

interface Plazo {
  fecha_limite: string;            // fin del día hábil 15, ISO UTC
  dias_habiles_transcurridos: number;
  dias_habiles_restantes: number;  // negativo si venció
  semaforo: Semaforo;
}
```

Regla de plazo: 15 días hábiles contados desde el día hábil siguiente al registro, en hora de Lima, sin sábados, domingos ni fechas de la tabla `feriados`. Semáforo: `verde` de 0 a 9 días transcurridos, `ambar` de 10 a 13, `rojo` 14 y 15, `vencido` más de 15, `cerrado` si el estado es `respondido`.

## Rutas públicas (sin sesión)

| Método y ruta | Respuesta 200/201 |
|---|---|
| `GET /api/salud` | `{ estado, servicio, version, establecimientos, hora_servidor }` |
| `GET /api/publico/empresa` | `{ razon_social, ruc, direccion_fiscal }` |
| `GET /api/publico/establecimientos` | `[{ codigo, nombre, direccion, ciudad }]` solo activos |
| `POST /api/reclamos` | 201 con `Constancia` |
| `GET /api/seguimiento/:codigo` | `{ numero, tipo, estado, establecimiento, creado_en, respondido_en, plazo: Plazo }` |

`POST /api/reclamos` — cuerpo:

```ts
{
  establecimiento_codigo: string;          // p. ej. "HYO-01"
  tipo: Tipo;
  consumidor: {
    nombres: string;                       // 3 a 120
    tipo_documento: 'DNI' | 'CE' | 'PASAPORTE';
    numero_documento: string;              // 8 a 12; DNI: exactamente 8 dígitos
    domicilio?: string;                    // obligatorio domicilio o correo
    telefono?: string;
    correo?: string;
    es_menor: boolean;
    apoderado_nombres?: string;            // obligatorio si es_menor
    apoderado_contacto?: string;
  };
  bien: { tipo: 'producto' | 'servicio'; descripcion: string; monto?: number }; // monto en soles, 2 decimales
  detalle: string;                         // 10 a 3000
  pedido: string;                          // 5 a 1500
  acepta_tratamiento_datos: true;          // debe ser true
}
```

`Constancia`:

```ts
{
  numero: NumeroHoja;
  codigo_seguimiento: string;   // 32 caracteres hexadecimales
  tipo: Tipo;
  creado_en: string;
  plazo: Plazo;
  empresa: { razon_social, ruc, direccion_fiscal };
  establecimiento: { codigo, nombre, direccion, ciudad };
  hoja: { /* los mismos datos enviados, para imprimir */ };
}
```

La ruta de seguimiento **nunca** devuelve datos personales. Un código inexistente o mal formado responde 404 con el mismo mensaje.

## Sesión

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /api/sesion` | `{ correo, clave }` | 200 `{ usuario: Usuario, token_csrf }` + cookie. 401 con mensaje genérico. 429 si hay bloqueo |
| `GET /api/sesion` | — | 200 `{ usuario: Usuario, token_csrf }` o 401 |
| `DELETE /api/sesion` | — | 204 |

```ts
interface Usuario {
  id: number; nombre: string; correo: string; rol: Rol;
  establecimiento: { codigo: string; nombre: string } | null;  // null para admin
}
```

## Bandeja (requiere sesión)

Un `encargado` solo ve y modifica casos de su establecimiento. Un caso de otro establecimiento responde 403.

| Método y ruta | Detalle |
|---|---|
| `GET /api/reclamos?estado=&tipo=&establecimiento=&pagina=` | Lista de `ResumenReclamo`, más `total`. `establecimiento` solo lo puede usar `admin`. 20 por página, más recientes primero |
| `GET /api/reclamos/:id` | `DetalleReclamo` |
| `PATCH /api/reclamos/:id` | Cuerpo `{ estado?: 'en_atencion', tipo?: Tipo }`. Reclasificar o marcar en atención. Devuelve `DetalleReclamo` |
| `POST /api/reclamos/:id/respuesta` | Cuerpo `{ texto, medio_comunicacion: 'correo' \| 'carta', fecha_comunicacion: 'AAAA-MM-DD' }`. 409 si ya tiene respuesta. Pone el estado en `respondido`. Devuelve `DetalleReclamo` |
| `GET /api/panel` | Indicadores del alcance del usuario |

```ts
interface ResumenReclamo {
  id: number; numero: NumeroHoja; tipo: Tipo; estado: Estado;
  establecimiento: { codigo: string; nombre: string };
  consumidor_nombres: string; creado_en: string; plazo: Plazo;
}

interface DetalleReclamo extends ResumenReclamo {
  consumidor: { /* igual que en el registro */ };
  bien: { tipo; descripcion; monto: number | null };
  detalle: string; pedido: string; respondido_en: string | null;
  respuesta: { texto; medio_comunicacion; fecha_comunicacion; autor: string; creado_en } | null;
  eventos: { accion: string; detalle: string | null; autor: string | null; creado_en: string }[];
}

interface Panel {
  total: number;
  por_estado: Record<Estado, number>;
  por_tipo: Record<Tipo, number>;
  por_semaforo: Record<Semaforo, number>;
  por_establecimiento: { codigo: string; nombre: string; total: number; pendientes: number }[];
  respondidos_en_plazo: number;
  respondidos_fuera_de_plazo: number;
}
```

## Administración (solo `admin`)

| Método y ruta | Detalle |
|---|---|
| `GET /api/admin/usuarios` | `[Usuario & { activo: boolean }]` |
| `POST /api/admin/usuarios` | `{ nombre, correo, clave, rol, establecimiento_codigo? }`. Clave de 10 caracteres o más. 409 si el correo existe |
| `PATCH /api/admin/usuarios/:id` | `{ nombre?, rol?, establecimiento_codigo?, activo?, clave? }`. **403 si intenta cambiar su propio rol o desactivarse** |
| `GET /api/admin/establecimientos` | Todos, con `activo` |
| `POST /api/admin/establecimientos` | `{ codigo, nombre, direccion, ciudad }`. Código con formato `AAA-00` |
| `PATCH /api/admin/establecimientos/:codigo` | `{ nombre?, direccion?, ciudad?, activo? }` |
| `GET /api/admin/eventos?pagina=` | Historial general: `[{ accion, detalle, autor, numero: NumeroHoja \| null, creado_en }]`, 50 por página |

Un `encargado` que llama a cualquier ruta `/api/admin/*` recibe 403.

## Acciones que se anotan en `eventos`

`reclamo_registrado`, `reclamo_en_atencion`, `reclamo_reclasificado`, `respuesta_registrada`, `sesion_iniciada`, `sesion_cerrada`, `usuario_creado`, `usuario_modificado`, `establecimiento_creado`, `establecimiento_modificado`.
