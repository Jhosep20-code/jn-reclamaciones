// Bandeja de reclamos (requiere sesión). El encargado solo ve y modifica su establecimiento.
import { Hono } from 'hono';
import { esDominioDePrueba } from '../correo/dominios';
import { lanzarEnvio, MAX_INTENTOS, procesarEnvio } from '../correo/servicio';
import {
  enteroPositivo,
  idDeRuta,
  leerJson,
  registrar,
  sentenciaEvento,
  sentenciaEventoSiCambio,
} from '../datos/comunes';
import {
  type Alcance,
  cargarDetalle,
  construirPanel,
  existeReclamo,
  listarReclamos,
  reclamoEnAlcance,
} from '../datos/reclamos';
import { construirReporte, MAX_DIAS_REPORTE } from '../datos/reportes';
import { fechaLima, sumarDias } from '../dominio/plazos';
import {
  esquemaCambioReclamo,
  esquemaEntregaCarta,
  esquemaRespuesta,
  fechaCalendarioValida,
  validar,
} from '../dominio/validacion';
import { ErrorHttp } from '../errores';
import { exigirSesion } from '../seguridad/sesiones';
import type { AppEnv, Estado, MedioRespuesta, Tipo } from '../tipos';

const rutas = new Hono<AppEnv>();

const ESTADOS = new Set(['registrado', 'en_atencion', 'respondido']);
const TIPOS = new Set(['reclamo', 'queja']);

function alcanceDe(c: { get: (k: 'sesion') => AppEnv['Variables']['sesion'] }): Alcance {
  const s = c.get('sesion');
  return s.rol === 'admin' ? null : s.establecimientoId;
}

// Diferencia 404 (no existe) de 403 (existe pero es de otro establecimiento).
async function reclamoOError(db: D1Database, id: number, alcance: Alcance) {
  const r = await reclamoEnAlcance(db, id, alcance);
  if (r) return r;
  if (await existeReclamo(db, id)) throw new ErrorHttp(403, 'No tiene permiso sobre este caso');
  throw new ErrorHttp(404, 'No se encontró el caso');
}

rutas.get('/reclamos', exigirSesion, async (c) => {
  const s = c.get('sesion');
  const estado = c.req.query('estado') || null;
  const tipo = c.req.query('tipo') || null;
  const establecimiento = c.req.query('establecimiento') || null;
  if (estado && !ESTADOS.has(estado)) throw new ErrorHttp(400, 'Estado no válido', { estado: 'Valor no permitido' });
  if (tipo && !TIPOS.has(tipo)) throw new ErrorHttp(400, 'Tipo no válido', { tipo: 'Valor no permitido' });
  if (establecimiento && s.rol !== 'admin') throw new ErrorHttp(403, 'Solo el administrador puede filtrar por establecimiento');
  const pagina = enteroPositivo(c.req.query('pagina'), 1);
  const datos = await listarReclamos(
    c.env.DB,
    alcanceDe(c),
    { estado: estado as Estado | null, tipo: tipo as Tipo | null, establecimientoCodigo: establecimiento, pagina },
    new Date(),
  );
  return c.json(datos);
});

rutas.get('/reclamos/:id', exigirSesion, async (c) => {
  const id = idDeRuta(c.req.param('id'));
  const alcance = alcanceDe(c);
  const detalle = await cargarDetalle(c.env.DB, id, alcance, new Date());
  if (detalle) return c.json(detalle);
  await reclamoOError(c.env.DB, id, alcance); // lanza 403 o 404
  throw new ErrorHttp(404, 'No se encontró el caso');
});

