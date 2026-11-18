import { useState, type FormEvent } from 'react';
import { api } from '../api/cliente';
import { Entrada, Seleccion } from '../componentes/Campos';
import { CajaError, Cargando, EstadoVacio, InsigniaEstado, Titulo } from '../componentes/Comunes';
import { IcoDescargar } from '../componentes/Iconos';
import { exportarCsv, exportarPdf } from '../reportes/exportar';
import { useCarga, useTitulo } from '../hooks';
import { useSesion } from '../sesion';
import type { Empresa, Establecimiento, Estado, Indicadores as IndicadoresT, Reporte, Tipo } from '../tipos';
import { ETIQUETA_SEMAFORO, ETIQUETA_TIPO, formatearFecha, formatearFechaHoraCorta, formatearFechaSimple, hoyEnLima, sumarDias } from '../util/formato';
import { Cifra } from './Indicadores';

interface Filtros {
  desde: string;
  hasta: string;
  tipo: Tipo | '';
  estado: Estado | '';
  establecimiento: string;
}

function periodoInicial(): Pick<Filtros, 'desde' | 'hasta'> {
  const hoy = hoyEnLima();
  return { desde: sumarDias(hoy, -29), hasta: hoy };
}

const num = (n: number | null, sufijo = '') => (n == null ? '—' : `${String(n).replace('.', ',')}${sufijo}`);

function BarraPct({ valor, clase }: { valor: number; clase: string }) {
  return (
    <span className="barra-pista mt-1 w-full" aria-hidden="true">
      <span className={`barra-relleno ${clase}`} style={{ width: `${Math.min(100, Math.max(0, valor))}%` }} />
    </span>
  );
}

function TarjetasResumen({ r }: { r: IndicadoresT }) {
  return (
    <div className="cifras cifras-3">
      <Cifra etiqueta="Total de hojas" valor={r.total} nota={`${r.respondidos} respondidas · ${r.pendientes} pendientes`} />
      <Cifra etiqueta="Cumplimiento del plazo" valor={num(r.cumplimiento_pct, ' %')} nota={r.respondidos ? 'Respondidos dentro de los 15 días hábiles' : 'Aún sin respuestas'} />
      <Cifra etiqueta="Tiempo promedio de respuesta" valor={num(r.promedio_dias_habiles_respuesta)} nota="días hábiles" />
      <Cifra etiqueta="Respondidos" valor={r.respondidos} nota={`${r.respondidos_en_plazo} en plazo · ${r.respondidos_fuera_de_plazo} fuera de plazo`} />
      <Cifra etiqueta="Pendientes" valor={r.pendientes} nota="Registrados o en atención" />
      <Cifra etiqueta="Vencidos" valor={r.vencidos} tono={r.vencidos > 0 ? 'alerta' : undefined} nota="Pendientes fuera de plazo" />
    </div>
  );
}

