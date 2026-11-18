// Consultas de la bandeja: lista, detalle y panel. El alcance del encargado va dentro del SQL.
import { calcularPlazo, calcularPlazoPorDias, fechaLima, diaLimite } from '../dominio/plazos';
import type { Estado, MedioRespuesta, Plazo, Rol, Semaforo, Tipo } from '../tipos';
import { construirCarta, SQL_CARGO_AUTOR, SQL_EMPRESA } from './carta';
import { aConjuntoFeriados, numeroHoja, sentenciaFeriados } from './comunes';

// Alcance: null = todos (admin); número = solo ese establecimiento (encargado).
export type Alcance = number | null;

interface FilaReclamo {
  id: number;
  anio: number;
  correlativo: number;
  tipo: Tipo;
  estado: Estado;
  nombres: string;
  tipo_documento: string;
  numero_documento: string;
  domicilio: string | null;
  telefono: string | null;
  correo: string | null;
  es_menor: number;
  apoderado_nombres: string | null;
  apoderado_contacto: string | null;
  tipo_bien: string;
  descripcion_bien: string;
  monto_reclamado_centimos: number | null;
  detalle: string;
  pedido: string;
  creado_en: string;
  respondido_en: string | null;
  medio_respuesta: MedioRespuesta | null;
  est_codigo: string;
  est_nombre: string;
  est_direccion: string;
  est_ciudad: string;
}

const COLUMNAS = `r.id, r.anio, r.correlativo, r.tipo, r.estado, r.nombres, r.tipo_documento, r.numero_documento,
  r.domicilio, r.telefono, r.correo, r.es_menor, r.apoderado_nombres, r.apoderado_contacto, r.tipo_bien,
  r.descripcion_bien, r.monto_reclamado_centimos, r.detalle, r.pedido, r.creado_en, r.respondido_en,
  r.medio_respuesta, e.codigo AS est_codigo, e.nombre AS est_nombre, e.direccion AS est_direccion, e.ciudad AS est_ciudad`;

const SQL_RECLAMO = `SELECT ${COLUMNAS}
  FROM reclamos r JOIN establecimientos e ON e.id = r.establecimiento_id
  WHERE r.id = ?1 AND (?2 IS NULL OR r.establecimiento_id = ?2)`;

function resumen(f: FilaReclamo, plazo: Plazo) {
  return {
    id: f.id,
    numero: numeroHoja(f.est_codigo, f.anio, f.correlativo),
    tipo: f.tipo,
    estado: f.estado,
    establecimiento: { codigo: f.est_codigo, nombre: f.est_nombre },
    consumidor_nombres: f.nombres,
    creado_en: f.creado_en,
    plazo,
    medio_respuesta: f.medio_respuesta,
  };
}

function plazoDe(f: FilaReclamo, ahora: Date, feriados: Set<string>): Plazo {
  return calcularPlazo({ creadoEn: f.creado_en, ahora, feriados, estado: f.estado, respondidoEn: f.respondido_en });
}

// Consulta mínima con alcance: devuelve null si no existe o está fuera del alcance.
export async function reclamoEnAlcance(
  db: D1Database,
  id: number,
  alcance: Alcance,
): Promise<ReclamoMinimo | null> {
  return db
    .prepare(
      'SELECT id, estado, tipo, creado_en, medio_respuesta, correo FROM reclamos WHERE id = ?1 AND (?2 IS NULL OR establecimiento_id = ?2)',
    )
    .bind(id, alcance)
    .first<ReclamoMinimo>();
}

export interface ReclamoMinimo {
  id: number;
  estado: Estado;
  tipo: Tipo;
  creado_en: string;
  medio_respuesta: MedioRespuesta | null;
  correo: string | null; // solo para decidir el envío; nunca se devuelve por la API
}

export async function existeReclamo(db: D1Database, id: number): Promise<boolean> {
  const f = await db.prepare('SELECT 1 AS ok FROM reclamos WHERE id = ?1').bind(id).first();
  return f !== null;
}

