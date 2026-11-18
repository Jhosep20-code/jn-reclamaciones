import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ErrorApi } from '../api/cliente';
import { BotonesCarta } from '../carta/BotonesCarta';
import { Entrada } from '../componentes/Campos';
import { Cargando, CajaError, Dato, InsigniaEstado, InsigniaSemaforo } from '../componentes/Comunes';
import { IcoVisto } from '../componentes/Iconos';
import { useTitulo } from '../hooks';
import type { Estado, EtapaSeguimiento, RespuestaSegura, Seguimiento } from '../tipos';
import { ETIQUETA_ESTADO, ETIQUETA_MEDIO, ETIQUETA_TIPO, formatearFecha, formatearFechaHora } from '../util/formato';

const ORDEN_ETAPAS: Estado[] = ['registrado', 'en_atencion', 'respondido'];

/** Si el servidor no envía las etapas, se deducen de los datos básicos. */
function etapasDe(r: Seguimiento): EtapaSeguimiento[] {
  if (r.etapas && r.etapas.length === 3) return r.etapas;
  return [
    { etapa: 'registrado', fecha: r.creado_en },
    { etapa: 'en_atencion', fecha: null },
    { etapa: 'respondido', fecha: r.respondido_en },
  ];
}

function LineaDeTiempo({ r }: { r: Seguimiento }) {
  const etapas = etapasDe(r);
  const actual = ORDEN_ETAPAS.indexOf(r.estado);
  return (
    <section aria-labelledby="t-linea" className="mt-5 border-t border-borde pt-5">
      <h3 id="t-linea" className="mt-0 mb-4">Avance de su reclamación</h3>
      <ol className="linea-tiempo m-0 list-none p-0" data-testid="linea-tiempo">
        {etapas.map((e, i) => {
          // Si el caso ya se respondió y nunca se registró la etapa de atención, no se presenta como completada.
          const noRegistrada = e.etapa === 'en_atencion' && !e.fecha && actual === 2;
          const completada = !noRegistrada && (i < actual || (i === actual && actual === 2));
          const enCurso = i === actual && actual < 2;
          const estadoTxt = noRegistrada ? 'No registrada' : completada ? 'Completada' : enCurso ? 'Etapa actual' : 'Pendiente';
          return (
            <li
              key={e.etapa}
              className={`linea-paso ${completada ? 'completa' : ''} ${enCurso ? 'actual' : ''} ${noRegistrada ? 'omitida' : ''}`}
              aria-current={enCurso ? 'step' : undefined}
            >
              <span className="linea-marca" aria-hidden="true">
                {completada ? <IcoVisto tam={16} /> : enCurso ? <span className="block h-2 w-2 rounded-full bg-acento" /> : null}
              </span>
              <div className="min-w-0">
                <p className="m-0 font-semibold">
                  {ETIQUETA_ESTADO[e.etapa]} <span className="linea-estado">· {estadoTxt}</span>
                </p>
                <p className="m-0 text-sm text-suave">
                  {e.fecha
                    ? formatearFechaHora(e.fecha)
                    : noRegistrada
                      ? 'El caso se respondió sin registrar una etapa de atención'
                      : 'Fecha por definir'}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function tiempoDeEspera(segundos?: number): string {
  if (!segundos) return 'unos minutos';
  if (segundos < 90) return `${segundos} segundos`;
  const min = Math.ceil(segundos / 60);
  return `${min} minutos`;
}

function ConsultaSegura({ codigo, seguimiento }: { codigo: string; seguimiento: Seguimiento }) {
  const [documento, setDocumento] = useState('');
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [respuesta, setRespuesta] = useState<RespuestaSegura | null>(null);

  // Al cambiar de código se descarta todo lo consultado: nada se guarda.
  useEffect(() => {
    setDocumento('');
    setMensaje('');
    setRespuesta(null);
  }, [codigo]);

  async function consultar(ev: FormEvent) {
    ev.preventDefault();
    if (cargando) return;
    const doc = documento.trim();
    if (!doc) {
      setMensaje('Escriba su número de documento.');
      return;
    }
    setCargando(true);
    setMensaje('');
    try {
      const r = await api.crear<RespuestaSegura>(`/api/seguimiento/${encodeURIComponent(codigo)}/respuesta`, { numero_documento: doc });
      setRespuesta(r);
      setDocumento('');
    } catch (e) {
      if (e instanceof ErrorApi && e.estado === 403) setMensaje('No pudimos verificar sus datos. Revise el número de documento e inténtelo de nuevo.');
      else if (e instanceof ErrorApi && e.estado === 409) setMensaje('Este caso aún no tiene una respuesta.');
      else if (e instanceof ErrorApi && e.estado === 429) setMensaje(`Hubo demasiados intentos para este código. Espere ${tiempoDeEspera(e.reintentarEn)} antes de volver a intentar.`);
      else setMensaje(e instanceof ErrorApi ? e.message : 'No se pudo consultar la respuesta.');
    } finally {
      setCargando(false);
    }
  }

  return (
    <section className="tarjeta mt-5" aria-labelledby="t-consulta">
      <h2 id="t-consulta" className="mt-0">Consultar la respuesta</h2>
      {seguimiento.medio_respuesta && (
        <p className="mb-3 text-sm">Usted pidió recibir la respuesta por {ETIQUETA_MEDIO[seguimiento.medio_respuesta]}.</p>
      )}
      {!respuesta ? (
        <form onSubmit={consultar} noValidate>
          <p className="mt-0 text-sm text-suave">
            La respuesta contiene datos personales. Para verla, confirme su identidad con el número de documento que usó al registrar la reclamación.
          </p>
          <Entrada
            id="numero_documento_consulta"
            etiqueta="Número de documento"
            valor={documento}
            alCambiar={setDocumento}
            autoComplete="off"
            maxLength={12}
            ayuda="No guardamos este dato: se descarta al salir de esta página."
            requerido
          />
          <div aria-live="polite">{mensaje && <p role="alert" className="aviso aviso-error mb-4 font-semibold">{mensaje}</p>}</div>
          <button type="submit" className="btn btn-primario w-full sm:w-auto" disabled={cargando}>
            {cargando && <span className="spinner" aria-hidden="true" />}
            {cargando ? 'Verificando…' : 'Ver la respuesta'}
          </button>
        </form>
      ) : (
        <div data-testid="respuesta-segura">
          <p role="status" className="aviso aviso-ok mb-4 font-semibold">Verificación correcta. Esta es la respuesta a su Hoja N.° {respuesta.numero}.</p>
          <dl className="dato">
            <Dato etiqueta="Fecha de la respuesta">{formatearFecha(respuesta.respuesta.fecha_emision)}</Dato>
            <Dato etiqueta="Respuesta">{respuesta.respuesta.texto}</Dato>
          </dl>
          <h3 className="mt-2 mb-2">Carta de respuesta</h3>
          <p className="mt-0 text-sm text-suave">El PDF se genera en su dispositivo; no se envía a ningún servidor.</p>
          <BotonesCarta carta={respuesta.carta} />
        </div>
      )}
    </section>
  );
}

export function PaginaSeguimiento() {
  useTitulo('Consultar mi reclamo');
  const { codigo } = useParams();
  const navegar = useNavigate();
  const [entrada, setEntrada] = useState(codigo ?? '');
  const [resultado, setResultado] = useState<Seguimiento | null>(null);
  const [error, setError] = useState<ErrorApi | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    setResultado(null);
    setError(null);
    if (!codigo) return;
    let vigente = true;
    setCargando(true);
    api.obtener<Seguimiento>(`/api/seguimiento/${encodeURIComponent(codigo)}`).then(
      (r) => vigente && (setResultado(r), setCargando(false)),
      (e: unknown) => vigente && (setError(e instanceof ErrorApi ? e : new ErrorApi(0, 'Ocurrió un error inesperado.')), setCargando(false)),
    );
    return () => {
      vigente = false;
    };
  }, [codigo]);

  function buscar(e: FormEvent) {
    e.preventDefault();
    const limpio = entrada.trim();
    if (limpio) navegar(`/seguimiento/${encodeURIComponent(limpio)}`);
  }

  const tienda = resultado ? (typeof resultado.establecimiento === 'string' ? resultado.establecimiento : resultado.establecimiento.nombre) : '';

  return (
    <div className="contenedor-angosto">
      <p className="eyebrow">Libro de Reclamaciones Virtual</p>
      <h1 className="mt-1 mb-2">Consultar mi reclamo</h1>
      <p className="mb-7 text-sm text-suave">Escriba el código de seguimiento de 32 caracteres que recibió al registrar su reclamación. Por su seguridad, aquí no se muestran datos personales.</p>

      <form onSubmit={buscar} className="tarjeta mb-6" noValidate>
        <Entrada
          id="codigo"
          etiqueta="Código de seguimiento"
          valor={entrada}
          alCambiar={setEntrada}
          autoComplete="off"
          maxLength={64}
        />
        <button type="submit" className="btn btn-primario w-full sm:w-auto" disabled={cargando || !entrada.trim()}>
          {cargando && <span className="spinner" aria-hidden="true" />}
          {cargando ? 'Consultando…' : 'Consultar'}
        </button>
      </form>

      <div aria-live="polite">
        {cargando && <Cargando texto="Consultando…" />}
        {error && (
          <CajaError error={error.estado === 404 ? 'No encontramos una reclamación con ese código. Revise que esté completo y sin espacios.' : error} />
        )}
        {resultado && (
          <section className="tarjeta" aria-labelledby="t-resultado">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-2 border-b border-borde pb-4">
              <h2 id="t-resultado" className="m-0 !text-lg">Hoja N.° <span className="numero-hoja">{resultado.numero}</span></h2>
              <InsigniaEstado estado={resultado.estado} />
            </div>
            <dl className="dato grid gap-x-8 sm:grid-cols-2">
              <Dato etiqueta="Tipo">{ETIQUETA_TIPO[resultado.tipo]}</Dato>
              <Dato etiqueta="Estado actual">{ETIQUETA_ESTADO[resultado.estado]}</Dato>
              <Dato etiqueta="Establecimiento">{tienda}</Dato>
              <Dato etiqueta="Registrada el">{formatearFechaHora(resultado.creado_en)}</Dato>
              <Dato etiqueta="Fecha límite de respuesta">{formatearFecha(resultado.plazo.fecha_limite)}</Dato>
              <Dato etiqueta="Plazo"><InsigniaSemaforo plazo={resultado.plazo} conDias /></Dato>
              {resultado.respondido_en && <Dato etiqueta="Respondida el">{formatearFechaHora(resultado.respondido_en)}</Dato>}
            </dl>
            <LineaDeTiempo r={resultado} />
          </section>
        )}
        {resultado && codigo && (resultado.tiene_respuesta ? (
          <ConsultaSegura codigo={codigo} seguimiento={resultado} />
        ) : (
          <p className="aviso aviso-info mt-5 text-sm">
            {resultado.medio_respuesta ? `Usted pidió recibir la respuesta por ${ETIQUETA_MEDIO[resultado.medio_respuesta]}. ` : ''}
            Cuando su caso tenga respuesta, podrá consultarla aquí con su número de documento.
          </p>
        ))}
      </div>
    </div>
  );
}
