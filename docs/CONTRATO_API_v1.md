# Contrato de la API — ampliación 1.0.0

Complementa `CONTRATO_API.md` (que sigue vigente en todo lo que aquí no se cambia). Es la fuente de verdad entre `src/worker/` y `src/web/` para la versión 1.0.0.

Principios de esta ampliación:
- Nada de lo que funciona en 0.3.1 se rompe: los campos nuevos son aditivos.
- Un fallo de correo **nunca** hace fallar un registro ni revierte una respuesta.
- Ninguna ruta pública devuelve datos personales con solo el código de seguimiento.

## 1. Registro público — cambios

`POST /api/reclamos` añade un campo obligatorio:

```ts
medio_respuesta: 'correo' | 'carta';   // por dónde quiere recibir la respuesta el consumidor
```
- Si es `'correo'`, `consumidor.correo` es obligatorio. Si es `'carta'`, `consumidor.domicilio` es obligatorio.

`Constancia` añade:

```ts
medio_respuesta: 'correo' | 'carta';
correo_constancia: 'pendiente' | 'omitido' | 'desactivado';
// pendiente: se intentará enviar · omitido: el consumidor no dio correo o es de un dominio de prueba
// desactivado: el envío de correos está apagado o sin configurar
```

## 2. Seguimiento del consumidor

`GET /api/seguimiento/:codigo` (público, **sin datos personales**) añade:

```ts
etapas: { etapa: 'registrado' | 'en_atencion' | 'respondido'; fecha: string | null }[];  // siempre las 3, en orden
tiene_respuesta: boolean;
medio_respuesta: 'correo' | 'carta' | null;   // null en hojas anteriores a 1.0.0
```
La fecha de `en_atencion` sale del primer evento `reclamo_en_atencion`; si el caso pasó directo a respondido, es `null`.

`POST /api/seguimiento/:codigo/respuesta` — consulta segura de la respuesta. Exige un segundo dato que solo conoce el consumidor:

```ts
// cuerpo
{ numero_documento: string }
// 200
{ numero: NumeroHoja; respuesta: { texto: string; fecha_emision: string; medio: 'correo' | 'carta' }; carta: DatosCarta }
```
- 404: código inexistente o mal formado (mismo mensaje que hoy).
- 409: el caso aún no tiene respuesta.
- 403: el documento no coincide. Mensaje genérico. Comparación en tiempo constante.
- 429 con `Retry-After`: 5 intentos fallidos para ese código en 15 minutos (contados en D1).
- Cada consulta correcta anota el evento `respuesta_consultada` (sin datos personales).

```ts
interface DatosCarta {
  numero: NumeroHoja;
  tipo: Tipo;
  fecha_emision: string;                       // ISO; fecha de la respuesta
  empresa: { razon_social: string; ruc: string; direccion_fiscal: string };
  establecimiento: { codigo: string; nombre: string; direccion: string; ciudad: string };
  destinatario: { nombres: string; domicilio: string | null };
  texto: string;
  responsable: { nombre: string; cargo: string };   // cargo: "Encargado de tienda" o "Administrador"
}
```

## 3. Bandeja — cambios

`ResumenReclamo` añade `medio_respuesta: 'correo' | 'carta' | null`.

`DetalleReclamo` añade:

```ts
medio_respuesta: 'correo' | 'carta' | null;
comunicaciones: Comunicacion[];
carta: DatosCarta | null;          // presente cuando hay respuesta
anterior_id: number | null;        // navegación dentro del alcance del usuario (orden de la bandeja)
siguiente_id: number | null;

interface Comunicacion {
  id: number;
  tipo: 'constancia_correo' | 'respuesta_correo' | 'respuesta_carta';
  estado: 'pendiente' | 'enviado' | 'fallido' | 'omitido' | 'pendiente_entrega' | 'entrega_registrada';
  intentos: number;
  detalle: string | null;          // motivo del fallo u observación de entrega; nunca datos personales
  creado_en: string;
  actualizado_en: string;
}
```

`POST /api/reclamos/:id/respuesta` — el cuerpo pasa a ser:

```ts
{ texto: string; medio_comunicacion?: 'correo' | 'carta'; fecha_comunicacion?: string }
```
- El medio es el que pidió el consumidor (`medio_respuesta`). `medio_comunicacion` solo se usa si la hoja no tiene preferencia (hojas anteriores a 1.0.0); si la hoja la tiene y se envía uno distinto → 400.
- `fecha_comunicacion` es opcional; por defecto, hoy en Lima. Se mantienen las validaciones (no futura, no anterior al registro).
- Efecto: crea la respuesta, pone `respondido` y crea una comunicación: `respuesta_correo` en `pendiente` (y dispara el envío en segundo plano) o `respuesta_carta` en `pendiente_entrega`.

Nuevas:

| Método y ruta | Detalle |
|---|---|
| `POST /api/reclamos/:id/comunicaciones/:cid/reintentar` | Reintenta un correo `fallido`. Máximo 3 intentos en total. 409 si no está fallido o agotó intentos. Devuelve `DetalleReclamo` |
| `POST /api/reclamos/:id/carta/entrega` | Cuerpo `{ fecha_entrega: 'AAAA-MM-DD'; observacion?: string }`. Pasa `respuesta_carta` de `pendiente_entrega` a `entrega_registrada`. No futura ni anterior a la respuesta. 409 si no hay carta pendiente. Devuelve `DetalleReclamo` |

