import { useState } from 'react';
import { api, normalizarLista } from '../api/cliente';
import { CajaError, Cargando, EstadoVacio, Paginacion, Titulo } from '../componentes/Comunes';
import { useCarga, useTitulo } from '../hooks';
import type { EventoGeneral } from '../tipos';
import { ETIQUETA_ACCION, formatearFechaHoraCorta } from '../util/formato';

const POR_PAGINA = 50;

export function Historial() {
  useTitulo('Historial general');
  const [pagina, setPagina] = useState(1);
  const { datos, error, cargando, recargar } = useCarga(
    async () => normalizarLista<EventoGeneral>(await api.obtener<unknown>(`/api/admin/eventos?pagina=${pagina}`)),
    [pagina],
  );
  const items = datos?.items ?? [];
  const total = datos?.total ?? null;
  const haySiguiente = total != null ? pagina * POR_PAGINA < total : items.length === POR_PAGINA;

  return (
    <div>
      <Titulo subtitulo="Registro de acciones de todo el sistema, de la más reciente a la más antigua">Historial</Titulo>
      {error && <CajaError error={error} alReintentar={recargar} />}
      {cargando && <Cargando />}
      {!cargando && !error && items.length === 0 && <EstadoVacio titulo="No hay eventos en esta página" />}
      {!cargando && items.length > 0 && (
        <>
          <div className="tarjeta hidden overflow-x-auto !p-0 md:block">
            <table className="tabla">
              <caption className="sr-only">Historial general de eventos</caption>
              <thead>
                <tr>
                  <th scope="col">Fecha (Lima)</th>
                  <th scope="col">Acción</th>
                  <th scope="col">Hoja</th>
                  <th scope="col">Autor</th>
                  <th scope="col">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {items.map((e, i) => (
                  <tr key={`${e.creado_en}-${i}`}>
                    <td className="whitespace-nowrap">{formatearFechaHoraCorta(e.creado_en)}</td>
                    <td className="font-semibold">{ETIQUETA_ACCION[e.accion] ?? e.accion}</td>
                    <td className="whitespace-nowrap">{e.numero ?? '—'}</td>
                    <td>{e.autor ?? '—'}</td>
                    <td className="break-words">{e.detalle ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="m-0 grid list-none gap-3 p-0 md:hidden">
            {items.map((e, i) => (
              <li key={`m-${e.creado_en}-${i}`} className="tarjeta !p-4">
                <p className="m-0 font-bold">{ETIQUETA_ACCION[e.accion] ?? e.accion}</p>
                <p className="m-0 text-sm text-suave">{formatearFechaHoraCorta(e.creado_en)}</p>
                {e.detalle && <p className="mt-1 mb-0 text-sm [overflow-wrap:anywhere]">{e.detalle}</p>}
                <p className="mt-1 mb-0 text-sm text-suave [overflow-wrap:anywhere]">{e.autor ?? 'Sistema'}{e.numero ? ` · ${e.numero}` : ''}</p>
              </li>
            ))}
          </ul>
          <Paginacion pagina={pagina} haySiguiente={haySiguiente} total={total} porPagina={POR_PAGINA} alCambiar={setPagina} />
        </>
      )}
    </div>
  );
}
