import type { ReactNode } from 'react';

// Iconografía lineal en SVG en línea (sin librería). Todos usan currentColor y son decorativos (aria-hidden).
const BASE = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function Icono({ children, tam = 20 }: { children: ReactNode; tam?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={tam} height={tam} aria-hidden="true" focusable="false" className="icono" {...BASE}>
      {children}
    </svg>
  );
}

type P = { tam?: number };
export const IcoResumen = (p: P) => <Icono {...p}><rect x="3.5" y="3.5" width="7" height="8" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="5" rx="1.5" /><rect x="13.5" y="11.5" width="7" height="9" rx="1.5" /><rect x="3.5" y="14.5" width="7" height="6" rx="1.5" /></Icono>;
export const IcoCasos = (p: P) => <Icono {...p}><path d="M4 13.5V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7.5" /><path d="M4 13.5h4.5l1 2.5h5l1-2.5H20V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /></Icono>;
export const IcoReportes = (p: P) => <Icono {...p}><path d="M4 20V4" /><path d="M4 20h16" /><path d="M8 16v-4" /><path d="M12.5 16V8" /><path d="M17 16v-6" /></Icono>;
export const IcoUsuarios = (p: P) => <Icono {...p}><circle cx="9" cy="8" r="3.2" /><path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5" /><path d="M16 5.2a3 3 0 0 1 0 5.6" /><path d="M18 14.2c1.7.6 2.7 2.1 3 4.8" /></Icono>;
export const IcoTienda = (p: P) => <Icono {...p}><path d="M4 9.5 5.5 4h13L20 9.5" /><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0" /><path d="M5.5 12.5V20h13v-7.5" /><path d="M10 20v-4.5h4V20" /></Icono>;
export const IcoHistorial = (p: P) => <Icono {...p}><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4.5v4h4" /><path d="M12 8v4.2l2.8 1.8" /></Icono>;
export const IcoCorreo = (p: P) => <Icono {...p}><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="m4 7.5 8 6 8-6" /></Icono>;
export const IcoSol = (p: P) => <Icono {...p}><circle cx="12" cy="12" r="3.8" /><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18" /></Icono>;
export const IcoLuna = (p: P) => <Icono {...p}><path d="M19.5 14.6A7.8 7.8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1z" /></Icono>;
export const IcoPantalla = (p: P) => <Icono {...p}><rect x="3.5" y="4.5" width="17" height="11.5" rx="1.8" /><path d="M9 20h6M12 16v4" /></Icono>;
export const IcoOjo = (p: P) => <Icono {...p}><path d="M2.8 12S6.3 5.8 12 5.8 21.2 12 21.2 12 17.7 18.2 12 18.2 2.8 12 2.8 12z" /><circle cx="12" cy="12" r="2.8" /></Icono>;
export const IcoOjoCerrado = (p: P) => <Icono {...p}><path d="M3 3l18 18" /><path d="M10.2 5.9c.6-.1 1.2-.1 1.8-.1 5.7 0 9.2 6.2 9.2 6.200a15 15 0 0 1-3.1 3.7" /><path d="M6.6 7.200A15 15 0 0 0 2.8 12S6.3 18.2 12 18.200c1.3 0 2.5-.3 3.6-.8" /><path d="M9.9 9.900a3 3 0 0 0 4.2 4.2" /></Icono>;
export const IcoFlechaIzq = (p: P) => <Icono {...p}><path d="M19 12H5" /><path d="m11 6-6 6 6 6" /></Icono>;
export const IcoFlechaDer = (p: P) => <Icono {...p}><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></Icono>;
export const IcoSalir = (p: P) => <Icono {...p}><path d="M10 4.5H6.500a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H10" /><path d="M15 8l4 4-4 4" /><path d="M19 12H9.5" /></Icono>;
export const IcoCopiar = (p: P) => <Icono {...p}><rect x="8.5" y="8.5" width="11" height="11" rx="2" /><path d="M15.5 8.500V6.500a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" /></Icono>;
export const IcoImprimir = (p: P) => <Icono {...p}><path d="M7 9V4.500h10V9" /><rect x="4" y="9" width="16" height="8" rx="2" /><path d="M7 14h10v5.500H7z" /></Icono>;
export const IcoDescargar = (p: P) => <Icono {...p}><path d="M12 4.500v11" /><path d="m7.5 11.5 4.5 4.5 4.5-4.5" /><path d="M5 19.500h14" /></Icono>;
export const IcoVisto = (p: P) => <Icono {...p}><path d="m5 12.5 4.5 4.500L19 7.5" /></Icono>;
export const IcoAviso = (p: P) => <Icono {...p}><path d="M12 4 2.8 19.500h18.400z" /><path d="M12 10v4.5" /><path d="M12 17.200v.1" /></Icono>;
export const IcoInfo = (p: P) => <Icono {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5" /><path d="M12 8v.1" /></Icono>;
export const IcoReloj = (p: P) => <Icono {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.500V12l3 2" /></Icono>;
export const IcoDocumento = (p: P) => <Icono {...p}><path d="M6.5 3.500h7.500L18.5 8v12.500h-12z" /><path d="M14 3.500V8h4.5" /><path d="M9 13h6M9 16.500h6" /></Icono>;
export const IcoMenu = (p: P) => <Icono {...p}><path d="M4 7h16M4 12h16M4 17h16" /></Icono>;
export const IcoBuscar = (p: P) => <Icono {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></Icono>;
export const IcoSello = (p: P) => <Icono {...p}><path d="M12 3.5 4.5 6.500v5.200c0 4.3 3.1 7.4 7.5 8.8 4.4-1.4 7.5-4.5 7.5-8.800V6.500z" /><path d="m8.8 12 2.2 2.2 4.2-4.4" /></Icono>;
