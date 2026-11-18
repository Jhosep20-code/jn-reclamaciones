// Envío de correos: reglas de la sección 6 del contrato (reclamo atómico, cuota, interruptor, dominios de prueba).
// Nada de lo que ocurre aquí puede hacer fallar la solicitud que lo dispara: todo error se captura.
import type { Context } from 'hono';
import { cargoDe, SQL_CARGO_AUTOR } from '../datos/carta';
import { registrar } from '../datos/comunes';
import { diaLimite, fechaLima, finDeDiaLimaISO } from '../dominio/plazos';
import type { AppEnv, Entorno, Tipo } from '../tipos';
import { esDominioDePrueba } from './dominios';
import { plantillaConstancia, plantillaRespuesta } from './plantillas';
import { enviarARelevo, urlRelevoValida } from './relevo';

export const MAX_INTENTOS = 3;
// Mientras un envío está en curso, la fila lleva este marcador en `detalle`. Si el proceso muere sin terminar,
// el marcador caduca y otro intento puede tomar la fila.
export const MARCA_ENVIANDO = 'enviando';
const CADUCIDAD_ENVIO_MS = 60_000;
export const LIMITE_DIARIO_POR_DEFECTO = 80;

export type TipoComunicacion = 'constancia_correo' | 'respuesta_correo' | 'respuesta_carta';

export interface ConfigCorreo {
  activo: boolean;
  configurado: boolean;
  limiteDiario: number;
  enviadosHoy: number;
}

export function correoConfigurado(env: Entorno): boolean {
  return Boolean(env.URL_RELEVO_CORREO && env.SECRETO_CORREO && urlRelevoValida(env.URL_RELEVO_CORREO));
}

// Inicio del día UTC al que pertenece `ahora` (la cuota diaria se cuenta por día UTC).
export function inicioDiaUtc(ahora: Date): string {
  return `${ahora.toISOString().slice(0, 10)}T00:00:00.000Z`;
}

// Dos sentencias: claves de configuración y enviados de hoy. Se pueden añadir a cualquier lote.
export function sentenciasConfigCorreo(db: D1Database, ahora: Date): D1PreparedStatement[] {
  return [
    db.prepare("SELECT clave, valor FROM configuracion WHERE clave IN ('correo_activo', 'correo_limite_diario')"),
    db.prepare("SELECT COUNT(*) AS n FROM comunicaciones WHERE estado = 'enviado' AND actualizado_en >= ?1").bind(inicioDiaUtc(ahora)),
  ];
}

export function interpretarConfigCorreo(
  env: Entorno,
  filasConfig: { clave: string; valor: string }[] | undefined,
  filasHoy: { n: number }[] | undefined,
): ConfigCorreo {
  const valor = (k: string) => filasConfig?.find((f) => f.clave === k)?.valor;
  const limite = Number(valor('correo_limite_diario') ?? LIMITE_DIARIO_POR_DEFECTO);
  return {
    activo: valor('correo_activo') === '1',
    configurado: correoConfigurado(env),
    limiteDiario: Number.isFinite(limite) && limite >= 0 ? limite : LIMITE_DIARIO_POR_DEFECTO,
    enviadosHoy: filasHoy?.[0]?.n ?? 0,
  };
}

interface FilaEnvio {
  id: number;
  tipo: TipoComunicacion;
  estado: string;
  intentos: number;
  reclamo_id: number;
  correo: string | null;
  codigo_seguimiento: string;
  tipo_hoja: Tipo;
  anio: number;
  correlativo: number;
  reclamo_creado: string;
  est_codigo: string;
  est_nombre: string;
  resp_texto: string | null;
  resp_autor: string | null;
  resp_rol: string | null;
  resp_cargo: string | null;
}

