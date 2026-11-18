// Reportes (sin datos personales). Los conteos se agrupan en SQL (por tienda, estado y día de Lima) y los plazos se
// calculan en JS sobre esos grupos con un calendario hábil precalculado: el costo no crece con la cantidad de hojas.
import { crearCalendarioHabil, fechaLima, semaforoPara, sumarDias } from '../dominio/plazos';
import type { Estado, Semaforo, Tipo } from '../tipos';
import type { Alcance } from './reclamos';
import { aConjuntoFeriados, numeroHoja, sentenciaFeriados } from './comunes';

export const MAX_CASOS_REPORTE = 500;
export const MAX_DIAS_REPORTE = 366;

export interface FiltrosReporte {
  desde: string;
  hasta: string;
  establecimiento: string | null;
  estado: Estado | null;
  tipo: Tipo | null;
}

export interface Indicadores {
  total: number;
  respondidos: number;
  pendientes: number;
  vencidos: number;
  respondidos_en_plazo: number;
  respondidos_fuera_de_plazo: number;
  cumplimiento_pct: number | null;
  promedio_dias_habiles_respuesta: number | null;
}

interface Acumulador {
  total: number;
  respondidos: number;
  pendientes: number;
  vencidos: number;
  enPlazo: number;
  fuera: number;
  sumaDias: number;
}

const nuevo = (): Acumulador => ({ total: 0, respondidos: 0, pendientes: 0, vencidos: 0, enPlazo: 0, fuera: 0, sumaDias: 0 });
const redondear1 = (x: number) => Math.round(x * 10) / 10;

function indicadores(a: Acumulador): Indicadores {
  return {
    total: a.total,
    respondidos: a.respondidos,
    pendientes: a.pendientes,
    vencidos: a.vencidos,
    respondidos_en_plazo: a.enPlazo,
    respondidos_fuera_de_plazo: a.fuera,
    cumplimiento_pct: a.respondidos ? redondear1((a.enPlazo / a.respondidos) * 100) : null,
    promedio_dias_habiles_respuesta: a.respondidos ? redondear1(a.sumaDias / a.respondidos) : null,
  };
}

// Rango de registro en hora de Lima [desde 00:00, hasta+1 00:00) expresado en ISO UTC.
export function rangoUtc(desde: string, hasta: string): { inicio: string; fin: string } {
  return { inicio: `${desde}T05:00:00.000Z`, fin: `${sumarDias(hasta, 1)}T05:00:00.000Z` };
}

export async function construirReporte(db: D1Database, alcance: Alcance, f: FiltrosReporte, ahora: Date) {
  const { inicio, fin } = rangoUtc(f.desde, f.hasta);
  const donde = `r.creado_en >= ?1 AND r.creado_en < ?2 AND (?3 IS NULL OR r.establecimiento_id = ?3)
    AND (?4 IS NULL OR e.codigo = ?4) AND (?5 IS NULL OR r.estado = ?5) AND (?6 IS NULL OR r.tipo = ?6)`;
  const enlaces = [inicio, fin, alcance, f.establecimiento, f.estado, f.tipo] as const;
  const [rGrupos, rCasos, rEst, rFer] = await db.batch([
    db
      .prepare(
        `SELECT r.establecimiento_id AS est, r.estado, date(r.creado_en, '-5 hours') AS dia,
                date(r.respondido_en, '-5 hours') AS dia_resp, COUNT(*) AS n
         FROM reclamos r JOIN establecimientos e ON e.id = r.establecimiento_id
         WHERE ${donde} GROUP BY r.establecimiento_id, r.estado, dia, dia_resp`,
      )
      .bind(...enlaces),
    db
      .prepare(
        `SELECT r.anio, r.correlativo, r.tipo, r.estado, r.creado_en, r.respondido_en, e.codigo
         FROM reclamos r JOIN establecimientos e ON e.id = r.establecimiento_id
         WHERE ${donde} ORDER BY r.creado_en DESC, r.id DESC LIMIT ${MAX_CASOS_REPORTE + 1}`,
      )
      .bind(...enlaces),
    db
      .prepare(
        `SELECT e.id, e.codigo, e.nombre FROM establecimientos e
         WHERE (?1 IS NULL OR e.id = ?1) AND (?2 IS NULL OR e.codigo = ?2) ORDER BY e.codigo`,
      )
      .bind(alcance, f.establecimiento),
    sentenciaFeriados(db),
  ]);
  const feriados = aConjuntoFeriados(rFer?.results as { fecha: string }[] | undefined);
  const hoy = fechaLima(ahora);
  const calendario = crearCalendarioHabil(f.desde, hoy > f.hasta ? hoy : f.hasta, feriados);

  const global = nuevo();
  const porEst = new Map<number, Acumulador>();
  for (const g of (rGrupos?.results ?? []) as { est: number; estado: Estado; dia: string; dia_resp: string | null; n: number }[]) {
    const acum = porEst.get(g.est) ?? nuevo();
    porEst.set(g.est, acum);
    for (const a of [global, acum]) {
      a.total += g.n;
      if (g.estado === 'respondido' && g.dia_resp) {
        a.respondidos += g.n;
        const dias = calendario.diasHabilesEntre(g.dia, g.dia_resp);
        a.sumaDias += dias * g.n;
        if (g.dia_resp <= calendario.diaLimite(g.dia)) a.enPlazo += g.n;
        else a.fuera += g.n;
      } else {
        a.pendientes += g.n;
        if (semaforoPara(calendario.diasHabilesEntre(g.dia, hoy), g.estado) === 'vencido') a.vencidos += g.n;
      }
    }
  }

  const filasCasos = (rCasos?.results ?? []) as {
    anio: number; correlativo: number; tipo: Tipo; estado: Estado; creado_en: string; respondido_en: string | null; codigo: string;
  }[];
  const casos = filasCasos.slice(0, MAX_CASOS_REPORTE).map((c) => {
    const respondido = c.estado === 'respondido' && c.respondido_en !== null;
    const dias = calendario.diasHabilesEntre(fechaLima(c.creado_en), respondido ? fechaLima(c.respondido_en as string) : hoy);
    const semaforo: Semaforo = semaforoPara(dias, c.estado);
    return {
      numero: numeroHoja(c.codigo, c.anio, c.correlativo),
      tipo: c.tipo,
      estado: c.estado,
      establecimiento_codigo: c.codigo,
      creado_en: c.creado_en,
      respondido_en: c.respondido_en,
      dias_habiles: dias,
      semaforo,
    };
  });

  return {
    filtros: f,
    resumen: indicadores(global),
    por_establecimiento: ((rEst?.results ?? []) as { id: number; codigo: string; nombre: string }[]).map((e) => ({
      codigo: e.codigo,
      nombre: e.nombre,
      ...indicadores(porEst.get(e.id) ?? nuevo()),
    })),
    casos,
    truncado: filasCasos.length > MAX_CASOS_REPORTE,
    generado_en: ahora.toISOString(),
  };
}
