import { useState, type FormEvent } from 'react';
import { api, ErrorApi } from '../api/cliente';
import { Entrada, Seleccion } from '../componentes/Campos';
import { CajaError, Cargando, Titulo } from '../componentes/Comunes';
import { useCarga, useTitulo } from '../hooks';
import { useSesion } from '../sesion';
import type { EstablecimientoAdmin, Rol, UsuarioAdmin } from '../tipos';

type Panel = { modo: 'crear' } | { modo: 'editar'; usuario: UsuarioAdmin } | { modo: 'clave'; usuario: UsuarioAdmin } | null;

const OPCIONES_ROL = [{ valor: 'encargado', texto: 'Encargado de tienda' }, { valor: 'admin', texto: 'Administrador' }];

export function Usuarios() {
  useTitulo('Usuarios');
  const { usuario: yo } = useSesion();
  const { datos: usuarios, error, cargando, recargar } = useCarga(() => api.obtener<UsuarioAdmin[]>('/api/admin/usuarios'), []);
  const { datos: tiendas } = useCarga(() => api.obtener<EstablecimientoAdmin[]>('/api/admin/establecimientos'), []);
  const [panel, setPanel] = useState<Panel>(null);
  const [aviso, setAviso] = useState('');
  const [errorLista, setErrorLista] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function alternar(u: UsuarioAdmin) {
    if (ocupado) return;
    setOcupado(true);
    setErrorLista('');
    setAviso('');
    try {
      await api.modificar(`/api/admin/usuarios/${u.id}`, { activo: !u.activo });
      setAviso(`Usuario ${u.activo ? 'desactivado' : 'activado'}: ${u.nombre}.`);
      recargar();
    } catch (e) {
      setErrorLista(e instanceof ErrorApi ? e.message : 'No se pudo completar la acción.');
    } finally {
      setOcupado(false);
    }
  }

  function terminado(mensaje: string) {
    setPanel(null);
    setAviso(mensaje);
    recargar();
  }

  return (
    <div>
      <Titulo
        subtitulo="Personal con acceso al panel"
        acciones={<button type="button" className="btn btn-primario" onClick={() => { setPanel({ modo: 'crear' }); setAviso(''); }}>Crear usuario</button>}
      >
        Usuarios
      </Titulo>

      <div aria-live="polite">
        {aviso && <p role="status" className="aviso aviso-ok mb-4 font-semibold">{aviso}</p>}
        {errorLista && <p role="alert" className="aviso aviso-error mb-4 font-semibold">{errorLista}</p>}
      </div>

      {panel && (
        <FormularioUsuario
          key={panel.modo === 'crear' ? 'nuevo' : `${panel.modo}-${panel.usuario.id}`}
          panel={panel}
          tiendas={(tiendas ?? []).filter((t) => t.activo)}
          esYo={panel.modo !== 'crear' && panel.usuario.id === yo?.id}
          alTerminar={terminado}
          alCancelar={() => setPanel(null)}
        />
      )}

      {cargando && <Cargando />}
      {error && <CajaError error={error} alReintentar={recargar} />}
      {usuarios && (
        <div className="tarjeta hidden overflow-x-auto !p-0 md:block">
          <table className="tabla">
            <caption className="sr-only">Usuarios del sistema</caption>
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Correo</th>
                <th scope="col">Rol</th>
                <th scope="col">Tienda</th>
                <th scope="col">Estado</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => {
                const esYo = u.id === yo?.id;
                return (
                  <tr key={u.id}>
                    <td className="font-semibold">{u.nombre}{esYo && <span className="font-normal text-suave"> (usted)</span>}</td>
                    <td className="[overflow-wrap:anywhere]">{u.correo.split('@')[0]}<wbr />@{u.correo.split('@').slice(1).join('@')}</td>
                    <td>{u.rol === 'admin' ? 'Administrador' : 'Encargado'}</td>
                    <td>{u.establecimiento?.nombre ?? 'Todas'}</td>
                    <td>
                      <span className={`insignia ${u.activo ? 'sem-verde' : 'sem-cerrado'}`}>{u.activo ? 'Activo' : 'Inactivo'}</span>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="btn btn-secundario btn-chico" onClick={() => { setPanel({ modo: 'editar', usuario: u }); setAviso(''); }}>
                          Editar<span className="sr-only"> a {u.nombre}</span>
                        </button>
                        <button type="button" className="btn btn-secundario btn-chico" onClick={() => { setPanel({ modo: 'clave', usuario: u }); setAviso(''); }}>
                          Cambiar clave<span className="sr-only"> de {u.nombre}</span>
                        </button>
                        {!esYo && (
                          <button type="button" className="btn btn-secundario btn-chico" disabled={ocupado} onClick={() => alternar(u)}>
                            {u.activo ? 'Desactivar' : 'Activar'}<span className="sr-only"> a {u.nombre}</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {usuarios && (
        <ul className="m-0 grid list-none gap-3 p-0 md:hidden">
          {usuarios.map((u) => {
            const esYo = u.id === yo?.id;
            return (
              <li key={`m-${u.id}`} className="tarjeta !p-4">
                <p className="m-0 flex flex-wrap items-center justify-between gap-2">
                  <strong>{u.nombre}{esYo && <span className="font-normal text-suave"> (usted)</span>}</strong>
                  <span className={`insignia ${u.activo ? 'sem-verde' : 'sem-cerrado'}`}>{u.activo ? 'Activo' : 'Inactivo'}</span>
                </p>
                <p className="mt-1 mb-0 text-sm [overflow-wrap:anywhere]">{u.correo}</p>
                <p className="m-0 text-sm text-suave">{u.rol === 'admin' ? 'Administrador · todas las tiendas' : `Encargado · ${u.establecimiento?.nombre ?? ''}`}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="btn btn-secundario btn-chico" onClick={() => { setPanel({ modo: 'editar', usuario: u }); setAviso(''); }}>Editar<span className="sr-only"> a {u.nombre}</span></button>
                  <button type="button" className="btn btn-secundario btn-chico" onClick={() => { setPanel({ modo: 'clave', usuario: u }); setAviso(''); }}>Cambiar clave<span className="sr-only"> de {u.nombre}</span></button>
                  {!esYo && <button type="button" className="btn btn-secundario btn-chico" disabled={ocupado} onClick={() => alternar(u)}>{u.activo ? 'Desactivar' : 'Activar'}<span className="sr-only"> a {u.nombre}</span></button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FormularioUsuario({
  panel, tiendas, esYo, alTerminar, alCancelar,
}: {
  panel: NonNullable<Panel>;
  tiendas: EstablecimientoAdmin[];
  esYo: boolean;
  alTerminar: (mensaje: string) => void;
  alCancelar: () => void;
}) {
  const u = panel.modo === 'crear' ? null : panel.usuario;
  const [nombre, setNombre] = useState(u?.nombre ?? '');
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [rol, setRol] = useState<Rol>(u?.rol ?? 'encargado');
  const [tienda, setTienda] = useState(u?.establecimiento?.codigo ?? '');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState('');
  const [enviando, setEnviando] = useState(false);

  const titulo = panel.modo === 'crear' ? 'Crear usuario' : panel.modo === 'editar' ? `Editar a ${u?.nombre}` : `Cambiar la clave de ${u?.nombre}`;

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    if (enviando) return;
    const e: Record<string, string> = {};
    if (panel.modo !== 'clave') {
      if (nombre.trim().length < 3) e.nombre = 'Escriba el nombre completo.';
      if (rol === 'encargado' && !tienda) e.establecimiento_codigo = 'Elija la tienda del encargado.';
    }
    if (panel.modo === 'crear' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim())) e.correo = 'Escriba un correo válido.';
    if (panel.modo !== 'editar' && clave.length < 10) e.clave = 'La clave debe tener 10 caracteres o más.';
    setErrores(e);
    setGeneral('');
    if (Object.keys(e).length) return;

    setEnviando(true);
    try {
      if (panel.modo === 'crear') {
        await api.crear('/api/admin/usuarios', {
          nombre: nombre.trim(), correo: correo.trim(), clave, rol,
          ...(rol === 'encargado' ? { establecimiento_codigo: tienda } : {}),
        });
        alTerminar('Usuario creado.');
      } else if (panel.modo === 'editar' && u) {
        const cuerpo: Record<string, unknown> = { nombre: nombre.trim() };
        if (!esYo) {
          cuerpo.rol = rol;
          if (rol === 'encargado') cuerpo.establecimiento_codigo = tienda;
        } else if (u.rol === 'encargado') {
          cuerpo.establecimiento_codigo = tienda;
        }
        await api.modificar(`/api/admin/usuarios/${u.id}`, cuerpo);
        alTerminar('Usuario actualizado.');
      } else if (u) {
        await api.modificar(`/api/admin/usuarios/${u.id}`, { clave });
        alTerminar('Clave actualizada.');
      }
    } catch (err) {
      if (err instanceof ErrorApi) {
        setErrores(err.campos ?? {});
        setGeneral(err.estado === 409 ? 'Ya existe un usuario con ese correo.' : err.message);
      } else setGeneral('No se pudo guardar.');
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="tarjeta mb-5" noValidate aria-labelledby="t-form-usuario">
      <h2 id="t-form-usuario" className="mt-0">{titulo}</h2>
      <div aria-live="polite">{general && <p role="alert" className="aviso aviso-error mb-4 font-semibold">{general}</p>}</div>
      <div className="grid gap-x-4 sm:grid-cols-2">
        {panel.modo !== 'clave' && (
          <Entrada id="u-nombre" etiqueta="Nombre completo" valor={nombre} alCambiar={setNombre} error={errores.nombre} requerido />
        )}
        {panel.modo === 'crear' && (
          <Entrada id="u-correo" etiqueta="Correo" tipo="email" valor={correo} alCambiar={setCorreo} error={errores.correo} autoComplete="off" requerido />
        )}
        {panel.modo !== 'editar' && (
          <Entrada id="u-clave" etiqueta="Clave" tipo="password" alternarVisible valor={clave} alCambiar={setClave} error={errores.clave} autoComplete="new-password" ayuda="Mínimo 10 caracteres." requerido />
        )}
        {panel.modo !== 'clave' && (
          <>
            <Seleccion id="u-rol" etiqueta="Rol" valor={rol} alCambiar={(v) => setRol(v as Rol)} opciones={OPCIONES_ROL} error={errores.rol} deshabilitado={esYo}
              ayuda={esYo ? 'No puede cambiar su propio rol.' : undefined} />
            {rol === 'encargado' && (
              <Seleccion id="u-tienda" etiqueta="Tienda" valor={tienda} alCambiar={setTienda} marcador="Elija una tienda"
                opciones={tiendas.map((t) => ({ valor: t.codigo, texto: t.nombre }))} error={errores.establecimiento_codigo} requerido />
            )}
          </>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn btn-primario" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" className="btn btn-secundario" onClick={alCancelar}>Cancelar</button>
      </div>
    </form>
  );
}