const SQL_FILA_ENVIO = `SELECT c.id, c.tipo, c.estado, c.intentos, c.reclamo_id, r.correo, r.codigo_seguimiento, r.tipo AS tipo_hoja,
    r.anio, r.correlativo, r.creado_en AS reclamo_creado, e.codigo AS est_codigo, e.nombre AS est_nombre,
    p.texto AS resp_texto, u.nombre AS resp_autor, u.rol AS resp_rol, ${SQL_CARGO_AUTOR} AS resp_cargo
  FROM comunicaciones c
  JOIN reclamos r ON r.id = c.reclamo_id
  JOIN establecimientos e ON e.id = r.establecimiento_id
  LEFT JOIN respuestas p ON p.reclamo_id = r.id
  LEFT JOIN usuarios u ON u.id = p.usuario_id
  WHERE c.id = ?1`;

export type ResultadoEnvio = 'enviado' | 'fallido' | 'omitido' | 'diferido' | 'no_aplica';

function actualizarDetalle(db: D1Database, id: number, detalle: string, ahora: string): D1PreparedStatement {
  return db
    .prepare("UPDATE comunicaciones SET detalle = ?2, actualizado_en = ?3 WHERE id = ?1 AND estado IN ('pendiente', 'fallido') AND detalle IS NOT ?2 AND detalle IS NOT 'enviando'")
    .bind(id, detalle, ahora);
}

