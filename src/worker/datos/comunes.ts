// Utilidades comunes: lectura del cuerpo, registros de actividad, feriados, eventos.
import type { Context } from 'hono';
import { ErrorHttp } from '../errores';
import type { AppEnv } from '../tipos';

export async function leerJson(c: Context<AppEnv>): Promise<unknown> {
  let crudo: string;
  try {
    crudo = await c.req.text();
  } catch {
    throw new ErrorHttp(400, 'Cuerpo no válido');
  }
  if (crudo.length > 100_000) throw new ErrorHttp(400, 'Cuerpo demasiado grande');
  try {
    return JSON.parse(crudo);
  } catch {
    throw new ErrorHttp(400, 'El cuerpo debe ser JSON válido');
  }
}

// Registro estructurado. Nunca incluir datos personales, claves, tokens ni la IP.
export function registrar(accion: string, ruta: string, datos: Record<string, string | number | boolean | null> = {}): void {
  console.log(JSON.stringify({ accion, ruta, ...datos }));
}

export function sentenciaFeriados(db: D1Database): D1PreparedStatement {
  return db.prepare('SELECT fecha FROM feriados');
}

export function aConjuntoFeriados(filas: { fecha: string }[] | undefined): Set<string> {
  return new Set((filas ?? []).map((f) => f.fecha));
}

export function sentenciaEvento(
  db: D1Database,
  reclamoId: number | null,
  usuarioId: number | null,
  accion: string,
  detalle: string | null,
  creadoEn: string,
): D1PreparedStatement {
  return db
    .prepare('INSERT INTO eventos (reclamo_id, usuario_id, accion, detalle, creado_en) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(reclamoId, usuarioId, accion, detalle, creadoEn);
}

// Evento que solo se anota si la sentencia inmediatamente anterior del lote modificó alguna fila.
// Evita historial duplicado o falso cuando dos solicitudes simultáneas compiten por el mismo cambio.
export function sentenciaEventoSiCambio(
  db: D1Database,
  reclamoId: number,
  usuarioId: number | null,
  accion: string,
  detalle: string | null,
  creadoEn: string,
): D1PreparedStatement {
  return db
    .prepare('INSERT INTO eventos (reclamo_id, usuario_id, accion, detalle, creado_en) SELECT ?1, ?2, ?3, ?4, ?5 WHERE changes() > 0')
    .bind(reclamoId, usuarioId, accion, detalle, creadoEn);
}

export function numeroHoja(codigo: string, anio: number, correlativo: number): string {
  return `${codigo}-${anio}-${String(correlativo).padStart(6, '0')}`;
}

export function enteroPositivo(valor: string | undefined, porDefecto: number): number {
  if (valor === undefined) return porDefecto;
  if (!/^\d{1,6}$/.test(valor) || Number(valor) < 1) throw new ErrorHttp(400, 'Parámetro de página no válido');
  return Number(valor);
}

export function idDeRuta(valor: string | undefined): number {
  if (!valor || !/^\d{1,9}$/.test(valor)) throw new ErrorHttp(404, 'No encontrado');
  return Number(valor);
}