rutas.patch('/reclamos/:id', exigirSesion, async (c) => {
  const s = c.get('sesion');
  const id = idDeRuta(c.req.param('id'));
  const cambios = validar(esquemaCambioReclamo, await leerJson(c));
  const db = c.env.DB;
  const alcance = alcanceDe(c);
  const actual = await reclamoOError(db, id, alcance);
  if (actual.estado === 'respondido') throw new ErrorHttp(409, 'El caso ya fue respondido y no admite cambios');

  const ahora = new Date().toISOString();
  const sentencias: D1PreparedStatement[] = [];
  if (cambios.tipo !== undefined && cambios.tipo !== actual.tipo) {
    sentencias.push(
      db
        .prepare("UPDATE reclamos SET tipo = ?1 WHERE id = ?2 AND estado <> 'respondido' AND tipo <> ?1 AND (?3 IS NULL OR establecimiento_id = ?3)")
        .bind(cambios.tipo, id, alcance),
      sentenciaEventoSiCambio(db, id, s.usuarioId, 'reclamo_reclasificado', `${actual.tipo} -> ${cambios.tipo}`, ahora),
    );
  }
  if (cambios.estado === 'en_atencion' && actual.estado === 'registrado') {
    sentencias.push(
      db
        .prepare("UPDATE reclamos SET estado = 'en_atencion' WHERE id = ?1 AND estado = 'registrado' AND (?2 IS NULL OR establecimiento_id = ?2)")
        .bind(id, alcance),
      sentenciaEventoSiCambio(db, id, s.usuarioId, 'reclamo_en_atencion', null, ahora),
    );
  }
  if (sentencias.length) await db.batch(sentencias);
  registrar('reclamo_modificado', '/api/reclamos/:id', { reclamo_id: id, usuario_id: s.usuarioId, cambios: sentencias.length / 2 });
  const detalle = await cargarDetalle(db, id, alcance, new Date());
  return c.json(detalle);
});

rutas.post('/reclamos/:id/respuesta', exigirSesion, async (c) => {
  const s = c.get('sesion');
  const id = idDeRuta(c.req.param('id'));
  const datos = validar(esquemaRespuesta, await leerJson(c));
  const hoy = fechaLima(new Date());
  const fechaComunicacion = datos.fecha_comunicacion ?? hoy;
  if (fechaComunicacion > hoy) {
    throw new ErrorHttp(400, 'Datos no válidos', { fecha_comunicacion: 'No puede ser una fecha futura' });
  }
  const db = c.env.DB;
  const alcance = alcanceDe(c);
  const actual = await reclamoOError(db, id, alcance);
  if (actual.estado === 'respondido') throw new ErrorHttp(409, 'El caso ya tiene una respuesta');
  // Una respuesta no puede haberse comunicado antes de que existiera la hoja (fechas en hora de Lima).
  if (fechaComunicacion < fechaLima(new Date(actual.creado_en))) {
    throw new ErrorHttp(400, 'Datos no válidos', { fecha_comunicacion: 'No puede ser anterior a la fecha de registro de la hoja' });
  }
  // El medio es el que pidió el consumidor. Solo en hojas anteriores a 1.0.0 (sin preferencia) lo elige quien responde.
  if (actual.medio_respuesta && datos.medio_comunicacion && datos.medio_comunicacion !== actual.medio_respuesta) {
    throw new ErrorHttp(400, 'Datos no válidos', { medio_comunicacion: 'El consumidor pidió recibir la respuesta por otro medio' });
  }
  const medio: MedioRespuesta | undefined = actual.medio_respuesta ?? datos.medio_comunicacion;
  if (!medio) {
    throw new ErrorHttp(400, 'Datos no válidos', { medio_comunicacion: 'Obligatorio en hojas anteriores a la versión 1.0.0' });
  }

  let estadoCom: 'pendiente' | 'omitido' | 'pendiente_entrega';
  let detalleCom: string | null = null;
  if (medio === 'carta') {
    estadoCom = 'pendiente_entrega';
  } else if (!actual.correo || esDominioDePrueba(actual.correo)) {
    estadoCom = 'omitido';
    detalleCom = actual.correo ? 'dominio de prueba' : 'sin correo';
  } else {
    estadoCom = 'pendiente';
  }
  const tipoCom = medio === 'carta' ? 'respuesta_carta' : 'respuesta_correo';

  const ahora = new Date().toISOString();
  let comunicacionId: number | undefined;
  try {
    // La restricción UNIQUE de respuestas.reclamo_id evita dos respuestas simultáneas (y revierte todo el lote).
    const r = await db.batch([
      db
        .prepare(
          `INSERT INTO respuestas (reclamo_id, texto, medio_comunicacion, fecha_comunicacion, usuario_id, creado_en)
           SELECT id, ?2, ?3, ?4, ?5, ?6 FROM reclamos WHERE id = ?1 AND (?7 IS NULL OR establecimiento_id = ?7)`,
        )
        .bind(id, datos.texto, medio, fechaComunicacion, s.usuarioId, ahora, alcance),
      db
        .prepare("UPDATE reclamos SET estado = 'respondido', respondido_en = ?2 WHERE id = ?1 AND (?3 IS NULL OR establecimiento_id = ?3)")
        .bind(id, ahora, alcance),
      sentenciaEvento(db, id, s.usuarioId, 'respuesta_registrada', medio, ahora),
      db
        .prepare(
          `INSERT INTO comunicaciones (reclamo_id, tipo, estado, intentos, detalle, usuario_id, creado_en, actualizado_en)
           VALUES (?1, ?2, ?3, 0, ?4, ?5, ?6, ?6)`,
        )
        .bind(id, tipoCom, estadoCom, detalleCom, s.usuarioId, ahora),
      db.prepare('SELECT id FROM comunicaciones WHERE reclamo_id = ?1 AND tipo = ?2').bind(id, tipoCom),
    ]);
    comunicacionId = (r[4]?.results?.[0] as { id: number } | undefined)?.id;
  } catch (e) {
    if (e instanceof Error && /UNIQUE/i.test(e.message)) throw new ErrorHttp(409, 'El caso ya tiene una respuesta');
    throw e;
  }
  registrar('respuesta_registrada', '/api/reclamos/:id/respuesta', { reclamo_id: id, usuario_id: s.usuarioId });
  // El envío ocurre después de responder; un fallo de correo nunca revierte la respuesta.
  if (estadoCom === 'pendiente' && comunicacionId !== undefined) lanzarEnvio(c, comunicacionId);
  const detalle = await cargarDetalle(db, id, alcance, new Date());
  return c.json(detalle);
});

