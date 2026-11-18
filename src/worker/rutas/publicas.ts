// Rutas públicas (sin sesión). Ninguna devuelve datos personales con solo el código de seguimiento.
import { Hono } from 'hono';
import { esDominioDePrueba } from '../correo/dominios';
import { interpretarConfigCorreo, lanzarEnvio, sentenciasConfigCorreo } from '../correo/servicio';
import { construirCarta, SQL_CARGO_AUTOR, SQL_EMPRESA } from '../datos/carta';
import { aConjuntoFeriados, leerJson, numeroHoja, registrar, sentenciaFeriados } from '../datos/comunes';
import { calcularPlazo, fechaLima } from '../dominio/plazos';
import { esquemaConsultaRespuesta, esquemaRegistro, limpiarVacios, validar } from '../dominio/validacion';
import { ErrorHttp } from '../errores';
import { aHex, aleatorioBytes, igualesTextoTiempoConstante, sha256Hex } from '../seguridad/claves';
import {
  evaluarBloqueoConsulta,
  evaluarLimiteRegistros,
  sentenciaConteoRegistros,
  sentenciaFallosConsulta,
  sentenciaLimiteRegistros,
} from '../seguridad/limites';
import { huellaOrigen } from '../seguridad/origen';
import type { AppEnv, Estado, MedioRespuesta, Rol, Tipo } from '../tipos';

export const VERSION = '1.0.0';

const rutas = new Hono<AppEnv>();

rutas.get('/salud', async (c) => {
  const fila = await c.env.DB.prepare('SELECT COUNT(*) AS total FROM establecimientos').first<{ total: number }>();
  return c.json({
    estado: 'ok',
    servicio: 'jn-reclamaciones',
    version: VERSION,
    establecimientos: fila?.total ?? 0,
    hora_servidor: new Date().toISOString(),
  });
});

rutas.get('/publico/empresa', async (c) => {
  const fila = await c.env.DB.prepare(SQL_EMPRESA).first();
  if (!fila) throw new ErrorHttp(404, 'Empresa no configurada');
  return c.json(fila);
});

rutas.get('/publico/establecimientos', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT codigo, nombre, direccion, ciudad FROM establecimientos WHERE activo = 1 ORDER BY codigo',
  ).all();
  return c.json(results);
});

