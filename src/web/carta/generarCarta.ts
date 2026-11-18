// Carta formal de respuesta, A4, generada en el navegador. Los datos no salen del equipo del usuario.
import { MARCA } from '../../compartido/marca';
import type { DatosCarta } from '../tipos';
import { formatearFechaCartaLima } from '../util/formato';
import {
  COLOR_LINEA, COLOR_MARCA, COLOR_SUAVE, COLOR_TEXTO, descargarBlob, dibujarMembrete, dibujarPie, nuevoDocumento, type Documento,
} from './pdfBase';

export const LEYENDA_FIRMA = 'Documento generado por el sistema. No constituye firma digital certificada.';

const MARGEN = 25; // mm
const ANCHO_PAGINA = 210;
const ALTO_PAGINA = 297;
const ANCHO_UTIL = ANCHO_PAGINA - MARGEN * 2; // 160 mm
const LIMITE_Y = ALTO_PAGINA - MARGEN; // 272 mm
const MM_PT = 0.3528;

export const nombreArchivoCarta = (numero: string) => `carta-${numero}.pdf`;

function membrete(doc: Documento, d: DatosCarta): number {
  // Quien emite y responde es la empresa cliente; JN Reclamaciones figura solo al pie, en pequeño.
  return dibujarMembrete(doc, {
    x: MARGEN,
    y: 16,
    ancho: ANCHO_UTIL,
    emisor: d.empresa.razon_social,
    lineas: [`RUC ${d.empresa.ruc}`, d.empresa.direccion_fiscal],
  });
}

/** Escribe párrafos con ajuste de línea y salto de página. Devuelve la nueva Y. */
function escribirParrafos(doc: Documento, texto: string, y: number, nuevaPagina: () => number, tam = 11): number {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(tam);
  doc.setTextColor(...COLOR_TEXTO);
  const alto = tam * MM_PT * 1.45;
  const parrafos = texto.replace(/\r\n?/g, '\n').split('\n');
  for (const p of parrafos) {
    if (p.trim() === '') {
      y += alto * 0.7;
      continue;
    }
    const lineas = doc.splitTextToSize(p, ANCHO_UTIL) as string[];
    for (const l of lineas) {
      if (y + alto > LIMITE_Y) y = nuevaPagina();
      doc.text(l, MARGEN, y);
      y += alto;
    }
    y += alto * 0.35;
  }
  return y;
}

/** Texto limpio de un dato opcional: cadena vacía si falta. */
const presente = (v: string | null | undefined): string => (typeof v === 'string' ? v.trim() : '');