export async function cargarDetalle(db: D1Database, id: number, alcance: Alcance, ahora: Date) {
  const enAlcance = '(?2 IS NULL OR r.establecimiento_id = ?2)';
  const [rRec, rResp, rEv, rFer, rCom, rEmp, rAnt, rSig] = await db.batch([
    db.prepare(SQL_RECLAMO).bind(id, alcance),
    db
      .prepare(
        `SELECT p.texto, p.medio_comunicacion, p.fecha_comunicacion, u.nombre AS autor, u.rol AS autor_rol, ${SQL_CARGO_AUTOR} AS autor_cargo, p.creado_en
         FROM respuestas p JOIN usuarios u ON u.id = p.usuario_id
         WHERE p.reclamo_id = ?1 AND EXISTS (SELECT 1 FROM reclamos r WHERE r.id = ?1 AND ${enAlcance})`,
      )
      .bind(id, alcance),
    db
      .prepare(
        `SELECT ev.accion, ev.detalle, u.nombre AS autor, ev.creado_en
         FROM eventos ev LEFT JOIN usuarios u ON u.id = ev.usuario_id
         WHERE ev.reclamo_id = ?1 AND EXISTS (SELECT 1 FROM reclamos r WHERE r.id = ?1 AND ${enAlcance})
         ORDER BY ev.creado_en, ev.id`,
      )
      .bind(id, alcance),
    sentenciaFeriados(db),
    db
      .prepare(
        `SELECT c.id, c.tipo, c.estado, c.intentos, c.detalle, c.creado_en, c.actualizado_en, c.fecha_entrega
         FROM comunicaciones c JOIN reclamos r ON r.id = c.reclamo_id
         WHERE c.reclamo_id = ?1 AND ${enAlcance} ORDER BY c.id`,
      )
      .bind(id, alcance),
    db.prepare(SQL_EMPRESA),
    // Navegación en el orden de la bandeja (más recientes primero): "anterior" es el caso que aparece justo antes
    // en la lista (más reciente) y "siguiente" el que aparece justo después (más antiguo), siempre dentro del alcance.
    db
      .prepare(
        `SELECT r.id FROM reclamos r WHERE ${enAlcance}
           AND (r.creado_en, r.id) > (SELECT creado_en, id FROM reclamos WHERE id = ?1)
         ORDER BY r.creado_en ASC, r.id ASC LIMIT 1`,
      )
      .bind(id, alcance),
    db
      .prepare(
        `SELECT r.id FROM reclamos r WHERE ${enAlcance}
           AND (r.creado_en, r.id) < (SELECT creado_en, id FROM reclamos WHERE id = ?1)
         ORDER BY r.creado_en DESC, r.id DESC LIMIT 1`,
      )
      .bind(id, alcance),
  ]);
  const f = (rRec?.results as unknown as FilaReclamo[] | undefined)?.[0];
  if (!f) return null;
  const feriados = aConjuntoFeriados(rFer?.results as { fecha: string }[] | undefined);
  const resp = (
    rResp?.results as
      | { texto: string; medio_comunicacion: string; fecha_comunicacion: string; autor: string; autor_rol: Rol; autor_cargo: string | null; creado_en: string }[]
      | undefined
  )?.[0];
  const consumidor: Record<string, unknown> = {
    nombres: f.nombres,
    tipo_documento: f.tipo_documento,
    numero_documento: f.numero_documento,
    es_menor: f.es_menor === 1,
  };
  if (f.domicilio !== null) consumidor.domicilio = f.domicilio;
  if (f.telefono !== null) consumidor.telefono = f.telefono;
  if (f.correo !== null) consumidor.correo = f.correo;
  if (f.apoderado_nombres !== null) consumidor.apoderado_nombres = f.apoderado_nombres;
  if (f.apoderado_contacto !== null) consumidor.apoderado_contacto = f.apoderado_contacto;
  const carta = resp
    ? construirCarta({
        estCodigo: f.est_codigo,
        anio: f.anio,
        correlativo: f.correlativo,
        tipo: f.tipo,
        fechaEmision: resp.creado_en,
        empresa: rEmp?.results?.[0] as { razon_social: string; ruc: string; direccion_fiscal: string } | undefined,
        estNombre: f.est_nombre,
        estDireccion: f.est_direccion,
        estCiudad: f.est_ciudad,
        nombres: f.nombres,
        domicilio: f.domicilio,
        texto: resp.texto,
        autorNombre: resp.autor,
        autorRol: resp.autor_rol,
        autorCargo: resp.autor_cargo,
      })
    : null;
  return {
    ...resumen(f, plazoDe(f, ahora, feriados)),
    consumidor,
    bien: {
      tipo: f.tipo_bien,
      descripcion: f.descripcion_bien,
      monto: f.monto_reclamado_centimos === null ? null : f.monto_reclamado_centimos / 100,
    },
    detalle: f.detalle,
    pedido: f.pedido,
    respondido_en: f.respondido_en,
    respuesta: resp
      ? {
          texto: resp.texto,
          medio_comunicacion: resp.medio_comunicacion,
          fecha_comunicacion: resp.fecha_comunicacion,
          autor: resp.autor,
          creado_en: resp.creado_en,
        }
      : null,
    eventos: (rEv?.results ?? []) as { accion: string; detalle: string | null; autor: string | null; creado_en: string }[],
    comunicaciones: (rCom?.results ?? []) as {
      id: number; tipo: string; estado: string; intentos: number; detalle: string | null; creado_en: string; actualizado_en: string; fecha_entrega: string | null;
    }[],
    carta,
    anterior_id: (rAnt?.results?.[0] as { id: number } | undefined)?.id ?? null,
    siguiente_id: (rSig?.results?.[0] as { id: number } | undefined)?.id ?? null,
  };
}

