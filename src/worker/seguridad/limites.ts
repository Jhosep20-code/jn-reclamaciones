// Límites de uso contados en D1 (no en memoria: puede haber muchos isolates).

export const VENTANA_LOGIN_MS = 15 * 60_000;
export const MAX_FALLOS_POR_CORREO = 5;
export const MAX_FALLOS_POR_ORIGEN = 20;
export const VENTANA_REGISTRO_MS = 3_600_000;

type ResumenConteo = { n: number; primero: string | null };

// Segundos que faltan para que el intento más antiguo salga de la ventana.
function segundosEspera(primero: string | null, ventanaMs: number, ahoraMs: number): number {
  const base = primero ? Date.parse(primero) : ahoraMs;
  return Math.max(1, Math.ceil((base + ventanaMs - ahoraMs) / 1000));
}

// Dos sentencias: fallos del correo (desde el último acierto) y fallos del origen.
export function sentenciasBloqueoLogin(db: D1Database, correo: string, huella: string, ahora: Date): D1PreparedStatement[] {
  const desde = new Date(ahora.getTime() - VENTANA_LOGIN_MS).toISOString();
  return [
    db
      .prepare(
        `SELECT COUNT(*) AS n, MIN(creado_en) AS primero FROM intentos_acceso
         WHERE correo = ?1 AND exito = 0
           AND creado_en > MAX(?2, COALESCE((SELECT MAX(creado_en) FROM intentos_acceso WHERE correo = ?1 AND exito = 1), ''))`,
      )
      .bind(correo, desde),
    db
      .prepare(
        `SELECT COUNT(*) AS n, MIN(creado_en) AS primero FROM intentos_acceso
         WHERE huella_origen = ?1 AND exito = 0 AND creado_en > ?2`,
      )
      .bind(huella, desde),
  ];
}

// Devuelve los segundos de espera si hay bloqueo, o null si puede intentar.
export function evaluarBloqueoLogin(
  porCorreo: ResumenConteo | null | undefined,
  porOrigen: ResumenConteo | null | undefined,
  ahora: Date,
): number | null {
  const ahoraMs = ahora.getTime();
  const esperas: number[] = [];
  if (porCorreo && porCorreo.n >= MAX_FALLOS_POR_CORREO) esperas.push(segundosEspera(porCorreo.primero, VENTANA_LOGIN_MS, ahoraMs));
  if (porOrigen && porOrigen.n >= MAX_FALLOS_POR_ORIGEN) esperas.push(segundosEspera(porOrigen.primero, VENTANA_LOGIN_MS, ahoraMs));
  return esperas.length ? Math.max(...esperas) : null;
}

// Límite del registro público: se cuenta con reclamos.huella_origen.
export function sentenciaConteoRegistros(db: D1Database, huella: string, ahora: Date): D1PreparedStatement {
  const desde = new Date(ahora.getTime() - VENTANA_REGISTRO_MS).toISOString();
  return db
    .prepare('SELECT COUNT(*) AS n, MIN(creado_en) AS primero FROM reclamos WHERE huella_origen = ?1 AND creado_en > ?2')
    .bind(huella, desde);
}

export function sentenciaLimiteRegistros(db: D1Database): D1PreparedStatement {
  return db.prepare("SELECT valor FROM configuracion WHERE clave = 'limite_registros_por_origen_hora'");
}

export function evaluarLimiteRegistros(
  conteo: ResumenConteo | null | undefined,
  valorConfigurado: string | null | undefined,
  ahora: Date,
): number | null {
  const limite = Number(valorConfigurado ?? '10');
  const maximo = Number.isFinite(limite) && limite >= 0 ? limite : 10;
  if (conteo && conteo.n >= maximo) return segundosEspera(conteo.primero, VENTANA_REGISTRO_MS, ahora.getTime());
  return null;
}

// Consulta segura de la respuesta: 5 fallos por código de seguimiento en 15 minutos (desde el último acierto).
// Se cuenta por el SHA-256 del código; el código nunca se guarda.
export const MAX_FALLOS_CONSULTA = 5;
export const VENTANA_CONSULTA_MS = VENTANA_LOGIN_MS;

export function sentenciaFallosConsulta(db: D1Database, codigoHash: string, ahora: Date): D1PreparedStatement {
  const desde = new Date(ahora.getTime() - VENTANA_CONSULTA_MS).toISOString();
  return db
    .prepare(
      `SELECT COUNT(*) AS n, MIN(creado_en) AS primero FROM intentos_consulta
       WHERE codigo_hash = ?1 AND exito = 0
         AND creado_en > MAX(?2, COALESCE((SELECT MAX(creado_en) FROM intentos_consulta WHERE codigo_hash = ?1 AND exito = 1), ''))`,
    )
    .bind(codigoHash, desde);
}

// Segundos de espera si el código está bloqueado, o null si puede intentar.
export function evaluarBloqueoConsulta(conteo: ResumenConteo | null | undefined, ahora: Date): number | null {
  if (conteo && conteo.n >= MAX_FALLOS_CONSULTA) return segundosEspera(conteo.primero, VENTANA_CONSULTA_MS, ahora.getTime());
  return null;
}
