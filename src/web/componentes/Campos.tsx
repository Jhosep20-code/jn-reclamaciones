import { useState, type HTMLAttributes, type ReactNode } from 'react';
import { IcoOjo, IcoOjoCerrado } from './Iconos';

interface BaseProps {
  id: string;
  etiqueta: string;
  error?: string;
  ayuda?: string;
  opcional?: boolean;
}

function Envoltura({ id, etiqueta, error, ayuda, opcional, children }: BaseProps & { children: ReactNode }) {
  return (
    <div className="mb-4">
      <label htmlFor={id} className="etiqueta">
        {etiqueta}
        {opcional && <span className="font-normal text-suave"> (opcional)</span>}
      </label>
      {children}
      {ayuda && <p id={`${id}-ayuda`} className="ayuda">{ayuda}</p>}
      <p id={`${id}-error`} className="error-campo" aria-live="polite">{error}</p>
    </div>
  );
}

function descritoPor(id: string, error?: string, ayuda?: string) {
  const ids = [ayuda ? `${id}-ayuda` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ');
  return ids || undefined;
}

interface EntradaProps extends BaseProps {
  valor: string;
  alCambiar: (v: string) => void;
  tipo?: string;
  multilinea?: boolean;
  autoComplete?: string;
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode'];
  maxLength?: number;
  max?: string;
  minLength?: number;
  requerido?: boolean;
  autoFocus?: boolean;
  /** En campos de tipo «password»: añade el botón mostrar/ocultar. */
  alternarVisible?: boolean;
}

export function Entrada(p: EntradaProps) {
  const [visible, setVisible] = useState(false);
  const esClave = p.tipo === 'password' && p.alternarVisible;
  const comun = {
    id: p.id,
    value: p.valor,
    className: 'entrada',
    'aria-invalid': p.error ? true : undefined,
    'aria-describedby': descritoPor(p.id, p.error, p.ayuda),
    'aria-required': p.requerido && !p.opcional ? true : undefined,
    maxLength: p.maxLength,
    autoComplete: p.autoComplete,
    autoFocus: p.autoFocus,
  } as const;
  const campo = p.multilinea ? (
    <textarea {...comun} onChange={(e) => p.alCambiar(e.target.value)} />
  ) : (
    <input
      {...comun}
      type={esClave && visible ? 'text' : (p.tipo ?? 'text')}
      inputMode={p.inputMode}
      max={p.max}
      minLength={p.minLength}
      onChange={(e) => p.alCambiar(e.target.value)}
    />
  );
  return (
    <Envoltura {...p}>
      {esClave ? (
        <div className="campo-clave">
          {campo}
          <button
            type="button"
            aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            aria-pressed={visible}
            aria-controls={p.id}
            onClick={() => setVisible((v) => !v)}
          >
            {visible ? <IcoOjoCerrado /> : <IcoOjo />}
          </button>
        </div>
      ) : (
        campo
      )}
    </Envoltura>
  );
}

interface SeleccionProps extends BaseProps {
  valor: string;
  alCambiar: (v: string) => void;
  opciones: { valor: string; texto: string }[];
  marcador?: string;
  requerido?: boolean;
  deshabilitado?: boolean;
}

export function Seleccion(p: SeleccionProps) {
  return (
    <Envoltura {...p}>
      <select
        id={p.id}
        className="entrada"
        value={p.valor}
        disabled={p.deshabilitado}
        aria-invalid={p.error ? true : undefined}
        aria-describedby={descritoPor(p.id, p.error, p.ayuda)}
        aria-required={p.requerido ? true : undefined}
        onChange={(e) => p.alCambiar(e.target.value)}
      >
        {p.marcador !== undefined && <option value="">{p.marcador}</option>}
        {p.opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
    </Envoltura>
  );
}

export function Casilla({
  id,
  texto,
  marcada,
  alCambiar,
  error,
  deshabilitada,
}: {
  id: string;
  texto: ReactNode;
  marcada: boolean;
  alCambiar: (v: boolean) => void;
  error?: string;
  deshabilitada?: boolean;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          checked={marcada}
          disabled={deshabilitada}
          onChange={(e) => alCambiar(e.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="mt-0.5 h-5 w-5 shrink-0"
        />
        <label htmlFor={id} className="cursor-pointer text-[0.9375rem]">{texto}</label>
      </div>
      <p id={`${id}-error`} className="error-campo" aria-live="polite">{error}</p>
    </div>
  );
}

export function GrupoOpciones<T extends string>({
  nombre,
  leyenda,
  valor,
  alCambiar,
  opciones,
  error,
}: {
  nombre: string;
  leyenda: string;
  valor: T | '';
  alCambiar: (v: T) => void;
  opciones: { valor: T; titulo: string; descripcion?: string }[];
  error?: string;
}) {
  return (
    <fieldset className="mb-4 border-0 p-0">
      <legend className="etiqueta">{leyenda}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {opciones.map((o) => (
          <label key={o.valor} className="opcion" data-activa={valor === o.valor}>
            <input
              type="radio"
              name={nombre}
              value={o.valor}
              checked={valor === o.valor}
              onChange={() => alCambiar(o.valor)}
              className="mt-1 h-4 w-4 shrink-0"
            />
            <span>
              <span className="block font-semibold">{o.titulo}</span>
              {o.descripcion && <span className="block text-[0.8125rem] text-suave">{o.descripcion}</span>}
            </span>
          </label>
        ))}
      </div>
      <p id={`${nombre}-error`} className="error-campo" aria-live="polite">{error}</p>
    </fieldset>
  );
}
