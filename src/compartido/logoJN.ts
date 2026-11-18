// Logotipo de JN Reclamaciones: datos vectoriales compartidos por la interfaz, los PDF y los scripts.
// GENERADO a partir del diseño aprobado por el titular (monograma serif itálico, hoja dorada con doblez y check).
// Las letras son trazados: no dependen de ninguna fuente instalada. Origen de las formas del monograma:
// Libre Bodoni Bold Italic (SIL Open Font License 1.1), convertida a contornos. Malla de 64 × 64 unidades.

export type Cmd = ['M' | 'L', number, number] | ['C', number, number, number, number, number, number] | ['Z'];

export const LOGO_MALLA = 64;
export const LOGO_GROSOR = 1.8;

/** Contorno parcial de la hoja, doblez y check (trazos dorados, extremos redondeados). */
export const LOGO_ORO: Cmd[][] = [[["M",6,24.5],["L",6,10.5],["C",6,8.01,8.01,6,10.5,6],["L",45.5,6],["L",58,18.5]],[["M",45.5,6],["L",45.5,15.5],["C",45.5,17.16,46.84,18.5,48.5,18.5],["L",58,18.5]],[["M",6,55],["C",6.5,57,8.3,58.5,10.5,58.5],["L",37,58.5]],[["M",40.5,52],["L",46.5,58.5],["L",60.5,43.5]]];

/** Monograma JN: un contorno cerrado por cada elemento de la lista (relleno). */
export const LOGO_LETRAS: Cmd[][] = [[["M",12.21,52.54],["L",12.21,52.54],["C",11.12,52.54,10.19,52.34,9.42,51.92],["C",8.65,51.51,8.06,50.98,7.65,50.34],["C",7.24,49.69,7.03,49.02,7.03,48.31],["L",7.03,48.31],["C",7.03,47.53,7.27,46.81,7.76,46.14],["C",8.25,45.47,8.94,45.13,9.84,45.13],["L",9.84,45.13],["C",10.52,45.13,11.12,45.36,11.65,45.81],["C",12.17,46.26,12.43,46.91,12.43,47.76],["L",12.43,47.76],["C",12.43,48.27,12.35,48.7,12.17,49.04],["C",12,49.38,11.83,49.67,11.66,49.9],["C",11.49,50.13,11.41,50.35,11.41,50.57],["L",11.41,50.57],["C",11.41,51.01,11.72,51.23,12.36,51.23],["L",12.36,51.23],["C",12.63,51.23,12.87,51.17,13.09,51.07],["C",13.31,50.96,13.51,50.75,13.71,50.44],["C",13.9,50.14,14.1,49.71,14.29,49.15],["C",14.49,48.59,14.68,47.86,14.88,46.96],["L",14.88,46.96],["L",20.39,21.77],["L",16.63,21.77],["L",16.63,20.68],["L",28.64,20.68],["L",28.64,21.77],["L",25.94,21.77],["L",21.52,43.02],["C",21.06,45.3,20.32,47.15,19.31,48.55],["C",18.3,49.95,17.17,50.96,15.92,51.59],["C",14.66,52.23,13.43,52.54,12.21,52.54]],[["M",48.66,48.67],["L",47.53,48.67],["L",36.58,24.95],["L",36.44,24.95],["L",36.47,24.66],["L",31.62,47.11],["L",35.38,47.11],["L",35.38,48.2],["L",26.73,48.2],["L",26.73,47.11],["L",30.16,47.11],["L",35.63,21.77],["L",31.91,21.77],["L",31.91,20.68],["L",41.29,20.68],["L",49.72,38.45],["L",49.83,38.45],["L",53.08,21.77],["L",49.61,21.77],["L",49.61,20.68],["L",57.57,20.68],["L",57.57,21.77],["L",54.5,21.77],["L",48.66,48.67]]];

export const aTrazado = (cs: Cmd[]): string => cs.map((c) => c[0] + c.slice(1).join(' ')).join('');
export const LOGO_ORO_D: string[] = LOGO_ORO.map(aTrazado);
export const LOGO_LETRAS_D: string = LOGO_LETRAS.map(aTrazado).join('');
