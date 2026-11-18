import { Link, useSearchParams } from 'react-router-dom';
import { api, normalizarLista } from '../api/cliente';
import { Seleccion } from '../componentes/Campos';
import { CajaError, Cargando, EstadoVacio, InsigniaEstado, InsigniaSemaforo, Paginacion, Titulo } from '../componentes/Comunes';
import { useCarga, useTitulo } from '../hooks';
import { useSesion } from '../sesion';
import type { Establecimiento, ResumenReclamo } from '../tipos';
import { ETIQUETA_TIPO, formatearFechaHoraCorta } from '../util/formato';

const POR_PAGINA = 20;

export function Bandeja() {
  useTitulo('Bandeja de reclamos');
  const { usuario } = useSesion();
  const esAdmin = usuario?.rol === 'admin';
  const [params, setParams] = useSearchParams();
  const estado = params.get('estado') ?? '';
  const tipo = params.get('tipo') ?? '';
  const tienda = params.get('establecimiento') ?? '';
  const pagina = Math.max(1, Number(params.get('pagina')) || 1);

  const { datos: tiendas } = useCarga(
    () => (esAdmin ? api.obtener<Establecimiento[]>('/api/admin/establecimientos') : Promise.resolve([] as Establecimiento[])),
    [esAdmin],
  );

  const { datos, error, cargando, recargar } = useCarga(async () => {
    const q = new URLSearchParams();
    if (estado) q.set('estado', estado);
    if (tipo) q.set('tipo', tipo);
    if (esAdmin && tienda) q.set('establecimiento', tienda);
    q.set('pagina', String(pagina));
    return normalizarLista<ResumenReclamo>(await api.obtener<unknown>(`/api/reclamos?${q.toString()}`));
  }, [estado, tipo, tienda, pagina, esAdmin]);

  function cambiar(clave: string, valor: string) {
    const nuevo = new URLSearchParams(params);
    if (valor) nuevo.set(clave, valor);
    else nuevo.delete(clave);
    if (clave !== 'pagina') nuevo.delete('pagina');
    setParams(nuevo);
  }

  const volver = params.toString();
  const ruta = (id: number, atender = false) => {
    const q = new URLSearchParams();
    if (volver) q.set('volver', volver);
    if (atender) q.set('atender', '1');
    const s = q.toString();
    return `/panel/reclamos/${id}${s ? '?' + s : ''}`;
  };

  const items = datos?.items ?? [];
  const total = datos?.total ?? null;
  const haySiguiente = total != null ? pagina * POR_PAGINA < total : items.length === POR_PAGINA;

  return (
    <div>
      <Titulo etiqueta="Bandeja" subtitulo={esAdmin ? 'Todas las tiendas · de la más reciente a la más antigua' : `${usuario?.establecimiento?.nombre ?? ''} · de la más reciente a la más antigua`}>{esAdmin ? 'Todos los casos' : 'Casos de mi tienda'}</Titulo>

      <form className="tarjeta filtros mb-5 grid grid-cols-1 gap-x-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(e) => e.preventDefault()} aria-label="Filtros">
        <Seleccion id="f-estado" etiqueta="Estado" valor={estado} alCambiar={(v) => cambiar('estado', v)} marcador="Todos"
          opciones={[{ valor: 'registrado', texto: 'Registrado' }, { valor: 'en_atencion', texto: 'En atención' }, { valor: 'respondido', texto: 'Respondido' }]} />
        <Seleccion id="f-tipo" etiqueta="Tipo" valor={tipo} alCambiar={(v) => cambiar('tipo', v)} marcador="Todos"
          opciones={[{ valor: 'reclamo', texto: 'Reclamo' }, { valor: 'queja', texto: 'Queja' }]} />
        {esAdmin && (
          <Seleccion id="f-tienda" etiqueta="Tienda" valor={tienda} alCambiar={(v) => cambiar('establecimiento', v)} marcador="Todas"
            opciones={(tiendas ?? []).map((t) => ({ valor: t.codigo, texto: t.nombre }))} />
        )}
      </form>

      {error && <CajaError error={error} alReintentar={recargar} />}
      {cargando && <Cargando />}
      {!cargando && !error && items.length === 0 && (
        <EstadoVacio
          titulo={estado || tipo || tienda ? 'Ningún caso coincide con estos filtros' : 'Todavía no hay casos'}
          accion={(estado || tipo || tienda) && <button type="button" className="btn btn-secundario btn-chico" onClick={() => setParams(new URLSearchParams())}>Quitar filtros</button>}
        >
          {estado || tipo || tienda ? 'Pruebe con otros criterios o quite los filtros.' : 'Cuando se registre una hoja de reclamación aparecerá aquí.'}
        </EstadoVacio>
      )}

      {!cargando && items.length > 0 && (
        <>
          {/* Escritorio: tabla */}
          <div className="tabla-marco hidden overflow-x-auto lg:block">
            <table className="tabla tabla-compacta">
              <caption className="sr-only">Lista de reclamos y quejas</caption>
              <thead>
                <tr>
                  <th scope="col">Número</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Consumidor</th>
                  {esAdmin && <th scope="col">Tienda</th>}
                  <th scope="col">Registrado</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Plazo</th>
                  <th scope="col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id} className={r.estado !== 'respondido' && ['vencido', 'rojo', 'ambar'].includes(r.plazo.semaforo) ? `fila-${r.plazo.semaforo}` : undefined}>
                    <td className="numero-hoja font-semibold"><Link to={ruta(r.id)}>{r.numero}</Link></td>
                    <td className="text-suave">{ETIQUETA_TIPO[r.tipo]}</td>
                    <td className="font-medium">{r.consumidor_nombres}</td>
                    {esAdmin && <td className="text-suave">{r.establecimiento.nombre}</td>}
                    <td className="w-[6.75rem] text-suave">{formatearFechaHoraCorta(r.creado_en)}</td>
                    <td><InsigniaEstado estado={r.estado} /></td>
                    <td><InsigniaSemaforo plazo={r.plazo} conDias /></td>
                    <td>
                      <span className="flex flex-nowrap gap-1.5">
                        <Link to={ruta(r.id)} className="btn btn-secundario btn-chico no-underline">Ver detalle<span className="sr-only"> de la hoja {r.numero}</span></Link>
                        {r.estado !== 'respondido' && <Link to={ruta(r.id, true)} className="btn btn-primario btn-chico no-underline">Atender caso<span className="sr-only"> {r.numero}</span></Link>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Celular: tarjetas */}
          <ul className="m-0 grid list-none gap-3 p-0 lg:hidden">
            {items.map((r) => (
              <li key={r.id} className={`tarjeta !p-4 ${r.estado !== 'respondido' && ['vencido', 'rojo', 'ambar'].includes(r.plazo.semaforo) ? `tarjeta-urgente-${r.plazo.semaforo}` : ''}`}>
                <p className="m-0 flex flex-wrap items-center justify-between gap-2">
                  <Link to={ruta(r.id)} className="numero-hoja font-bold">{r.numero}</Link>
                  <InsigniaEstado estado={r.estado} />
                </p>
                <p className="mt-1 mb-0">{r.consumidor_nombres}</p>
                <p className="m-0 text-sm text-suave">
                  {ETIQUETA_TIPO[r.tipo]} · {r.establecimiento.nombre} · {formatearFechaHoraCorta(r.creado_en)}
                </p>
                <p className="mt-2 mb-0"><InsigniaSemaforo plazo={r.plazo} conDias /></p>
                <p className="mt-3 mb-0 flex flex-wrap gap-2">
                  <Link to={ruta(r.id)} className="btn btn-secundario btn-chico no-underline">Ver detalle<span className="sr-only"> de la hoja {r.numero}</span></Link>
                  {r.estado !== 'respondido' && <Link to={ruta(r.id, true)} className="btn btn-primario btn-chico no-underline">Atender caso<span className="sr-only"> {r.numero}</span></Link>}
                </p>
              </li>
            ))}
          </ul>

          <Paginacion pagina={pagina} haySiguiente={haySiguiente} total={total} porPagina={POR_PAGINA} alCambiar={(p) => cambiar('pagina', String(p))} />
        </>
      )}
    </div>
  );
}
