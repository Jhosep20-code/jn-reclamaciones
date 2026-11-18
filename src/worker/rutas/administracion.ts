// Administración (solo admin): usuarios, establecimientos e historial.
import { Hono } from 'hono';
import { interpretarConfigCorreo, sentenciasConfigCorreo } from '../correo/servicio';
import { enteroPositivo, idDeRuta, leerJson, numeroHoja, registrar, sentenciaEvento } from '../datos/comunes';
import {
  esquemaCorreoAdmin,
  esquemaEstablecimientoCambio,
  esquemaEstablecimientoNuevo,
  esquemaUsuarioCambio,
  esquemaUsuarioNuevo,
  validar,
} from '../dominio/validacion';
import { ErrorHttp } from '../errores';
import { hashearClave } from '../seguridad/claves';
import { exigirAdmin, exigirSesion } from '../seguridad/sesiones';
import type { AppEnv, Rol } from '../tipos';

const rutas = new Hono<AppEnv>();
rutas.use('/admin/*', exigirSesion, exigirAdmin);

interface FilaUsuario {
  id: number; nombre: string; correo: string; rol: Rol; activo: number;
  establecimiento_id: number | null; est_codigo: string | null; est_nombre: string | null;
}

const SQL_USUARIOS = `SELECT u.id, u.nombre, u.correo, u.rol, u.activo, u.establecimiento_id,
    e.codigo AS est_codigo, e.nombre AS est_nombre
  FROM usuarios u LEFT JOIN establecimientos e ON e.id = u.establecimiento_id`;

function aUsuario(f: FilaUsuario) {
  return {
    id: f.id,
    nombre: f.nombre,
    correo: f.correo,
    rol: f.rol,
    establecimiento: f.est_codigo && f.est_nombre ? { codigo: f.est_codigo, nombre: f.est_nombre } : null,
    activo: f.activo === 1,
  };
}

async function idEstablecimiento(db: D1Database, codigo: string): Promise<number> {
  const f = await db.prepare('SELECT id FROM establecimientos WHERE codigo = ?1').bind(codigo).first<{ id: number }>();
  if (!f) throw new ErrorHttp(400, 'Datos no válidos', { establecimiento_codigo: 'Establecimiento inexistente' });
  return f.id;
}

const esUnico = (e: unknown) => e instanceof Error && /UNIQUE/i.test(e.message);

rutas.get('/admin/usuarios', async (c) => {
  const { results } = await c.env.DB.prepare(`${SQL_USUARIOS} ORDER BY u.id`).all<FilaUsuario>();
  return c.json(results.map(aUsuario));
});

