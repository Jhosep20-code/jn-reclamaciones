import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, normalizarLista } from '../api/cliente';
import { CajaError, Cargando, EstadoVacio, InsigniaEstado, InsigniaSemaforo, Titulo } from '../componentes/Comunes';
import { useCarga, useTitulo } from '../hooks';
import { useSesion } from '../sesion';
import type { Panel, ResumenReclamo, Semaforo } from '../tipos';
import { ETIQUETA_ESTADO, ETIQUETA_SEMAFORO, ETIQUETA_TIPO, formatearFechaHoraCorta } from '../util/formato';

/** Indicador: etiqueta pequeña, cifra grande (Manrope) y nota. Va dentro de una banda `.cifras`; la alerta se marca con un punto, no con color de texto. */
export function Cifra({
  etiqueta,
  valor,
  nota,
  tono,
}: {
  etiqueta: string;
  valor: ReactNode;
  nota?: string;
  tono?: 'alerta';
  principal?: boolean;
}) {
  return (
    <div>
      <p className="cifra-etiqueta">
        {tono === 'alerta' && <span className="punto punto-vencido" aria-hidden="true" />}
        {etiqueta}
      </p>
      <p className="cifra-valor my-2 text-[2rem]">{valor}</p>
      {nota ? <p className="cifra-nota">{nota}</p> : <p className="cifra-nota" aria-hidden="true">&nbsp;</p>}
    </div>
  );
}

/** Barra horizontal de un gráfico CSS: etiqueta, pista, valor y, si se indica, porcentaje del total. */
export function Barra({ etiqueta, valor, maximo, clase, total }: { etiqueta: string; valor: number; maximo: number; clase: string; total?: number }) {
  const ancho = maximo > 0 ? Math.max(valor > 0 ? 2 : 0, (valor / maximo) * 100) : 0;
  const pct = total && total > 0 ? Math.round((valor / total) * 100) : null;
  return (
    <li className="grid grid-cols-[6.5rem_1fr_4.6rem] items-center gap-3 sm:grid-cols-[8rem_1fr_5rem]">
      <span className="text-sm text-suave">{etiqueta}</span>
      <span className="barra-pista" aria-hidden="true">
        <span className={`barra-relleno ${clase}`} style={{ width: `${ancho}%` }} />
      </span>
      <span className="text-right text-sm tabular-nums">
        <strong className="font-semibold">{valor}</strong>
        {pct !== null && <span className="text-suave"> · {pct}%</span>}
      </span>
    </li>
  );
}

const CLASE_SEM: Record<Semaforo, string> = {
  verde: 'c-verde',
  ambar: 'c-ambar',
  rojo: 'c-rojo',
  vencido: 'c-vencido',
  cerrado: 'c-cerrado',
};

const SEM_ALERTA: { clave: Semaforo; ayuda: string }[] = [
  { clave: 'vencido', ayuda: 'Pasó el plazo de 15 días hábiles' },
  { clave: 'rojo', ayuda: 'Vencen en 1 día hábil o menos' },
  { clave: 'ambar', ayuda: 'Quedan pocos días hábiles' },
  { clave: 'verde', ayuda: 'Dentro del plazo' },
];

function TarjetaSemaforo({ sem, ayuda, valor, ruta }: { sem: Semaforo; ayuda: string; valor: number; ruta: string }) {
  return (
    <Link to={ruta}>
      <span className="cifra-etiqueta">
        <span className={`punto punto-${sem}`} aria-hidden="true" />
        {ETIQUETA_SEMAFORO[sem]}
      </span>
      <span className="cifra-valor my-2 block text-[2rem]">{valor}</span>
      <span className="cifra-nota block">{ayuda}</span>
    </Link>
  );
}

