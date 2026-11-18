// P5: correo con relevo SIMULADO. SOLO LOCAL (nunca con --remoto: en la nube el correo no se enciende desde las pruebas).
// Requisitos: `wrangler dev` en marcha con .dev.vars que contenga
//   URL_RELEVO_CORREO=http://localhost:<puerto>   y   SECRETO_CORREO=<cadena aleatoria>
// El script levanta el relevo simulado (pruebas/relevo_simulado.mjs) en ese puerto, enciende el envío con el endpoint de
// administración, ejecuta las verificaciones y al final restaura correo_activo y correo_limite_diario.
// Las direcciones usan @pruebas-rc.dev (dominio inventado, no reservado: no se omite) y solo llegan al simulador local.
// Uso: node pruebas/p5_correo_local.mjs [urlBase=http://localhost:8787]
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ejecutarSql, fechaHoyLima, iniciarPrueba, solicitudValida, sufijoAleatorio } from './_comun.mjs';
import { crearRelevo, leerDevVars } from './relevo_simulado.mjs';

if (process.argv.includes('--remoto')) {
  console.error('P5 solo se ejecuta en local: en la nube nunca se enciende el correo desde las pruebas.');
  process.exit(2);
}
const ctx = await iniciarPrueba({ id: 'P5', titulo: 'P5 correo (relevo simulado local)', gestionarCorreo: false });
const { base, verificar } = ctx;
const DIR = dirname(fileURLToPath(import.meta.url));
const vars = leerDevVars(join(DIR, '..', '.dev.vars'));
const urlRelevo = vars.URL_RELEVO_CORREO ? new URL(vars.URL_RELEVO_CORREO) : null;
if (!urlRelevo || !['localhost', '127.0.0.1'].includes(urlRelevo.hostname) || !vars.SECRETO_CORREO) {
  console.error('.dev.vars debe tener URL_RELEVO_CORREO=http://localhost:<puerto> y SECRETO_CORREO (solo local).');
  process.exit(2);
}
const puerto = Number(urlRelevo.port);
const u = ctx.cuentas();
const dominio = 'pruebas-rc.dev';
const direccion = () => `p5.${sufijoAleatorio(5)}@${dominio}`;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const hoy = fechaHoyLima();

let relevo = await crearRelevo({ secreto: vars.SECRETO_CORREO, puerto });
const original = {
  activo: ejecutarSql("SELECT valor FROM configuracion WHERE clave = 'correo_activo';", 'local')[0]?.valor ?? '0',
  limite: ejecutarSql("SELECT valor FROM configuracion WHERE clave = 'correo_limite_diario';", 'local')[0]?.valor ?? '80',
  limiteOrigen: ejecutarSql("SELECT valor FROM configuracion WHERE clave = 'limite_registros_por_origen_hora';", 'local')[0]?.valor ?? '10',
};
ctx.extra.correo_activo_original = original.activo;
ctx.extra.correo_limite_diario_original = original.limite;

async function esperar(condicion, ms = 15000) {
  const fin = Date.now() + ms;
  for (;;) {
    const v = await condicion();
    if (v) return v;
    if (Date.now() > fin) return null;
    await dormir(150);
  }
}