rutas.post('/reclamos', async (c) => {
  const datos = validar(esquemaRegistro, limpiarVacios(await leerJson(c)));
  const db = c.env.DB;
  const ahora = new Date();
  const huella = await huellaOrigen(c);

  // Una sola ida a D1 para: establecimiento, empresa, conteo del origen, límite configurado, feriados y estado del correo.
  const [rEst, rEmp, rCont, rLim, rFer, rCfg, rHoy] = await db.batch([
    db
      .prepare('SELECT id, codigo, nombre, direccion, ciudad FROM establecimientos WHERE codigo = ?1 AND activo = 1')
      .bind(datos.establecimiento_codigo),
    db.prepare(SQL_EMPRESA),
    sentenciaConteoRegistros(db, huella, ahora),
    sentenciaLimiteRegistros(db),
    sentenciaFeriados(db),
    ...sentenciasConfigCorreo(db, ahora),
  ]);
  const espera = evaluarLimiteRegistros(
    rCont?.results?.[0] as { n: number; primero: string | null } | undefined,
    (rLim?.results?.[0] as { valor: string } | undefined)?.valor,
    ahora,
  );
  if (espera !== null) {
    registrar('registro_limitado', '/api/reclamos');
    throw new ErrorHttp(429, 'Demasiados registros desde su conexión. Intente más tarde.', undefined, {
      'Retry-After': String(espera),
    });
  }
  const est = rEst?.results?.[0] as { id: number; codigo: string; nombre: string; direccion: string; ciudad: string } | undefined;
  if (!est) throw new ErrorHttp(400, 'Datos no válidos', { establecimiento_codigo: 'Establecimiento no disponible' });
  const empresa = rEmp?.results?.[0];

  const creadoEn = ahora.toISOString();
  const anio = Number(fechaLima(ahora).slice(0, 4));
  const codigoSeguimiento = aHex(aleatorioBytes(16));
  const k = datos.consumidor;
  const monto = datos.bien.monto === undefined ? null : Math.round(datos.bien.monto * 100);

  // Constancia por correo: omitida si no hay correo o es un dominio de prueba; si el envío está apagado o sin
  // configurar queda pendiente con el motivo y no se intenta enviar.
  const cfgCorreo = interpretarConfigCorreo(
    c.env,
    rCfg?.results as { clave: string; valor: string }[] | undefined,
    rHoy?.results as { n: number }[] | undefined,
  );
  let correoConstancia: 'pendiente' | 'omitido' | 'desactivado' = 'pendiente';
  let detalleConstancia: string | null = null;
  if (!k.correo || esDominioDePrueba(k.correo)) {
    correoConstancia = 'omitido';
    detalleConstancia = k.correo ? 'dominio de prueba' : 'sin correo';
  } else if (!cfgCorreo.activo || !cfgCorreo.configurado) {
    correoConstancia = 'desactivado';
    detalleConstancia = 'envío desactivado';
  }

  // Lote = transacción: si algo falla, el contador no avanza y no quedan saltos en la numeración.
  // El orden importa: contador, hoja, evento, comunicación y, al final, la lectura del correlativo.
  const resultados = await db.batch([
    db
      .prepare(
        `INSERT INTO contadores (establecimiento_id, anio, ultimo) VALUES (?1, ?2, 1)
         ON CONFLICT (establecimiento_id, anio) DO UPDATE SET ultimo = ultimo + 1`,
      )
      .bind(est.id, anio),
    db
      .prepare(
        `INSERT INTO reclamos (establecimiento_id, anio, correlativo, codigo_seguimiento, tipo, nombres, tipo_documento,
           numero_documento, domicilio, telefono, correo, es_menor, apoderado_nombres, apoderado_contacto, tipo_bien,
           descripcion_bien, monto_reclamado_centimos, detalle, pedido, acepta_tratamiento_datos, creado_en, huella_origen,
           medio_respuesta)
         SELECT ?1, ?2, ultimo, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, 1, ?19, ?20, ?21
         FROM contadores WHERE establecimiento_id = ?1 AND anio = ?2`,
      )
      .bind(
        est.id, anio, codigoSeguimiento, datos.tipo, k.nombres, k.tipo_documento, k.numero_documento,
        k.domicilio ?? null, k.telefono ?? null, k.correo ?? null, k.es_menor ? 1 : 0,
        k.apoderado_nombres ?? null, k.apoderado_contacto ?? null, datos.bien.tipo, datos.bien.descripcion,
        monto, datos.detalle, datos.pedido, creadoEn, huella, datos.medio_respuesta,
      ),
    db
      .prepare(
        `INSERT INTO eventos (reclamo_id, usuario_id, accion, detalle, creado_en)
         SELECT id, NULL, 'reclamo_registrado', NULL, ?2 FROM reclamos WHERE codigo_seguimiento = ?1`,
      )
      .bind(codigoSeguimiento, creadoEn),
    // La comunicación va en el mismo lote que la hoja: no puede quedar una sin la otra.
    db
      .prepare(
        `INSERT INTO comunicaciones (reclamo_id, tipo, estado, intentos, detalle, creado_en, actualizado_en)
         SELECT id, 'constancia_correo', ?2, 0, ?3, ?4, ?4 FROM reclamos WHERE codigo_seguimiento = ?1`,
      )
      .bind(codigoSeguimiento, correoConstancia === 'omitido' ? 'omitido' : 'pendiente', detalleConstancia, creadoEn),
    db
      .prepare(
        `SELECT r.id, r.correlativo, (SELECT c.id FROM comunicaciones c WHERE c.reclamo_id = r.id AND c.tipo = 'constancia_correo') AS com_id
         FROM reclamos r WHERE r.codigo_seguimiento = ?1`,
      )
      .bind(codigoSeguimiento),
  ]);
  const fila = resultados[4]?.results?.[0] as { id: number; correlativo: number; com_id: number | null } | undefined;
  if (!fila) throw new Error('El registro no devolvió el correlativo');

  const numero = numeroHoja(est.codigo, anio, fila.correlativo);
  const feriados = aConjuntoFeriados(rFer?.results as { fecha: string }[] | undefined);
  registrar('reclamo_registrado', '/api/reclamos', { reclamo_id: fila.id, establecimiento: est.codigo, numero });
  // Después de responder al cliente; un fallo del correo no afecta al registro.
  if (correoConstancia === 'pendiente' && fila.com_id !== null) lanzarEnvio(c, fila.com_id);
  return c.json(
    {
      numero,
      codigo_seguimiento: codigoSeguimiento,
      tipo: datos.tipo,
      creado_en: creadoEn,
      medio_respuesta: datos.medio_respuesta,
      correo_constancia: correoConstancia,
      plazo: calcularPlazo({ creadoEn, ahora, feriados, estado: 'registrado' }),
      empresa,
      establecimiento: { codigo: est.codigo, nombre: est.nombre, direccion: est.direccion, ciudad: est.ciudad },
      hoja: {
        establecimiento_codigo: datos.establecimiento_codigo,
        tipo: datos.tipo,
        medio_respuesta: datos.medio_respuesta,
        consumidor: datos.consumidor,
        bien: datos.bien,
        detalle: datos.detalle,
        pedido: datos.pedido,
        acepta_tratamiento_datos: true,
      },
    },
    201,
  );
});