export interface FiltrosLista {
  estado: Estado | null;
  tipo: Tipo | null;
  establecimientoCodigo: string | null;
  pagina: number;
}

export const POR_PAGINA = 20;

export async function listarReclamos(db: D1Database, alcance: Alcance, filtros: FiltrosLista, ahora: Date) {
  const donde = `WHERE (?1 IS NULL OR r.estado = ?1) AND (?2 IS NULL OR r.tipo = ?2)
    AND (?3 IS NULL OR e.codigo = ?3) AND (?4 IS NULL OR r.establecimiento_id = ?4)`;
  const [rLista, rTotal, rFer] = await db.batch([
    db
      .prepare(
        `SELECT ${COLUMNAS} FROM reclamos r JOIN establecimientos e ON e.id = r.establecimiento_id ${donde}
         ORDER BY r.creado_en DESC, r.id DESC LIMIT ${POR_PAGINA} OFFSET ?5`,
      )
      .bind(filtros.estado, filtros.tipo, filtros.establecimientoCodigo, alcance, (filtros.pagina - 1) * POR_PAGINA),
    db
      .prepare(`SELECT COUNT(*) AS total FROM reclamos r JOIN establecimientos e ON e.id = r.establecimiento_id ${donde}`)
      .bind(filtros.estado, filtros.tipo, filtros.establecimientoCodigo, alcance),
    sentenciaFeriados(db),
  ]);
  const feriados = aConjuntoFeriados(rFer?.results as { fecha: string }[] | undefined);
  const filas = (rLista?.results ?? []) as unknown as FilaReclamo[];
  return {
    reclamos: filas.map((f) => resumen(f, plazoDe(f, ahora, feriados))),
    total: ((rTotal?.results?.[0] as { total: number } | undefined)?.total) ?? 0,
    pagina: filtros.pagina,
    por_pagina: POR_PAGINA,
  };
}

export async function construirPanel(db: D1Database, alcance: Alcance, ahora: Date) {
  const [rGrupos, rEst, rFer] = await db.batch([
    db
      .prepare(
        `SELECT r.establecimiento_id AS est, r.estado, r.tipo,
                date(r.creado_en, '-5 hours') AS dia, date(r.respondido_en, '-5 hours') AS dia_resp, COUNT(*) AS n
         FROM reclamos r WHERE (?1 IS NULL OR r.establecimiento_id = ?1)
         GROUP BY r.establecimiento_id, r.estado, r.tipo, dia, dia_resp`,
      )
      .bind(alcance),
    db
      .prepare('SELECT id, codigo, nombre FROM establecimientos WHERE (?1 IS NULL OR id = ?1) ORDER BY codigo')
      .bind(alcance),
    sentenciaFeriados(db),
  ]);
  const feriados = aConjuntoFeriados(rFer?.results as { fecha: string }[] | undefined);
  const hoy = fechaLima(ahora);
  const porEstado: Record<Estado, number> = { registrado: 0, en_atencion: 0, respondido: 0 };
  const porTipo: Record<Tipo, number> = { reclamo: 0, queja: 0 };
  const porSemaforo: Record<Semaforo, number> = { verde: 0, ambar: 0, rojo: 0, vencido: 0, cerrado: 0 };
  const porEst = new Map<number, { total: number; pendientes: number }>();
  let enPlazo = 0;
  let fueraPlazo = 0;
  let total = 0;
  for (const g of (rGrupos?.results ?? []) as { est: number; estado: Estado; tipo: Tipo; dia: string; dia_resp: string | null; n: number }[]) {
    total += g.n;
    porEstado[g.estado] += g.n;
    porTipo[g.tipo] += g.n;
    const referencia = g.estado === 'respondido' && g.dia_resp ? g.dia_resp : hoy;
    porSemaforo[calcularPlazoPorDias(g.dia, referencia, g.estado, feriados).semaforo] += g.n;
    if (g.estado === 'respondido' && g.dia_resp) {
      if (g.dia_resp <= diaLimite(g.dia, feriados)) enPlazo += g.n;
      else fueraPlazo += g.n;
    }
    const acum = porEst.get(g.est) ?? { total: 0, pendientes: 0 };
    acum.total += g.n;
    if (g.estado !== 'respondido') acum.pendientes += g.n;
    porEst.set(g.est, acum);
  }
  return {
    total,
    por_estado: porEstado,
    por_tipo: porTipo,
    por_semaforo: porSemaforo,
    por_establecimiento: ((rEst?.results ?? []) as { id: number; codigo: string; nombre: string }[]).map((e) => ({
      codigo: e.codigo,
      nombre: e.nombre,
      total: porEst.get(e.id)?.total ?? 0,
      pendientes: porEst.get(e.id)?.pendientes ?? 0,
    })),
    respondidos_en_plazo: enPlazo,
    respondidos_fuera_de_plazo: fueraPlazo,
  };
}