function Urgentes({ titulo, vacio, mostrarTienda }: { titulo: string; vacio: string; mostrarTienda: boolean }) {
  const { datos, cargando, error, recargar } = useCarga(async () => {
    const todos: ResumenReclamo[] = [];
    for (let p = 1; p <= 5; p++) {
      const { items } = normalizarLista<ResumenReclamo>(await api.obtener<unknown>(`/api/reclamos?pagina=${p}`));
      todos.push(...items);
      if (items.length < 20) break;
    }
    return todos
      .filter((c) => c.estado !== 'respondido' && c.plazo.semaforo !== 'verde' && c.plazo.semaforo !== 'cerrado')
      .sort((a, b) => a.plazo.dias_habiles_restantes - b.plazo.dias_habiles_restantes);
  }, []);
  const lista = datos ?? [];
  return (
    <section className="tarjeta" aria-labelledby="t-urgentes">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="t-urgentes" className="m-0">{titulo}</h2>
        <Link to="/panel/reclamos" className="text-sm font-semibold">Ver todos los casos</Link>
      </div>
      {cargando && <Cargando />}
      {error && <CajaError error={error} alReintentar={recargar} />}
      {!cargando && !error && lista.length === 0 && <p className="m-0 text-suave">{vacio}</p>}
      {lista.length > 0 && (
        <ul className="lista-casos">
          {lista.slice(0, 8).map((c) => (
            <li key={c.id}>
              <div className="min-w-0">
                <span className="caso-numero">
                  <span className={`punto punto-${c.plazo.semaforo}`} aria-hidden="true" />
                  <Link to={`/panel/reclamos/${c.id}`} className="numero-hoja">{c.numero}</Link>
                </span>
                <p className="m-0 mt-0.5 pl-[1.05rem] text-sm text-suave">
                  {c.consumidor_nombres} · {ETIQUETA_TIPO[c.tipo]}
                  {mostrarTienda ? ` · ${c.establecimiento.nombre}` : ''} · <InsigniaEstado estado={c.estado} />
                </p>
                <p className="m-0 pl-[1.05rem] text-xs text-suave">Registrado el {formatearFechaHoraCorta(c.creado_en)}</p>
              </div>
              <InsigniaSemaforo plazo={c.plazo} conDias />
            </li>
          ))}
        </ul>
      )}
      {lista.length > 8 && <p className="mt-3 mb-0 text-sm text-suave">Se muestran los 8 más urgentes de {lista.length}.</p>}
    </section>
  );
}