const CODIGO_SEGUIMIENTO = /^[0-9a-f]{32}$/;
const MENSAJE_NO_EXISTE = 'No se encontró una hoja con ese código de seguimiento';

// Seguimiento: solo datos no personales. Un código mal formado o inexistente responde igual: 404.
rutas.get('/seguimiento/:codigo', async (c) => {
  const codigo = (c.req.param('codigo') ?? '').toLowerCase();
  const noExiste = new ErrorHttp(404, MENSAJE_NO_EXISTE);
  if (!CODIGO_SEGUIMIENTO.test(codigo)) throw noExiste;
  const db = c.env.DB;
  const [rFila, rFer] = await db.batch([
    db
      .prepare(
        `SELECT r.anio, r.correlativo, r.tipo, r.estado, r.creado_en, r.respondido_en, r.medio_respuesta, e.codigo, e.nombre,
                (SELECT MIN(ev.creado_en) FROM eventos ev WHERE ev.reclamo_id = r.id AND ev.accion = 'reclamo_en_atencion') AS fecha_atencion,
                EXISTS (SELECT 1 FROM respuestas p WHERE p.reclamo_id = r.id) AS tiene_respuesta
         FROM reclamos r JOIN establecimientos e ON e.id = r.establecimiento_id
         WHERE r.codigo_seguimiento = ?1`,
      )
      .bind(codigo),
    sentenciaFeriados(db),
  ]);
  const f = rFila?.results?.[0] as
    | {
        anio: number; correlativo: number; tipo: Tipo; estado: Estado; creado_en: string; respondido_en: string | null;
        medio_respuesta: MedioRespuesta | null; codigo: string; nombre: string; fecha_atencion: string | null; tiene_respuesta: number;
      }
    | undefined;
  if (!f) throw noExiste;
  const feriados = aConjuntoFeriados(rFer?.results as { fecha: string }[] | undefined);
  return c.json({
    numero: numeroHoja(f.codigo, f.anio, f.correlativo),
    tipo: f.tipo,
    estado: f.estado,
    establecimiento: { codigo: f.codigo, nombre: f.nombre },
    creado_en: f.creado_en,
    respondido_en: f.respondido_en,
    plazo: calcularPlazo({ creadoEn: f.creado_en, ahora: new Date(), feriados, estado: f.estado, respondidoEn: f.respondido_en }),
    etapas: [
      { etapa: 'registrado', fecha: f.creado_en },
      { etapa: 'en_atencion', fecha: f.fecha_atencion },
      { etapa: 'respondido', fecha: f.respondido_en },
    ],
    tiene_respuesta: f.tiene_respuesta === 1,
    medio_respuesta: f.medio_respuesta,
  });
});

