import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ErrorApi } from '../api/cliente';
import { Casilla, Entrada, GrupoOpciones, Seleccion } from '../componentes/Campos';
import { Cargando, nombreEmpresa } from '../componentes/Comunes';
import { useEmpresa } from '../empresa';
import { useCarga, useTitulo } from '../hooks';
import type { Constancia, Establecimiento, MedioComunicacion, SolicitudReclamo, Tipo, TipoBien, TipoDocumento } from '../tipos';

interface Formulario {
  establecimiento_codigo: string;
  tipo: Tipo | '';
  medio_respuesta: MedioComunicacion | '';
  nombres: string;
  tipo_documento: TipoDocumento;
  numero_documento: string;
  domicilio: string;
  telefono: string;
  correo: string;
  es_menor: boolean;
  apoderado_nombres: string;
  apoderado_contacto: string;
  bien_tipo: TipoBien | '';
  bien_descripcion: string;
  monto: string;
  detalle: string;
  pedido: string;
  acepta: boolean;
}

const INICIAL: Formulario = {
  establecimiento_codigo: '',
  tipo: '',
  medio_respuesta: '',
  nombres: '',
  tipo_documento: 'DNI',
  numero_documento: '',
  domicilio: '',
  telefono: '',
  correo: '',
  es_menor: false,
  apoderado_nombres: '',
  apoderado_contacto: '',
  bien_tipo: '',
  bien_descripcion: '',
  monto: '',
  detalle: '',
  pedido: '',
  acepta: false,
};

type Errores = Record<string, string>;

// Orden visual de los campos, para llevar el foco al primero con error.
const ORDEN = [
  'establecimiento_codigo', 'tipo', 'consumidor.nombres', 'consumidor.tipo_documento', 'consumidor.numero_documento',
  'medio_respuesta', 'consumidor.domicilio', 'consumidor.telefono', 'consumidor.correo', 'consumidor.apoderado_nombres', 'consumidor.apoderado_contacto',
  'bien.tipo', 'bien.descripcion', 'bien.monto', 'detalle', 'pedido', 'acepta_tratamiento_datos',
];

const idCampo = (clave: string) => clave.replace(/\./g, '_');
const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parsearMonto(texto: string): number | null {
  const t = texto.trim().replace(',', '.');
  if (!t) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
  return Number(t);
}

function validar(f: Formulario): Errores {
  const e: Errores = {};
  if (!f.establecimiento_codigo) e.establecimiento_codigo = 'Elija el establecimiento donde ocurrió el hecho.';
  if (!f.tipo) e.tipo = 'Elija si es un reclamo o una queja.';
  const nombres = f.nombres.trim();
  if (nombres.length < 3 || nombres.length > 120) e['consumidor.nombres'] = 'Escriba sus nombres y apellidos (de 3 a 120 caracteres).';
  const doc = f.numero_documento.trim();
  if (f.tipo_documento === 'DNI') {
    if (!/^\d{8}$/.test(doc)) e['consumidor.numero_documento'] = 'El DNI debe tener exactamente 8 dígitos.';
  } else if (doc.length < 8 || doc.length > 12) {
    e['consumidor.numero_documento'] = 'El número de documento debe tener de 8 a 12 caracteres.';
  }
  if (!f.medio_respuesta) e.medio_respuesta = 'Elija cómo desea recibir la respuesta.';
  if (f.medio_respuesta === 'correo' && !f.correo.trim()) e['consumidor.correo'] = 'Para recibir la respuesta por correo, escriba su correo electrónico.';
  if (f.medio_respuesta === 'carta' && !f.domicilio.trim()) e['consumidor.domicilio'] = 'Para recibir la respuesta por carta, escriba su domicilio.';
  if (!f.medio_respuesta && !f.domicilio.trim() && !f.correo.trim()) {
    e['consumidor.domicilio'] = 'Indique su domicilio o su correo electrónico.';
  }
  if (f.correo.trim() && !REGEX_CORREO.test(f.correo.trim())) e['consumidor.correo'] = 'Escriba un correo válido, por ejemplo nombre@ejemplo.com.';
  if (f.es_menor && !f.apoderado_nombres.trim()) e['consumidor.apoderado_nombres'] = 'Escriba los nombres del padre, madre o apoderado.';
  if (!f.bien_tipo) e['bien.tipo'] = 'Indique si se trata de un producto o un servicio.';
  if (!f.bien_descripcion.trim()) e['bien.descripcion'] = 'Describa el producto o servicio.';
  const monto = parsearMonto(f.monto);
  if (monto !== null && (Number.isNaN(monto) || monto < 0)) e['bien.monto'] = 'Escriba un monto en soles con hasta 2 decimales, por ejemplo 59.90.';
  const detalle = f.detalle.trim().length;
  if (detalle < 10 || detalle > 3000) e.detalle = 'Cuéntenos lo ocurrido (de 10 a 3000 caracteres).';
  const pedido = f.pedido.trim().length;
  if (pedido < 5 || pedido > 1500) e.pedido = 'Indique qué solicita (de 5 a 1500 caracteres).';
  if (!f.acepta) e.acepta_tratamiento_datos = 'Debe aceptar el tratamiento de sus datos personales para registrar la reclamación.';
  return e;
}

