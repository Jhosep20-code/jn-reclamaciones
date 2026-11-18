// Plantillas de los correos (HTML con estilos en línea y texto plano). Todo valor que viene del usuario
// o de la base se escapa antes de entrar en el HTML.
// Quien escribe es la empresa cliente (responsable legal); JN Reclamaciones figura solo como plataforma, en el pie.
// HTML sobrio y compatible con clientes de correo: tablas, estilos en línea, sin imágenes ni fuentes web, ancho máximo 600 px.
// El monograma «JN» es texto/HTML (muchos clientes bloquean SVG e imágenes).
import { MARCA, PALETA } from '../../compartido/marca.ts';

export const LEYENDA_INDECOPI =
  'La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante el INDECOPI.';
export const LEYENDA_PLAZO =
  'El proveedor debe dar respuesta al reclamo o queja en un plazo no mayor a quince (15) días hábiles, el cual es improrrogable.';
export const PIE = `${MARCA.pieCorreo}. ${MARCA.pieCorreoAutomatico}`;

const FUENTE = 'Arial,Helvetica,sans-serif';

export function escaparHtml(valor: unknown): string {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface CorreoRedactado {
  asunto: string;
  html: string;
  texto: string;
}

export interface DatosConstancia {
  numero: string;
  creadoEn: string; // ISO UTC
  establecimiento: string;
  tipo: 'reclamo' | 'queja';
  fechaLimite: string; // ISO UTC
  codigoSeguimiento: string;
  urlSeguimiento: string;
  /** Razón social de la empresa que emite el mensaje. Si no se indica, se usa la de la marca (cliente por defecto). */
  empresa?: string;
}

export interface DatosRespuestaCorreo {
  numero: string;
  texto: string;
  responsable: string;
  cargo: string;
  urlSeguimiento: string;
  /** Razón social de la empresa que responde. Si no se indica, se usa la de la marca (cliente por defecto). */
  empresa?: string;
}

// Fecha y hora de Lima (UTC-5) legibles, sin depender de Intl ni de la zona del servidor.
export function fechaHoraLima(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 5 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export function fechaLimaLarga(iso: string): string {
  return fechaHoraLima(iso).slice(0, 10);
}

const nombreTipo = (t: 'reclamo' | 'queja') => (t === 'queja' ? 'Queja' : 'Reclamo');
const emisorDe = (e?: string) => (e && e.trim() ? e.trim() : MARCA.clienteAlternativo);

// La insignia es un PNG servido por la propia aplicación (los clientes de correo no admiten SVG incrustado).
// Si el cliente bloquea las imágenes, se ve el texto alternativo «JN» con estilo serif.
function origenDe(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

// En el encabezado se muestra el nombre sin aclaraciones entre paréntesis; la razón social completa va en el pie.
const nombreCorto = (e: string) => e.replace(/\s*\([^)]*\)\s*$/, '');

function marco(titulo: string, emisor: string, cuerpoHtml: string, origen: string): string {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${escaparHtml(titulo)}</title></head>
<body style="margin:0;padding:0;background:${PALETA.marfil};font-family:${FUENTE};color:${PALETA.navy};">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${PALETA.marfil};"><tr><td align="center" style="padding:20px 12px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid ${PALETA.linea};border-radius:8px;">
<tr><td style="background:${PALETA.navy};padding:18px 24px;border-radius:8px 8px 0 0;">
<table role="presentation" cellspacing="0" cellpadding="0"><tr>
<td valign="middle" style="width:48px;"><img src="${escaparHtml(origen)}/marca/jn-insignia.png" width="48" height="48" alt="JN" style="display:block;border:0;outline:none;font-family:Georgia,'Times New Roman',serif;font-style:italic;font-weight:bold;font-size:20px;line-height:48px;text-align:center;color:${PALETA.marfil};"></td>
<td valign="middle" style="padding-left:14px;">
<div style="font-family:${FUENTE};font-size:17px;font-weight:bold;line-height:1.25;color:${PALETA.marfil};">${escaparHtml(nombreCorto(emisor))}</div>
<div style="font-family:${FUENTE};font-size:11px;line-height:1.5;color:${PALETA.oro};letter-spacing:1.2px;text-transform:uppercase;">Libro de Reclamaciones Virtual</div>
</td></tr></table>
</td></tr>
<tr><td style="height:3px;line-height:3px;font-size:0;background:${PALETA.oro};">&nbsp;</td></tr>
<tr><td style="padding:26px 24px 8px;font-family:${FUENTE};font-size:15px;line-height:1.55;color:${PALETA.navy};">${cuerpoHtml}</td></tr>
<tr><td style="padding:16px 24px 20px;border-top:1px solid ${PALETA.linea};font-family:${FUENTE};font-size:12px;line-height:1.5;color:${PALETA.textoSuave};">
<strong style="color:${PALETA.navy};">${escaparHtml(emisor)}</strong><br>${escaparHtml(MARCA.pieCorreo)}<br>${escaparHtml(MARCA.pieCorreoAutomatico)}
</td></tr>
</table></td></tr></table></body></html>`;
}

function fila(etiqueta: string, valor: string): string {
  return `<tr><td style="padding:6px 14px 6px 0;color:${PALETA.textoSuave};vertical-align:top;font-size:13px;border-bottom:1px solid ${PALETA.linea};">${escaparHtml(etiqueta)}</td><td style="padding:6px 0;font-weight:bold;vertical-align:top;border-bottom:1px solid ${PALETA.linea};">${escaparHtml(valor)}</td></tr>`;
}

function boton(url: string, texto: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:22px 0 10px;"><tr><td style="background:${PALETA.azulProfundo};border-radius:6px;"><a href="${escaparHtml(url)}" style="display:inline-block;padding:12px 22px;font-family:${FUENTE};font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">${escaparHtml(texto)}</a></td></tr></table>
<p style="margin:0 0 14px;font-size:12px;color:${PALETA.textoSuave};">Si el botón no funciona, copie este enlace en su navegador:<br><span style="word-break:break-all;">${escaparHtml(url)}</span></p>`;
}

export function plantillaConstancia(d: DatosConstancia): CorreoRedactado {
  const emisor = emisorDe(d.empresa);
  const asunto = `Constancia de su ${d.tipo === 'queja' ? 'queja' : 'reclamo'} ${d.numero}`;
  const html = marco(
    asunto,
    emisor,
    `<p style="margin:0 0 14px;">${escaparHtml(emisor)} registró su hoja de reclamación en su Libro de Reclamaciones Virtual. Conserve este mensaje como constancia.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:15px;margin:0 0 6px;border-top:1px solid ${PALETA.linea};">
${fila('Número de hoja', d.numero)}
${fila('Registrada el', `${fechaHoraLima(d.creadoEn)} (hora de Lima)`)}
${fila('Establecimiento', d.establecimiento)}
${fila('Tipo', nombreTipo(d.tipo))}
${fila('Fecha límite de respuesta', fechaLimaLarga(d.fechaLimite))}
${fila('Código de seguimiento', d.codigoSeguimiento)}
</table>
<p style="margin:12px 0 0;font-size:13px;color:${PALETA.textoSuave};">Con el código de seguimiento puede consultar el estado de su hoja, sin necesidad de crear una cuenta.</p>
${boton(d.urlSeguimiento, 'Ver el seguimiento de mi hoja')}
<p style="margin:12px 0 6px;font-size:13px;color:${PALETA.textoSuave};">${escaparHtml(LEYENDA_INDECOPI)}</p>
<p style="margin:0 0 14px;font-size:13px;color:${PALETA.textoSuave};">${escaparHtml(LEYENDA_PLAZO)}</p>`,
    origenDe(d.urlSeguimiento),
  );
  const texto = [
    emisor,
    'Libro de Reclamaciones Virtual',
    '',
    `${emisor} registró su hoja de reclamación en su Libro de Reclamaciones Virtual. Conserve este mensaje como constancia.`,
    '',
    `Número de hoja: ${d.numero}`,
    `Registrada el: ${fechaHoraLima(d.creadoEn)} (hora de Lima)`,
    `Establecimiento: ${d.establecimiento}`,
    `Tipo: ${nombreTipo(d.tipo)}`,
    `Fecha límite de respuesta: ${fechaLimaLarga(d.fechaLimite)}`,
    `Código de seguimiento: ${d.codigoSeguimiento}`,
    `Seguimiento: ${d.urlSeguimiento}`,
    '',
    LEYENDA_INDECOPI,
    LEYENDA_PLAZO,
    '',
    PIE,
  ].join('\n');
  return { asunto, html, texto };
}

export function plantillaRespuesta(d: DatosRespuestaCorreo): CorreoRedactado {
  const emisor = emisorDe(d.empresa);
  const asunto = `Respuesta a su hoja de reclamación ${d.numero}`;
  // El texto de la respuesta conserva sus saltos de línea, ya escapado.
  const cuerpoRespuesta = escaparHtml(d.texto).replace(/\r?\n/g, '<br>');
  const html = marco(
    asunto,
    emisor,
    `<p style="margin:0 0 14px;">${escaparHtml(emisor)} respondió a su hoja de reclamación <strong>${escaparHtml(d.numero)}</strong>:</p>
<div style="margin:0 0 16px;padding:14px 16px;background:${PALETA.marfil};border-left:3px solid ${PALETA.oro};font-size:15px;line-height:1.6;">${cuerpoRespuesta}</div>
<p style="margin:0 0 6px;">Responsable: <strong>${escaparHtml(d.responsable)}</strong>, ${escaparHtml(d.cargo)}.</p>
<p style="margin:0;font-size:13px;color:${PALETA.textoSuave};">Si necesita la carta de respuesta en PDF, puede descargarla desde el seguimiento de su hoja con su número de documento.</p>
${boton(d.urlSeguimiento, 'Ver el seguimiento de mi hoja')}`,
    origenDe(d.urlSeguimiento),
  );
  const texto = [
    emisor,
    'Libro de Reclamaciones Virtual',
    '',
    `${emisor} respondió a su hoja de reclamación ${d.numero}:`,
    '',
    d.texto,
    '',
    `Responsable: ${d.responsable}, ${d.cargo}.`,
    `Seguimiento: ${d.urlSeguimiento}`,
    '',
    PIE,
  ].join('\n');
  return { asunto, html, texto };
}
