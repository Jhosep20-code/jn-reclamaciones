// Inicio, consulta y cierre de sesión.
import { Hono } from 'hono';
import { leerJson, registrar, sentenciaEvento } from '../datos/comunes';
import { esquemaLogin, validar } from '../dominio/validacion';
import { ErrorHttp } from '../errores';
import { sha256Hex, verificarClave } from '../seguridad/claves';
import { evaluarBloqueoLogin, sentenciasBloqueoLogin } from '../seguridad/limites';
import { huellaOrigen } from '../seguridad/origen';
import {
  cargarSesion,
  cookieDeSesion,
  DURACION_SESION_MS,
  nuevoIdentificador,
  nuevoTokenCsrf,
  origenCoincide,
  verificarCsrf,
} from '../seguridad/sesiones';
import type { AppEnv, Rol, SesionActiva } from '../tipos';

const rutas = new Hono<AppEnv>();
const MENSAJE_GENERICO = 'Correo o clave incorrectos';

export function usuarioPublico(s: SesionActiva) {
  return {
    id: s.usuarioId,
    nombre: s.nombre,
    correo: s.correo,
    rol: s.rol,
    establecimiento:
      s.establecimientoCodigo && s.establecimientoNombre
        ? { codigo: s.establecimientoCodigo, nombre: s.establecimientoNombre }
        : null,
  };
}

rutas.post('/sesion', async (c) => {
  // Si el navegador envía Origin, debe ser el propio servicio (evita inicios de sesión forzados desde otros sitios).
  if (!origenCoincide(c, false)) throw new ErrorHttp(403, 'Solicitud rechazada por seguridad (CSRF)');
  const datos = validar(esquemaLogin, await leerJson(c));
  const correo = datos.correo.toLowerCase();
  const db = c.env.DB;
  const ahora = new Date();
  const huella = await huellaOrigen(c);

  const [rCorreo, rOrigen, rUsuario] = await db.batch([
    ...sentenciasBloqueoLogin(db, correo, huella, ahora),
    db
      .prepare(
        `SELECT u.id, u.nombre, u.correo, u.rol, u.hash_clave, u.activo, u.establecimiento_id,
                e.codigo AS est_codigo, e.nombre AS est_nombre
         FROM usuarios u LEFT JOIN establecimientos e ON e.id = u.establecimiento_id
         WHERE u.correo = ?1`,
      )
      .bind(correo),
  ]);
  const espera = evaluarBloqueoLogin(
    rCorreo?.results?.[0] as { n: number; primero: string | null } | undefined,
    rOrigen?.results?.[0] as { n: number; primero: string | null } | undefined,
    ahora,
  );
  if (espera !== null) {
    registrar('login_bloqueado', '/api/sesion');
    throw new ErrorHttp(429, 'Demasiados intentos fallidos. Intente de nuevo más tarde.', undefined, {
      'Retry-After': String(espera),
    });
  }

  const u = rUsuario?.results?.[0] as
    | {
        id: number; nombre: string; correo: string; rol: Rol; hash_clave: string; activo: number;
        establecimiento_id: number | null; est_codigo: string | null; est_nombre: string | null;
      }
    | undefined;
  // Siempre se deriva (aunque el usuario no exista) para no revelar por tiempo qué correos existen.
  const claveCorrecta = await verificarClave(datos.clave, u ? u.hash_clave : null);
  const iso = ahora.toISOString();
  if (!u || !claveCorrecta || u.activo !== 1) {
    await db
      .prepare('INSERT INTO intentos_acceso (correo, huella_origen, exito, creado_en) VALUES (?1, ?2, 0, ?3)')
      .bind(correo, huella, iso)
      .run();
    registrar('login_fallido', '/api/sesion');
    throw new ErrorHttp(401, MENSAJE_GENERICO);
  }

  // Identificador nuevo en cada inicio; en la base solo se guarda su SHA-256.
  const id = nuevoIdentificador();
  const tokenCsrf = nuevoTokenCsrf();
  await db.batch([
    db.prepare('DELETE FROM sesiones WHERE expira_en < ?1').bind(iso),
    db
      .prepare('DELETE FROM intentos_acceso WHERE creado_en < ?1')
      .bind(new Date(ahora.getTime() - 24 * 3_600_000).toISOString()),
    db
      .prepare('INSERT INTO sesiones (id_hash, usuario_id, token_csrf, creado_en, expira_en) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind(await sha256Hex(id), u.id, tokenCsrf, iso, new Date(ahora.getTime() + DURACION_SESION_MS).toISOString()),
    db
      .prepare('INSERT INTO intentos_acceso (correo, huella_origen, exito, creado_en) VALUES (?1, ?2, 1, ?3)')
      .bind(correo, huella, iso),
    sentenciaEvento(db, null, u.id, 'sesion_iniciada', null, iso),
  ]);
  registrar('sesion_iniciada', '/api/sesion', { usuario_id: u.id, rol: u.rol });
  c.header('Set-Cookie', cookieDeSesion(c, id, DURACION_SESION_MS / 1000));
  return c.json({
    usuario: {
      id: u.id,
      nombre: u.nombre,
      correo: u.correo,
      rol: u.rol,
      establecimiento: u.est_codigo && u.est_nombre ? { codigo: u.est_codigo, nombre: u.est_nombre } : null,
    },
    token_csrf: tokenCsrf,
  });
});

rutas.get('/sesion', async (c) => {
  const s = await cargarSesion(c);
  if (!s) throw new ErrorHttp(401, 'Debe iniciar sesión');
  return c.json({ usuario: usuarioPublico(s), token_csrf: s.tokenCsrf });
});

rutas.delete('/sesion', async (c) => {
  const s = await cargarSesion(c);
  // Sin sesión válida no hay nada que cerrar: se limpia la cookie y se responde 204.
  if (s) {
    verificarCsrf(c, s);
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM sesiones WHERE id_hash = ?1').bind(s.idHash),
      sentenciaEvento(c.env.DB, null, s.usuarioId, 'sesion_cerrada', null, new Date().toISOString()),
    ]);
    registrar('sesion_cerrada', '/api/sesion', { usuario_id: s.usuarioId });
  }
  c.header('Set-Cookie', cookieDeSesion(c, '', 0));
  return c.body(null, 204);
});

export default rutas;