function construir(f: Formulario): SolicitudReclamo {
  const opc = (v: string) => (v.trim() ? v.trim() : undefined);
  const monto = parsearMonto(f.monto);
  return {
    establecimiento_codigo: f.establecimiento_codigo,
    tipo: f.tipo as Tipo,
    medio_respuesta: f.medio_respuesta as MedioComunicacion,
    consumidor: {
      nombres: f.nombres.trim(),
      tipo_documento: f.tipo_documento,
      numero_documento: f.numero_documento.trim(),
      domicilio: opc(f.domicilio),
      telefono: opc(f.telefono),
      correo: opc(f.correo),
      es_menor: f.es_menor,
      apoderado_nombres: f.es_menor ? opc(f.apoderado_nombres) : undefined,
      apoderado_contacto: f.es_menor ? opc(f.apoderado_contacto) : undefined,
    },
    bien: {
      tipo: f.bien_tipo as TipoBien,
      descripcion: f.bien_descripcion.trim(),
      ...(monto !== null && !Number.isNaN(monto) ? { monto } : {}),
    },
    detalle: f.detalle.trim(),
    pedido: f.pedido.trim(),
    acepta_tratamiento_datos: true,
  };
}

function Seccion({ numero, titulo, children }: { numero: number; titulo: string; children: React.ReactNode }) {
  return (
    <fieldset className="tarjeta seccion-form">
      <legend>
        <span aria-hidden="true" className="seccion-numero">{numero}</span>
        {titulo}
      </legend>
      <div>{children}</div>
    </fieldset>
  );
}

