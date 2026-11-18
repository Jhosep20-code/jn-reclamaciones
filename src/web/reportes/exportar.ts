// Exportaciones del reporte: Excel (CSV UTF-8 con BOM, separador «;») y PDF (jsPDF, cargado a demanda).
// Ninguna exportación contiene datos personales: solo número de hoja, tipo, estado, tienda y fechas.
import { COLOR_LINEA, COLOR_MARCA, COLOR_SUAVE, COLOR_TEXTO, descargarBlob, dibujarMembrete, dibujarPie, dibujarTabla, nuevoDocumento } from '../carta/pdfBase';
import { MARCA } from '../../compartido/marca';
import type { Empresa, Indicadores, Reporte } from '../tipos';
import {
  ETIQUETA_ESTADO, ETIQUETA_SEMAFORO, ETIQUETA_TIPO, formatearFecha, formatearFechaHoraCorta, formatearFechaSimple,
} from '../util/formato';

export const nombreBase = (r: Reporte) => `reporte-reclamos-${r.filtros.desde}_${r.filtros.hasta}`;

/** Un valor numérico con coma decimal (Excel en español). */
const num = (n: number | null, decimales = 1) => (n == null ? '' : Number.isInteger(n) ? String(n) : n.toFixed(decimales).replace('.', ','));

/**
 * Protege contra inyección de fórmulas: si una celda de texto empieza por = + - @ (o tabulación / retorno),
 * se antepone una comilla simple. Luego se entrecomilla si hace falta.
 */