// Reintento manual de un correo fallido (máximo MAX_INTENTOS intentos en total).
rutas.post('/reclamos/:id/comunicaciones/:cid/reintentar', exigirSesion, async (c) => {
  const id = idDeRuta(c.req.param('id'));
  const cid = idDeRuta(c.req.param('cid'));
  const db = c.env.DB;
  const alcance = alcanceDe(c);
  await reclamoOError(db, id, alcance);
  const com = await db
    .prepare('SELECT id, tipo, estado, intentos FROM comunicaciones WHERE id = ?1 AND reclamo_id = ?2')
    .bind(cid, id)
    .first<{ id: number; tipo: string; estado: string; intentos: number }>();
  if (!com) throw new ErrorHttp(404, 'No se encontró la comunicación');
  // Se puede reenviar un correo fallido, o uno que quedó pendiente porque el envío estaba apagado o sin cuota.
  if (com.tipo === 'respuesta_carta' || (com.estado !== 'fallido' && com.estado !== 'pendiente')) throw new ErrorHttp(409, 'Solo se puede reintentar un correo fallido o pendiente');
  if (com.intentos >= MAX_INTENTOS) throw new ErrorHttp(409, 'Se agotaron los intentos de envío');
  // Se espera el resultado para devolver el estado real; procesarEnvio nunca lanza.
  await procesarEnvio(c.env, cid, new URL(c.req.url).origin);
  registrar('correo_reintento', '/api/reclamos/:id/comunicaciones/:cid/reintentar', { reclamo_id: id, comunicacion_id: cid });
  const detalle = await cargarDetalle(db, id, alcance, new Date());
  return c.json(detalle);
});

