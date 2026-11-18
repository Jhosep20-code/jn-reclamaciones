import { LOGO_GROSOR, LOGO_LETRAS_D, LOGO_MALLA, LOGO_ORO_D } from '../../compartido/logoJN';
import { MARCA } from '../../compartido/marca';

// Isotipo de JN Reclamaciones (diseño aprobado por el titular): monograma JN serif itálico sobre el contorno parcial
// de una hoja con la esquina doblada y un check, ambos en dorado champán.
// Todo son trazados (src/compartido/logoJN.ts): no depende de ninguna fuente instalada.
// Colores: las letras toman --logo-trazo (azul noche en claro, marfil en oscuro); el contorno, --logo-oro.
export function Isotipo({ tam = 32, className, titulo }: { tam?: number; className?: string; titulo?: string }) {
  return (
    <svg
      viewBox={`0 0 ${LOGO_MALLA} ${LOGO_MALLA}`}
      width={tam}
      height={tam}
      className={className}
      role={titulo ? 'img' : undefined}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : true}
      focusable="false"
    >
      <g fill="none" stroke="var(--logo-oro)" strokeWidth={tam < 40 ? LOGO_GROSOR + 0.5 : LOGO_GROSOR} strokeLinecap="round" strokeLinejoin="round">
        {LOGO_ORO_D.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <path fill="var(--logo-trazo)" d={LOGO_LETRAS_D} />
    </svg>
  );
}

/** Isotipo + nombre comercial. El nombre es texto real (Manrope, alojada en local). */
export function Logotipo({ tam = 32, className = '', conNombre = true }: { tam?: number; className?: string; conNombre?: boolean }) {
  return (
    <span className={`logotipo ${className}`}>
      <Isotipo tam={tam} />
      {conNombre ? (
        <span className="logotipo-nombre" style={{ fontSize: tam * 0.5 }}>
          <b>JN</b> Reclamaciones
        </span>
      ) : (
        <span className="sr-only">{MARCA.nombre}</span>
      )}
    </span>
  );
}
