// Sesiones, cookie, CSRF y middleware de permisos.
import type { Context, Next } from 'hono';
import { ErrorHttp } from '../errores';
import type { AppEnv, Rol, SesionActiva } from '../tipos';
import { aHex, aleatorioBytes, igualesTextoTiempoConstante, sha256Hex } from './claves';

export const DURACION_SESION_MS = 8 * 3_600_000;
const FORMATO_ID = /^[0-9a-f]{64}$/;

export function esHttps(c: Context<AppEnv>): boolean {
  return new URL(c.req.url).protocol === 'https:';
}

export function nombreCookie(c: Context<AppEnv>): string {
  return esHttps(c) ? '__Host-rc_sesion' : 'rc_sesion';
}

export function leerCookie(c: Context<AppEnv>, nombre: string): string | null {
  const cabecera = c.req.header('Cookie');
  if (!cabecera) return null;
  for (const trozo of cabecera.split(';')) {
    const i = trozo.indexOf('=');
    if (i > 0 && trozo.slice(0, i).trim() === nombre) return trozo.slice(i + 1).trim();
  }
  return null;
}

export function cookieDeSesion(c: Context<AppEnv>, valor: string, maxEdadSeg: number): string {
  const seguro = esHttps(c) ? '; Secure' : '';
  return `${nombreCookie(c)}=${valor}; HttpOnly${seguro}; SameSite=Lax; Path=/; Max-Age=${maxEdadSeg}`;
}

export function nuevoIdentificador(): string {
  return aHex(aleatorioBytes(32));
}

export function nuevoTokenCsrf(): string {
  return aHex(aleatorioBytes(32));
}

// Carga la sesión de la cookie y relee usuario, rol, establecimiento y estado desde D1 (un solo JOIN).
export async function cargarSesion(c: Context<AppEnv>): Promise<SesionActiva | null> {
  const id = leerCookie(c, nombreCookie(c));
  if (!id || !FORMATO_ID.test(id)) return null;
  const idHash = await sha256Hex(id);
  const fila = await c.env.DB.prepare(
    `SELECT s.token_csrf, u.id AS usuario_id, u.nombre, u.correo, u.rol, u.establecimiento_id,
            e.codigo AS est_codigo, e.nombre AS est_nombre
     FROM sesiones s
     JOIN usuarios u ON u.id = s.usuario_id
     LEFT JOIN establecimientos e ON e.id = u.establecimiento_id
     WHERE s.id_hash = ?1 AND s.expira_en > ?2 AND u.activo = 1`,
  )
    .bind(idHash, new Date().toISOString())
    .first<{
      token_csrf: string;
      usuario_id: number;
      nombre: string;
      correo: string;
      rol: Rol;
      establecimiento_id: number | null;
      est_codigo: string | null;
      est_nombre: string | null;
    }>();
  if (!fila) return null;
  return {
    idHash,
    tokenCsrf: fila.token_csrf,
    usuarioId: fila.usuario_id,
    nombre: fila.nombre,
    correo: fila.correo,
    rol: fila.rol,
    establecimientoId: fila.establecimiento_id,
    establecimientoCodigo: fila.est_codigo,
    establecimientoNombre: fila.est_nombre,
  };
}

// Si llega la cabecera Origin, debe coincidir con el origen del servicio.
export function origenCoincide(c: Context<AppEnv>, obligatorio: boolean): boolean {
  const origen = c.req.header('Origin');
  if (origen === undefined) return !obligatorio;
  return origen === new URL(c.req.url).origin;
}

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function verificarCsrf(c: Context<AppEnv>, sesion: SesionActiva): void {
  if (METODOS_SEGUROS.has(c.req.method)) return;
  const token = c.req.header('X-CSRF-Token');
  if (!token || !igualesTextoTiempoConstante(token, sesion.tokenCsrf) || !origenCoincide(c, true)) {
    throw new ErrorHttp(403, 'Solicitud rechazada por seguridad (CSRF)');
  }
}

export async function exigirSesion(c: Context<AppEnv>, next: Next): Promise<void> {
  const sesion = await cargarSesion(c);
  if (!sesion) throw new ErrorHttp(401, 'Debe iniciar sesión');
  verificarCsrf(c, sesion);
  c.set('sesion', sesion);
  await next();
}

export async function exigirAdmin(c: Context<AppEnv>, next: Next): Promise<void> {
  if (c.get('sesion').rol !== 'admin') throw new ErrorHttp(403, 'No tiene permiso para esta operación');
  await next();
}
