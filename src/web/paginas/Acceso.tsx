import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { MARCA } from '../../compartido/marca';
import { ErrorApi } from '../api/cliente';
import { Entrada } from '../componentes/Campos';
import { nombreEmpresa } from '../componentes/Comunes';
import { IcoFlechaIzq, IcoSello } from '../componentes/Iconos';
import { useEmpresa } from '../empresa';
import { useTitulo } from '../hooks';
import { Logotipo } from '../marca/Logo';
import { useSesion } from '../sesion';
import { SelectorTema } from '../tema';

export function Acceso() {
  useTitulo('Acceso del personal');
  const { usuario, cargando, iniciar } = useSesion();
  const empresa = useEmpresa();
  const navegar = useNavigate();
  const ubicacion = useLocation() as { state: { desde?: string } | null };
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  if (!cargando && usuario) return <Navigate to={ubicacion.state?.desde ?? '/panel'} replace />;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setMensaje('');
    if (!correo.trim() || !clave) {
      setMensaje('Escriba su correo y su clave.');
      return;
    }
    setEnviando(true);
    try {
      await iniciar(correo.trim(), clave);
      navegar(ubicacion.state?.desde ?? '/panel', { replace: true });
    } catch (err) {
      if (err instanceof ErrorApi && err.estado === 429) {
        const espera = err.reintentarEn;
        setMensaje(
          espera
            ? `Demasiados intentos. Espere ${espera >= 60 ? `${Math.ceil(espera / 60)} minuto(s)` : `${espera} segundos`} antes de volver a intentar.`
            : 'Demasiados intentos. Espere unos minutos antes de volver a intentar.',
        );
      } else if (err instanceof ErrorApi && err.estado === 401) {
        setMensaje('Correo o clave incorrectos.');
      } else {
        setMensaje(err instanceof ErrorApi ? err.message : 'No se pudo iniciar sesión.');
      }
      setClave('');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="acceso">
      <section className="acceso-identidad" aria-label="Identidad de la plataforma">
        <Link to="/" className="no-underline" aria-label={`${MARCA.nombre}, ir al sitio público`}>
          <Logotipo tam={34} className="md:hidden" />
          <Logotipo tam={60} className="max-md:hidden" />
        </Link>
        <div className="max-w-sm max-md:hidden">
          <h2 className="m-0 !text-[1.75rem] !font-semibold !leading-tight !tracking-tight !text-[color:var(--jn-marfil)]">Atención al consumidor, con orden y trazabilidad.</h2>
          {empresa && (
            <p className="mt-5 mb-0 text-[0.9375rem] leading-relaxed">
              Libro de Reclamaciones Virtual de <strong className="font-semibold text-[color:var(--jn-marfil)]">{nombreEmpresa(empresa.razon_social)}</strong>
            </p>
          )}
        </div>
        <p className="m-0 text-xs max-md:hidden">{MARCA.desarrolladora}</p>
      </section>

      <main id="contenido" className="acceso-formulario">
        <div className="acceso-contenido">
          <div className="mb-5 flex items-center justify-between gap-3 md:mb-8">
            <Link to="/" className="inline-flex min-h-10 items-center gap-2 text-sm text-suave no-underline hover:text-texto">
              <IcoFlechaIzq tam={16} />
              Volver al sitio público
            </Link>
            <SelectorTema />
          </div>
          <h1 className="mb-1">Acceso del personal</h1>
          <p className="mb-6 text-sm text-suave">Solo para encargados de tienda y administradores.</p>
          <form onSubmit={enviar} noValidate>
            <div aria-live="polite" role="status">
              {mensaje && <p className="aviso aviso-error mb-4 font-semibold">{mensaje}</p>}
            </div>
            <Entrada id="correo" etiqueta="Correo electrónico" tipo="email" valor={correo} alCambiar={setCorreo} autoComplete="username" requerido />
            <Entrada id="clave" etiqueta="Contraseña" tipo="password" alternarVisible valor={clave} alCambiar={setClave} autoComplete="current-password" requerido />
            <button type="submit" className="btn btn-primario btn-grande mt-2 w-full" disabled={enviando} aria-busy={enviando}>
              {enviando && <span className="spinner" aria-hidden="true" />}
              {enviando ? 'Ingresando…' : 'Ingresar'}
            </button>
          </form>
          <p className="mt-6 flex items-start gap-2 text-xs text-suave">
            <IcoSello tam={16} />
            <span>Acceso restringido. Sus acciones quedan registradas en el historial del sistema.</span>
          </p>
        </div>
      </main>
    </div>
  );
}
