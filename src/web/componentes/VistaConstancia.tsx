import { Link } from 'react-router-dom';
import { MARCA } from '../../compartido/marca';
import type { Constancia } from '../tipos';
import { ETIQUETA_MEDIO, ETIQUETA_TIPO, formatearFecha, formatearFechaHora, formatearMonto } from '../util/formato';
import { BotonCopiar, Dato, InsigniaSemaforo, nombreEmpresa } from './Comunes';
import { Isotipo } from '../marca/Logo';
import { IcoImprimir, IcoReloj } from './Iconos';

export const LEYENDA_INDECOPI =
  'La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante el INDECOPI.';
export const LEYENDA_PLAZO =
  'El proveedor debe dar respuesta al reclamo o queja en un plazo no mayor a quince (15) días hábiles, el cual es improrrogable.';

const TEXTO_CORREO: Record<string, string> = {
  pendiente: 'Le enviaremos una copia de esta constancia a su correo electrónico. Si no la ve en unos minutos, revise su carpeta de correo no deseado (spam).',
  omitido: 'No se envió copia por correo: no indicó un correo electrónico o es una dirección de prueba.',
  desactivado: 'El envío de correos está desactivado en este prototipo. Guarde o imprima esta constancia.',
};

export function VistaConstancia({ constancia: c }: { constancia: Constancia }) {
  const { hoja, empresa, establecimiento } = c;
  const con = hoja.consumidor;
  return (
    <article className="constancia tarjeta" aria-labelledby="titulo-constancia">
      <header className="constancia-cabecera">
        <div className="constancia-emisor">
          <Isotipo tam={46} />
          <div className="min-w-0">
            <p className="eyebrow">Libro de Reclamaciones Virtual</p>
            <p className="mt-1 mb-0 font-[family-name:var(--font-titulo)] text-lg font-bold leading-snug tracking-tight">{nombreEmpresa(empresa.razon_social)}</p>
            <p className="m-0 text-[0.8125rem] leading-snug text-suave">
              RUC {empresa.ruc}
              <br />
              {empresa.direccion_fiscal}
            </p>
          </div>
        </div>
        <div className="hoja-numero min-w-0">
          <h1 id="titulo-constancia" className="m-0 !text-base">
            <span className="eyebrow block">Hoja de Reclamación</span>
            <span className="numero numero-hoja">N.° {c.numero}</span>
          </h1>
        </div>
      </header>

      <div className="codigo-seguimiento mb-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 max-sm:text-center max-sm:justify-center">
        <div className="min-w-0">
          <p className="eyebrow">Su código de seguimiento</p>
          <p className="codigo-valor mt-1 mb-0" data-testid="codigo-seguimiento">
            {c.codigo_seguimiento}
          </p>
        </div>
        <div className="no-imprimir flex flex-wrap items-center justify-center gap-3">
          <BotonCopiar texto={c.codigo_seguimiento} etiqueta="Copiar código" />
        </div>
      </div>

      <div className="no-imprimir aviso aviso-ambar mb-6" role="note">
        <strong>Guarde este código ahora.</strong> Es la única forma de consultar el estado de su reclamación. No se puede recuperar si lo pierde.
      </div>
      <p className="imprimir-solo mb-4 font-semibold">Guarde este código: es la única forma de consultar el estado de su reclamación.</p>

      <dl className="dato grid gap-x-8 sm:grid-cols-2">
        <Dato etiqueta="Fecha y hora de registro">{formatearFechaHora(c.creado_en)}</Dato>
        <Dato etiqueta="Fecha límite de respuesta">
          <span className="inline-flex flex-wrap items-center gap-2">
            {formatearFecha(c.plazo.fecha_limite)} <InsigniaSemaforo plazo={c.plazo} />
          </span>
        </Dato>
        <Dato etiqueta="Tipo">{ETIQUETA_TIPO[c.tipo]}</Dato>
        <Dato etiqueta="Establecimiento">
          {establecimiento.nombre} ({establecimiento.codigo})
          <br />
          {establecimiento.direccion}, {establecimiento.ciudad}
        </Dato>
      </dl>

      {(c.medio_respuesta || c.correo_constancia) && (
        <section aria-labelledby="t-medio" className="subtarjeta mb-2">
          <h2 id="t-medio" className="mt-0 mb-2 flex items-center gap-2 !text-[0.9375rem]">
            <IcoReloj tam={18} />
            Respuesta y copia por correo
          </h2>
          {c.medio_respuesta && (
            <p className="m-0 mb-1 text-[0.9375rem]">
              <strong>Medio elegido para recibir la respuesta:</strong> {ETIQUETA_MEDIO[c.medio_respuesta]}.
            </p>
          )}
          {c.correo_constancia && (
            <p className="m-0 text-[0.9375rem]" data-testid="estado-correo-constancia">
              <strong>Copia de la constancia:</strong> {TEXTO_CORREO[c.correo_constancia] ?? ''}
            </p>
          )}
        </section>
      )}

      <h2 className="seccion-titulo">Datos del consumidor</h2>
      <dl className="dato grid gap-x-8 sm:grid-cols-2">
        <Dato etiqueta="Nombres y apellidos">{con.nombres}</Dato>
        <Dato etiqueta="Documento">{con.tipo_documento} {con.numero_documento}</Dato>
        {con.domicilio && <Dato etiqueta="Domicilio">{con.domicilio}</Dato>}
        {con.telefono && <Dato etiqueta="Teléfono">{con.telefono}</Dato>}
        {con.correo && <Dato etiqueta="Correo electrónico">{con.correo}</Dato>}
        {con.es_menor && (
          <>
            <Dato etiqueta="Padre, madre o apoderado">{con.apoderado_nombres}</Dato>
            {con.apoderado_contacto && <Dato etiqueta="Contacto del apoderado">{con.apoderado_contacto}</Dato>}
          </>
        )}
      </dl>

      <h2 className="seccion-titulo">Bien contratado</h2>
      <dl className="dato grid gap-x-8 sm:grid-cols-2">
        <Dato etiqueta="Clase">{hoja.bien.tipo === 'producto' ? 'Producto' : 'Servicio'}</Dato>
        <Dato etiqueta="Monto reclamado">{hoja.bien.monto != null ? formatearMonto(hoja.bien.monto) : 'No indicado'}</Dato>
      </dl>
      <dl className="dato">
        <Dato etiqueta="Descripción">{hoja.bien.descripcion}</Dato>
      </dl>

      <h2 className="seccion-titulo">Detalle y pedido</h2>
      <dl className="dato">
        <Dato etiqueta="Detalle">{hoja.detalle}</Dato>
        <Dato etiqueta="Pedido del consumidor">{hoja.pedido}</Dato>
      </dl>

      <footer className="mt-6 border-t border-borde pt-4 text-[0.8125rem] leading-relaxed">
        <p className="m-0 mb-2">{LEYENDA_INDECOPI}</p>
        <p className="m-0">{LEYENDA_PLAZO}</p>
        <p className="mt-3 mb-0 text-xs text-suave">
          Hoja emitida por {empresa.razon_social}. {MARCA.pieDocumento}.
        </p>
      </footer>

      <div className="no-imprimir mt-7 flex flex-wrap gap-3 border-t border-borde pt-6">
        <button type="button" className="btn btn-primario" onClick={() => window.print()}>
          <IcoImprimir tam={18} />
          Imprimir constancia
        </button>
        <Link to={`/seguimiento/${c.codigo_seguimiento}`} className="btn btn-secundario">
          Ver el estado de mi reclamo
        </Link>
      </div>
    </article>
  );
}