export async function generarCartaPdf(d: DatosCarta): Promise<{ blob: Blob; nombreArchivo: string; paginas: number }> {
  const doc = await nuevoDocumento('portrait');
  doc.setProperties({ title: `Carta de respuesta - Hoja de Reclamación ${d.numero}`, creator: MARCA.nombre });

  const nuevaPagina = () => {
    doc.addPage();
    return MARGEN + 2;
  };

  let y = membrete(doc, d);

  // Identificación del establecimiento
  doc.setFontSize(9);
  doc.setTextColor(...COLOR_SUAVE);
  doc.setFont('helvetica', 'bold');
  doc.text('Establecimiento:', MARGEN, y);
  doc.setFont('helvetica', 'normal');
  // Solo se escriben los datos que existen: un dato ausente nunca debe aparecer como «undefined» en el documento.
  const ubicacion = [d.establecimiento.direccion, d.establecimiento.ciudad].map(presente).filter(Boolean).join(', ');
  const est = [`${d.establecimiento.nombre} (${d.establecimiento.codigo})`, ubicacion].filter(Boolean).join(' · ');
  const lineasEst = doc.splitTextToSize(est, ANCHO_UTIL - 28) as string[];
  doc.text(lineasEst, MARGEN + 28, y);
  y += lineasEst.length * 4 + 7;

  // Título
  doc.setTextColor(...COLOR_TEXTO);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  const titulo = doc.splitTextToSize(`Carta de respuesta a la Hoja de Reclamación N.° ${d.numero}`, ANCHO_UTIL) as string[];
  doc.text(titulo, MARGEN, y);
  y += titulo.length * 5.6 + 5;

  // Lugar y fecha
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text([presente(d.establecimiento.ciudad), formatearFechaCartaLima(d.fecha_emision)].filter(Boolean).join(', '), MARGEN, y);
  y += 11;

  // Destinatario
  doc.text('Señor(a):', MARGEN, y);
  y += 5.5;
  doc.setFont('helvetica', 'bold');
  doc.text(d.destinatario.nombres, MARGEN, y);
  y += 5.5;
  doc.setFont('helvetica', 'normal');
  if (d.destinatario.domicilio) {
    const dom = doc.splitTextToSize(d.destinatario.domicilio, ANCHO_UTIL) as string[];
    doc.text(dom, MARGEN, y);
    y += dom.length * 5.2;
  }
  y += 5;

  // Asunto
  const tipoTxt = d.tipo === 'queja' ? 'queja' : 'reclamo';
  doc.setFont('helvetica', 'bold');
  doc.text('Asunto:', MARGEN, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`Respuesta a su ${tipoTxt} (Hoja de Reclamación N.° ${d.numero})`, MARGEN + 17.5, y);
  y += 10;

  // Saludo y cuerpo
  doc.text(`Estimado(a) ${d.destinatario.nombres}:`, MARGEN, y);
  y += 8;
  y = escribirParrafos(
    doc,
    `En atención a su ${tipoTxt} registrad${d.tipo === 'queja' ? 'a' : 'o'} en nuestro Libro de Reclamaciones, le comunicamos lo siguiente:`,
    y,
    nuevaPagina,
  );
  y += 3;
  y = escribirParrafos(doc, d.texto, y, nuevaPagina);
  y += 5;
  y = escribirParrafos(doc, 'Sin otro particular, quedamos a su disposición para cualquier consulta adicional.', y, nuevaPagina);
  y += 4;

  // Despedida y firma: se mantienen juntas en la misma página.
  const altoFirma = 56;
  if (y + altoFirma > LIMITE_Y) y = nuevaPagina();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...COLOR_TEXTO);
  doc.text('Atentamente,', MARGEN, y);
  y += 24;
  doc.setDrawColor(...COLOR_LINEA);
  doc.setLineWidth(0.4);
  doc.line(MARGEN, y, MARGEN + 70, y);
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.text(d.responsable.nombre, MARGEN, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.text(d.responsable.cargo, MARGEN, y);
  y += 5;
  doc.text(d.empresa.razon_social, MARGEN, y);
  y += 7;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...COLOR_SUAVE);
  doc.text(LEYENDA_FIRMA, MARGEN, y);

  // Pie con número de hoja y paginación en todas las páginas
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    dibujarPie(doc, { x: MARGEN, ancho: ANCHO_UTIL, yLinea: ALTO_PAGINA - 17, texto: `Hoja de Reclamación N.° ${d.numero}`, pagina: i, total });
  }

  return { blob: doc.output('blob'), nombreArchivo: nombreArchivoCarta(d.numero), paginas: total };
}

export async function descargarCarta(d: DatosCarta): Promise<void> {
  const { blob, nombreArchivo } = await generarCartaPdf(d);
  descargarBlob(blob, nombreArchivo);
}

/** Abre el diálogo de impresión con el PDF; si el navegador no lo permite, lo descarga. */
export async function imprimirCarta(d: DatosCarta): Promise<void> {
  const { blob, nombreArchivo } = await generarCartaPdf(d);
  const url = URL.createObjectURL(blob);
  const marco = document.createElement('iframe');
  marco.setAttribute('aria-hidden', 'true');
  marco.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  marco.src = url;
  marco.onload = () => {
    try {
      marco.contentWindow?.focus();
      marco.contentWindow?.print();
    } catch {
      descargarBlob(blob, nombreArchivo);
    }
    setTimeout(() => {
      marco.remove();
      URL.revokeObjectURL(url);
    }, 60000);
  };
  document.body.appendChild(marco);
}