export function Reportes() {
  const { usuario } = useSesion();
  const admin = usuario?.rol === 'admin';
  useTitulo(admin ? 'Reportes' : 'Reportes de mi tienda');

  const [form, setForm] = useState<Filtros>({ ...periodoInicial(), tipo: '', estado: '', establecimiento: '' });
  const [aplicados, setAplicados] = useState<Filtros>(form);
  const [errorForm, setErrorForm] = useState('');
  const [exportando, setExportando] = useState<'' | 'csv' | 'pdf'>('');
  const [avisoExport, setAvisoExport] = useState('');
  const [errorExport, setErrorExport] = useState('');

  const poner = <K extends keyof Filtros>(k: K, v: Filtros[K]) => setForm((a) => ({ ...a, [k]: v }));

  const { datos: tiendas } = useCarga(
    () => (admin ? api.obtener<Establecimiento[]>('/api/admin/establecimientos') : Promise.resolve([] as Establecimiento[])),
    [admin],
  );

  const { datos: r, error, cargando, recargar } = useCarga(() => {
    const q = new URLSearchParams({ desde: aplicados.desde, hasta: aplicados.hasta });
    if (aplicados.tipo) q.set('tipo', aplicados.tipo);
    if (aplicados.estado) q.set('estado', aplicados.estado);
    if (admin && aplicados.establecimiento) q.set('establecimiento', aplicados.establecimiento);
    return api.obtener<Reporte>(`/api/reportes?${q.toString()}`);
  }, [aplicados, admin]);

  function aplicar(f: Filtros) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.desde) || !/^\d{4}-\d{2}-\d{2}$/.test(f.hasta)) return setErrorForm('Indique las fechas «Desde» y «Hasta».');
    if (f.desde > f.hasta) return setErrorForm('La fecha «Desde» no puede ser posterior a «Hasta».');
    if (new Date(f.hasta).getTime() - new Date(f.desde).getTime() > 366 * 86400000) return setErrorForm('El periodo no puede superar 366 días.');
    setErrorForm('');
    setAvisoExport('');
    setErrorExport('');
    setAplicados(f);
  }

  function enviar(ev: FormEvent) {
    ev.preventDefault();
    aplicar(form);
  }

  function atajo(desde: string, hasta: string) {
    const f = { ...form, desde, hasta };
    setForm(f);
    aplicar(f);
  }
  const hoy = hoyEnLima();
  const primeroMes = `${hoy.slice(0, 7)}-01`;
  const finMesAnterior = sumarDias(primeroMes, -1);
  const primeroMesAnterior = `${finMesAnterior.slice(0, 7)}-01`;

  async function exportar(tipo: 'csv' | 'pdf') {
    if (!r || exportando) return;
    setExportando(tipo);
    setAvisoExport('');
    setErrorExport('');
    try {
      if (tipo === 'csv') {
        exportarCsv(r);
        setAvisoExport('Archivo CSV generado. Puede abrirlo con Excel; no contiene datos personales.');
      } else {
        let empresa: Empresa | null = null;
        try {
          empresa = await api.obtener<Empresa>('/api/publico/empresa');
        } catch {
          empresa = null;
        }
        await exportarPdf(r, empresa);
        setAvisoExport('Archivo PDF generado en su equipo; no contiene datos personales.');
      }
    } catch {
      setErrorExport('No se pudo generar el archivo. Inténtelo de nuevo.');
    } finally {
      setExportando('');
    }
  }

  const titulo = admin ? 'Reportes' : 'Reportes de mi tienda';
  const mostrarComparacion = !!r && (admin || r.por_establecimiento.length > 1);
  const maxTotal = r ? Math.max(...r.por_establecimiento.map((e) => e.total), 0) : 0;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-7">
      <Titulo etiqueta="Analítica" subtitulo={admin ? 'Indicadores y casos por periodo, sin datos personales' : `${usuario?.establecimiento?.nombre ?? ''} · indicadores y casos por periodo, sin datos personales`}>{titulo}</Titulo>

      <form className="tarjeta filtros-reporte" onSubmit={enviar} aria-label="Filtros del reporte" noValidate>
        <div className="grid gap-x-8 gap-y-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend>Periodo</legend>
            <div className="grid gap-x-3 sm:grid-cols-2">
              <Entrada id="r-desde" etiqueta="Desde" tipo="date" valor={form.desde} alCambiar={(v) => poner('desde', v)} max={hoy} />
              <Entrada id="r-hasta" etiqueta="Hasta" tipo="date" valor={form.hasta} alCambiar={(v) => poner('hasta', v)} max={hoy} />
            </div>
          </fieldset>
          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend>Criterios</legend>
            <div className={`grid gap-x-3 ${admin ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
              <Seleccion id="r-tipo" etiqueta="Tipo" valor={form.tipo} alCambiar={(v) => poner('tipo', v as Tipo | '')} marcador="Todos"
                opciones={[{ valor: 'reclamo', texto: 'Reclamo' }, { valor: 'queja', texto: 'Queja' }]} />
              <Seleccion id="r-estado" etiqueta="Estado" valor={form.estado} alCambiar={(v) => poner('estado', v as Estado | '')} marcador="Todos"
                opciones={[{ valor: 'registrado', texto: 'Registrado' }, { valor: 'en_atencion', texto: 'En atención' }, { valor: 'respondido', texto: 'Respondido' }]} />
              {admin && (
                <Seleccion id="r-tienda" etiqueta="Establecimiento" valor={form.establecimiento} alCambiar={(v) => poner('establecimiento', v)} marcador="Todos"
                  opciones={(tiendas ?? []).map((t) => ({ valor: t.codigo, texto: t.nombre }))} />
              )}
            </div>
          </fieldset>
        </div>
        <div aria-live="polite">{errorForm && <p role="alert" className="aviso aviso-error my-3 font-semibold">{errorForm}</p>}</div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-borde pt-4">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Atajos de periodo">
            <span className="text-[0.8125rem] font-semibold text-suave">Atajos:</span>
            <button type="button" className="btn btn-secundario btn-chico" onClick={() => atajo(sumarDias(hoy, -29), hoy)}>Últimos 30 días</button>
            <button type="button" className="btn btn-secundario btn-chico" onClick={() => atajo(primeroMes, hoy)}>Este mes</button>
            <button type="button" className="btn btn-secundario btn-chico" onClick={() => atajo(primeroMesAnterior, finMesAnterior)}>Mes anterior</button>
          </div>
          <button type="submit" className="btn btn-primario max-sm:w-full" disabled={cargando}>Aplicar filtros</button>
        </div>
      </form>

      {error && <CajaError error={error} alReintentar={recargar} />}
      {cargando && <Cargando texto="Generando el reporte…" />}

      {!cargando && !error && r && (
        <>
          <p className="m-0 -mt-3 text-sm text-suave" data-testid="periodo-reporte">
            Periodo: {formatearFechaSimple(r.filtros.desde)} al {formatearFechaSimple(r.filtros.hasta)} · generado el {formatearFechaHoraCorta(r.generado_en)} (hora de Lima)
          </p>

          {r.resumen.total === 0 ? (
            <EstadoVacio titulo="No hay casos en este periodo">Pruebe con otro periodo o quite algún filtro.</EstadoVacio>
          ) : (
            <>
              <section aria-labelledby="t-res">
                <h2 id="t-res" className="titulo-bloque">Resumen</h2>
                <TarjetasResumen r={r.resumen} />
              </section>

              {mostrarComparacion && (
                <section className="tarjeta" aria-labelledby="t-comp">
                  <h2 id="t-comp" className="mt-0">Comparación entre establecimientos</h2>
                  <div className="hidden lg:block" data-testid="tabla-comparacion">
                    <table className="tabla tabla-fija">
                      <caption className="sr-only">Indicadores por establecimiento</caption>
                      <colgroup>
                        <col style={{ width: '27%' }} />
                        <col style={{ width: '15%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '16%' }} />
                        <col style={{ width: '12%' }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th scope="col">Establecimiento</th>
                          <th scope="col" className="num">Total</th>
                          <th scope="col" className="num"><abbr title="Respondidos">Resp.</abbr></th>
                          <th scope="col" className="num"><abbr title="Pendientes">Pend.</abbr></th>
                          <th scope="col" className="num"><abbr title="Vencidos">Venc.</abbr></th>
                          <th scope="col" className="num"><abbr title="Cumplimiento del plazo">Cumpl.</abbr></th>
                          <th scope="col" className="num"><abbr title="Promedio de días hábiles de respuesta">Prom. d. háb.</abbr></th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.por_establecimiento.map((e) => (
                          <tr key={e.codigo}>
                            <th scope="row">{e.nombre} <span className="numero-hoja font-normal text-suave">({e.codigo})</span></th>
                            <td className="num"><strong>{e.total}</strong><BarraPct valor={maxTotal ? (e.total / maxTotal) * 100 : 0} clase="c-marca" /></td>
                            <td className="num">{e.respondidos}</td>
                            <td className="num">{e.pendientes}</td>
                            <td className="num">{e.vencidos}</td>
                            <td className="num"><strong>{num(e.cumplimiento_pct, ' %')}</strong>{e.cumplimiento_pct != null && <BarraPct valor={e.cumplimiento_pct} clase="c-verde" />}</td>
                            <td className="num">{num(e.promedio_dias_habiles_respuesta)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <ul className="m-0 grid list-none gap-3 p-0 lg:hidden">
                    {r.por_establecimiento.map((e) => (
                      <li key={e.codigo} className="subtarjeta">
                        <p className="m-0 font-semibold">{e.nombre} <span className="font-normal text-suave">({e.codigo})</span></p>
                        <p className="mt-1 mb-1 text-sm">{e.total} casos · {e.respondidos} respondidos · {e.pendientes} pendientes · {e.vencidos} vencidos</p>
                        <p className="m-0 text-sm">Cumplimiento: <strong>{num(e.cumplimiento_pct, ' %')}</strong> · Promedio: <strong>{num(e.promedio_dias_habiles_respuesta)}</strong> días hábiles</p>
                        <div className="mt-2"><BarraPct valor={e.cumplimiento_pct ?? 0} clase="c-verde" /></div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="tarjeta" aria-labelledby="t-casos">
                <h2 id="t-casos" className="mt-0">Casos del periodo</h2>
                {r.truncado && (
                  <p role="status" className="aviso aviso-ambar mb-4 font-semibold">
                    Hay más de 500 casos con estos filtros. Se muestran los 500 más recientes; acote el periodo para ver el resto. Los indicadores sí consideran todos los casos.
                  </p>
                )}
                <div className="hidden lg:block">
                  <table className="tabla">
                    <caption className="sr-only">Casos del periodo, sin datos personales</caption>
                    <thead>
                      <tr>
                        <th scope="col">Número</th>
                        <th scope="col">Tipo</th>
                        <th scope="col">Estado</th>
                        <th scope="col">Tienda</th>
                        <th scope="col">Registrado</th>
                        <th scope="col">Respondido</th>
                        <th scope="col" className="num"><abbr title="Días hábiles hasta la respuesta, o transcurridos si sigue pendiente">Días háb.</abbr></th>
                        <th scope="col">Plazo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.casos.map((c) => (
                        <tr key={c.numero}>
                          <td className="numero-hoja font-semibold">{c.numero}</td>
                          <td>{ETIQUETA_TIPO[c.tipo]}</td>
                          <td><InsigniaEstado estado={c.estado} /></td>
                          <td className="whitespace-nowrap">{c.establecimiento_codigo}</td>
                          <td className="whitespace-nowrap">{formatearFecha(c.creado_en)}</td>
                          <td className="whitespace-nowrap">{c.respondido_en ? formatearFecha(c.respondido_en) : '—'}</td>
                          <td className="num">{c.dias_habiles}</td>
                          <td><span className={`insignia sem-${c.semaforo}`}>{ETIQUETA_SEMAFORO[c.semaforo]}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ul className="m-0 grid list-none gap-3 p-0 lg:hidden">
                  {r.casos.map((c) => (
                    <li key={c.numero} className="subtarjeta">
                      <p className="m-0 flex flex-wrap items-center justify-between gap-2">
                        <span className="numero-hoja font-semibold">{c.numero}</span>
                        <InsigniaEstado estado={c.estado} />
                      </p>
                      <p className="m-0 text-sm text-suave">{ETIQUETA_TIPO[c.tipo]} · {c.establecimiento_codigo} · registrado {formatearFechaHoraCorta(c.creado_en)}</p>
                      <p className="mt-1 mb-0 text-sm">
                        {c.respondido_en ? `Respondido ${formatearFechaHoraCorta(c.respondido_en)}` : 'Sin responder'} · {c.dias_habiles} días háb.{' '}
                        <span className={`insignia sem-${c.semaforo}`}>{ETIQUETA_SEMAFORO[c.semaforo]}</span>
                      </p>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="tarjeta" aria-labelledby="t-export">
                <h2 id="t-export" className="mt-0">Exportar</h2>
                <p className="mt-0 mb-4 text-sm text-suave">Los archivos se generan en su equipo y no contienen datos personales.</p>
                <div className="flex flex-wrap gap-3">
                  <button type="button" className="btn btn-primario" disabled={!!exportando} onClick={() => exportar('csv')}>
                    <IcoDescargar tam={18} />
                    {exportando === 'csv' ? 'Generando…' : 'Exportar CSV (compatible con Excel)'}
                  </button>
                  <button type="button" className="btn btn-secundario" disabled={!!exportando} onClick={() => exportar('pdf')}>
                    <IcoDescargar tam={18} />
                    {exportando === 'pdf' ? 'Generando…' : 'Exportar a PDF'}
                  </button>
                </div>
                <div aria-live="polite">
                  {avisoExport && <p role="status" className="mt-3 mb-0 text-sm font-semibold text-ok-texto">{avisoExport}</p>}
                  {errorExport && <p role="alert" className="mt-3 mb-0 text-sm font-semibold text-alerta-texto">{errorExport}</p>}
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
