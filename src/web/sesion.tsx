import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ErrorApi, fijarTokenCsrf, registrarAlExpirarSesion } from './api/cliente';
import type { SesionRespuesta, Usuario } from './tipos';

interface ContextoSesion {
  usuario: Usuario | null;
  cargando: boolean;
  iniciar: (correo: string, clave: string) => Promise<void>;
  cerrar: () => Promise<void>;
}

const Contexto = createContext<ContextoSesion | null>(null);

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);

  const fijar = useCallback((s: SesionRespuesta | null) => {
    fijarTokenCsrf(s ? s.token_csrf : null);
    setUsuario(s ? s.usuario : null);
  }, []);

  // Al cargar la aplicación se recupera la sesión (usuario y token CSRF) si existe.
  useEffect(() => {
    let vigente = true;
    api.obtener<SesionRespuesta>('/api/sesion').then(
      (s) => {
        if (vigente) {
          fijar(s);
          setCargando(false);
        }
      },
      () => {
        if (vigente) {
          fijar(null);
          setCargando(false);
        }
      },
    );
    registrarAlExpirarSesion(() => fijar(null));
    return () => {
      vigente = false;
      registrarAlExpirarSesion(null);
    };
  }, [fijar]);

  const iniciar = useCallback(
    async (correo: string, clave: string) => {
      const s = await api.crear<SesionRespuesta>('/api/sesion', { correo, clave });
      fijar(s);
    },
    [fijar],
  );

  const cerrar = useCallback(async () => {
    try {
      await api.eliminar('/api/sesion');
    } catch (e) {
      if (!(e instanceof ErrorApi)) throw e;
    }
    fijar(null);
  }, [fijar]);

  const valor = useMemo(() => ({ usuario, cargando, iniciar, cerrar }), [usuario, cargando, iniciar, cerrar]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion(): ContextoSesion {
  const c = useContext(Contexto);
  if (!c) throw new Error('useSesion debe usarse dentro de ProveedorSesion');
  return c;
}