// Intenta enviar una comunicación por correo. Nunca lanza.
export async function procesarEnvio(env: Entorno, comunicacionId: number, origenApp: string): Promise<ResultadoEnvio> {
  const db = env.DB;
  let reclamada = false;
  try {
    const ahora = new Date();
    const [rCfg, rHoy, rFila, rFer, rEmp] = await db.batch([
      ...sentenciasConfigCorreo(db, ahora),
      db.prepare(SQL_FILA_ENVIO).bind(comunicacionId),
      db.prepare('SELECT fecha FROM feriados'),
      db.prepare('SELECT razon_social FROM empresa WHERE id = 1'),
    ]);
    // Razón social tal como figura en la base; si faltara, la plantilla usa la de la marca.
    const empresa = (rEmp?.results?.[0] as { razon_social?: string } | undefined)?.razon_social;
    const fila = rFila?.results?.[0] as unknown as FilaEnvio | undefined;
    if (!fila || (fila.tipo !== 'constancia_correo' && fila.tipo !== 'respuesta_correo')) return 'no_aplica';
    if (!['pendiente', 'fallido'].includes(fila.estado) || fila.intentos >= MAX_INTENTOS) return 'no_aplica';
    const iso = ahora.toISOString();

    // 4. Sin correo o dominio de prueba: omitido.
    if (!fila.correo || esDominioDePrueba(fila.correo)) {
      await db
        .prepare("UPDATE comunicaciones SET estado = 'omitido', detalle = ?2, actualizado_en = ?3 WHERE id = ?1 AND estado IN ('pendiente', 'fallido')")
        .bind(comunicacionId, fila.correo ? 'dominio de prueba' : 'sin correo', iso)
        .run();
      return 'omitido';
    }

    // 5. Interruptor, secretos y cuota diaria: queda pendiente con el motivo.
    const cfg = interpretarConfigCorreo(env, rCfg?.results as { clave: string; valor: string }[], rHoy?.results as { n: number }[]);
    if (!cfg.activo || !cfg.configurado) {
      await actualizarDetalle(db, comunicacionId, 'envío desactivado', iso).run();
      return 'diferido';
    }
    if (cfg.enviadosHoy >= cfg.limiteDiario) {
      await actualizarDetalle(db, comunicacionId, 'cuota diaria alcanzada', iso).run();
      return 'diferido';
    }

    // 3. Reclamo atómico de la fila (UPDATE ... RETURNING). Además de estado e intentos < 3:
    //  - `intentos` debe seguir valiendo lo que leímos (dos procesos que leen a la vez: solo uno gana);
    //  - la fila no debe tener un envío en curso reciente (marcador en `detalle`), para que quien llegue mientras el
    //    primero espera al relevo tampoco envíe un duplicado.
    const tomada = await db
      .prepare(
        `UPDATE comunicaciones SET intentos = intentos + 1, detalle = ?5, actualizado_en = ?2
         WHERE id = ?1 AND estado IN ('pendiente', 'fallido') AND intentos < ?4 AND intentos = ?3
           AND (detalle IS NOT ?5 OR actualizado_en < ?6) RETURNING id`,
      )
      .bind(comunicacionId, iso, fila.intentos, MAX_INTENTOS, MARCA_ENVIANDO, new Date(ahora.getTime() - CADUCIDAD_ENVIO_MS).toISOString())
      .first<{ id: number }>();
    if (!tomada) return 'no_aplica';
    reclamada = true;

    const numero = `${fila.est_codigo}-${fila.anio}-${String(fila.correlativo).padStart(6, '0')}`;
    const urlSeguimiento = `${origenApp}/seguimiento/${fila.codigo_seguimiento}`;
    let redactado;
    if (fila.tipo === 'constancia_correo') {
      const feriados = new Set(((rFer?.results ?? []) as { fecha: string }[]).map((f) => f.fecha));
      redactado = plantillaConstancia({
        numero,
        creadoEn: fila.reclamo_creado,
        establecimiento: fila.est_nombre,
        tipo: fila.tipo_hoja,
        fechaLimite: finDeDiaLimaISO(diaLimite(fechaLima(fila.reclamo_creado), feriados)),
        codigoSeguimiento: fila.codigo_seguimiento,
        urlSeguimiento,
        empresa,
      });
    } else {
      redactado = plantillaRespuesta({
        numero,
        texto: fila.resp_texto ?? '',
        responsable: fila.resp_autor ?? '',
        cargo: cargoDe(fila.resp_rol, fila.resp_cargo),
        urlSeguimiento,
        empresa,
      });
    }

    const resultado = await enviarARelevo(env.URL_RELEVO_CORREO as string, env.SECRETO_CORREO as string, {
      para: fila.correo,
      asunto: redactado.asunto,
      html: redactado.html,
      texto: redactado.texto,
    });
    const fin = new Date().toISOString();
    const estadoFinal = resultado.ok ? 'enviado' : 'fallido';
    await db.batch([
      db
        .prepare('UPDATE comunicaciones SET estado = ?2, detalle = ?3, actualizado_en = ?4 WHERE id = ?1')
        .bind(comunicacionId, estadoFinal, resultado.motivo, fin),
      db
        .prepare('INSERT INTO eventos (reclamo_id, usuario_id, accion, detalle, creado_en) VALUES (?1, NULL, ?2, ?3, ?4)')
        .bind(fila.reclamo_id, resultado.ok ? 'correo_enviado' : 'correo_fallido', resultado.ok ? fila.tipo : `${fila.tipo}: ${resultado.motivo}`, fin),
    ]);
    registrar(resultado.ok ? 'correo_enviado' : 'correo_fallido', 'correo', { comunicacion_id: comunicacionId, tipo: fila.tipo });
    return estadoFinal;
  } catch (e) {
    registrar('correo_error', 'correo', { comunicacion_id: comunicacionId, tipo: e instanceof Error ? e.name : 'desconocido' });
    if (reclamada) {
      // La fila quedó tomada: se deja constancia del fallo para que se pueda reintentar.
      try {
        await db
          .prepare("UPDATE comunicaciones SET estado = 'fallido', detalle = 'error interno al enviar', actualizado_en = ?2 WHERE id = ?1 AND detalle = 'enviando'")
          .bind(comunicacionId, new Date().toISOString())
          .run();
      } catch {
        /* sin más recursos: la fila queda pendiente */
      }
    }
    return 'fallido';
  }
}

// Programa el envío después de responder al cliente. Nunca lanza hacia la solicitud.
export function lanzarEnvio(c: Context<AppEnv>, comunicacionId: number): void {
  const tarea = procesarEnvio(c.env, comunicacionId, new URL(c.req.url).origin).catch(() => 'fallido' as const);
  try {
    c.executionCtx.waitUntil(tarea);
  } catch {
    /* sin contexto de ejecución: la promesa sigue por su cuenta */
  }
}
