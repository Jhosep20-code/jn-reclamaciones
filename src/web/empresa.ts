import { useEffect, useState } from 'react';
import { api } from './api/cliente';
import type { Empresa } from './tipos';

// Datos de la empresa cliente (responsable legal de las hojas): siempre salen de la API, nunca se escriben a mano.
// Se piden una sola vez por visita y se comparten entre el encabezado, el pie y las pantallas.
let promesa: Promise<Empresa | null> | null = null;

function pedir(): Promise<Empresa | null> {
  promesa ??= api.obtener<Empresa>('/api/publico/empresa').catch(() => {
    promesa = null; // permite reintentar en la siguiente carga
    return null;
  });
  return promesa;
}

export function useEmpresa(): Empresa | null {
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  useEffect(() => {
    let vigente = true;
    pedir().then((e) => {
      if (vigente) setEmpresa(e);
    });
    return () => {
      vigente = false;
    };
  }, []);
  return empresa;
}
