import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { MARCA } from '../../compartido/marca';
import { Logotipo } from '../marca/Logo';
import { useSesion } from '../sesion';
import { SelectorTema } from '../tema';
import { VERSION_INTERFAZ } from '../version';
import { Cargando } from './Comunes';
import { IcoCasos, IcoCorreo, IcoFlechaIzq, IcoHistorial, IcoReportes, IcoResumen, IcoSalir, IcoTienda, IcoUsuarios } from './Iconos';

/** Protege rutas privadas (solo experiencia de usuario: la seguridad real está en el servidor). */
export function RutaPrivada({ soloAdmin = false }: { soloAdmin?: boolean }) {
  const { usuario, cargando } = useSesion();
  const ubicacion = useLocation();
  if (cargando) {
    return (
      <div className="contenedor">
        <Cargando texto="Verificando sesión…" />
      </div>
    );
  }
  if (!usuario) return <Navigate to="/acceso" replace state={{ desde: ubicacion.pathname }} />;
  if (soloAdmin && usuario.rol !== 'admin') return <Navigate to="/panel" replace state={{ sinPermiso: true }} />;
  return <Outlet />;
}

const enlaceSub = ({ isActive }: { isActive: boolean }) => `nav-panel-enlace ${isActive ? 'activo' : ''}`;

export function MarcoPanel() {
  const { usuario, cerrar } = useSesion();
  const navegar = useNavigate();
  const ubicacion = useLocation() as { pathname: string; state: { sinPermiso?: boolean } | null };
  const nav = useRef<HTMLElement>(null);
  const [saliendo, setSaliendo] = useState(false);

  // En celular, la pestaña activa se mantiene a la vista.
  useEffect(() => {
    nav.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [ubicacion.pathname]);

  if (!usuario) return null;
  const admin = usuario.rol === 'admin';
  const tienda = usuario.establecimiento;

  async function salir() {
    setSaliendo(true);
    await cerrar();
    setSaliendo(false);
    navegar('/acceso', { replace: true });
  }

  const iniciales = usuario.nombre
    .split(/\s+/)
    .filter((w) => w && !w.startsWith('('))
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');

  return (
    <div className="shell">
      <aside className="lateral no-imprimir">
        <div className="lateral-interior">
          <div className="lateral-marca">
            <Link to="/panel" className="no-underline" aria-label={`${MARCA.nombre}, panel`}>
              <Logotipo tam={30} />
            </Link>
          </div>

          <section aria-label="Alcance de la sesión" className="lateral-contexto">
            <span className="rol-sello" data-rol={usuario.rol}>{admin ? 'Administrador' : 'Encargado de tienda'}</span>
            <p className="mt-2 mb-0 text-sm leading-snug">
              {admin ? (
                <strong className="font-semibold">Todas las tiendas</strong>
              ) : (
                <>
                  <strong className="block font-semibold">{tienda?.nombre ?? 'Sin tienda'}</strong>
                  {tienda && <span className="text-xs text-[color:var(--lateral-suave)]">Código {tienda.codigo}</span>}
                </>
              )}
            </p>
          </section>

          <nav ref={nav} aria-label="Panel" className="nav-panel">
            <NavLink to="/panel" end className={enlaceSub}><IcoResumen />{admin ? 'Vista general' : 'Mi tienda'}</NavLink>
            <NavLink to="/panel/reclamos" className={enlaceSub}><IcoCasos />{admin ? 'Todos los casos' : 'Casos de mi tienda'}</NavLink>
            <NavLink to="/panel/reportes" className={enlaceSub}><IcoReportes />{admin ? 'Reportes' : 'Reportes de mi tienda'}</NavLink>
            {admin && (
              <>
                <span className="nav-panel-grupo" aria-hidden="true">Administración</span>
                <NavLink to="/panel/usuarios" className={enlaceSub}><IcoUsuarios />Usuarios</NavLink>
                <NavLink to="/panel/establecimientos" className={enlaceSub}><IcoTienda />Tiendas</NavLink>
                <NavLink to="/panel/historial" className={enlaceSub}><IcoHistorial />Historial</NavLink>
                <NavLink to="/panel/correo" className={enlaceSub}><IcoCorreo />Correo</NavLink>
              </>
            )}
          </nav>

          <div className="lateral-pie">
            <Link to="/"><IcoFlechaIzq tam={16} />Sitio público</Link>
            <p className="mt-2 mb-0 leading-snug">
              {MARCA.desarrolladora}
              <br />
              <span aria-label={`Versión de la interfaz ${VERSION_INTERFAZ}`}>v{VERSION_INTERFAZ}</span>
            </p>
          </div>
        </div>
      </aside>

      <div className="shell-contenido">
        <header className="barra-superior no-imprimir">
          <div className="flex min-w-0 items-center gap-3">
            <span className="avatar" aria-hidden="true">{iniciales}</span>
            <p className="m-0 min-w-0 leading-tight">
              <strong className="block truncate text-sm font-semibold">{usuario.nombre}</strong>
              <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-suave">
                <span className="rol-sello shrink-0" data-rol={usuario.rol}>{admin ? 'Administrador' : 'Encargado'}</span>
                <span className="truncate">{admin ? 'Todas las tiendas' : `${tienda?.nombre ?? 'Sin tienda'}${tienda ? ` · ${tienda.codigo}` : ''}`}</span>
              </span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <SelectorTema />
            <Link to="/" className="btn btn-terciario btn-chico max-sm:hidden lg:hidden">Sitio público</Link>
            <button type="button" className="btn btn-secundario btn-chico" onClick={salir} disabled={saliendo}>
              <IcoSalir tam={16} />
              <span className="max-sm:sr-only">{saliendo ? 'Saliendo…' : 'Cerrar sesión'}</span>
            </button>
          </div>
        </header>

        <main id="contenido" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
          {ubicacion.state?.sinPermiso && (
            <p role="status" className="aviso aviso-ambar mb-5 font-semibold">
              Esa sección es solo para administradores. Le llevamos a su panel.
            </p>
          )}
          <div className="mx-auto w-full max-w-[84rem]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
