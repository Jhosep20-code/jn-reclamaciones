import { useState } from 'react';
import type { DatosCarta } from '../tipos';

/** Botones «Descargar carta (PDF)» e «Imprimir». jsPDF se carga solo al pulsarlos. */
export function BotonesCarta({ carta }: { carta: DatosCarta }) {
  const [ocupado, setOcupado] = useState<'' | 'descargar' | 'imprimir'>('');
  const [mensaje, setMensaje] = useState('');
  const [fallo, setFallo] = useState(false);

  async function ejecutar(accion: 'descargar' | 'imprimir') {
    if (ocupado) return;
    setOcupado(accion);
    setMensaje('');
    setFallo(false);
    try {
      const m = await import('./generarCarta');
      if (accion === 'descargar') {
        await m.descargarCarta(carta);
        setMensaje(`Carta descargada: ${m.nombreArchivoCarta(carta.numero)}`);
      } else {
        await m.imprimirCarta(carta);
        setMensaje('Se abrió el diálogo de impresión.');
      }
    } catch {
      setFallo(true);
      setMensaje('No se pudo generar la carta. Inténtelo de nuevo.');
    } finally {
      setOcupado('');
    }
  }

  return (
    <div className="no-imprimir">
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn btn-primario" disabled={!!ocupado} onClick={() => ejecutar('descargar')}>
          {ocupado === 'descargar' ? 'Generando…' : 'Descargar carta (PDF)'}
        </button>
        <button type="button" className="btn btn-secundario" disabled={!!ocupado} onClick={() => ejecutar('imprimir')}>
          {ocupado === 'imprimir' ? 'Preparando…' : 'Imprimir'}
        </button>
      </div>
      <p role={fallo ? 'alert' : 'status'} aria-live="polite" className={`mt-2 mb-0 text-sm font-semibold ${fallo ? 'text-alerta-texto' : 'text-ok-texto'}`}>
        {mensaje}
      </p>
    </div>
  );
}