Ambas respetan sesión, CSRF y alcance por establecimiento (403 en caso ajeno).

## 4. Reportes

`GET /api/reportes?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&establecimiento=&estado=&tipo=`

- Requiere sesión. `admin`: todas las tiendas o la que filtre. `encargado`: siempre su tienda; si envía `establecimiento` de otra → 403.
- `desde`/`hasta` son fechas de registro en hora de Lima, inclusivas; por defecto, los últimos 30 días. Rango máximo: 366 días (si no, 400).
- **Sin datos personales.**

```ts
interface Reporte {
  filtros: { desde: string; hasta: string; establecimiento: string | null; estado: Estado | null; tipo: Tipo | null };
  resumen: Indicadores;
  por_establecimiento: ({ codigo: string; nombre: string } & Indicadores)[];
  casos: {
    numero: NumeroHoja; tipo: Tipo; estado: Estado; establecimiento_codigo: string;
    creado_en: string; respondido_en: string | null;
    dias_habiles: number;          // hasta la respuesta, o transcurridos hasta hoy si sigue pendiente
    semaforo: Semaforo;
  }[];                             // máximo 500, más recientes primero
  truncado: boolean;               // true si había más de 500
  generado_en: string;
}

interface Indicadores {
  total: number; respondidos: number; pendientes: number; vencidos: number;   // vencidos: pendientes fuera de plazo
  respondidos_en_plazo: number; respondidos_fuera_de_plazo: number;
  cumplimiento_pct: number | null;                   // respondidos_en_plazo / respondidos * 100, 1 decimal; null sin respondidos
  promedio_dias_habiles_respuesta: number | null;    // 1 decimal; null sin respondidos
}
```

## 5. Correo — administración

| Método y ruta | Detalle |
|---|---|
| `GET /api/admin/correo` | `{ activo: boolean; configurado: boolean; enviados_hoy: number; limite_diario: number; fallidos_pendientes: number }` |
| `PATCH /api/admin/correo` | `{ activo: boolean }`. Enciende o apaga los envíos reales. Anota evento |

- `configurado` es `true` si existen los secretos `URL_RELEVO_CORREO` y `SECRETO_CORREO`.
- Claves en `configuracion`: `correo_activo` (`'0'` por defecto) y `correo_limite_diario` (`'80'`).

## 6. Reglas del envío de correo

1. La comunicación se inserta en D1 en estado `pendiente` dentro del mismo lote que la hoja o la respuesta. `UNIQUE (reclamo_id, tipo)` impide duplicados.
2. El envío ocurre **después** de responder al cliente, con `c.executionCtx.waitUntil(...)`. Cualquier error se captura y deja la comunicación en `fallido` con su motivo. Nunca lanza hacia la solicitud.
3. Antes de enviar se reclama la fila con un `UPDATE ... SET intentos = intentos + 1 WHERE id = ? AND estado IN ('pendiente','fallido') AND intentos < 3 RETURNING id`. Si no devuelve fila, otro proceso ya la tomó: no se envía.
4. No se envía (estado `omitido`) si no hay correo, o si el dominio es de prueba: `example.com`, `example.org`, `example.net`, o termina en `.test`, `.invalid` o `.example`.
5. No se envía (queda `pendiente`, detalle "envío desactivado" o "cuota diaria alcanzada") si `correo_activo` no es `'1'`, si faltan los secretos, o si los `enviado` de hoy (UTC) ya alcanzan `correo_limite_diario`.
6. Tiempo máximo de la llamada al relevo: 10 segundos.
7. Eventos: `correo_enviado`, `correo_fallido`, `carta_entrega_registrada`, `respuesta_consultada`, `correo_configuracion_cambiada`.

### Protocolo con el relevo (Google Apps Script)

`POST URL_RELEVO_CORREO` con `Content-Type: application/json`:

```json
{ "carga": "<cadena JSON>", "firma": "<hex de HMAC-SHA256(SECRETO_CORREO, carga)>" }
```
`carga`, una vez decodificada: `{ "v": 1, "ts": <segundos Unix>, "nonce": "<32 hex>", "para": "...", "asunto": "...", "html": "...", "texto": "..." }`.

Respuesta (siempre HTTP 200, JSON): `{ "ok": true, "restante": <número> }` o `{ "ok": false, "error": "<código>" }`.
El relevo rechaza: firma inválida, `ts` con más de 300 s de diferencia, `nonce` repetido, destinatario mal formado.
Apps Script responde con una redirección 302: usar `fetch` con `redirect: 'follow'`.

### Contenido de los correos

HTML sobrio con la identidad actual (verde azulado `#0d5a63`, fondo claro), estilos en línea, ancho máximo 600 px, y versión de texto plano.
- **Constancia:** número de hoja, fecha y hora (Lima), tienda, tipo, fecha límite, código de seguimiento, enlace `…/seguimiento/<código>`, y las dos leyendas legales. No repite el detalle ni el documento.
- **Respuesta:** número de hoja, texto de la respuesta, responsable, y enlace al seguimiento.
- Pie: "Mensaje automático de un prototipo académico. No responda a este correo."