export function celdaCsv(valor: string | number | null | undefined): string {
  if (valor == null) return '';
  let t = typeof valor === 'number' ? num(valor) : String(valor);
  if (typeof valor === 'string' && /^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  if (/[;"\n\r]/.test(t)) t = `"${t.replace(/"/g, '""')}"`;
  return t;
}

const fila = (celdas: (string | number | null | undefined)[]) => celdas.map(celdaCsv).join(';');

function cuerpoIndicadores(i: Indicadores): (string | number | null)[] {
  return [i.total, i.respondidos, i.pendientes, i.vencidos, i.cumplimiento_pct == null ? '' : `${num(i.cumplimiento_pct)} %`, i.promedio_dias_habiles_respuesta == null ? '' : num(i.promedio_dias_habiles_respuesta)];
}
const CABECERA_INDICADORES = ['Total', 'Respondidos', 'Pendientes', 'Vencidos', 'Cumplimiento del plazo', 'Promedio de respuesta (días hábiles)'];

export function filtrosComoTexto(r: Reporte): string[] {
  const f = r.filtros;
  const tienda = f.establecimiento ? (r.por_establecimiento.find((e) => e.codigo === f.establecimiento)?.nombre ?? f.establecimiento) : 'Todas';
  return [
    `Periodo: ${formatearFechaSimple(f.desde)} al ${formatearFechaSimple(f.hasta)}`,
    `Tienda: ${tienda}`,
    `Tipo: ${f.tipo ? ETIQUETA_TIPO[f.tipo] : 'Todos'}`,
    `Estado: ${f.estado ? ETIQUETA_ESTADO[f.estado] : 'Todos'}`,
  ];
}

export function construirCsv(r: Reporte): string {
  const l: string[] = [];
  l.push(fila(['Reporte de reclamaciones - ' + MARCA.nombre]));
  l.push(fila(['Generado', formatearFechaHoraCorta(r.generado_en) + ' (hora de Lima)']));
  for (const t of filtrosComoTexto(r)) {
    const [k, ...v] = t.split(': ');
    l.push(fila([k, v.join(': ')]));
  }
  l.push('');
  l.push(fila(['Indicadores']));
  l.push(fila(CABECERA_INDICADORES));
  l.push(fila(cuerpoIndicadores(r.resumen)));
  l.push('');
  l.push(fila(['Comparación entre establecimientos']));
  l.push(fila(['Código', 'Establecimiento', ...CABECERA_INDICADORES]));
  for (const e of r.por_establecimiento) l.push(fila([e.codigo, e.nombre, ...cuerpoIndicadores(e)]));
  l.push('');
  l.push(fila(['Casos' + (r.truncado ? ' (se muestran los 500 más recientes)' : '')]));
  l.push(fila(['Número de hoja', 'Tipo', 'Estado', 'Establecimiento', 'Registrado', 'Respondido', 'Días hábiles', 'Plazo']));
  for (const c of r.casos) {
    l.push(fila([
      c.numero, ETIQUETA_TIPO[c.tipo], ETIQUETA_ESTADO[c.estado], c.establecimiento_codigo,
      formatearFechaHoraCorta(c.creado_en), c.respondido_en ? formatearFechaHoraCorta(c.respondido_en) : '',
      c.dias_habiles, ETIQUETA_SEMAFORO[c.semaforo],
    ]));
  }
  return l.join('\r\n') + '\r\n';
}

export function exportarCsv(r: Reporte): void {
  const blob = new Blob(['﻿', construirCsv(r)], { type: 'text/csv;charset=utf-8' });
  descargarBlob(blob, `${nombreBase(r)}.csv`);
}

export async function construirPdf(r: Reporte, empresa: Empresa | null): Promise<Blob> {
  const doc = await nuevoDocumento('portrait');
  doc.setProperties({ title: `Reporte de reclamaciones ${r.filtros.desde} a ${r.filtros.hasta}`, creator: MARCA.nombre });
  const M = 15;
  const ANCHO = 180;
  const LIMITE = 282;
  const nuevaPagina = () => {
    doc.addPage();
    return 20;
  };

  // Membrete: el reporte lo emite la empresa; si no se pudo leer, se muestra solo el nombre del libro.
  let y = dibujarMembrete(doc, {
    x: M,
    y: 12,
    ancho: ANCHO,
    emisor: empresa ? empresa.razon_social : 'Libro de Reclamaciones Virtual',
    lineas: empresa ? [`RUC ${empresa.ruc}`, empresa.direccion_fiscal] : [],
  });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...COLOR_MARCA);
  doc.text('Reporte de reclamaciones', M, y + 1);
  y += 9;

  doc.setTextColor(...COLOR_TEXTO);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Filtros aplicados', M, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  y += 5;
  for (const t of filtrosComoTexto(r)) {
    doc.text(t, M, y);
    y += 4.8;
  }
  doc.text(`Generado el ${formatearFechaHoraCorta(r.generado_en)} (hora de Lima)`, M, y);
  y += 9;

  // Indicadores
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Indicadores', M, y);
  y += 3;
  const i = r.resumen;
  const tarjetas: [string, string][] = [
    ['Total de hojas', String(i.total)],
    ['Respondidos', String(i.respondidos)],
    ['Pendientes', String(i.pendientes)],
    ['Vencidos', String(i.vencidos)],
    ['Cumplimiento del plazo', i.cumplimiento_pct == null ? 'Sin datos' : `${num(i.cumplimiento_pct)} %`],
    ['Respuesta promedio', i.promedio_dias_habiles_respuesta == null ? 'Sin datos' : `${num(i.promedio_dias_habiles_respuesta)} días háb.`],
  ];
  const w = (ANCHO - 8) / 3;
  tarjetas.forEach(([t, v], k) => {
    const cx = M + (k % 3) * (w + 4);
    const cy = y + Math.floor(k / 3) * 19;
    doc.setDrawColor(...COLOR_LINEA);
    doc.setLineWidth(0.25);
    doc.roundedRect(cx, cy, w, 16, 1.5, 1.5, 'S');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...COLOR_SUAVE);
    doc.text(t, cx + 3, cy + 5.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...COLOR_MARCA);
    doc.text(v, cx + 3, cy + 12.5);
  });
  y += 19 * 2 + 4;

  // Comparación
  doc.setTextColor(...COLOR_TEXTO);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Comparación entre establecimientos', M, y);
  y += 2;
  if (r.por_establecimiento.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Sin datos para el periodo.', M, y + 5);
    y += 10;
  } else {
    y = dibujarTabla(doc, {
      x: M, y: y + 1, limiteY: LIMITE, nuevaPagina,
      columnas: [
        { titulo: 'Establecimiento', ancho: 52 },
        { titulo: 'Total', ancho: 16, alinear: 'right' },
        { titulo: 'Resp.', ancho: 16, alinear: 'right' },
        { titulo: 'Pend.', ancho: 16, alinear: 'right' },
        { titulo: 'Venc.', ancho: 16, alinear: 'right' },
        { titulo: 'Cumpl. %', ancho: 22, alinear: 'right' },
        { titulo: 'Prom. días háb.', ancho: 42, alinear: 'right' },
      ],
      filas: r.por_establecimiento.map((e) => [
        `${e.nombre} (${e.codigo})`, String(e.total), String(e.respondidos), String(e.pendientes), String(e.vencidos),
        e.cumplimiento_pct == null ? '-' : num(e.cumplimiento_pct), e.promedio_dias_habiles_respuesta == null ? '-' : num(e.promedio_dias_habiles_respuesta),
      ]),
    });
    y += 8;
  }

  // Casos
  if (y > LIMITE - 30) y = nuevaPagina();
  doc.setTextColor(...COLOR_TEXTO);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`Casos del periodo${r.truncado ? ' (se muestran los 500 más recientes)' : ''}`, M, y);
  y += 3;
  if (r.casos.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('No hay casos con estos filtros.', M, y + 4);
  } else {
    dibujarTabla(doc, {
      x: M, y, limiteY: LIMITE, nuevaPagina,
      columnas: [
        { titulo: 'Número de hoja', ancho: 38 },
        { titulo: 'Tipo', ancho: 16 },
        { titulo: 'Estado', ancho: 24 },
        { titulo: 'Tienda', ancho: 18 },
        { titulo: 'Registrado', ancho: 22 },
        { titulo: 'Respondido', ancho: 22 },
        { titulo: 'Días háb.', ancho: 18, alinear: 'right' },
        { titulo: 'Plazo', ancho: 22 },
      ],
      filas: r.casos.map((c) => [
        c.numero, ETIQUETA_TIPO[c.tipo], ETIQUETA_ESTADO[c.estado], c.establecimiento_codigo,
        formatearFecha(c.creado_en), c.respondido_en ? formatearFecha(c.respondido_en) : '-', String(c.dias_habiles), ETIQUETA_SEMAFORO[c.semaforo],
      ]),
    });
  }

  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    dibujarPie(doc, { x: M, ancho: ANCHO, yLinea: 285, texto: 'Reporte sin datos personales', pagina: p, total });
  }
  return doc.output('blob');
}

export async function exportarPdf(r: Reporte, empresa: Empresa | null): Promise<void> {
  descargarBlob(await construirPdf(r, empresa), `${nombreBase(r)}.pdf`);
}