try {
  const anon = ctx.cliente();
  const adm = ctx.cliente();
  await adm.iniciarSesion(u.admin.correo, u.admin.clave);
  const enc = ctx.cliente();
  await enc.iniciarSesion(u.encargado_hyo.correo, u.encargado_hyo.clave);
  ejecutarSql(`UPDATE configuracion SET valor = '100000' WHERE clave = 'limite_registros_por_origen_hora';`, 'local');

  // --- El propio simulador se comporta como el .gs (si esto falla, el resto no prueba nada) ---
  const sobre = async (carga, firmaPropia) => {
    const { firmaEsperada } = await import('./relevo_simulado.mjs');
    const firma = firmaPropia ?? firmaEsperada(vars.SECRETO_CORREO, carga);
    const r = await fetch(`http://127.0.0.1:${puerto}/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ carga, firma }), redirect: 'follow' });
    return r.json();
  };
  const cargaBase = (extra = {}) => JSON.stringify({ v: 1, ts: Math.floor(Date.now() / 1000), nonce: sufijoAleatorio(16), para: `sim.${sufijoAleatorio(3)}@${dominio}`, asunto: 'Prueba del simulador', html: '<p>x</p>', texto: 'x', ...extra });
  const c0 = cargaBase();
  verificar('simulador: firma válida -> ok', (await sobre(c0)).ok === true);
  verificar('simulador: nonce repetido -> repetida', (await sobre(c0)).error === 'repetida');
  verificar('simulador: firma inválida -> firma', (await sobre(cargaBase(), 'a'.repeat(64))).error === 'firma');
  verificar('simulador: ts caducado (>300 s) -> caducada', (await sobre(cargaBase({ ts: Math.floor(Date.now() / 1000) - 400 }))).error === 'caducada');
  verificar('simulador: destinatario mal formado -> destinatario', (await sobre(cargaBase({ para: 'no-es-correo' }))).error === 'destinatario');
  relevo.reiniciarConteos();

  // --- Encender el envío (solo contra el simulador local) ---
  let r = await adm.pedir('GET', '/api/admin/correo');
  verificar('el Worker local está configurado con el relevo simulado', r.estado === 200 && r.datos.configurado === true, JSON.stringify(r.datos));
  if (!r.datos?.configurado) throw new Error('El Worker no ve URL_RELEVO_CORREO/SECRETO_CORREO: reinicie wrangler dev tras editar .dev.vars');
  r = await adm.pedir('PATCH', '/api/admin/correo', { activo: true });
  verificar('PATCH /api/admin/correo activo=true', r.estado === 200 && r.datos.activo === true && r.datos.limite_diario === Number(original.limite), JSON.stringify(r.datos));

  const idDe = (numero) => {
    const [, anio, corr] = numero.match(/^[A-Z]{3}-\d{2}-(\d{4})-(\d{6})$/) ?? [];
    return ejecutarSql(`SELECT r.id AS id FROM reclamos r JOIN establecimientos e ON e.id = r.establecimiento_id WHERE e.codigo = '${numero.slice(0, 6)}' AND r.anio = ${Number(anio)} AND r.correlativo = ${Number(corr)};`, 'local')[0]?.id;
  };
  const detalle = async (id) => (await adm.pedir('GET', `/api/reclamos/${id}`)).datos;
  const comunicacion = async (id, tipo) => (await detalle(id)).comunicaciones.find((c) => c.tipo === tipo);
  const esperarEstado = async (id, tipo, estados) => esperar(async () => { const c = await comunicacion(id, tipo); return c && estados.includes(c.estado) ? c : null; });
  const registrar = async (extra = {}, correo = direccion()) => {
    const resp = await anon.pedir('POST', '/api/reclamos', solicitudValida('HYO-01', { consumidor: { ...solicitudValida('x').consumidor, correo }, ...extra }));
    return { resp, id: resp.datos?.numero ? idDe(resp.datos.numero) : null, correo };
  };

  // 1. Envío correcto de la constancia
  const base1 = relevo.estado.enviados.length;
  const h1 = await registrar();
  verificar('registro con correo y envío activo -> 201 y correo_constancia pendiente', h1.resp.estado === 201 && h1.resp.datos.correo_constancia === 'pendiente', `${h1.resp.estado}/${h1.resp.datos?.correo_constancia}`);
  const c1 = await esperarEstado(h1.id, 'constancia_correo', ['enviado', 'fallido']);
  verificar('constancia enviada: estado enviado, 1 intento, sin detalle', c1?.estado === 'enviado' && c1.intentos === 1 && c1.detalle === null, JSON.stringify(c1));
  const m1 = relevo.estado.enviados[base1];
  verificar('el relevo recibió exactamente 1 correo, firmado y dirigido a la dirección registrada', relevo.estado.enviados.length === base1 + 1 && m1?.para === h1.correo, `${relevo.estado.enviados.length - base1} correos`);
  verificar('constancia: asunto con número, enlace de seguimiento del origen local, leyendas y pie', m1?.asunto.includes(h1.resp.datos.numero) && m1.html.includes(`${base}/seguimiento/${h1.resp.datos.codigo_seguimiento}`) && m1.texto.includes(`${base}/seguimiento/${h1.resp.datos.codigo_seguimiento}`) && /INDECOPI/.test(m1.html) && /quince \(15\) días hábiles/.test(m1.texto) && m1.html.includes('Mensaje enviado mediante JN Reclamaciones') && m1.html.includes('Este mensaje es automático; no responda a este correo.') && m1.html.includes('#0B1220') && m1.html.includes('Comercial del Centro S.A.C. (empresa ficticia)') && !m1.html.includes('S.A.C..'), m1?.asunto);
  verificar('constancia: no repite el detalle ni el documento del consumidor', !/12345678|dejó de funcionar|cambio del producto/.test(m1.html + m1.texto));
  const d1 = await detalle(h1.id);
  verificar('evento correo_enviado anotado', d1.eventos.some((e) => e.accion === 'correo_enviado'));

  // 2. Fallo del relevo: el registro sigue en 201
  relevo.forzarFallos(1);
  const h2 = await registrar();
  verificar('con el relevo fallando, el registro responde 201', h2.resp.estado === 201 && h2.resp.datos.numero, `estado ${h2.resp.estado}`);
  const c2 = await esperarEstado(h2.id, 'constancia_correo', ['fallido', 'enviado']);
  verificar('la constancia queda fallido (1 intento) con el motivo, sin afectar la hoja', c2?.estado === 'fallido' && c2.intentos === 1 && /relevo rechaz/.test(c2.detalle ?? ''), JSON.stringify(c2));
  const d2 = await detalle(h2.id);
  verificar('la hoja sigue registrada y con evento correo_fallido', d2.estado === 'registrado' && d2.eventos.some((e) => e.accion === 'correo_fallido'));
  verificar('el motivo del fallo no contiene datos personales', !/@|Persona|12345678/.test(c2.detalle ?? ''));

  // 3. Reintento -> enviado
  const antesReintento = relevo.estado.enviados.length;
  r = await adm.pedir('POST', `/api/reclamos/${h2.id}/comunicaciones/${c2.id}/reintentar`);
  const c2b = r.datos?.comunicaciones?.find((c) => c.id === c2.id);
  verificar('reintentar un fallido -> 200 y enviado (2 intentos)', r.estado === 200 && c2b?.estado === 'enviado' && c2b.intentos === 2 && relevo.estado.enviados.length === antesReintento + 1, JSON.stringify(c2b));
  r = await adm.pedir('POST', `/api/reclamos/${h2.id}/comunicaciones/${c2.id}/reintentar`);
  verificar('reintentar uno ya enviado -> 409', r.estado === 409);

  // 4. Máximo 3 intentos en total
  relevo.forzarFallos(3);
  const h4 = await registrar();
  const c4 = await esperarEstado(h4.id, 'constancia_correo', ['fallido']);
  const intentos = [c4?.intentos];
  for (let i = 0; i < 2; i++) {
    r = await adm.pedir('POST', `/api/reclamos/${h4.id}/comunicaciones/${c4.id}/reintentar`);
    intentos.push(r.datos?.comunicaciones?.find((c) => c.id === c4.id)?.intentos);
  }
  verificar('tres intentos en total (1 automático + 2 reintentos), todos fallidos', intentos.join(',') === '1,2,3' && r.datos.comunicaciones.find((c) => c.id === c4.id).estado === 'fallido', intentos.join(','));
  r = await adm.pedir('POST', `/api/reclamos/${h4.id}/comunicaciones/${c4.id}/reintentar`);
  verificar('cuarto intento rechazado -> 409', r.estado === 409, `estado ${r.estado}`);
  verificar('el relevo no recibió un cuarto intento', relevo.estado.rechazos.interno >= 4, JSON.stringify(relevo.estado.rechazos));
  relevo.forzarFallos(0);

  // 5. Respuesta con correo: fallo del relevo no revierte la respuesta; escape HTML de la plantilla
  const h5 = await registrar();
  await esperarEstado(h5.id, 'constancia_correo', ['enviado']);
  const textoPeligroso = 'PRUEBA <script>alert("x")</script> & <b>negrita</b>\nSegunda línea';
  relevo.forzarFallos(1);
  r = await enc.pedir('POST', `/api/reclamos/${h5.id}/respuesta`, { texto: textoPeligroso, fecha_comunicacion: hoy });
  verificar('la respuesta se registra (200) aunque el relevo falle', r.estado === 200 && r.datos.estado === 'respondido' && r.datos.respuesta?.medio_comunicacion === 'correo', `estado ${r.estado}`);
  const cr = await esperarEstado(h5.id, 'respuesta_correo', ['fallido', 'enviado']);
  verificar('respuesta_correo queda fallido y la hoja sigue respondida', cr?.estado === 'fallido' && (await detalle(h5.id)).estado === 'respondido', JSON.stringify(cr));
  r = await enc.pedir('POST', `/api/reclamos/${h5.id}/comunicaciones/${cr.id}/reintentar`);
  const cr2 = r.datos?.comunicaciones?.find((c) => c.id === cr.id);
  verificar('el encargado reintenta la respuesta -> enviado', r.estado === 200 && cr2?.estado === 'enviado' && cr2.intentos === 2, JSON.stringify(cr2));
  const mr = relevo.estado.enviados[relevo.estado.enviados.length - 1];
  verificar('correo de respuesta: texto escapado en el HTML y crudo en texto plano', mr.para === h5.correo && !mr.html.includes('<script>') && mr.html.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &lt;b&gt;negrita&lt;/b&gt;') && mr.html.includes('<br>') && mr.texto.includes('<script>alert("x")</script>'), mr.asunto);
  verificar('correo de respuesta: responsable, cargo y enlace de seguimiento', mr.html.includes('Encargado de tienda') && mr.html.includes(`${base}/seguimiento/`) && mr.asunto.includes(h5.resp.datos.numero));

  // 6. Sin duplicados aunque se dispare varias veces a la vez
  relevo.forzarFallos(1);
  const h6 = await registrar();
  const c6 = await esperarEstado(h6.id, 'constancia_correo', ['fallido']);
  relevo.demorar(400);
  const antes6 = relevo.estado.enviados.length;
  const rafaga = await Promise.all(Array.from({ length: 6 }, () => adm.pedir('POST', `/api/reclamos/${h6.id}/comunicaciones/${c6.id}/reintentar`)));
  relevo.demorar(0);
  const c6b = await comunicacion(h6.id, 'constancia_correo');
  verificar('6 reintentos simultáneos: el relevo recibe un solo correo', relevo.estado.enviados.length === antes6 + 1, `${relevo.estado.enviados.length - antes6} correos`);
  verificar('6 reintentos simultáneos: queda enviado con 2 intentos (no se gastan intentos de más)', c6b.estado === 'enviado' && c6b.intentos === 2 && rafaga.every((x) => x.estado === 200 || x.estado === 409), `${c6b.estado}/${c6b.intentos}, estados ${rafaga.map((x) => x.estado).join(',')}`);
  const [ev6] = [ejecutarSql(`SELECT COUNT(*) AS n FROM eventos WHERE reclamo_id = ${Number(h6.id)} AND accion = 'correo_enviado';`, 'local')[0]];
  verificar('un solo evento correo_enviado', ev6.n === 1, `${ev6.n}`);

  // 7. Cuota diaria
  const estadoCorreo = (await adm.pedir('GET', '/api/admin/correo')).datos;
  verificar('GET /api/admin/correo refleja los envíos del día y los fallidos pendientes', estadoCorreo.activo === true && estadoCorreo.enviados_hoy >= 5 && estadoCorreo.fallidos_pendientes >= 1, JSON.stringify(estadoCorreo));
  ejecutarSql(`UPDATE configuracion SET valor = '${estadoCorreo.enviados_hoy}' WHERE clave = 'correo_limite_diario';`, 'local');
  const antes7 = relevo.estado.solicitudes;
  const h7 = await registrar();
  await dormir(1200);
  const c7 = await comunicacion(h7.id, 'constancia_correo');
  verificar('cuota diaria alcanzada: no se envía y queda pendiente con el motivo', c7.estado === 'pendiente' && c7.intentos === 0 && c7.detalle === 'cuota diaria alcanzada' && relevo.estado.solicitudes === antes7, JSON.stringify(c7));
  ejecutarSql(`UPDATE configuracion SET valor = '${original.limite}' WHERE clave = 'correo_limite_diario';`, 'local');

  // 8. Interruptor apagado
  r = await adm.pedir('PATCH', '/api/admin/correo', { activo: false });
  verificar('PATCH /api/admin/correo activo=false', r.estado === 200 && r.datos.activo === false);
  const antes8 = relevo.estado.solicitudes;
  const h8 = await registrar();
  verificar('con el correo apagado: correo_constancia = desactivado', h8.resp.estado === 201 && h8.resp.datos.correo_constancia === 'desactivado', `${h8.resp.datos?.correo_constancia}`);
  await dormir(800);
  const c8 = await comunicacion(h8.id, 'constancia_correo');
  verificar('con el correo apagado: queda pendiente "envío desactivado" y no se contacta al relevo', c8.estado === 'pendiente' && c8.detalle === 'envío desactivado' && relevo.estado.solicitudes === antes8, JSON.stringify(c8));
  const h8b = await registrar();
  r = await enc.pedir('POST', `/api/reclamos/${h8b.id}/respuesta`, { texto: 'PRUEBA: respuesta con el correo apagado.' });
  await dormir(800);
  const cr8 = await comunicacion(h8b.id, 'respuesta_correo');
  verificar('con el correo apagado la respuesta se registra (200) y su correo queda pendiente', r.estado === 200 && cr8.estado === 'pendiente' && cr8.detalle === 'envío desactivado' && relevo.estado.solicitudes === antes8, JSON.stringify(cr8));
  r = await enc.pedir('POST', `/api/reclamos/${h8b.id}/comunicaciones/${cr8.id}/reintentar`);
  // Con el correo aún apagado, reintentar un pendiente no envía nada y lo deja pendiente.
  const cr8b = await comunicacion(h8b.id, 'respuesta_correo');
  verificar('reintentar un pendiente con el correo apagado -> 200, sigue pendiente y no se envía nada', r.estado === 200 && cr8b.estado === 'pendiente' && relevo.estado.solicitudes === antes8, JSON.stringify(cr8b));
  // Al encender el correo, ese pendiente sí puede enviarse con el mismo botón.
  await adm.pedir('PATCH', '/api/admin/correo', { activo: true });
  r = await enc.pedir('POST', `/api/reclamos/${h8b.id}/comunicaciones/${cr8.id}/reintentar`);
  const cr8c = await comunicacion(h8b.id, 'respuesta_correo');
  verificar('al encender el correo, el pendiente se puede enviar -> enviado', r.estado === 200 && cr8c.estado === 'enviado', JSON.stringify(cr8c));
  await adm.pedir('PATCH', '/api/admin/correo', { activo: false });
  r = await adm.pedir('GET', '/api/admin/eventos');
  verificar('el cambio de configuración quedó en el historial', r.datos.some((e) => e.accion === 'correo_configuracion_cambiada'));
  r = await adm.pedir('PATCH', '/api/admin/correo', { activo: true });
  verificar('se vuelve a encender', r.estado === 200 && r.datos.activo === true);

  // 9. Dominios de prueba y sin correo: omitido, sin tocar al relevo
  const antes9 = relevo.estado.solicitudes;
  const dominios = ['x.prueba@example.com', 'x.prueba@example.org', 'x.prueba@example.net', 'x.prueba@correo.test', 'x.prueba@correo.invalid', 'x.prueba@correo.example', 'x.prueba@SUB.EXAMPLE.COM'.replace('SUB.EXAMPLE.COM', 'Example.COM')];
  const estados9 = [];
  for (const d of dominios) {
    const h = await registrar({}, d);
    estados9.push(h.resp.datos?.correo_constancia);
  }
  verificar('dominios de prueba (example.*, .test, .invalid, .example) -> omitido', estados9.every((e) => e === 'omitido'), estados9.join(','));
  const hCarta = await registrar({ medio_respuesta: 'carta', consumidor: { nombres: 'Persona Carta PRUEBA', tipo_documento: 'DNI', numero_documento: '87654321', domicilio: 'Av. Ficticia PRUEBA 123', es_menor: false } });
  verificar('sin correo -> omitido', hCarta.resp.datos?.correo_constancia === 'omitido');
  await dormir(500);
  verificar('ninguno de ellos llegó al relevo', relevo.estado.solicitudes === antes9, `${relevo.estado.solicitudes - antes9} solicitudes`);
  const cOm = await comunicacion(hCarta.id, 'constancia_correo');
  verificar('la constancia sin correo queda omitida con motivo', cOm.estado === 'omitido' && cOm.detalle === 'sin correo');
  r = await enc.pedir('POST', `/api/reclamos/${hCarta.id}/respuesta`, { texto: 'PRUEBA: respuesta por carta física.' });
  verificar('hoja de carta: respuesta_carta pendiente_entrega y sin correo al relevo', r.estado === 200 && r.datos.comunicaciones.find((c) => c.tipo === 'respuesta_carta')?.estado === 'pendiente_entrega' && relevo.estado.solicitudes === antes9);

  // 10. Relevo caído: el registro sigue en 201 y la comunicación queda fallida
  await relevo.cerrar();
  const h10 = await registrar();
  verificar('con el relevo caído, el registro responde 201', h10.resp.estado === 201);
  const c10 = await esperarEstado(h10.id, 'constancia_correo', ['fallido', 'enviado']);
  verificar('relevo caído: fallido con motivo de red', c10?.estado === 'fallido' && /no se pudo contactar/.test(c10.detalle ?? ''), JSON.stringify(c10));
  relevo = await crearRelevo({ secreto: vars.SECRETO_CORREO, puerto });
  r = await adm.pedir('POST', `/api/reclamos/${h10.id}/comunicaciones/${c10.id}/reintentar`);
  verificar('al volver el relevo, el reintento lo entrega', r.estado === 200 && r.datos.comunicaciones.find((c) => c.id === c10.id)?.estado === 'enviado');

  // 11. Registros y privacidad
  const [pend] = [ejecutarSql("SELECT COUNT(*) AS n FROM comunicaciones WHERE estado = 'enviado' AND intentos < 1;", 'local')[0]];
  verificar('ningún correo "enviado" con 0 intentos', pend.n === 0);
} catch (e) {
  verificar('ejecución sin excepciones', false, e.stack?.split('\n').slice(0, 2).join(' ') ?? e);
} finally {
  try {
    ejecutarSql(`UPDATE configuracion SET valor = '${original.activo}' WHERE clave = 'correo_activo';`, 'local');
    ejecutarSql(`UPDATE configuracion SET valor = '${original.limite}' WHERE clave = 'correo_limite_diario';`, 'local');
    ejecutarSql(`UPDATE configuracion SET valor = '${original.limiteOrigen}' WHERE clave = 'limite_registros_por_origen_hora';`, 'local');
    const act = ejecutarSql("SELECT valor FROM configuracion WHERE clave IN ('correo_activo','correo_limite_diario','limite_registros_por_origen_hora') ORDER BY clave;", 'local').map((f) => f.valor).join(',');
    verificar('correo_activo, cuota y límite por origen restaurados', act === [original.activo, original.limite, original.limiteOrigen].join(','), `valores ${act}`);
  } catch (e) {
    verificar('correo_activo, cuota y límite por origen restaurados', false, e.message);
  }
  await relevo.cerrar();
}
process.exit(await ctx.finalizar());