rutas.post('/admin/usuarios', async (c) => {
  const s = c.get('sesion');
  const d = validar(esquemaUsuarioNuevo, await leerJson(c));
  const db = c.env.DB;
  if (d.rol === 'admin' && d.establecimiento_codigo) {
    throw new ErrorHttp(400, 'Datos no válidos', { establecimiento_codigo: 'Un administrador no pertenece a un establecimiento' });
  }
  if (d.rol === 'encargado' && !d.establecimiento_codigo) {
    throw new ErrorHttp(400, 'Datos no válidos', { establecimiento_codigo: 'Obligatorio para un encargado' });
  }
  const estId = d.establecimiento_codigo ? await idEstablecimiento(db, d.establecimiento_codigo) : null;
  const hash = await hashearClave(d.clave);
  const correo = d.correo.toLowerCase();
  const ahora = new Date().toISOString();
  let nuevoId: number;
  try {
    const r = await db.batch([
      db
        .prepare('INSERT INTO usuarios (correo, nombre, hash_clave, rol, establecimiento_id, creado_en) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
        .bind(correo, d.nombre, hash, d.rol, estId, ahora),
      db.prepare(`${SQL_USUARIOS} WHERE u.id = last_insert_rowid()`),
      db
        .prepare("INSERT INTO eventos (usuario_id, accion, detalle, creado_en) VALUES (?1, 'usuario_creado', 'usuario ' || last_insert_rowid(), ?2)")
        .bind(s.usuarioId, ahora),
    ]);
    const fila = r[1]?.results?.[0] as FilaUsuario | undefined;
    if (!fila) throw new Error('No se pudo leer el usuario creado');
    nuevoId = fila.id;
    registrar('usuario_creado', '/api/admin/usuarios', { usuario_id: nuevoId, por: s.usuarioId });
    return c.json(aUsuario(fila), 201);
  } catch (e) {
    if (esUnico(e)) throw new ErrorHttp(409, 'Ya existe un usuario con ese correo');
    throw e;
  }
});

rutas.patch('/admin/usuarios/:id', async (c) => {
  const s = c.get('sesion');
  const id = idDeRuta(c.req.param('id'));
  const d = validar(esquemaUsuarioCambio, await leerJson(c));
  const db = c.env.DB;
  const actual = await db.prepare(`${SQL_USUARIOS} WHERE u.id = ?1`).bind(id).first<FilaUsuario>();
  if (!actual) throw new ErrorHttp(404, 'No se encontró el usuario');

  if (id === s.usuarioId && ((d.rol !== undefined && d.rol !== actual.rol) || d.activo === false)) {
    throw new ErrorHttp(403, 'No puede cambiar su propio rol ni desactivarse');
  }

  const rolFinal: Rol = d.rol ?? actual.rol;
  let estFinal = actual.establecimiento_id;
  if (rolFinal === 'admin') {
    if (d.establecimiento_codigo) {
      throw new ErrorHttp(400, 'Datos no válidos', { establecimiento_codigo: 'Un administrador no pertenece a un establecimiento' });
    }
    estFinal = null;
  } else if (d.establecimiento_codigo) {
    estFinal = await idEstablecimiento(db, d.establecimiento_codigo);
  } else if (estFinal === null) {
    throw new ErrorHttp(400, 'Datos no válidos', { establecimiento_codigo: 'Obligatorio para un encargado' });
  }

  const hash = d.clave ? await hashearClave(d.clave) : null;
  const ahora = new Date().toISOString();
  const cerrarSesiones = d.activo === false || d.clave !== undefined || rolFinal !== actual.rol || estFinal !== actual.establecimiento_id;
  // Nunca debe quedar el sistema sin un administrador activo. La condición va dentro del propio UPDATE:
  // como D1 ejecuta una sentencia a la vez, dos administradores no pueden quitarse el rol mutuamente a la vez.
  const dejaDeSerAdminActivo = actual.rol === 'admin' && actual.activo === 1 && (rolFinal !== 'admin' || d.activo === false);
  const cambiado = await db
    .prepare(
      `UPDATE usuarios SET nombre = COALESCE(?2, nombre), rol = ?3, establecimiento_id = ?4,
         activo = COALESCE(?5, activo), hash_clave = COALESCE(?6, hash_clave)
       WHERE id = ?1
         AND (?7 = 0 OR (SELECT COUNT(*) FROM usuarios WHERE rol = 'admin' AND activo = 1 AND id <> ?1) >= 1)
       RETURNING id`,
    )
    .bind(id, d.nombre ?? null, rolFinal, estFinal, d.activo === undefined ? null : d.activo ? 1 : 0, hash, dejaDeSerAdminActivo ? 1 : 0)
    .first<{ id: number }>();
  if (!cambiado) throw new ErrorHttp(409, 'Debe quedar al menos un administrador activo');

  const sentencias: D1PreparedStatement[] = [];
  if (cerrarSesiones) sentencias.push(db.prepare('DELETE FROM sesiones WHERE usuario_id = ?1 AND ?1 <> ?2').bind(id, s.usuarioId));
  const campos = Object.keys(d).join(',');
  sentencias.push(sentenciaEvento(db, null, s.usuarioId, 'usuario_modificado', `usuario ${id}: ${campos}`, ahora));
  sentencias.push(db.prepare(`${SQL_USUARIOS} WHERE u.id = ?1`).bind(id));
  const r = await db.batch(sentencias);
  const fila = r[r.length - 1]?.results?.[0] as FilaUsuario | undefined;
  if (!fila) throw new Error('No se pudo leer el usuario modificado');
  registrar('usuario_modificado', '/api/admin/usuarios/:id', { usuario_id: id, por: s.usuarioId });
  return c.json(aUsuario(fila));
});

rutas.get('/admin/establecimientos', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT codigo, nombre, direccion, ciudad, activo FROM establecimientos ORDER BY codigo',
  ).all<{ codigo: string; nombre: string; direccion: string; ciudad: string; activo: number }>();
  return c.json(results.map((e) => ({ ...e, activo: e.activo === 1 })));
});

rutas.post('/admin/establecimientos', async (c) => {
  const s = c.get('sesion');
  const d = validar(esquemaEstablecimientoNuevo, await leerJson(c));
  const db = c.env.DB;
  const ahora = new Date().toISOString();
  try {
    await db.batch([
      db
        .prepare('INSERT INTO establecimientos (codigo, nombre, direccion, ciudad, creado_en) VALUES (?1, ?2, ?3, ?4, ?5)')
        .bind(d.codigo, d.nombre, d.direccion, d.ciudad, ahora),
      sentenciaEvento(db, null, s.usuarioId, 'establecimiento_creado', d.codigo, ahora),
    ]);
  } catch (e) {
    if (esUnico(e)) throw new ErrorHttp(409, 'Ya existe un establecimiento con ese código');
    throw e;
  }
  registrar('establecimiento_creado', '/api/admin/establecimientos', { codigo: d.codigo, por: s.usuarioId });
  return c.json({ codigo: d.codigo, nombre: d.nombre, direccion: d.direccion, ciudad: d.ciudad, activo: true }, 201);
});