// Consulta segura de la respuesta: exige el número de documento del consumidor como segundo dato.
rutas.post('/seguimiento/:codigo/respuesta', async (c) => {
  const codigo = (c.req.param('codigo') ?? '').toLowerCase();
  if (!CODIGO_SEGUIMIENTO.test(codigo)) throw new ErrorHttp(404, MENSAJE_NO_EXISTE);
  const datos = validar(esquemaConsultaRespuesta, await leerJson(c));
  const db = c.env.DB;
  const ahora = new Date();
  const codigoHash = await sha256Hex(codigo);

  const [rHoja, rResp, rFallos, rEmp] = await db.batch([
    db
      .prepare(
        `SELECT r.id, r.anio, r.correlativo, r.tipo, r.numero_documento, r.nombres, r.domicilio,
                e.codigo AS est_codigo, e.nombre AS est_nombre, e.direccion AS est_direccion, e.ciudad AS est_ciudad
         FROM reclamos r JOIN establecimientos e ON e.id = r.establecimiento_id WHERE r.codigo_seguimiento = ?1`,
      )
      .bind(codigo),
    db
      .prepare(
        `SELECT p.texto, p.medio_comunicacion, p.creado_en, u.nombre AS autor, u.rol AS autor_rol, ${SQL_CARGO_AUTOR} AS autor_cargo
         FROM respuestas p JOIN reclamos r ON r.id = p.reclamo_id JOIN usuarios u ON u.id = p.usuario_id
         WHERE r.codigo_seguimiento = ?1`,
      )
      .bind(codigo),
    sentenciaFallosConsulta(db, codigoHash, ahora),
    db.prepare(SQL_EMPRESA),
  ]);
  const hoja = rHoja?.results?.[0] as
    | {
        id: number; anio: number; correlativo: number; tipo: Tipo; numero_documento: string; nombres: string; domicilio: string | null;
        est_codigo: string; est_nombre: string; est_direccion: string; est_ciudad: string;
      }
    | undefined;
  if (!hoja) throw new ErrorHttp(404, MENSAJE_NO_EXISTE);

  const espera = evaluarBloqueoConsulta(rFallos?.results?.[0] as { n: number; primero: string | null } | undefined, ahora);
  if (espera !== null) {
    registrar('consulta_respuesta_bloqueada', '/api/seguimiento/:codigo/respuesta');
    throw new ErrorHttp(429, 'Demasiados intentos fallidos. Intente de nuevo más tarde.', undefined, { 'Retry-After': String(espera) });
  }
  const resp = rResp?.results?.[0] as
    | { texto: string; medio_comunicacion: MedioRespuesta; creado_en: string; autor: string; autor_rol: Rol; autor_cargo: string | null }
    | undefined;
  if (!resp) throw new ErrorHttp(409, 'Este caso aún no tiene una respuesta');

  // Se comparan los SHA-256 del documento (largo fijo) en tiempo constante, sin distinguir mayúsculas ni espacios.
  const normalizar = (t: string) => t.trim().toUpperCase();
  const [recibido, guardado] = await Promise.all([sha256Hex(normalizar(datos.numero_documento)), sha256Hex(normalizar(hoja.numero_documento))]);
  const iso = ahora.toISOString();
  if (!igualesTextoTiempoConstante(recibido, guardado)) {
    await db.batch([
      db.prepare('INSERT INTO intentos_consulta (codigo_hash, exito, creado_en) VALUES (?1, 0, ?2)').bind(codigoHash, iso),
      // Limpieza de intentos viejos (más de un día) para que la tabla no crezca sin fin.
      db
        .prepare('DELETE FROM intentos_consulta WHERE creado_en < ?1')
        .bind(new Date(ahora.getTime() - 86_400_000).toISOString()),
    ]);
    registrar('consulta_respuesta_fallida', '/api/seguimiento/:codigo/respuesta');
    throw new ErrorHttp(403, 'No se pudo verificar la identidad. Revise el documento ingresado.');
  }

  await db.batch([
    db.prepare('INSERT INTO intentos_consulta (codigo_hash, exito, creado_en) VALUES (?1, 1, ?2)').bind(codigoHash, iso),
    db
      .prepare("INSERT INTO eventos (reclamo_id, usuario_id, accion, detalle, creado_en) VALUES (?1, NULL, 'respuesta_consultada', NULL, ?2)")
      .bind(hoja.id, iso),
  ]);
  registrar('consulta_respuesta_correcta', '/api/seguimiento/:codigo/respuesta', { reclamo_id: hoja.id });
  const carta = construirCarta({
    estCodigo: hoja.est_codigo,
    anio: hoja.anio,
    correlativo: hoja.correlativo,
    tipo: hoja.tipo,
    fechaEmision: resp.creado_en,
    empresa: rEmp?.results?.[0] as { razon_social: string; ruc: string; direccion_fiscal: string } | undefined,
    estNombre: hoja.est_nombre,
    estDireccion: hoja.est_direccion,
    estCiudad: hoja.est_ciudad,
    nombres: hoja.nombres,
    domicilio: hoja.domicilio,
    texto: resp.texto,
    autorNombre: resp.autor,
    autorRol: resp.autor_rol,
    autorCargo: resp.autor_cargo,
  });
  return c.json({
    numero: carta.numero,
    respuesta: { texto: resp.texto, fecha_emision: resp.creado_en, medio: resp.medio_comunicacion },
    carta,
  });
});

export default rutas;