export function Indicadores() {
  useTitulo('Indicadores');
  const { usuario } = useSesion();
  const admin = usuario?.rol === 'admin';
  const { datos: p, error, cargando, recargar } = useCarga(() => api.obtener<Panel>('/api/panel'), []);

  const titulo = admin ? 'Vista general' : 'Mi tienda';
  const subtitulo = admin ? 'Resumen de todas las tiendas' : `${usuario?.establecimiento?.nombre ?? ''} · lo que requiere su atención`;
  if (cargando) return (<div><Titulo subtitulo={subtitulo}>{titulo}</Titulo><Cargando /></div>);
  if (error) return <CajaError error={error} alReintentar={recargar} />;
  if (!p) return null;

  const maxEst = Math.max(...Object.values(p.por_estado), 0);
  const maxTipo = Math.max(...Object.values(p.por_tipo), 0);
  const maxTienda = Math.max(...p.por_establecimiento.map((e) => e.total), 0);
  const respondidos = p.respondidos_en_plazo + p.respondidos_fuera_de_plazo;
  const pct = respondidos > 0 ? Math.round((p.respondidos_en_plazo / respondidos) * 100) : null;
  const pendientes = (p.por_estado.registrado ?? 0) + (p.por_estado.en_atencion ?? 0);
  const vencidas = p.por_semaforo.vencido ?? 0;
  const porVencer = (p.por_semaforo.rojo ?? 0) + (p.por_semaforo.ambar ?? 0);
  const totalSem = Object.values(p.por_semaforo).reduce((a, b) => a + b, 0);
  const acciones = !admin ? (
    <div className="flex flex-wrap gap-2">
      <Link to="/panel/reclamos" className="btn btn-primario btn-chico no-underline">Ver casos de mi tienda</Link>
      <Link to="/panel/reportes" className="btn btn-secundario btn-chico no-underline">Reportes de mi tienda</Link>
    </div>
  ) : undefined;

  return (
    <div className="grid gap-8">
      <Titulo
        etiqueta={admin ? 'Administración' : usuario?.establecimiento ? `Tienda · ${usuario.establecimiento.codigo}` : 'Tienda'}
        subtitulo={subtitulo}
        acciones={acciones}
      >
        {titulo}
      </Titulo>

      <section aria-labelledby="t-resumen" className="-mt-3">
        <h2 id="t-resumen" className="sr-only">Indicadores principales</h2>
        <div className="cifras cifras-6">
          <Cifra etiqueta="Total de hojas" valor={p.total} nota={`${p.por_tipo.reclamo ?? 0} reclamos · ${p.por_tipo.queja ?? 0} quejas`} />
          <Cifra etiqueta="Pendientes" valor={pendientes} nota="Registradas o en atención" />
          <Cifra etiqueta="Por vencer" valor={porVencer} nota="Quedan pocos días hábiles" />
          <Cifra etiqueta="Vencidas" valor={vencidas} tono={vencidas > 0 ? 'alerta' : undefined} nota="Pendientes fuera de plazo" />
          <Cifra etiqueta="Respondidas" valor={p.por_estado.respondido ?? 0} />
          <Cifra
            etiqueta="Cumplimiento"
            valor={pct !== null ? `${pct}%` : '—'}
            nota={respondidos ? `${p.respondidos_en_plazo} en plazo · ${p.respondidos_fuera_de_plazo} fuera` : 'Aún sin respuestas'}
          />
        </div>
      </section>

      {!admin && <Urgentes titulo="Casos que requieren atención" vacio="No hay casos próximos a vencer. Buen trabajo." mostrarTienda={false} />}

      <section aria-labelledby="t-plazos">
        <h2 id="t-plazos" className="titulo-bloque">Estado de los plazos</h2>
        <div className="cifras cifras-4">
          {SEM_ALERTA.map((s) => (
            <TarjetaSemaforo key={s.clave} sem={s.clave} ayuda={s.ayuda} valor={p.por_semaforo[s.clave] ?? 0} ruta="/panel/reclamos" />
          ))}
        </div>
      </section>

      {admin && <Urgentes titulo="Casos que requieren atención" vacio="Ningún caso está por vencer ni vencido." mostrarTienda />}

      {admin && (
        <section className="tarjeta" aria-labelledby="t-tiendas">
          <h2 id="t-tiendas" className="mt-0">Comparación entre establecimientos</h2>
          {p.por_establecimiento.length === 0 ? (
            <EstadoVacio titulo="Aún no hay datos">Cuando se registren hojas aparecerán aquí por tienda.</EstadoVacio>
          ) : (
            <ul className="m-0 grid list-none gap-4 p-0">
              {p.por_establecimiento.map((e) => (
                <li key={e.codigo} className="grid items-center gap-x-6 gap-y-1.5 md:grid-cols-[minmax(0,15rem)_1fr_auto]">
                  <p className="m-0 text-sm font-semibold">
                    {e.nombre} <span className="numero-hoja text-xs font-normal text-suave">({e.codigo})</span>
                  </p>
                  <span className="barra-pista" aria-hidden="true">
                    <span className="barra-relleno c-marca" style={{ width: `${maxTienda ? (e.total / maxTienda) * 100 : 0}%` }} />
                  </span>
                  <p className="m-0 flex items-center gap-5 text-sm tabular-nums text-suave">
                    <span><strong className="font-semibold text-texto">{e.total}</strong> total</span>
                    <span><strong className="font-semibold text-texto">{e.pendientes}</strong> pendientes</span>
                    <Link to={`/panel/reclamos?establecimiento=${encodeURIComponent(e.codigo)}`} className="font-semibold">
                      Ver casos<span className="sr-only"> de {e.nombre}</span>
                    </Link>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="tarjeta" aria-labelledby="t-estado">
          <h2 id="t-estado" className="mt-0">Casos por estado</h2>
          <ul className="m-0 grid list-none gap-3.5 p-0">
            {(Object.keys(ETIQUETA_ESTADO) as (keyof typeof ETIQUETA_ESTADO)[]).map((k) => (
              <Barra key={k} etiqueta={ETIQUETA_ESTADO[k]} valor={p.por_estado[k] ?? 0} maximo={maxEst} total={p.total} clase="c-marca" />
            ))}
          </ul>
          <h3 className="mt-6 mb-3.5 border-t border-borde pt-5 text-xs font-bold uppercase tracking-widest text-suave">Por tipo de hoja</h3>
          <ul className="m-0 grid list-none gap-3.5 p-0">
            <Barra etiqueta="Reclamos" valor={p.por_tipo.reclamo ?? 0} maximo={maxTipo} total={p.total} clase="c-oro" />
            <Barra etiqueta="Quejas" valor={p.por_tipo.queja ?? 0} maximo={maxTipo} total={p.total} clase="c-info" />
          </ul>
        </section>
        <section className="tarjeta" aria-labelledby="t-sem">
          <h2 id="t-sem" className="mt-0">Semáforo de plazos</h2>
          {totalSem > 0 && (
            <div className="barra-apilada mb-5" role="img" aria-label={(Object.keys(ETIQUETA_SEMAFORO) as Semaforo[]).map((k) => `${ETIQUETA_SEMAFORO[k]}: ${p.por_semaforo[k] ?? 0}`).join(', ')}>
              {(Object.keys(ETIQUETA_SEMAFORO) as Semaforo[]).filter((k) => (p.por_semaforo[k] ?? 0) > 0).map((k) => (
                <span key={k} className={CLASE_SEM[k]} style={{ width: `${((p.por_semaforo[k] ?? 0) / totalSem) * 100}%` }} />
              ))}
            </div>
          )}
          <ul className="m-0 grid list-none gap-3.5 p-0">
            {(Object.keys(ETIQUETA_SEMAFORO) as Semaforo[]).map((k) => (
              <Barra key={k} etiqueta={ETIQUETA_SEMAFORO[k]} valor={p.por_semaforo[k] ?? 0} maximo={Math.max(...Object.values(p.por_semaforo), 0)} total={totalSem} clase={CLASE_SEM[k]} />
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
