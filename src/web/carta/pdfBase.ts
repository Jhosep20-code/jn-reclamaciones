// Utilidades comunes para generar PDF en el navegador con jsPDF (cero consumo cloud).
// jsPDF se carga con import() dinámico: no forma parte del paquete inicial.
// Los PDF son siempre claros (papel blanco), sea cual sea el tema de la pantalla. Se usa Helvetica (sin incrustar fuentes).
import type { jsPDF } from 'jspdf';
import { LOGO_GROSOR, LOGO_LETRAS, LOGO_MALLA, LOGO_ORO, type Cmd } from '../../compartido/logoJN';
import { MARCA, PALETA, rgb } from '../../compartido/marca';

export type Documento = jsPDF;
type Color = [number, number, number];

export const COLOR_MARCA: Color = rgb(PALETA.navy); // texto y filetes principales
export const COLOR_AZUL: Color = rgb(PALETA.azulProfundo);
export const COLOR_ORO: Color = rgb(PALETA.oro);
export const COLOR_TEXTO: Color = rgb(PALETA.navy);
export const COLOR_SUAVE: Color = rgb(PALETA.textoSuave);
export const COLOR_LINEA: Color = rgb(PALETA.plata);
export const COLOR_TENUE: Color = rgb(PALETA.azulTenue);

export async function nuevoDocumento(orientacion: 'portrait' | 'landscape' = 'portrait'): Promise<Documento> {
  const { jsPDF: JsPDF } = await import('jspdf');
  const doc = new JsPDF({ unit: 'mm', format: 'a4', orientation: orientacion, compress: true });
  doc.setFont('helvetica', 'normal');
  return doc;
}

/**
 * Isotipo de JN Reclamaciones (las mismas formas de src/compartido/logoJN.ts, malla de 64 unidades) dibujado con
 * primitivas vectoriales: contorno dorado de la hoja con doblez y check, y monograma JN serif en azul noche.
 */
export function dibujarIsotipo(doc: Documento, x: number, y: number, tam: number): void {
  const s = tam / LOGO_MALLA;
  // Convierte un contorno en coordenadas absolutas a los segmentos relativos que espera jsPDF.
  const trazar = (cs: Cmd[], estilo: 'S' | 'F') => {
    let px = 0;
    let py = 0;
    let ix = 0;
    let iy = 0;
    const segs: number[][] = [];
    let cerrado = false;
    for (const c of cs) {
      if (c[0] === 'M') {
        ix = px = c[1];
        iy = py = c[2];
      } else if (c[0] === 'L') {
        segs.push([(c[1] - px) * s, (c[2] - py) * s]);
        px = c[1];
        py = c[2];
      } else if (c[0] === 'C') {
        segs.push([(c[1] - px) * s, (c[2] - py) * s, (c[3] - px) * s, (c[4] - py) * s, (c[5] - px) * s, (c[6] - py) * s]);
        px = c[5];
        py = c[6];
      } else cerrado = true;
    }
    doc.lines(segs, x + ix * s, y + iy * s, [1, 1], estilo, cerrado);
  };
  doc.setDrawColor(...COLOR_ORO);
  doc.setLineWidth((LOGO_GROSOR + 0.3) * s);
  doc.setLineJoin('round');
  doc.setLineCap('round');
  for (const cs of LOGO_ORO) trazar(cs, 'S');
  doc.setFillColor(...COLOR_MARCA);
  for (const cs of LOGO_LETRAS) trazar(cs, 'F');
  doc.setLineJoin('miter');
  doc.setLineCap('butt');
}

/**
 * Membrete con la empresa que emite el documento (la responsable legal), el isotipo, un filete azul noche
 * y un detalle dorado fino. Devuelve la coordenada Y donde puede continuar el contenido.
 */
export function dibujarMembrete(doc: Documento, o: { x: number; y: number; ancho: number; emisor: string; lineas: string[] }): number {
  dibujarIsotipo(doc, o.x, o.y, 14);
  doc.setTextColor(...COLOR_MARCA);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(o.emisor, o.x + 18, o.y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLOR_SUAVE);
  o.lineas.forEach((l, i) => doc.text(l, o.x + 18, o.y + 10.8 + i * 4));
  const yFilete = o.y + 19.5;
  doc.setDrawColor(...COLOR_MARCA);
  doc.setLineWidth(0.5);
  doc.line(o.x, yFilete, o.x + o.ancho, yFilete);
  doc.setDrawColor(...COLOR_ORO);
  doc.setLineWidth(0.9);
  doc.line(o.x, yFilete + 0.9, o.x + 30, yFilete + 0.9);
  doc.setTextColor(...COLOR_TEXTO);
  return yFilete + 8;
}