export function Registro() {
  useTitulo('Registrar una reclamación');
  const { codigoEstablecimiento } = useParams();
  const navegar = useNavigate();
  const { datos: tiendas, error: errorTiendas, cargando } = useCarga(
    () => api.obtener<Establecimiento[]>('/api/publico/establecimientos'),
    [],
  );
  const [f, setF] = useState<Formulario>(INICIAL);
  const [errores, setErrores] = useState<Errores>({});
  const [errorGeneral, setErrorGeneral] = useState('');
  const [enviando, setEnviando] = useState(false);
  const bloqueo = useRef(false);
  const resumen = useRef<HTMLDivElement>(null);
  const [tiendaNoValida, setTiendaNoValida] = useState(false);
  const empresa = useEmpresa();

  const poner = <K extends keyof Formulario>(k: K, v: Formulario[K]) => setF((a) => ({ ...a, [k]: v }));

  // Preselecciona la tienda del código QR.
  useEffect(() => {
    if (!tiendas || !codigoEstablecimiento) return;
    const existe = tiendas.some((t) => t.codigo === codigoEstablecimiento.toUpperCase());
    if (existe) setF((a) => ({ ...a, establecimiento_codigo: codigoEstablecimiento.toUpperCase() }));
    else setTiendaNoValida(true);
  }, [tiendas, codigoEstablecimiento]);

  function mostrarErrores(e: Errores, general: string) {
    setErrores(e);
    setErrorGeneral(general);
    requestAnimationFrame(() => {
      resumen.current?.focus();
      const primera = ORDEN.find((k) => e[k]) ?? Object.keys(e)[0];
      if (primera) document.getElementById(idCampo(primera))?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    if (bloqueo.current) return;
    const e = validar(f);
    if (Object.keys(e).length > 0) {
      mostrarErrores(e, 'Revise los campos marcados antes de enviar.');
      return;
    }
    bloqueo.current = true;
    setEnviando(true);
    setErrores({});
    setErrorGeneral('');
    try {
      const constancia = await api.crear<Constancia>('/api/reclamos', construir(f));
      navegar('/constancia', { state: { constancia }, replace: true });
      return;
    } catch (err) {
      if (err instanceof ErrorApi) {
        mostrarErrores(err.campos ?? {}, err.estado === 429 ? 'Se enviaron demasiadas solicitudes. Espere unos minutos e inténtelo de nuevo.' : err.message);
      } else {
        mostrarErrores({}, 'Ocurrió un error inesperado.');
      }
    }
    bloqueo.current = false;
    setEnviando(false);
  }

  const err = (k: string) => errores[k];
  const listaErrores = ORDEN.filter((k) => errores[k]);
  const otros = Object.keys(errores).filter((k) => !ORDEN.includes(k));

  if (cargando) return <div className="contenedor-angosto"><Cargando texto="Cargando el formulario…" /></div>;

  return (
    <div className="contenedor-angosto">
      <p className="eyebrow">Libro de Reclamaciones Virtual{empresa ? ` · ${nombreEmpresa(empresa.razon_social)}` : ''}</p>
      <h1 className="mt-1 mb-2">Hoja de Reclamación</h1>
      <p className="mb-7 text-sm text-suave">Complete las cuatro secciones. Los campos sin la marca «opcional» son obligatorios.</p>

      {errorTiendas && <p role="alert" className="aviso aviso-error mb-5">No se pudo cargar la lista de establecimientos. Recargue la página.</p>}
      {tiendaNoValida && (
        <p role="status" className="aviso aviso-ambar mb-5">
          El código de establecimiento del enlace no corresponde a uno activo. Elija el establecimiento de la lista.
        </p>
      )}

      <div ref={resumen} tabIndex={-1} aria-live="assertive" className="outline-none">
        {(errorGeneral || listaErrores.length > 0 || otros.length > 0) && (
          <div className="aviso aviso-error mb-5" role="alert">
            <p className="m-0 font-bold">{errorGeneral || 'Revise los campos marcados.'}</p>
            {(listaErrores.length > 0 || otros.length > 0) && (
              <ul className="mt-2 mb-0 list-disc pl-5">
                {listaErrores.map((k) => (
                  <li key={k}><a href={`#${idCampo(k)}`}>{errores[k]}</a></li>
                ))}
                {otros.map((k) => (
                  <li key={k}>{errores[k]}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <form onSubmit={enviar} noValidate>
        <Seccion numero={1} titulo="¿Dónde y qué ocurrió?">
          <Seleccion
            id="establecimiento_codigo"
            etiqueta="Establecimiento"
            valor={f.establecimiento_codigo}
            alCambiar={(v) => poner('establecimiento_codigo', v)}
            marcador="Elija un establecimiento"
            opciones={(tiendas ?? []).map((t) => ({ valor: t.codigo, texto: `${t.nombre} — ${t.ciudad}` }))}
            error={err('establecimiento_codigo')}
            requerido
          />
          <div id="tipo">
            <GrupoOpciones<Tipo>
              nombre="tipo"
              leyenda="Tipo de hoja"
              valor={f.tipo}
              alCambiar={(v) => poner('tipo', v)}
              error={err('tipo')}
              opciones={[
                { valor: 'reclamo', titulo: 'Reclamo', descripcion: 'Disconformidad con un producto o un servicio.' },
                { valor: 'queja', titulo: 'Queja', descripcion: 'Disconformidad con la atención al público, sin relación con el producto o servicio.' },
              ]}
            />
          </div>
          <dl className="subtarjeta m-0 grid gap-1.5 text-sm" aria-label="Qué es un reclamo y qué es una queja">
            <div><dt className="inline font-bold">Reclamo: </dt><dd className="m-0 inline">disconformidad con los productos o servicios adquiridos.</dd></div>
            <div><dt className="inline font-bold">Queja: </dt><dd className="m-0 inline">malestar o descontento por la atención al público, sin relación con el producto o servicio.</dd></div>
          </dl>
        </Seccion>

        <Seccion numero={2} titulo="Sus datos">
          <Entrada id="consumidor_nombres" etiqueta="Nombres y apellidos" valor={f.nombres} alCambiar={(v) => poner('nombres', v)} error={err('consumidor.nombres')} autoComplete="name" maxLength={120} requerido />
          <div className="grid gap-x-4 sm:grid-cols-[11rem_1fr]">
            <Seleccion
              id="consumidor_tipo_documento"
              etiqueta="Tipo de documento"
              valor={f.tipo_documento}
              alCambiar={(v) => poner('tipo_documento', v as TipoDocumento)}
              opciones={[{ valor: 'DNI', texto: 'DNI' }, { valor: 'CE', texto: 'Carné de extranjería' }, { valor: 'PASAPORTE', texto: 'Pasaporte' }]}
              error={err('consumidor.tipo_documento')}
            />
            <Entrada
              id="consumidor_numero_documento"
              etiqueta="Número de documento"
              valor={f.numero_documento}
              alCambiar={(v) => poner('numero_documento', v)}
              error={err('consumidor.numero_documento')}
              inputMode={f.tipo_documento === 'DNI' ? 'numeric' : 'text'}
              maxLength={12}
              autoComplete="off"
              requerido
            />
          </div>
          <div id="medio_respuesta">
            <GrupoOpciones<MedioComunicacion>
              nombre="medio_respuesta"
              leyenda="¿Cómo desea recibir la respuesta?"
              valor={f.medio_respuesta}
              alCambiar={(v) => poner('medio_respuesta', v)}
              error={err('medio_respuesta')}
              opciones={[
                { valor: 'correo', titulo: 'Correo electrónico', descripcion: 'Necesitamos su correo electrónico.' },
                { valor: 'carta', titulo: 'Carta al domicilio', descripcion: 'Necesitamos su domicilio.' },
              ]}
            />
          </div>
          <p className="ayuda -mt-2 mb-4">Si elige correo, escriba su correo electrónico; si elige carta, escriba su domicilio. El otro dato es opcional.</p>
          <Entrada id="consumidor_domicilio" etiqueta="Domicilio" opcional={f.medio_respuesta !== 'carta'} requerido={f.medio_respuesta === 'carta'} valor={f.domicilio} alCambiar={(v) => poner('domicilio', v)} error={err('consumidor.domicilio')} autoComplete="street-address" maxLength={200} />
          <Entrada id="consumidor_correo" etiqueta="Correo electrónico" opcional={f.medio_respuesta !== 'correo'} requerido={f.medio_respuesta === 'correo'} tipo="email" valor={f.correo} alCambiar={(v) => poner('correo', v)} error={err('consumidor.correo')} autoComplete="email" maxLength={120} />
          <Entrada id="consumidor_telefono" etiqueta="Teléfono" opcional tipo="tel" valor={f.telefono} alCambiar={(v) => poner('telefono', v)} error={err('consumidor.telefono')} autoComplete="tel" maxLength={20} />

          <Casilla id="es_menor" marcada={f.es_menor} alCambiar={(v) => poner('es_menor', v)} texto="La persona que reclama es menor de edad" />
          {f.es_menor && (
            <div className="subtarjeta mb-4">
              <Entrada id="consumidor_apoderado_nombres" etiqueta="Nombres del padre, madre o apoderado" valor={f.apoderado_nombres} alCambiar={(v) => poner('apoderado_nombres', v)} error={err('consumidor.apoderado_nombres')} maxLength={120} requerido />
              <Entrada id="consumidor_apoderado_contacto" etiqueta="Teléfono o correo del apoderado" opcional valor={f.apoderado_contacto} alCambiar={(v) => poner('apoderado_contacto', v)} error={err('consumidor.apoderado_contacto')} maxLength={120} />
            </div>
          )}
        </Seccion>

        <Seccion numero={3} titulo="Producto o servicio">
          <Seleccion
            id="bien_tipo"
            etiqueta="Se trata de"
            valor={f.bien_tipo}
            alCambiar={(v) => poner('bien_tipo', v as TipoBien)}
            marcador="Elija una opción"
            opciones={[{ valor: 'producto', texto: 'Un producto' }, { valor: 'servicio', texto: 'Un servicio' }]}
            error={err('bien.tipo')}
            requerido
          />
          <Entrada id="bien_descripcion" etiqueta="Descripción del producto o servicio" valor={f.bien_descripcion} alCambiar={(v) => poner('bien_descripcion', v)} error={err('bien.descripcion')} maxLength={300} requerido ayuda="Por ejemplo: marca, modelo o tipo de servicio." />
          <Entrada id="bien_monto" etiqueta="Monto reclamado en soles (S/)" opcional valor={f.monto} alCambiar={(v) => poner('monto', v)} error={err('bien.monto')} inputMode="decimal" maxLength={12} ayuda="Use punto para los céntimos, por ejemplo 59.90." />
        </Seccion>

        <Seccion numero={4} titulo="Su reclamación">
          <Entrada id="detalle" etiqueta="Detalle de lo ocurrido" multilinea valor={f.detalle} alCambiar={(v) => poner('detalle', v)} error={err('detalle')} maxLength={3000} requerido ayuda="Cuéntenos qué pasó, cuándo y dónde. Mínimo 10 caracteres." />
          <Entrada id="pedido" etiqueta="Pedido concreto" multilinea valor={f.pedido} alCambiar={(v) => poner('pedido', v)} error={err('pedido')} maxLength={1500} requerido ayuda="¿Qué solución espera de la empresa?" />

          <div className="subtarjeta mb-4 text-sm" id="aviso-privacidad">
            <p className="m-0 mb-1 font-semibold">Aviso de privacidad</p>
            <p className="m-0">
              Sus datos personales se usarán solo para atender esta reclamación, conforme a la Ley N.° 29733, Ley de Protección de Datos Personales. Se almacenan en servidores ubicados fuera del Perú. Usted puede ejercer sus derechos de acceso, rectificación, cancelación y oposición ante la empresa.
            </p>
          </div>
          <Casilla
            id="acepta_tratamiento_datos"
            marcada={f.acepta}
            alCambiar={(v) => poner('acepta', v)}
            error={err('acepta_tratamiento_datos')}
            texto="He leído el aviso de privacidad y acepto el tratamiento de mis datos personales para atender esta reclamación."
          />
        </Seccion>

        <div className="flex flex-col items-stretch gap-3 pb-4 sm:flex-row sm:items-center">
          <button type="submit" className="btn btn-primario btn-grande sm:min-w-64" disabled={enviando} aria-busy={enviando}>
            {enviando && <span className="spinner" aria-hidden="true" />}
            {enviando ? 'Enviando…' : 'Enviar hoja de reclamación'}
          </button>
          <p className="ayuda m-0">Al enviar recibirá una constancia imprimible y un código de seguimiento.</p>
        </div>
      </form>
    </div>
  );
}
