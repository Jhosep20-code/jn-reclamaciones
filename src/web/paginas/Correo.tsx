import { useState } from 'react';
import { api, ErrorApi } from '../api/cliente';
import { CajaError, Cargando, Confirmacion, Titulo } from '../componentes/Comunes';
import { useCarga, useTitulo } from '../hooks';
import type { EstadoCorreo } from '../tipos';

function Fila({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-borde py-3 last:border-b-0">
      <dt className="font-semibold">{etiqueta}</dt>
      <dd className="m-0 text-right">{children}</dd>
    </div>
  );
}

export function Correo() {
  useTitulo('Correo');
  const { datos, setDatos, error, cargando, recargar } = useCarga(() => api.obtener<EstadoCorreo>('/api/admin/correo'), []);
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [errorAccion, setErrorAccion] = useState('');

  if (cargando) return <div><Titulo>Correo</Titulo><Cargando /></div>;
  if (error) return <CajaError error={error} alReintentar={recargar} />;
  if (!datos) return null;
  const d = datos;
  const destino = !d.activo;

  async function cambiar() {
    if (ocupado) return;
    setOcupado(true);
    setMensaje('');
    setErrorAccion('');
    try {
      const nuevo = await api.modificar<Partial<EstadoCorreo>>('/api/admin/correo', { activo: destino });
      // El PATCH puede devolver el estado completo o solo el interruptor.
      setDatos(typeof nuevo?.configurado === 'boolean' ? { ...d, ...nuevo } as EstadoCorreo : { ...d, activo: destino });
      setMensaje(destino ? 'El envío de correos quedó encendido.' : 'El envío de correos quedó apagado.');
      setConfirmando(false);
    } catch (e) {
      setErrorAccion(e instanceof ErrorApi ? e.message : 'No se pudo cambiar el interruptor.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="grid gap-5">
      <Titulo subtitulo="Estado y control del envío de correos a los consumidores">Correo</Titulo>

      <div aria-live="polite">
        {mensaje && <p role="status" className="aviso aviso-ok font-semibold">{mensaje}</p>}
        {errorAccion && <p role="alert" className="aviso aviso-error font-semibold">{errorAccion}</p>}
      </div>

      <section className="tarjeta" aria-labelledby="t-estado-correo">
        <h2 id="t-estado-correo" className="mt-0">Estado</h2>
        <dl className="m-0">
          <Fila etiqueta="Configuración del relevo">
            <span className={`insignia ${d.configurado ? 'sem-verde' : 'sem-ambar'}`}>{d.configurado ? 'Configurado' : 'Sin configurar'}</span>
          </Fila>
          <Fila etiqueta="Envío de correos">
            <span className={`insignia ${d.activo ? 'sem-verde' : 'sem-cerrado'}`}>{d.activo ? 'Activo' : 'Apagado'}</span>
          </Fila>
          <Fila etiqueta="Enviados hoy">
            <strong>{d.enviados_hoy}</strong> de {d.limite_diario} permitidos
          </Fila>
          <Fila etiqueta="Fallidos pendientes de reintento">
            <strong>{d.fallidos_pendientes}</strong>
          </Fila>
        </dl>
        {!d.configurado && (
          <p className="aviso aviso-ambar mt-4 mb-0 text-sm">
            Faltan los secretos del relevo de correo: aunque se encienda el interruptor, no se enviará ningún correo real.
          </p>
        )}
      </section>

      <section className="tarjeta" aria-labelledby="t-interruptor">
        <h2 id="t-interruptor" className="mt-0">Interruptor de envío</h2>
        <p className="mt-0 text-suave">
          Con el envío apagado, los correos quedan «pendientes» y la constancia indica que el envío está desactivado. Los registros y respuestas nunca fallan por el correo.
        </p>
        {!confirmando ? (
          <button type="button" className={`btn ${destino ? 'btn-primario' : 'btn-secundario'}`} onClick={() => setConfirmando(true)}>
            {destino ? 'Encender el envío de correos' : 'Apagar el envío de correos'}
          </button>
        ) : (
          <Confirmacion
            id="t-conf-correo"
            texto={
              destino
                ? '¿Encender el envío de correos? Desde ahora se enviarán correos reales a los consumidores que dieron su correo (hasta el límite diario).'
                : '¿Apagar el envío de correos? Los nuevos correos quedarán pendientes hasta que vuelva a encenderlo.'
            }
            confirmar={ocupado ? 'Guardando…' : destino ? 'Sí, encender' : 'Sí, apagar'}
            ocupado={ocupado}
            alConfirmar={cambiar}
            alCancelar={() => setConfirmando(false)}
          />
        )}
      </section>
    </div>
  );
}
