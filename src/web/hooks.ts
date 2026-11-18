import { useCallback, useEffect, useState } from 'react';
import { tituloPagina } from '../compartido/marca';
import { ErrorApi } from './api/cliente';

/** Carga datos al montar y cada vez que cambian las dependencias. */
export function useCarga<T>(cargar: () => Promise<T>, deps: unknown[]) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<ErrorApi | null>(null);
  const [cargando, setCargando] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError(null);
    cargar().then(
      (d) => {
        if (vigente) {
          setDatos(d);
          setCargando(false);
        }
      },
      (e: unknown) => {
        if (vigente) {
          setError(e instanceof ErrorApi ? e : new ErrorApi(0, 'Ocurrió un error inesperado.'));
          setCargando(false);
        }
      },
    );
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  return { datos, setDatos, error, cargando, recargar };
}

export function useTitulo(titulo: string) {
  useEffect(() => {
    document.title = tituloPagina(titulo);
  }, [titulo]);
}