rutas.patch('/admin/establecimientos/:codigo', async (c) => {
  const s = c.get('sesion');
  const codigo = c.req.param('codigo') ?? '';
  if (!/^[A-Z]{3}-\d{2}$/.test(codigo)) throw new ErrorHttp(404, 'No se encontró el establecimiento');
  const d = validar(esquemaEstablecimientoCambio, await leerJson(c));
  const db = c.env.DB;
  const ahora = new Date().toISOString();
  const r = await db.batch([
    db
      .prepare(
        `UPDATE establecimientos SET nombre = COALESCE(?2, nombre), direccion = COALESCE(?3, direccion),
           ciudad = COALESCE(?4, ciudad), activo = COALESCE(?5, activo) WHERE codigo = ?1`,
      )
      .bind(codigo, d.nombre ?? null, d.direccion ?? null, d.ciudad ?? null, d.activo === undefined ? null : d.activo ? 1 : 0),
    db
      .prepare(
        `INSERT INTO eventos (usuario_id, accion, detalle, creado_en)
         SELECT ?2, 'establecimiento_modificado', ?1 || ': ' || ?3, ?4 WHERE EXISTS (SELECT 1 FROM establecimientos WHERE codigo = ?1)`,
      )
      .bind(codigo, s.usuarioId, Object.keys(d).join(','), ahora),
    db.prepare('SELECT codigo, nombre, direccion, ciudad, activo FROM establecimientos WHERE codigo = ?1').bind(codigo),
  ]);
  const e = r[2]?.results?.[0] as { codigo: string; nombre: string; direccion: string; ciudad: string; activo: number } | undefined;
  if (!e) throw new ErrorHttp(404, 'No se encontró el establecimiento');
  registrar('establecimiento_modificado', '/api/admin/establecimientos/:codigo', { codigo, por: s.usuarioId });
  return c.json({ ...e, activo: e.activo === 1 });
});

rutas.get('/admin/eventos', async (c) => {
  const pagina = enteroPositivo(c.req.query('pagina'), 1);
  const { results } = await c.env.DB.prepare(
    `SELECT ev.accion, ev.detalle, u.nombre AS autor, ev.creado_en,
            r.anio, r.correlativo, e.codigo AS est_codigo
     FROM eventos ev
     LEFT JOIN usuarios u ON u.id = ev.usuario_id
     LEFT JOIN reclamos r ON r.id = ev.reclamo_id
     LEFT JOIN establecimientos e ON e.id = r.establecimiento_id
     ORDER BY ev.creado_en DESC, ev.id DESC LIMIT 50 OFFSET ?1`,
  )
    .bind((pagina - 1) * 50)
    .all<{ accion: string; detalle: string | null; autor: string | null; creado_en: string; anio: number | null; correlativo: number | null; est_codigo: string | null }>();
  return c.json(
    results.map((f) => ({
      accion: f.accion,
      detalle: f.detalle,
      autor: f.autor,
      numero: f.est_codigo && f.anio !== null && f.correlativo !== null ? numeroHoja(f.est_codigo, f.anio, f.correlativo) : null,
      creado_en: f.creado_en,
    })),
  );
});

// Estado y interruptor del envío real de correos.
async function estadoCorreo(c: { env: AppEnv['Bindings'] }) {
  const db = c.env.DB;
  const [rCfg, rHoy, rPend] = await db.batch([
    ...sentenciasConfigCorreo(db, new Date()),
    db.prepare("SELECT COUNT(*) AS n FROM comunicaciones WHERE estado IN ('fallido', 'pendiente') AND tipo IN ('constancia_correo', 'respuesta_correo')"),
  ]);
  const cfg = interpretarConfigCorreo(c.env, rCfg?.results as { clave: string; valor: string }[], rHoy?.results as { n: number }[]);
  return {
    activo: cfg.activo,
    configurado: cfg.configurado,
    enviados_hoy: cfg.enviadosHoy,
    limite_diario: cfg.limiteDiario,
    fallidos_pendientes: (rPend?.results?.[0] as { n: number } | undefined)?.n ?? 0,
  };
}

rutas.get('/admin/correo', async (c) => c.json(await estadoCorreo(c)));

rutas.patch('/admin/correo', async (c) => {
  const s = c.get('sesion');
  const d = validar(esquemaCorreoAdmin, await leerJson(c));
  const db = c.env.DB;
  const ahora = new Date().toISOString();
  await db.batch([
    db.prepare("INSERT INTO configuracion (clave, valor) VALUES ('correo_activo', ?1) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor").bind(d.activo ? '1' : '0'),
    sentenciaEvento(db, null, s.usuarioId, 'correo_configuracion_cambiada', `activo=${d.activo ? 1 : 0}`, ahora),
  ]);
  registrar('correo_configuracion_cambiada', '/api/admin/correo', { activo: d.activo, por: s.usuarioId });
  return c.json(await estadoCorreo(c));
});

export default rutas;
