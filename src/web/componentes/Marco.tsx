import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { MARCA } from '../../compartido/marca';
import { useEmpresa } from '../empresa';
import { useSesion } from '../sesion';
import { SelectorTema } from '../tema';
import { VERSION_INTERFAZ } from '../version';
import { Isotipo } from '../marca/Logo';
import { nombreEmpresa } from './Comunes';

const enlaceNav = ({ isActive }: { isActive: boolean }) => 'nav-publico-enlace' + (isActive ? ' activo' : '');

export function Marco() {
  const { pathname } = useLocation();
  const { usuario } = useSesion();
  const empresa = useEmpresa();
  const enPanel = pathname.startsWith('/panel') && !!usuario;
  const enAcceso = pathname === '/acceso';

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  // El panel y la pantalla de acceso tienen su propia composición.
  if (enPanel || enAcceso) {
    return (
      <>
        <a href="#contenido" className="salto">Saltar al contenido</a>
        <Outlet />
      </>
    );
  }

  return (
    <div className="flex min-h-dvh min-w-0 flex-col">
      <a href="#contenido" className="salto">Saltar al contenido</a>
      <header className="cabecera-publica no-imprimir">
        <div className="contenedor flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 sm:h-16 sm:py-0">
          <Link to="/" className="flex min-w-0 items-center gap-2.5 no-underline" aria-label="Libro de Reclamaciones Virtual, inicio">
            <Isotipo tam={32} />
            <span className="min-w-0 truncate font-[family-name:var(--font-titulo)] text-[0.9375rem] font-bold tracking-tight text-texto sm:text-base">
              {empresa ? nombreEmpresa(empresa.razon_social) : 'Libro de Reclamaciones Virtual'}
            </span>
          </Link>
          <div className="flex items-center gap-2 max-sm:order-3 max-sm:w-full max-sm:justify-between">
            <nav aria-label="Principal" className="flex items-center gap-0.5">
              <NavLink to="/registrar" className={enlaceNav}>Registrar</NavLink>
              <NavLink to="/seguimiento" className={enlaceNav}>
                Consultar<span className="hidden sm:inline">&nbsp;mi reclamo</span>
              </NavLink>
              {usuario && <NavLink to="/panel" className={enlaceNav}>Panel</NavLink>}
            </nav>
            <SelectorTema className="sm:ml-2" />
          </div>
        </div>
      </header>
      <main id="contenido" className="min-w-0 flex-1 py-8 sm:py-10">
        <Outlet />
      </main>
      <footer className="pie-pagina no-imprimir">
        <div className="contenedor grid gap-x-10 gap-y-5 py-7 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div>
            <p className="pie-etiqueta">Empresa responsable</p>
            {empresa ? (
              <address className="not-italic leading-relaxed">
                <strong className="font-semibold text-texto">{empresa.razon_social}</strong>
                <br />
                RUC {empresa.ruc}
                <br />
                {empresa.direccion_fiscal}
              </address>
            ) : (
              <p className="m-0">Libro de Reclamaciones Virtual</p>
            )}
          </div>
          <div className="md:text-right">
            <p className="pie-etiqueta">Plataforma</p>
            <p className="m-0 leading-relaxed">
              {MARCA.plataforma}
              <br />
              <span className="inline-flex items-center gap-4">
                {!usuario && <Link to="/acceso">Acceso del personal</Link>}
                <span aria-label={`Versión de la interfaz ${VERSION_INTERFAZ}`}>v{VERSION_INTERFAZ}</span>
              </span>
            </p>
          </div>
        </div>
        <p className="aviso-demo" data-testid="aviso-demo">{MARCA.avisoDemo}</p>
      </footer>
    </div>
  );
}
