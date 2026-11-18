import { useState, type FormEvent } from 'react';
import { api, ErrorApi } from '../api/cliente';
import { Entrada } from '../componentes/Campos';
import { BotonCopiar, CajaError, Cargando, Titulo } from '../componentes/Comunes';
import { useCarga, useTitulo } from '../hooks';
import type { EstablecimientoAdmin } from '../tipos';

type Panel = { modo: 'crear' } | { modo: 'editar'; tienda: EstablecimientoAdmin } | null;

export function Establecimientos() {
  useTitulo('Tiendas');
  const { datos: tiendas, error, cargando, recargar } = useCarga(() => api.obtener<EstablecimientoAdmin[]>('/api/admin/establecimientos'), []);
  const [panel, setPanel] = useState<Panel>(null);
  const [aviso, setAviso] = useState('');
  const [errorLista, setErrorLista] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function alternar(t: EstablecimientoAdmin) {
    if (ocupado) return;
    setOcupado(true);
    setErrorLista('');
    setAviso('');
    try {
      await api.modificar(`/api/admin/establecimientos/${encodeURIComponent(t.codigo)}`, { activo: !t.activo });
      setAviso(`Tienda ${t.activo ? 'desactivada' : 'activada'}: ${t.nombre}.`);
      recargar();
    } catch (e) {
      setErrorLista(e instanceof ErrorApi ? e.message : 'No se pudo completar la acción.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div>
      <Titulo
        subtitulo="Cada tienda tiene un enlace propio para su código QR"
        acciones={<button type="button" className="btn btn-primario" onClick={() => { setPanel({ modo: 'crear' }); setAviso(''); }}>Crear tienda</button>}
      >
        Tiendas
      </Titulo>

      <div aria-live="polite">
        {aviso && <p role="status" className="aviso aviso-ok mb-4 font-semibold">{aviso}</p>}
        {errorLista && <p role="alert" className="aviso aviso-error mb-4 font-semibold">{errorLista}</p>}
      </div>

      {panel && (
        <FormularioTienda
          key={panel.modo === 'crear' ? 'nueva' : panel.tienda.codigo}
          panel={panel}
          alTerminar={(m) => { setPanel(null); setAviso(m); recargar(); }}
          alCancelar={() => setPanel(null)}
        />
      )}

      {cargando && <Cargando />}
      {error && <CajaError error={error} alReintentar={recargar} />}
      {tiendas && (
        <ul className="m-0 grid list-none gap-4 p-0">
          {tiendas.map((t) => {
            const enlace = `${window.location.origin}/registrar/${t.codigo}`;
            return (
              <li key={t.codigo} className="tarjeta !p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="m-0 text-lg">{t.nombre} <span className="font-normal text-suave">({t.codigo})</span></h2>
                    <p className="m-0 text-sm text-suave">{t.direccion}, {t.ciudad}</p>
                  </div>
                  <span className={`insignia ${t.activo ? 'sem-verde' : 'sem-cerrado'}`}>{t.activo ? 'Activa' : 'Inactiva'}</span>
                </div>
                <p className="mt-3 mb-1 text-sm font-semibold">Enlace del código QR</p>
                <p className="m-0 break-all rounded-md bg-superficie-2 px-3 py-2 font-mono text-sm">{enlace}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <BotonCopiar texto={enlace} etiqueta="Copiar enlace" className="btn-chico" />
                  <button type="button" className="btn btn-secundario btn-chico" onClick={() => { setPanel({ modo: 'editar', tienda: t }); setAviso(''); }}>
                    Editar<span className="sr-only"> {t.nombre}</span>
                  </button>
                  <button type="button" className="btn btn-secundario btn-chico" disabled={ocupado} onClick={() => alternar(t)}>
                    {t.activo ? 'Desactivar' : 'Activar'}<span className="sr-only"> {t.nombre}</span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FormularioTienda({ panel, alTerminar, alCancelar }: { panel: NonNullable<Panel>; alTerminar: (m: string) => void; alCancelar: () => void }) {
  const t = panel.modo === 'editar' ? panel.tienda : null;
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState(t?.nombre ?? '');
  const [direccion, setDireccion] = useState(t?.direccion ?? '');
  const [ciudad, setCiudad] = useState(t?.ciudad ?? '');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    if (enviando) return;
    const e: Record<string, string> = {};
    if (!t && !/^[A-Z]{3}-\d{2}$/.test(codigo.trim().toUpperCase())) e.codigo = 'Use el formato AAA-00, por ejemplo HYO-01.';
    if (!nombre.trim()) e.nombre = 'Escriba el nombre de la tienda.';
    if (!direccion.trim()) e.direccion = 'Escriba la dirección.';
    if (!ciudad.trim()) e.ciudad = 'Escriba la ciudad.';
    setErrores(e);
    setGeneral('');
    if (Object.keys(e).length) return;
    setEnviando(true);
    try {
      const datos = { nombre: nombre.trim(), direccion: direccion.trim(), ciudad: ciudad.trim() };
      if (t) {
        await api.modificar(`/api/admin/establecimientos/${encodeURIComponent(t.codigo)}`, datos);
        alTerminar('Tienda actualizada.');
      } else {
        await api.crear('/api/admin/establecimientos', { codigo: codigo.trim().toUpperCase(), ...datos });
        alTerminar('Tienda creada.');
      }
    } catch (err) {
      if (err instanceof ErrorApi) {
        setErrores(err.campos ?? {});
        setGeneral(err.message);
      } else setGeneral('No se pudo guardar.');
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="tarjeta mb-5" noValidate aria-labelledby="t-form-tienda">
      <h2 id="t-form-tienda" className="mt-0">{t ? `Editar ${t.nombre}` : 'Crear tienda'}</h2>
      <div aria-live="polite">{general && <p role="alert" className="aviso aviso-error mb-4 font-semibold">{general}</p>}</div>
      <div className="grid gap-x-4 sm:grid-cols-2">
        {!t && <Entrada id="t-codigo" etiqueta="Código" valor={codigo} alCambiar={setCodigo} error={errores.codigo} maxLength={6} ayuda="Formato AAA-00. No se puede cambiar después." requerido />}
        <Entrada id="t-nombre" etiqueta="Nombre" valor={nombre} alCambiar={setNombre} error={errores.nombre} requerido />
        <Entrada id="t-direccion" etiqueta="Dirección" valor={direccion} alCambiar={setDireccion} error={errores.direccion} requerido />
        <Entrada id="t-ciudad" etiqueta="Ciudad" valor={ciudad} alCambiar={setCiudad} error={errores.ciudad} requerido />
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn btn-primario" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" className="btn btn-secundario" onClick={alCancelar}>Cancelar</button>
      </div>
    </form>
  );
}
