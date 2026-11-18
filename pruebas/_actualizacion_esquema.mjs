// Prueba del camino de actualización real (solo local): hojas creadas con el esquema 0.3.1 (sin medio_respuesta)
// deben seguir funcionando después de aplicar la migración 0004.
// Preparación: node scripts/preparar_actualizacion_local.mjs (aplica 0001-0003, inserta hojas antiguas aaaa...1 a 3 y aplica 0004).
// Uso: node pruebas/_actualizacion_esquema.mjs [urlBase=http://localhost:8787]
import { iniciarPrueba, fechaHoyLima } from './_comun.mjs';

const ctx = await iniciarPrueba({ id: 'ACT', titulo: 'Actualización de esquema 0.3.1 -> 1.0.0 (hojas antiguas)' });
if (ctx.nube) { console.error('Solo local.'); process.exit(2); }
const { verificar } = ctx;
const u = ctx.cuentas();
const C1 = 'a'.repeat(31) + '1';
const C2 = 'a'.repeat(31) + '2';
const C3 = 'a'.repeat(31) + '3';
try {
  const anon = ctx.cliente();
  const adm = ctx.cliente();
  await adm.iniciarSesion(u.admin.correo, u.admin.clave);
  const enc = ctx.cliente();
  await enc.iniciarSesion(u.encargado_hyo.correo, u.encargado_hyo.clave);

  let r = await adm.pedir('GET', '/api/reclamos?establecimiento=HYO-01');
  const antiguas = (r.datos?.reclamos ?? []).filter((x) => /^HYO-01-2026-00000[123]$/.test(x.numero));
  verificar('la lista incluye las 3 hojas antiguas', r.estado === 200 && antiguas.length === 3, `${antiguas.length} encontradas`);
  verificar('en la lista, medio_respuesta es null en las antiguas', antiguas.every((x) => x.medio_respuesta === null));
  const id1 = antiguas.find((x) => x.numero.endsWith('000001'))?.id;
  const id2 = antiguas.find((x) => x.numero.endsWith('000002'))?.id;
  const id3 = antiguas.find((x) => x.numero.endsWith('000003'))?.id;

  r = await enc.pedir('GET', `/api/reclamos/${id1}`);
  verificar('detalle de hoja antigua sin errores', r.estado === 200 && r.datos.medio_respuesta === null && Array.isArray(r.datos.comunicaciones) && r.datos.comunicaciones.length === 0 && r.datos.carta === null, `estado ${r.estado}`);
  r = await enc.pedir('GET', `/api/reclamos/${id3}`);
  verificar('detalle de hoja antigua respondida incluye carta y respuesta', r.estado === 200 && r.datos.carta?.texto?.startsWith('Respuesta antigua') && r.datos.respuesta?.medio_comunicacion === 'carta', `estado ${r.estado}`);
  verificar('navegación en hoja antigua coherente (siguiente más antigua)', r.datos.siguiente_id === null || typeof r.datos.siguiente_id === 'number');

  r = await anon.pedir('GET', `/api/seguimiento/${C1}`);
  verificar('seguimiento de hoja antigua: 3 etapas y medio null', r.estado === 200 && r.datos.etapas?.length === 3 && r.datos.medio_respuesta === null && r.datos.tiene_respuesta === false, JSON.stringify(r.datos?.etapas?.map((e) => e.etapa)));
  r = await anon.pedir('GET', `/api/seguimiento/${C2}`);
  verificar('seguimiento de hoja en atención antigua', r.estado === 200 && r.datos.estado === 'en_atencion');
  r = await anon.pedir('GET', `/api/seguimiento/${C3}`);
  verificar('seguimiento de hoja antigua respondida: tiene_respuesta', r.estado === 200 && r.datos.tiene_respuesta === true && r.datos.etapas[2].fecha !== null);
  r = await anon.pedir('POST', `/api/seguimiento/${C3}/respuesta`, { numero_documento: '33333333' });
  verificar('consulta segura de hoja antigua con su documento -> 200', r.estado === 200 && r.datos.respuesta?.medio === 'carta' && r.datos.carta?.destinatario?.domicilio === 'Calle Vieja 3', `estado ${r.estado}`);

  // Responder una hoja antigua exige medio_comunicacion (no hay preferencia)
  r = await enc.pedir('POST', `/api/reclamos/${id1}/respuesta`, { texto: 'PRUEBA: respuesta sin medio en hoja antigua.' });
  verificar('hoja antigua sin medio_comunicacion -> 400', r.estado === 400 && r.datos.campos?.medio_comunicacion, JSON.stringify(r.datos?.campos));
  r = await enc.pedir('POST', `/api/reclamos/${id1}/respuesta`, { texto: 'PRUEBA: respuesta de una hoja antigua por correo.', medio_comunicacion: 'correo', fecha_comunicacion: fechaHoyLima() });
  verificar('responder hoja antigua con medio_comunicacion -> 200', r.estado === 200 && r.datos.estado === 'respondido' && r.datos.respuesta?.medio_comunicacion === 'correo', `estado ${r.estado}`);
  const com = r.datos?.comunicaciones?.[0];
  verificar('se creó respuesta_correo omitida (hoja con correo de dominio de prueba)', com?.tipo === 'respuesta_correo' && com?.estado === 'omitido', JSON.stringify(com && { tipo: com.tipo, estado: com.estado }));
  r = await enc.pedir('POST', `/api/reclamos/${id2}/respuesta`, { texto: 'PRUEBA: respuesta de una hoja antigua por carta.', medio_comunicacion: 'carta' });
  verificar('responder hoja antigua por carta (fecha por defecto) -> 200', r.estado === 200 && r.datos.comunicaciones?.[0]?.estado === 'pendiente_entrega', `estado ${r.estado}`);
  r = await enc.pedir('POST', `/api/reclamos/${id2}/carta/entrega`, { fecha_entrega: fechaHoyLima(), observacion: 'PRUEBA entregada en mostrador' });
  verificar('registrar entrega de carta de hoja antigua -> 200', r.estado === 200 && r.datos.comunicaciones?.[0]?.estado === 'entrega_registrada', `estado ${r.estado}`);
  r = await enc.pedir('GET', '/api/panel');
  verificar('panel funciona con hojas antiguas', r.estado === 200 && r.datos.total >= 3);
  const [vigentes] = ctx.sqlTodo("SELECT COUNT(*) AS n FROM reclamos WHERE medio_respuesta IS NULL;");
  verificar('las hojas antiguas siguen con medio_respuesta NULL', vigentes[0].n === 3, `${vigentes[0].n}`);
} catch (e) {
  verificar('ejecución sin excepciones', false, e.stack?.split('\n').slice(0, 2).join(' ') ?? e);
}
process.exit(await ctx.finalizar());
