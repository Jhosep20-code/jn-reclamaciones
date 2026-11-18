import { useCallback, useEffect, useState } from 'react';
import { IcoLuna, IcoPantalla, IcoSol } from './componentes/Iconos';

// Apariencia: claro, oscuro o según el sistema. La preferencia es lo ÚNICO que se guarda en localStorage (clave «jn-tema»).
// El script mínimo de index.html aplica el tema antes del primer pintado; este módulo lo mantiene y permite cambiarlo.
export type Preferencia = 'claro' | 'oscuro' | 'sistema';
export const CLAVE_TEMA = 'jn-tema';

const OPCIONES: { valor: Preferencia; texto: string }[] = [
  { valor: 'claro', texto: 'Claro' },
  { valor: 'oscuro', texto: 'Oscuro' },
  { valor: 'sistema', texto: 'Sistema' },
];

function leer(): Preferencia {
  try {
    const v = localStorage.getItem(CLAVE_TEMA);
    if (v === 'claro' || v === 'oscuro' || v === 'sistema') return v;
  } catch {
    /* sin almacenamiento: se usa el sistema */
  }
  return 'sistema';
}

const sistemaOscuro = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;

function aplicar(p: Preferencia): void {
  const t = p === 'sistema' ? (sistemaOscuro() ? 'oscuro' : 'claro') : p;
  document.documentElement.dataset.tema = t;
}

export function useTema() {
  const [preferencia, setPreferencia] = useState<Preferencia>(leer);

  useEffect(() => {
    aplicar(preferencia);
    if (preferencia !== 'sistema') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const alCambiar = () => aplicar('sistema');
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }, [preferencia]);

  // Mantiene sincronizados varios selectores y otras pestañas.
  useEffect(() => {
    const alAvisar = () => setPreferencia(leer());
    window.addEventListener('jn-tema', alAvisar);
    window.addEventListener('storage', alAvisar);
    return () => {
      window.removeEventListener('jn-tema', alAvisar);
      window.removeEventListener('storage', alAvisar);
    };
  }, []);

  const elegir = useCallback((p: Preferencia) => {
    try {
      localStorage.setItem(CLAVE_TEMA, p);
    } catch {
      /* sin almacenamiento: el cambio vale solo para esta visita */
    }
    setPreferencia(p);
    window.dispatchEvent(new Event('jn-tema'));
  }, []);

  return { preferencia, elegir };
}

export function SelectorTema({ className = '' }: { className?: string }) {
  const { preferencia, elegir } = useTema();
  const ICONOS = { claro: IcoSol, oscuro: IcoLuna, sistema: IcoPantalla } as const;
  return (
    <span role="group" aria-label="Apariencia" className={`selector-tema no-imprimir ${className}`}>
      {OPCIONES.map((o) => {
        const Icono = ICONOS[o.valor];
        return (
          <button
            key={o.valor}
            type="button"
            aria-label={o.texto}
            title={o.valor === 'sistema' ? 'Apariencia según el sistema' : `Tema ${o.texto.toLowerCase()}`}
            aria-pressed={preferencia === o.valor}
            onClick={() => elegir(o.valor)}
          >
            <Icono tam={16} />
          </button>
        );
      })}
    </span>
  );
}