/** Pie de página: filete, texto a la izquierda, paginación a la derecha y la plataforma, discreta. */
export function dibujarPie(
  doc: Documento,
  o: { x: number; ancho: number; yLinea: number; texto: string; pagina: number; total: number },
): void {
  doc.setDrawColor(...COLOR_LINEA);
  doc.setLineWidth(0.2);
  doc.line(o.x, o.yLinea, o.x + o.ancho, o.yLinea);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLOR_SUAVE);
  doc.text(o.texto, o.x, o.yLinea + 5);
  doc.text(`Página ${o.pagina} de ${o.total}`, o.x + o.ancho, o.yLinea + 5, { align: 'right' });
  doc.setFontSize(7);
  doc.text(MARCA.pieDocumento, o.x, o.yLinea + 9);
}

export interface Columna {
  titulo: string;
  ancho: number;
  alinear?: 'left' | 'right' | 'center';
}

/**
 * Dibuja una tabla con encabezado repetido y salto de página.
 * `nuevaPagina` debe añadir la página y devolver la coordenada Y donde continúa la tabla.
 */
export function dibujarTabla(
  doc: Documento,
  o: { x: number; y: number; columnas: Columna[]; filas: string[][]; limiteY: number; nuevaPagina: () => number; tamano?: number },
): number {
  const tam = o.tamano ?? 8;
  const interlinea = tam * 0.3528 * 1.25;
  const relleno = 1.4;
  const anchoTotal = o.columnas.reduce((a, c) => a + c.ancho, 0);
  let y = o.y;

  const escribirCelda = (texto: string, cx: number, cy: number, c: Columna) => {
    const lineas = doc.splitTextToSize(texto, c.ancho - relleno * 2) as string[];
    const base = cy + tam * 0.3528 * 0.85;
    lineas.forEach((l, i) => {
      const ty = base + i * interlinea;
      if (c.alinear === 'right') doc.text(l, cx + c.ancho - relleno, ty, { align: 'right' });
      else if (c.alinear === 'center') doc.text(l, cx + c.ancho / 2, ty, { align: 'center' });
      else doc.text(l, cx + relleno, ty);
    });
  };

  const cabecera = () => {
    const alto = interlinea + relleno * 2;
    doc.setFillColor(...COLOR_TENUE);
    doc.rect(o.x, y, anchoTotal, alto, 'F');
    doc.setDrawColor(...COLOR_MARCA);
    doc.setLineWidth(0.3);
    doc.line(o.x, y + alto, o.x + anchoTotal, y + alto);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(tam);
    doc.setTextColor(...COLOR_AZUL);
    let cx = o.x;
    for (const c of o.columnas) {
      escribirCelda(c.titulo, cx, y + relleno, c);
      cx += c.ancho;
    }
    y += alto;
    doc.setTextColor(...COLOR_TEXTO);
    doc.setFont('helvetica', 'normal');
  };

  doc.setFontSize(tam);
  cabecera();
  for (const fila of o.filas) {
    doc.setFontSize(tam);
    const lineasMax = Math.max(
      ...fila.map((t, i) => (doc.splitTextToSize(t, (o.columnas[i]?.ancho ?? 20) - relleno * 2) as string[]).length),
    );
    const alto = lineasMax * interlinea + relleno * 2;
    if (y + alto > o.limiteY) {
      y = o.nuevaPagina();
      cabecera();
    }
    let cx = o.x;
    fila.forEach((t, i) => {
      const col = o.columnas[i];
      if (!col) return;
      escribirCelda(t, cx, y + relleno, col);
      cx += col.ancho;
    });
    y += alto;
    doc.setDrawColor(...rgb(PALETA.linea));
    doc.setLineWidth(0.15);
    doc.line(o.x, y, o.x + anchoTotal, y);
  }
  return y;
}

/** Entrega un Blob al usuario como descarga. */
export function descargarBlob(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
