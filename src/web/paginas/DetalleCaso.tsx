import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, ErrorApi } from '../api/cliente';
import { BotonesCarta } from '../carta/BotonesCarta';
import { Entrada, Seleccion } from '../componentes/Campos';
import { CajaError, Cargando, Confirmacion, Dato, InsigniaEstado, InsigniaSemaforo } from '../componentes/Comunes';
import { IcoCorreo, IcoDocumento, IcoFlechaDer, IcoFlechaIzq } from '../componentes/Iconos';
import { useCarga, useTitulo } from '../hooks';
import type { Comunicacion, DetalleReclamo, EstadoComunicacion, MedioComunicacion, Tipo, TipoComunicacion } from '../tipos';
import {
  ETIQUETA_ACCION, ETIQUETA_MEDIO, ETIQUETA_TIPO, fechaLimaDe, formatearFecha, formatearFechaHora, formatearFechaSimple, formatearMonto, hoyEnLima,
} from '../util/formato';

const ETIQUETA_COMUNICACION: Record<TipoComunicacion, string> = {
  constancia_correo: 'Copia de la constancia por correo',
  respuesta_correo: 'Respuesta por correo',
  respuesta_carta: 'Carta de respuesta',
};

const ESTADO_COMUNICACION: Record<EstadoComunicacion, { texto: string; clase: string }> = {
  pendiente: { texto: 'Pendiente de envío', clase: 'sem-ambar' },
  enviado: { texto: 'Enviado', clase: 'sem-verde' },
  fallido: { texto: 'Falló el envío', clase: 'sem-rojo' },
  omitido: { texto: 'No se envía', clase: 'sem-cerrado' },
  pendiente_entrega: { texto: 'Carta generada · pendiente de entrega', clase: 'sem-ambar' },
  entrega_registrada: { texto: 'Entrega registrada', clase: 'sem-verde' },
};

const MAX_INTENTOS = 3;

