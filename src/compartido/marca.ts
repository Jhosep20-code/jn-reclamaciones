// Marca y textos de marca. Única fuente para la interfaz web, los PDF y las plantillas de correo.
// No importa nada: la usan por igual el navegador y el Worker.
//
// Identidades (no se mezclan):
//  - JN Reclamaciones: nombre comercial del software.
//  - JN Soluciones Digitales: empresa desarrolladora (ficticia); aparece solo de forma discreta.
//  - La empresa cliente (responsable legal de hojas y respuestas) sale siempre de la API /api/publico/empresa.

export const MARCA = {
  nombre: 'JN Reclamaciones',
  descripcion: 'Libro de Reclamaciones Virtual y plataforma de gestión de atención al consumidor',
  desarrolladora: 'JN Soluciones Digitales',
  /** Línea discreta de pie de página. */
  plataforma: 'JN Reclamaciones · JN Soluciones Digitales',
  /** Pie discreto de documentos (PDF, constancia impresa). */
  pieDocumento: 'Generado con JN Reclamaciones · Entorno de demostración',
  /** Pie de los correos. */
  pieCorreo: 'Mensaje enviado mediante JN Reclamaciones · Entorno de demostración',
  pieCorreoAutomatico: 'Este mensaje es automático; no responda a este correo.',
  /** Texto de «gestionado con…» del portal público. */
  gestionadoCon: 'Gestionado con JN Reclamaciones',
  /** Apoyo para correos cuando el llamador no indica la razón social del cliente (ver plantillas de correo). */
  clienteAlternativo: 'Comercial del Centro S.A.C.',
  sufijoTitulo: 'JN Reclamaciones',
  /** Aviso discreto del portal público: el caso empresarial es simulado. */
  avisoDemo: 'Prototipo académico — entorno de demostración',
} as const;

/** Título del documento HTML: «Página · JN Reclamaciones». */
export const tituloPagina = (pagina: string): string => `${pagina} · ${MARCA.sufijoTitulo}`;

/**
 * Paleta de la marca para destinos que no pueden usar variables CSS (PDF y correo).
 * Es un espejo de los tokens de src/web/estilos.css; pruebas/marca.test.mjs comprueba que coinciden.
 */
export const PALETA = {
  navy: '#0B1220',
  azulProfundo: '#183153',
  oro: '#C5A059',
  marfil: '#F8F7F4',
  plata: '#D1D5DB',
  exito: '#166534',
  advertencia: '#D97706',
  error: '#B91C1C',
  informacion: '#2563EB',
  // Derivados para papel y correo (siempre sobre fondo claro).
  textoSuave: '#4B5563',
  linea: '#E3E0D8',
  oroTexto: '#7A5A18',
  azulTenue: '#EEF2F8',
} as const;

/** «#RRGGBB» a [r, g, b]. */
export const rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];
