import { useState, type ReactNode } from 'react';
import type { ErrorApi } from '../api/cliente';
import type { Estado, Plazo } from '../tipos';
import { ETIQUETA_ESTADO, ETIQUETA_SEMAFORO, textoDias } from '../util/formato';
import { IcoCopiar, IcoFlechaDer, IcoFlechaIzq, IcoVisto } from './Iconos';

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <p role="status" aria-live="polite" className="flex items-center justify-center gap-3 py-10 text-suave">
      <span className="spinner" aria-hidden="true" />
      {texto}
    </p>
  );
}

export function EstadoVacio({ titulo, children, accion }: { titulo: string; children?: ReactNode; accion?: ReactNode }) {
  return (
    <div role="status" className="tarjeta text-center">
      <p className="m-0 font-semibold">{titulo}</p>
      {children && <p className="mx-auto mt-1 mb-0 max-w-md text-sm text-suave">{children}</p>}
      {accion && <div className="mt-4">{accion}</div>}
    </div>
  );
}

export function CajaError({ error, alReintentar }: { error: ErrorApi | string; alReintentar?: () => void }) {
  const mensaje = typeof error === 'string' ? error : error.message;
  return (
    <div role="alert" className="aviso aviso-error">
      <p className="m-0 font-semibold">{mensaje}</p>
      {alReintentar && (
        <button type="button" className="btn btn-secundario btn-chico mt-3" onClick={alReintentar}>
          Reintentar
        </button>
      )}
    </div>
  );
}

export function InsigniaSemaforo({ plazo, conDias = false }: { plazo: Plazo; conDias?: boolean }) {
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <span className={`insignia sem-${plazo.semaforo}`}>{ETIQUETA_SEMAFORO[plazo.semaforo]}</span>
      {conDias && <span className="text-xs text-suave">{textoDias(plazo.dias_habiles_restantes, plazo.semaforo)}</span>}
    </span>
  );
}

export function InsigniaEstado({ estado }: { estado: Estado }) {
  return <span className={`insignia insignia-neutra estado-${estado}`}>{ETIQUETA_ESTADO[estado]}</span>;
}

export function BotonCopiar({ texto, etiqueta = 'Copiar', className = '' }: { texto: string; etiqueta?: string; className?: string }) {
  const [estado, setEstado] = useState<'inicial' | 'copiado' | 'fallo'>('inicial');
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setEstado('copiado');
    } catch {
      setEstado('fallo');
    }
    setTimeout(() => setEstado('inicial'), 3000);
  }
  return (
    <>
      <button type="button" className={`btn btn-secundario ${className}`} onClick={copiar}>
        {estado === 'copiado' ? <IcoVisto tam={18} /> : <IcoCopiar tam={18} />}
        {etiqueta}
      </button>
      <span role="status" aria-live="polite" className="text-sm font-semibold">
        {estado === 'copiado' && 'Copiado'}
        {estado === 'fallo' && 'No se pudo copiar; selecciónelo y cópielo a mano'}
      </span>
    </>
  );
}

export function Paginacion({
  pagina,
  haySiguiente,
  total,
  porPagina,
  alCambiar,
}: {
  pagina: number;
  haySiguiente: boolean;
  total?: number | null;
  porPagina: number;
  alCambiar: (p: number) => void;
}) {
  const paginas = total != null ? Math.max(1, Math.ceil(total / porPagina)) : null;
  return (
    <nav aria-label="Paginación" className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <button type="button" className="btn btn-secundario btn-chico" disabled={pagina <= 1} onClick={() => alCambiar(pagina - 1)}>
        <IcoFlechaIzq tam={16} />
        Anterior
      </button>
      <span className="text-sm text-suave" aria-live="polite">
        Página {pagina}
        {paginas ? ` de ${paginas}` : ''}
        {total != null ? ` · ${total} en total` : ''}
      </span>
      <button type="button" className="btn btn-secundario btn-chico" disabled={!haySiguiente} onClick={() => alCambiar(pagina + 1)}>
        Siguiente
        <IcoFlechaDer tam={16} />
      </button>
    </nav>
  );
}

export function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div>
      <dt>{etiqueta}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Nombre de la empresa para titulares: la API envía el sufijo « (empresa ficticia)», que solo se muestra junto a la identificación legal. */
export function nombreEmpresa(razonSocial: string): string {
  return razonSocial.replace(/\s*\(empresa ficticia\)\s*$/i, '').trim();
}

export function Titulo({ children, subtitulo, acciones, etiqueta }: { children: ReactNode; subtitulo?: ReactNode; acciones?: ReactNode; etiqueta?: string }) {
  return (
    <div className="cabecera-modulo">
      <div className="min-w-0">
        {etiqueta && <p className="eyebrow">{etiqueta}</p>}
        <h1>{children}</h1>
        {subtitulo && <p className="apoyo">{subtitulo}</p>}
      </div>
      {acciones}
    </div>
  );
}

/** Confirmación en línea de una acción (diálogo de alerta accesible). */
export function Confirmacion({
  id,
  texto,
  confirmar,
  ocupado = false,
  alConfirmar,
  alCancelar,
}: {
  id: string;
  texto: ReactNode;
  confirmar: string;
  ocupado?: boolean;
  alConfirmar: () => void;
  alCancelar: () => void;
}) {
  return (
    <div role="alertdialog" aria-labelledby={id} className="aviso aviso-ambar">
      <p id={id} className="m-0 mb-3 font-semibold">
        {texto}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primario btn-chico" disabled={ocupado} onClick={alConfirmar}>
          {confirmar}
        </button>
        <button type="button" className="btn btn-secundario btn-chico" onClick={alCancelar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