// Registro de la entrega de una carta física.
rutas.post('/reclamos/:id/carta/entrega', exigirSesion, async (c) => {
  const s = c.get('sesion');
  const id = idDeRuta(c.req.param('id'));
  const datos = validar(esquemaEntregaCarta, await leerJson(c));
  if (datos.fecha_entrega > fechaLima(new Date())) {
    throw new ErrorHttp(400, 'Datos no válidos', { fecha_entrega: 'No puede ser una fecha futura' });
  }
  const db = c.env.DB;
  const alcance = alcanceDe(c);
  await reclamoOError(db, id, alcance);
  const carta = await db
    .prepare(
      `SELECT c.id, c.estado, p.creado_en AS respuesta_creada
       FROM comunicaciones c JOIN respuestas p ON p.reclamo_id = c.reclamo_id
       WHERE c.reclamo_id = ?1 AND c.tipo = 'respuesta_carta'`,
    )
    .bind(id)
    .first<{ id: number; estado: string; respuesta_creada: string }>();
  if (!carta || carta.estado !== 'pendiente_entrega') throw new ErrorHttp(409, 'No hay una carta pendiente de entrega');
  if (datos.fecha_entrega < fechaLima(carta.respuesta_creada)) {
    throw new ErrorHttp(400, 'Datos no válidos', { fecha_entrega: 'No puede ser anterior a la fecha de la respuesta' });
  }
  const ahora = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `UPDATE comunicaciones SET estado = 'entrega_registrada', fecha_entrega = ?2, detalle = ?3, usuario_id = ?4, actualizado_en = ?5
         WHERE id = ?1 AND estado = 'pendiente_entrega'`,
      )
      .bind(carta.id, datos.fecha_entrega, datos.observacion ?? null, s.usuarioId, ahora),
    sentenciaEventoSiCambio(db, id, s.usuarioId, 'carta_entrega_registrada', datos.fecha_entrega, ahora),
  ]);
  registrar('carta_entrega_registrada', '/api/reclamos/:id/carta/entrega', { reclamo_id: id, usuario_id: s.usuarioId });
  return c.json(await cargarDetalle(db, id, alcance, new Date()));
});

rutas.get('/panel', exigirSesion, async (c) => {
  return c.json(await construirPanel(c.env.DB, alcanceDe(c), new Date()));
});

// Reporte de cumplimiento (sin datos personales). El alcance del encargado se aplica dentro del SQL.
rutas.get('/reportes', exigirSesion, async (c) => {
  const s = c.get('sesion');
  const q = (k: string) => c.req.query(k) || null;
  const hoy = fechaLima(new Date());
  const hastaParam = q('hasta');
  const desdeParam = q('desde');
  const errores: Record<string, string> = {};
  if (hastaParam && !fechaCalendarioValida(hastaParam)) errores.hasta = 'Fecha no válida (AAAA-MM-DD)';
  if (desdeParam && !fechaCalendarioValida(desdeParam)) errores.desde = 'Fecha no válida (AAAA-MM-DD)';
  const estado = q('estado');
  const tipo = q('tipo');
  const establecimiento = q('establecimiento');
  if (estado && !ESTADOS.has(estado)) errores.estado = 'Valor no permitido';
  if (tipo && !TIPOS.has(tipo)) errores.tipo = 'Valor no permitido';
  if (establecimiento && !/^[A-Z]{3}-\d{2}$/.test(establecimiento)) errores.establecimiento = 'Código no válido';
  if (Object.keys(errores).length) throw new ErrorHttp(400, 'Parámetros no válidos', errores);
  const hasta = hastaParam ?? hoy;
  const desde = desdeParam ?? sumarDias(hasta, -29);
  if (desde > hasta) throw new ErrorHttp(400, 'Parámetros no válidos', { desde: 'No puede ser posterior a hasta' });
  const dias = (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000 + 1;
  if (dias > MAX_DIAS_REPORTE) {
    throw new ErrorHttp(400, 'Parámetros no válidos', { desde: `El rango máximo es de ${MAX_DIAS_REPORTE} días` });
  }
  // El encargado siempre ve solo su tienda; pedir otra es un error de permisos, no un reporte vacío.
  if (s.rol !== 'admin' && establecimiento && establecimiento !== s.establecimientoCodigo) {
    throw new ErrorHttp(403, 'Solo puede consultar el reporte de su establecimiento');
  }
  const reporte = await construirReporte(
    c.env.DB,
    alcanceDe(c),
    {
      desde,
      hasta,
      establecimiento: s.rol === 'admin' ? establecimiento : s.establecimientoCodigo,
      estado: estado as Estado | null,
      tipo: tipo as Tipo | null,
    },
    new Date(),
  );
  return c.json(reporte);
});

export default rutas;