function FilaComunicacion({
  com, ocupado, alReintentar, alRegistrarEntrega, fechaMinima,
}: {
  com: Comunicacion;
  ocupado: boolean;
  alReintentar: (c: Comunicacion) => void;
  alRegistrarEntrega: (fecha: string, observacion: string) => Promise<string | null>;
  fechaMinima: string;
}) {
  const est = ESTADO_COMUNICACION[com.estado] ?? { texto: com.estado, clase: 'sem-cerrado' };
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState(hoyEnLima());
  const [obs, setObs] = useState('');
  const [errorEntrega, setErrorEntrega] = useState('');
  const idBase = `com-${com.id}`;

  async function enviarEntrega(ev: FormEvent) {
    ev.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      setErrorEntrega('Indique la fecha de entrega.');
      return;
    }
    const e = await alRegistrarEntrega(fecha, obs.trim());
    if (e) setErrorEntrega(e);
  }

  return (
    <li className="subtarjeta" data-testid={`comunicacion-${com.tipo}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 font-semibold">{ETIQUETA_COMUNICACION[com.tipo]}</p>
        <span className={`insignia ${est.clase}`}>{est.texto}</span>
      </div>
      {com.estado === 'entrega_registrada' && (
        <p className="mt-2 mb-0 text-sm">Entrega registrada el {com.fecha_entrega ? formatearFechaSimple(com.fecha_entrega) : formatearFecha(com.actualizado_en)}.</p>
      )}
      {com.detalle && (
        <p className="mt-1.5 mb-0 text-sm text-suave [overflow-wrap:anywhere]">
          {com.estado === 'entrega_registrada' ? 'Observación' : com.estado === 'fallido' ? 'Motivo' : 'Detalle'}: {com.detalle}
        </p>
      )}
      {com.estado === 'omitido' && !com.detalle && (
        <p className="mt-1.5 mb-0 text-sm text-suave">No se envía porque no hay correo o es una dirección de prueba.</p>
      )}
      {(com.estado === 'fallido' || (com.estado === 'pendiente' && com.detalle !== 'enviando')) && (
        <div className="mt-2">
          <p className="m-0 text-sm text-suave">Intentos: {com.intentos} de {MAX_INTENTOS}</p>
          {com.intentos < MAX_INTENTOS ? (
            <button type="button" className="btn btn-secundario btn-chico mt-2" disabled={ocupado} onClick={() => alReintentar(com)}>
              Reintentar<span className="sr-only"> el envío</span>
            </button>
          ) : (
            <p className="mt-1 mb-0 text-sm font-semibold">Se agotaron los intentos de envío.</p>
          )}
        </div>
      )}
      {com.estado === 'pendiente_entrega' && (
        <div className="mt-3">
          {!abierto ? (
            <button type="button" className="btn btn-secundario btn-chico" onClick={() => setAbierto(true)}>
              Registrar entrega
            </button>
          ) : (
            <form onSubmit={enviarEntrega} noValidate aria-labelledby={`${idBase}-t`} className="rounded-lg border border-borde bg-superficie p-3">
              <p id={`${idBase}-t`} className="m-0 mb-2 font-semibold">Registrar entrega de la carta</p>
              <Entrada id={`${idBase}-fecha`} etiqueta="Fecha de entrega" tipo="date" valor={fecha} alCambiar={setFecha} max={hoyEnLima()} requerido />
              <Entrada id={`${idBase}-obs`} etiqueta="Observación" opcional multilinea valor={obs} alCambiar={setObs} maxLength={300} ayuda="Por ejemplo: recibida por un familiar." />
              <p role="alert" className="error-campo">{errorEntrega}</p>
              <div className="flex flex-wrap gap-2">
                <button type="submit" className="btn btn-primario btn-chico" disabled={ocupado}>Guardar entrega</button>
                <button type="button" className="btn btn-secundario btn-chico" onClick={() => setAbierto(false)}>Cancelar</button>
              </div>
              <p className="ayuda mb-0">La fecha no puede ser futura ni anterior a la respuesta ({formatearFecha(fechaMinima)}).</p>
            </form>
          )}
        </div>
      )}
    </li>
  );
}

export function DetalleCaso() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const volver = params.get('volver') ?? '';
  const atender = params.get('atender') === '1';
  useTitulo('Detalle del caso');
  const { datos: caso, setDatos, error, cargando, recargar } = useCarga(
    () => api.obtener<DetalleReclamo>(`/api/reclamos/${encodeURIComponent(id ?? '')}`),
    [id],
  );

  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [errorAccion, setErrorAccion] = useState('');
  const [confirmando, setConfirmando] = useState(false);

  const [texto, setTexto] = useState('');
  const [medio, setMedio] = useState<MedioComunicacion | ''>('');
  const [fecha, setFecha] = useState(hoyEnLima());
  const [erroresResp, setErroresResp] = useState<Record<string, string>>({});
  const [errorResp, setErrorResp] = useState('');
  const seccionResp = useRef<HTMLElement>(null);

  // Al cambiar de caso (Anterior / Siguiente) se limpian formularios y mensajes.
  useEffect(() => {
    setTexto('');
    setMedio('');
    setFecha(hoyEnLima());
    setErroresResp({});
    setErrorResp('');
    setMensaje('');
    setErrorAccion('');
    setConfirmando(false);
  }, [id]);

  // «Atender caso» lleva con el formulario de respuesta a la vista.
  useEffect(() => {
    if (!caso || !atender || caso.respuesta) return;
    seccionResp.current?.scrollIntoView({ block: 'start' });
    document.getElementById('texto')?.focus({ preventScroll: true });
  }, [caso?.id, atender]); // eslint-disable-line react-hooks/exhaustive-deps

  if (cargando) return <Cargando />;
  if (error) return <CajaError error={error.estado === 404 ? 'El caso no existe.' : error.estado === 403 ? 'No tiene permiso para ver este caso.' : error} alReintentar={error.estado === 0 || error.estado >= 500 ? recargar : undefined} />;
  if (!caso) return null;

  const c = caso;
  const con = c.consumidor;
  const coms = c.comunicaciones ?? [];
  const medioHoja = c.medio_respuesta ?? null;
  const volverQ = volver ? `?${volver}` : '';
  const irA = (otro: number) => `/panel/reclamos/${otro}${volver ? `?volver=${encodeURIComponent(volver)}` : ''}`;
  const fechaRespuesta = c.respondido_en ? fechaLimaDe(c.respondido_en) : fechaLimaDe(c.creado_en);

  function textoError(e: unknown, defecto: string) {
    return e instanceof ErrorApi ? e.message : defecto;
  }

  async function refrescar() {
    try {
      setDatos(await api.obtener<DetalleReclamo>(`/api/reclamos/${c.id}`));
    } catch {
      /* se conserva lo que ya se muestra */
    }
  }

  async function patch(cuerpo: { estado?: 'en_atencion'; tipo?: Tipo }, ok: string) {
    if (ocupado) return;
    setOcupado(true);
    setErrorAccion('');
    setMensaje('');
    try {
      setDatos(await api.modificar<DetalleReclamo>(`/api/reclamos/${c.id}`, cuerpo));
      setMensaje(ok);
      setConfirmando(false);
    } catch (e) {
      setErrorAccion(textoError(e, 'No se pudo completar la acción.'));
    } finally {
      setOcupado(false);
    }
  }

  async function responder(ev: FormEvent) {
    ev.preventDefault();
    if (ocupado) return;
    const e: Record<string, string> = {};
    if (!texto.trim()) e.texto = 'Escriba la respuesta para el consumidor.';
    if (!medioHoja && !medio) e.medio_comunicacion = 'Indique cómo se comunicó la respuesta.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) e.fecha_comunicacion = 'Indique la fecha de comunicación.';
    setErroresResp(e);
    setErrorResp('');
    if (Object.keys(e).length) return;
    setOcupado(true);
    try {
      const cuerpo: { texto: string; medio_comunicacion?: MedioComunicacion; fecha_comunicacion: string } = {
        texto: texto.trim(),
        fecha_comunicacion: fecha,
      };
      if (!medioHoja && medio) cuerpo.medio_comunicacion = medio;
      setDatos(await api.crear<DetalleReclamo>(`/api/reclamos/${c.id}/respuesta`, cuerpo));
      setMensaje(
        medioHoja === 'carta'
          ? 'Respuesta registrada. El caso quedó cerrado. La carta quedó pendiente de entrega.'
          : medioHoja === 'correo'
            ? 'Respuesta registrada. El caso quedó cerrado. El correo se enviará si el envío está activo.'
            : 'Respuesta registrada. El caso quedó cerrado.',
      );
    } catch (err) {
      if (err instanceof ErrorApi) {
        setErroresResp(err.campos ?? {});
        setErrorResp(err.estado === 409 ? 'Este caso ya tiene una respuesta registrada.' : err.message);
        if (err.estado === 409) recargar();
      } else setErrorResp('No se pudo registrar la respuesta.');
    } finally {
      setOcupado(false);
    }
  }

  async function reintentar(com: Comunicacion) {
    if (ocupado) return;
    setOcupado(true);
    setErrorAccion('');
    setMensaje('');
    try {
      const nuevo = await api.crear<DetalleReclamo>(`/api/reclamos/${c.id}/comunicaciones/${com.id}/reintentar`);
      setDatos(nuevo);
      setMensaje('Reintento solicitado. Actualizando el estado del envío…');
      setTimeout(async () => {
        try {
          const d = await api.obtener<DetalleReclamo>(`/api/reclamos/${c.id}`);
          setDatos(d);
          const actual = (d.comunicaciones ?? []).find((x) => x.id === com.id);
          if (actual?.estado === 'enviado') setMensaje('El correo se envió correctamente.');
          else if (actual?.estado === 'fallido') setMensaje('');
          else setMensaje('El reintento quedó registrado. Revise el estado en «Comunicaciones».');
          if (actual?.estado === 'fallido') setErrorAccion(`El reintento falló${actual.detalle ? `: ${actual.detalle}` : '.'}`);
        } catch {
          setMensaje('Reintento solicitado. Use «Actualizar estado» para ver el resultado.');
        }
      }, 3000);
    } catch (e) {
      setErrorAccion(e instanceof ErrorApi && e.estado === 409 ? 'No se puede reintentar: el envío ya no está fallido o agotó sus intentos.' : textoError(e, 'No se pudo reintentar el envío.'));
    } finally {
      setOcupado(false);
    }
  }

  async function registrarEntrega(fechaEntrega: string, observacion: string): Promise<string | null> {
    if (ocupado) return null;
    setOcupado(true);
    setErrorAccion('');
    setMensaje('');
    try {
      setDatos(
        await api.crear<DetalleReclamo>(`/api/reclamos/${c.id}/carta/entrega`, {
          fecha_entrega: fechaEntrega,
          ...(observacion ? { observacion } : {}),
        }),
      );
      setMensaje('Entrega de la carta registrada.');
      return null;
    } catch (e) {
      return e instanceof ErrorApi && e.estado === 409 ? 'No hay una carta pendiente de entrega.' : textoError(e, 'No se pudo registrar la entrega.');
    } finally {
      setOcupado(false);
    }
  }

  const otroTipo: Tipo = c.tipo === 'reclamo' ? 'queja' : 'reclamo';
  const cerrado = c.estado === 'respondido';

  return (
    <div>
      <nav aria-label="Navegación entre casos" className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Link to={`/panel/reclamos${volverQ}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold no-underline">
          <IcoFlechaIzq tam={16} />
          Volver a la bandeja
        </Link>
        <span className="flex gap-2">
          {c.anterior_id != null ? (
            <Link to={irA(c.anterior_id)} className="btn btn-secundario btn-chico no-underline" rel="prev"><IcoFlechaIzq tam={16} />Caso anterior</Link>
          ) : (
            <span className="btn btn-secundario btn-chico" aria-disabled="true"><IcoFlechaIzq tam={16} />Caso anterior</span>
          )}
          {c.siguiente_id != null ? (
            <Link to={irA(c.siguiente_id)} className="btn btn-secundario btn-chico no-underline" rel="next">Caso siguiente<IcoFlechaDer tam={16} /></Link>
          ) : (
            <span className="btn btn-secundario btn-chico" aria-disabled="true">Caso siguiente<IcoFlechaDer tam={16} /></span>
          )}
        </span>
      </nav>

      <header className="tarjeta mb-6 !p-0">
        <div className="expediente-cabecera">
          <div className="min-w-0">
            <p className="eyebrow">Expediente digital · {ETIQUETA_TIPO[c.tipo]}</p>
            <h1 className="m-0 mt-1">Hoja N.° <span className="numero-hoja">{c.numero}</span></h1>
            <p className="m-0 mt-1 text-sm text-suave">{c.establecimiento.nombre} ({c.establecimiento.codigo})</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <InsigniaEstado estado={c.estado} />
            <InsigniaSemaforo plazo={c.plazo} />
          </div>
        </div>
        <dl className="dato expediente-datos">
          <Dato etiqueta="Registrada">{formatearFechaHora(c.creado_en)}</Dato>
          <Dato etiqueta="Fecha límite">{formatearFecha(c.plazo.fecha_limite)}</Dato>
          <Dato etiqueta="Plazo">{c.estado === 'respondido' ? 'Atendido' : `${c.plazo.dias_habiles_transcurridos} días hábiles transcurridos`}</Dato>
          <Dato etiqueta="Respuesta solicitada por">{medioHoja ? (medioHoja === 'correo' ? 'Correo electrónico' : 'Carta al domicilio') : 'No indicado'}</Dato>
        </dl>
      </header>

      <div aria-live="polite">
        {mensaje && <p role="status" className="aviso aviso-ok mb-4 font-semibold">{mensaje}</p>}
        {errorAccion && <p role="alert" className="aviso aviso-error mb-4 font-semibold">{errorAccion}</p>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid min-w-0 content-start gap-6">
          <section className="tarjeta" aria-labelledby="t-hoja">
            <h2 id="t-hoja" className="mt-0">Datos del caso</h2>
            <dl className="dato grid gap-x-8 sm:grid-cols-2">
              <Dato etiqueta="Clase de bien">{c.bien.tipo === 'producto' ? 'Producto' : 'Servicio'}</Dato>
              <Dato etiqueta="Monto reclamado">{c.bien.monto != null ? formatearMonto(c.bien.monto) : 'No indicado'}</Dato>
            </dl>
            <dl className="dato m-0">
              <Dato etiqueta="Descripción del bien">{c.bien.descripcion}</Dato>
              <Dato etiqueta="Detalle">{c.detalle}</Dato>
              <Dato etiqueta="Pedido del consumidor">{c.pedido}</Dato>
            </dl>
          </section>

          <section className="tarjeta" aria-labelledby="t-con">
            <h2 id="t-con" className="mt-0">Consumidor</h2>
            <dl className="dato m-0 grid gap-x-8 sm:grid-cols-2">
              <Dato etiqueta="Nombres">{con.nombres}</Dato>
              <Dato etiqueta="Documento">{con.tipo_documento} {con.numero_documento}</Dato>
              {con.domicilio && <Dato etiqueta="Domicilio">{con.domicilio}</Dato>}
              {con.correo && <Dato etiqueta="Correo">{con.correo}</Dato>}
              {con.telefono && <Dato etiqueta="Teléfono">{con.telefono}</Dato>}
              {con.es_menor && <Dato etiqueta="Padre, madre o apoderado">{con.apoderado_nombres}{con.apoderado_contacto ? ` · ${con.apoderado_contacto}` : ''}</Dato>}
            </dl>
          </section>

          <section className="tarjeta" aria-labelledby="t-resp" ref={seccionResp}>
            <h2 id="t-resp" className="mt-0">Respuesta al consumidor</h2>
            {c.respuesta ? (
              <>
                <p className="aviso aviso-info mb-4 text-sm">La respuesta ya fue registrada y no puede editarse.</p>
                <dl className="dato">
                  <Dato etiqueta="Respuesta">{c.respuesta.texto}</Dato>
                  <Dato etiqueta="Medio de comunicación">{c.respuesta.medio_comunicacion === 'correo' ? 'Correo electrónico' : 'Carta'}</Dato>
                  <Dato etiqueta="Fecha de comunicación">{formatearFechaSimple(c.respuesta.fecha_comunicacion)}</Dato>
                  <Dato etiqueta="Registrada por">{c.respuesta.autor} · {formatearFechaHora(c.respuesta.creado_en)}</Dato>
                </dl>
                {c.carta && (
                  <div className="mt-2 border-t border-borde pt-4">
                    <h3 className="mt-0 mb-2 flex items-center gap-2"><IcoDocumento tam={18} />Carta de respuesta</h3>
                    <p className="mt-0 text-sm text-suave">El PDF se genera en este equipo. Puede descargarlo o imprimirlo.</p>
                    <BotonesCarta carta={c.carta} />
                  </div>
                )}
              </>
            ) : (
              <form onSubmit={responder} noValidate>
                <div aria-live="polite">{errorResp && <p className="aviso aviso-error mb-4 font-semibold" role="alert">{errorResp}</p>}</div>
                <Entrada id="texto" etiqueta="Texto de la respuesta" multilinea valor={texto} alCambiar={setTexto} error={erroresResp.texto} maxLength={3000} requerido />
                {medioHoja ? (
                  <p className="aviso aviso-info mb-4 text-sm" data-testid="medio-pedido">
                    <strong>El consumidor pidió la respuesta por {ETIQUETA_MEDIO[medioHoja]}.</strong>{' '}
                    {medioHoja === 'correo'
                      ? `Se enviará a ${con.correo ?? 'su correo'} si el envío de correos está activo.`
                      : 'Se generará una carta para entregar en su domicilio.'}
                  </p>
                ) : (
                  <Seleccion id="medio_comunicacion" etiqueta="Medio de comunicación" valor={medio} alCambiar={(v) => setMedio(v as MedioComunicacion)} marcador="Elija un medio"
                    opciones={[{ valor: 'correo', texto: 'Correo electrónico' }, { valor: 'carta', texto: 'Carta' }]} error={erroresResp.medio_comunicacion} requerido
                    ayuda="Esta hoja es anterior a la elección del medio por el consumidor." />
                )}
                <div className="grid gap-x-4 sm:grid-cols-2">
                  <Entrada id="fecha_comunicacion" etiqueta="Fecha de comunicación" tipo="date" valor={fecha} alCambiar={setFecha} max={hoyEnLima()} error={erroresResp.fecha_comunicacion} requerido />
                </div>
                <p className="ayuda mb-4">Al registrar la respuesta el caso se cierra y ya no podrá modificarse.</p>
                <button type="submit" className="btn btn-primario" disabled={ocupado}>
                  {ocupado ? 'Registrando…' : 'Registrar respuesta'}
                </button>
              </form>
            )}
          </section>

          <section className="tarjeta" aria-labelledby="t-coms">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <h2 id="t-coms" className="m-0 flex items-center gap-2"><IcoCorreo tam={18} />Comunicaciones</h2>
              <button type="button" className="btn btn-secundario btn-chico" onClick={refrescar}>Actualizar estado</button>
            </div>
            <p className="mt-0 mb-3 text-sm text-suave">Estado de los envíos al consumidor. Es independiente del estado del caso.</p>
            {coms.length === 0 ? (
              <p className="m-0 text-suave">Todavía no hay comunicaciones para este caso. Aparecerán al registrar la hoja o la respuesta.</p>
            ) : (
              <ul className="m-0 grid list-none gap-3 p-0">
                {coms.map((com) => (
                  <FilaComunicacion key={com.id} com={com} ocupado={ocupado} alReintentar={reintentar} alRegistrarEntrega={registrarEntrega} fechaMinima={fechaRespuesta} />
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="grid min-w-0 content-start gap-6">
          <section className="tarjeta" aria-labelledby="t-plazo">
            <h2 id="t-plazo" className="mt-0">Estado del caso</h2>
            <p className="mb-3 flex flex-wrap items-center gap-2"><InsigniaEstado estado={c.estado} /> <InsigniaSemaforo plazo={c.plazo} conDias /></p>
            <dl className="dato m-0">
              <Dato etiqueta="Fecha límite">{formatearFecha(c.plazo.fecha_limite)}</Dato>
              <Dato etiqueta="Días hábiles transcurridos">{c.plazo.dias_habiles_transcurridos}</Dato>
              {c.respondido_en && <Dato etiqueta="Respondido">{formatearFechaHora(c.respondido_en)}</Dato>}
            </dl>
          </section>

          {!cerrado && (
            <section className="tarjeta" aria-labelledby="t-acc">
              <h2 id="t-acc" className="mt-0">Acciones</h2>
              <div className="grid gap-3">
                {c.estado === 'registrado' && (
                  <button type="button" className="btn btn-secundario" disabled={ocupado} onClick={() => patch({ estado: 'en_atencion' }, 'El caso quedó en atención.')}>
                    Marcar en atención
                  </button>
                )}
                {!confirmando ? (
                  <button type="button" className="btn btn-secundario" disabled={ocupado} onClick={() => setConfirmando(true)}>
                    Reclasificar como {ETIQUETA_TIPO[otroTipo].toLowerCase()}
                  </button>
                ) : (
                  <Confirmacion
                    id="t-conf"
                    texto={`¿Cambiar esta hoja de ${ETIQUETA_TIPO[c.tipo].toLowerCase()} a ${ETIQUETA_TIPO[otroTipo].toLowerCase()}? Quedará anotado en el historial.`}
                    confirmar="Sí, reclasificar"
                    ocupado={ocupado}
                    alConfirmar={() => patch({ tipo: otroTipo }, `El caso fue reclasificado como ${ETIQUETA_TIPO[otroTipo].toLowerCase()}.`)}
                    alCancelar={() => setConfirmando(false)}
                  />
                )}
              </div>
            </section>
          )}

          <section className="tarjeta" aria-labelledby="t-hist">
            <h2 id="t-hist" className="mt-0">Historial</h2>
            {c.eventos.length === 0 ? (
              <p className="m-0 text-suave">Sin eventos.</p>
            ) : (
              <ol className="m-0 list-none space-y-4 border-l border-borde p-0 pl-5">
                {c.eventos.map((ev, i) => (
                  <li key={i} className="relative">
                    <span aria-hidden="true" className="absolute -left-[1.55rem] top-1.5 h-2 w-2 rounded-full bg-acento ring-4 ring-superficie" />
                    <p className="m-0 text-sm font-semibold">{ETIQUETA_ACCION[ev.accion] ?? ev.accion}</p>
                    {ev.detalle && <p className="m-0 text-sm">{ev.detalle}</p>}
                    <p className="m-0 text-xs text-suave">
                      {formatearFechaHora(ev.creado_en)}{ev.autor ? ` · ${ev.autor}` : ''}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
