// P3: seguridad.
// Local : node pruebas/p3_seguridad.mjs [urlBase=http://localhost:8787]
// Nube  : node pruebas/p3_seguridad.mjs --remoto
// Ajusta/restaura configuracion.limite_registros_por_origen_hora. En local limpia intentos_acceso.
// Salvaguardas para la nube:
//  - Todo lo que se bloquea, se modifica o se intenta escalar son usuarios DESECHABLES creados por este script
//    (correo prueba.<aleatorio>@example.com, clave aleatoria). Las cuentas de demostración nunca se bloquean ni se modifican.
//  - Solo se opera sobre hojas creadas por este script.
//  - Los intentos fallidos desde su conexión cuentan contra un límite de 20 por 15 minutos: si hubo una ejecución
//    reciente, el script se detiene antes de empezar para no bloquear su acceso.
//  - El correo real nunca se enciende (correo_activo se apaga durante la ejecución y se restaura); solo @example.com.
import { fechaHoyLima, iniciarPrueba, sufijoAleatorio, solicitudValida } from './_comun.mjs';

const ctx = await iniciarPrueba({ id: 'P3', titulo: 'P3 seguridad' });
const { base, nube, verificar } = ctx;
const u = ctx.cuentas();
const hoy = fechaHoyLima();
const noExiste = `prueba.inexistente.${sufijoAleatorio(6)}@example.com`;

if (nube) {
  const n = ctx.sql("SELECT COUNT(*) AS n FROM intentos_acceso WHERE exito = 0 AND creado_en > strftime('%Y-%m-%dT%H:%M:%fZ','now','-15 minutes');")[0]?.n ?? 0;
  if (n > 6) {
    console.error(`Hay ${n} intentos de acceso fallidos en los últimos 15 minutos (de cualquier origen). Esta prueba hace unos 13 y el límite por origen es 20: espere 15 minutos y vuelva a ejecutarla.`);
    process.exit(3);
  }
}

const contar = (tabla) => ctx.sql(`SELECT COUNT(*) AS n FROM ${tabla};`)[0].n;

try {
  ctx.leerLimite();
  ctx.fijarLimite(100000);
  ctx.limpiarIntentos();

  const anon = ctx.cliente();
  // Sin sesión
  for (const [metodo, ruta] of [['GET', '/api/reclamos'], ['GET', '/api/reclamos/1'], ['GET', '/api/panel'], ['GET', '/api/admin/usuarios'], ['PATCH', '/api/reclamos/1'], ['POST', '/api/reclamos/1/respuesta'], ['POST', '/api/admin/usuarios'], ['GET', '/api/admin/eventos'], ['GET', '/api/reportes'], ['GET', '/api/admin/correo'], ['PATCH', '/api/admin/correo'], ['POST', '/api/reclamos/1/comunicaciones/1/reintentar'], ['POST', '/api/reclamos/1/carta/entrega']]) {
    const r = await anon.pedir(metodo, ruta, metodo === 'GET' ? undefined : {});
    verificar(`sin sesión ${metodo} ${ruta} -> 401`, r.estado === 401, `estado ${r.estado}`);
  }
  let r = await anon.pedir('GET', '/api/sesion');
  verificar('GET /api/sesion sin cookie -> 401', r.estado === 401);
  const nombreCookie = nube ? '__Host-rc_sesion' : 'rc_sesion';
  const conCookieFalsa = await fetch(base + '/api/sesion', { headers: { Cookie: `${nombreCookie}=${'a'.repeat(64)}` } });
  verificar('cookie inventada -> 401', conCookieFalsa.status === 401);

  // Sesiones
  const adm = ctx.cliente();
  await adm.iniciarSesion(u.admin.correo, u.admin.clave);
  const hyo = ctx.cliente();
  await hyo.iniciarSesion(u.encargado_hyo.correo, u.encargado_hyo.clave);
  const tam = ctx.cliente();
  await tam.iniciarSesion(u.encargado_tam.correo, u.encargado_tam.clave);
  verificar('las tres cuentas de demostración inician sesión', Boolean(adm.csrf && hyo.csrf && tam.csrf));

  // Usuarios desechables: A (comparar mensajes), B (bloqueo), C (admin para pruebas de autoprotección)
  const A = await ctx.crearDesechable(adm, { rol: 'encargado', establecimiento_codigo: 'TAM-01', rotulo: 'P3-A' });
  const B = await ctx.crearDesechable(adm, { rol: 'encargado', establecimiento_codigo: 'TAM-01', rotulo: 'P3-B' });
  const C = await ctx.crearDesechable(adm, { rol: 'admin', rotulo: 'P3-C' });
  verificar('se crearon los 3 usuarios desechables', A.respuesta.estado === 201 && B.respuesta.estado === 201 && C.respuesta.estado === 201, `${A.respuesta.estado},${B.respuesta.estado},${C.respuesta.estado}`);

  // Hoja propia en HYO-01 (única que se usa para probar permisos entre establecimientos)
  r = await anon.pedir('POST', '/api/reclamos', solicitudValida('HYO-01'));
  const numeroHyo = r.datos.numero;
  const codigoHyo = r.datos.codigo_seguimiento;
  const [, anioH, corrH] = numeroHyo.match(/^[A-Z]{3}-\d{2}-(\d{4})-(\d{6})$/);
  const idHyo = ctx.sql(`SELECT r.id AS id FROM reclamos r JOIN establecimientos e ON e.id = r.establecimiento_id WHERE e.codigo = 'HYO-01' AND r.anio = ${Number(anioH)} AND r.correlativo = ${Number(corrH)};`)[0]?.id;
  verificar('hoja HYO creada para la prueba', Boolean(idHyo), `id ${idHyo}`);
  r = await tam.pedir('GET', `/api/reclamos/${idHyo}`);
  verificar('encargado TAM lee caso HYO -> 403', r.estado === 403, `estado ${r.estado}`);
  r = await tam.pedir('PATCH', `/api/reclamos/${idHyo}`, { estado: 'en_atencion' });
  verificar('encargado TAM modifica caso HYO -> 403', r.estado === 403, `estado ${r.estado}`);
  r = await tam.pedir('POST', `/api/reclamos/${idHyo}/respuesta`, { texto: 'PRUEBA: respuesta ajena no permitida.', fecha_comunicacion: hoy });
  verificar('encargado TAM responde caso HYO -> 403', r.estado === 403, `estado ${r.estado}`);
  r = await adm.pedir('GET', `/api/reclamos/${idHyo}`);
  verificar('el caso HYO sigue intacto (registrado)', r.estado === 200 && r.datos.estado === 'registrado' && r.datos.respuesta === null);
  const comIdHyo = r.datos?.comunicaciones?.[0]?.id;
  r = await tam.pedir('POST', `/api/reclamos/${idHyo}/comunicaciones/${comIdHyo}/reintentar`);
  verificar('encargado TAM reintenta correo de caso HYO -> 403', r.estado === 403, `estado ${r.estado}`);
  r = await tam.pedir('POST', `/api/reclamos/${idHyo}/carta/entrega`, { fecha_entrega: hoy });
  verificar('encargado TAM registra entrega de carta de caso HYO -> 403', r.estado === 403, `estado ${r.estado}`);
  r = await hyo.pedir('POST', `/api/reclamos/${idHyo}/comunicaciones/${comIdHyo}/reintentar`);
  verificar('reintentar una comunicación no fallida del propio caso -> 409', r.estado === 409, `estado ${r.estado}`);
  r = await tam.pedir('GET', `/api/reportes?desde=${hoy}&hasta=${hoy}&establecimiento=HYO-01`);
  verificar('encargado TAM pide el reporte de HYO -> 403', r.estado === 403, `estado ${r.estado}`);
  r = await hyo.pedir('GET', `/api/reportes?desde=${hoy}&hasta=${hoy}&establecimiento=TAM-01`);
  verificar('encargado HYO pide el reporte de TAM -> 403', r.estado === 403, `estado ${r.estado}`);
  r = await tam.pedir('GET', `/api/reportes?desde=${hoy}&hasta=${hoy}`);
  verificar('reporte del encargado TAM solo contiene TAM-01', r.estado === 200 && r.datos.por_establecimiento.length === 1 && r.datos.por_establecimiento[0].codigo === 'TAM-01' && r.datos.casos.every((x) => x.establecimiento_codigo === 'TAM-01'), `estado ${r.estado}`);
  r = await adm.pedir('GET', `/api/reportes?desde=${hoy}&hasta=${hoy}`);
  const reporteTexto = JSON.stringify(r.datos);
  verificar('GET /api/reportes sin datos personales', r.estado === 200 && r.datos.casos.some((x) => x.numero === numeroHyo) && !/Persona|12345678|ficticio\.prueba|example\.com|nombres|domicilio|numero_documento|telefono|"correo"|detalle|pedido/i.test(reporteTexto), `${reporteTexto.length} caracteres`);
  r = await anon.pedir('GET', `/api/seguimiento/${codigoHyo}`);
  const { medio_respuesta: _m, ...segSinMedio } = r.datos ?? {};
  verificar('GET /api/seguimiento sin datos personales (incluye etapas)', r.estado === 200 && Array.isArray(r.datos.etapas) && !/Persona|12345678|ficticio\.prueba|example\.com|nombres|domicilio|numero_documento|telefono|correo|detalle|pedido/i.test(JSON.stringify(segSinMedio)), Object.keys(r.datos ?? {}).join(','));
  r = await tam.pedir('GET', '/api/reclamos');
  verificar('bandeja TAM no incluye casos de HYO', r.estado === 200 && r.datos.reclamos.every((x) => x.establecimiento.codigo === 'TAM-01'));
  r = await tam.pedir('GET', '/api/reclamos?establecimiento=HYO-01');
  verificar('encargado usando ?establecimiento= -> 403', r.estado === 403);
  r = await tam.pedir('GET', '/api/reclamos/99999999');
  verificar('caso inexistente -> 404', r.estado === 404);
  r = await tam.pedir('GET', '/api/panel');
  verificar('panel del encargado solo incluye su tienda', r.estado === 200 && r.datos.por_establecimiento.length === 1 && r.datos.por_establecimiento[0].codigo === 'TAM-01');

  // Encargado en rutas de administración (con objetivos inexistentes o inofensivos: si hubiera un fallo, no se daña nada real)
  const usuariosAntes = contar('usuarios');
  const correoIntruso = `prueba.intruso.${sufijoAleatorio(5)}@example.com`;
  for (const [metodo, ruta, cuerpo] of [
    ['GET', '/api/admin/usuarios'],
    ['GET', '/api/admin/eventos'],
    ['GET', '/api/admin/establecimientos'],
    ['POST', '/api/admin/usuarios', { nombre: 'Intruso PRUEBA', correo: correoIntruso, clave: 'clave-larga-1234-x', rol: 'encargado', establecimiento_codigo: 'TAM-01' }],
    ['PATCH', '/api/admin/establecimientos/ZZZ-99', { activo: false }],
    ['PATCH', '/api/admin/usuarios/99999999', { activo: false }],
    ['GET', '/api/admin/correo'],
    // Con activo=false: aunque la protección fallara, la prueba nunca enciende el correo.
    ['PATCH', '/api/admin/correo', { activo: false }],
  ]) {
    r = await hyo.pedir(metodo, ruta, cuerpo);
    verificar(`encargado ${metodo} ${ruta} -> 403`, r.estado === 403, `estado ${r.estado}`);
    if (r.estado === 201) ctx.registrarDesechable(r.datos.id, 'intruso');
  }
  verificar('el intento de crear usuario no tuvo efecto', contar('usuarios') === usuariosAntes);

  // Autoprotección del administrador (se prueba con el admin desechable C, nunca con la cuenta de demostración)
  const adminC = ctx.cliente();
  r = await adminC.iniciarSesion(C.correo, C.clave);
  verificar('el admin desechable inicia sesión', r.estado === 200, `estado ${r.estado}`);
  const idC = r.datos?.usuario?.id;
  r = await adminC.pedir('PATCH', `/api/admin/usuarios/${idC}`, { rol: 'encargado', establecimiento_codigo: 'HYO-01' });
  verificar('admin cambia su propio rol -> 403', r.estado === 403, `estado ${r.estado}`);
  r = await adminC.pedir('PATCH', `/api/admin/usuarios/${idC}`, { activo: false });
  verificar('admin se desactiva -> 403', r.estado === 403, `estado ${r.estado}`);
  const filaC = ctx.sql(`SELECT rol, activo FROM usuarios WHERE id = ${Number(idC)};`)[0];
  verificar('el admin sigue siendo admin activo', filaC?.rol === 'admin' && filaC?.activo === 1);
  r = await adminC.pedir('PATCH', `/api/admin/usuarios/${B.id}`, { rol: 'admin', establecimiento_codigo: 'TAM-01' });
  verificar('admin con rol admin y establecimiento -> 400', r.estado === 400, `estado ${r.estado}`);
  r = await adminC.pedir('DELETE', '/api/sesion');

  // CSRF (sobre la hoja propia)
  r = await hyo.pedir('PATCH', `/api/reclamos/${idHyo}`, { estado: 'en_atencion' }, { csrf: false });
  verificar('mutación sin X-CSRF-Token -> 403', r.estado === 403, `estado ${r.estado}`);
  const token = hyo.csrf;
  hyo.csrf = 'f'.repeat(64);
  r = await hyo.pedir('PATCH', `/api/reclamos/${idHyo}`, { estado: 'en_atencion' });
  verificar('token CSRF equivocado -> 403', r.estado === 403, `estado ${r.estado}`);
  hyo.csrf = token;
  r = await hyo.pedir('PATCH', `/api/reclamos/${idHyo}`, { estado: 'en_atencion' }, { origen: 'https://sitio-malicioso.example' });
  verificar('Origin ajeno con token válido -> 403', r.estado === 403, `estado ${r.estado}`);
  r = await hyo.pedir('POST', `/api/reclamos/${idHyo}/carta/entrega`, { fecha_entrega: hoy }, { csrf: false });
  verificar('carta/entrega sin X-CSRF-Token -> 403', r.estado === 403, `estado ${r.estado}`);
  r = await hyo.pedir('POST', `/api/reclamos/${idHyo}/comunicaciones/${comIdHyo}/reintentar`, undefined, { csrf: false });
  verificar('reintentar sin X-CSRF-Token -> 403', r.estado === 403, `estado ${r.estado}`);
  r = await hyo.pedir('POST', `/api/reclamos/${idHyo}/respuesta`, { texto: 'PRUEBA: respuesta sin token CSRF.' }, { csrf: false });
  verificar('respuesta sin X-CSRF-Token -> 403', r.estado === 403, `estado ${r.estado}`);
  r = await hyo.pedir('POST', `/api/reclamos/${idHyo}/carta/entrega`, { fecha_entrega: hoy }, { origen: 'https://sitio-malicioso.example' });
  verificar('carta/entrega con Origin ajeno -> 403', r.estado === 403, `estado ${r.estado}`);
  r = await adm.pedir('PATCH', '/api/admin/correo', { activo: false }, { csrf: false });
  verificar('PATCH /api/admin/correo sin X-CSRF-Token -> 403', r.estado === 403, `estado ${r.estado}`);
  r = await adm.pedir('PATCH', '/api/admin/correo', { activo: false }, { origen: 'https://sitio-malicioso.example' });
  verificar('PATCH /api/admin/correo con Origin ajeno -> 403', r.estado === 403, `estado ${r.estado}`);
  r = await hyo.pedir('DELETE', '/api/sesion', undefined, { csrf: false });
  verificar('DELETE sesión sin token CSRF -> 403', r.estado === 403, `estado ${r.estado}`);
  r = await ctx.cliente().pedir('POST', '/api/sesion', { correo: 'x@example.com', clave: 'x' }, { origen: 'https://sitio-malicioso.example' });
  verificar('login con Origin ajeno -> 403', r.estado === 403, `estado ${r.estado}`);
  r = await adm.pedir('GET', `/api/reclamos/${idHyo}`);
  verificar('los intentos CSRF no cambiaron la hoja', r.datos?.estado === 'registrado');

  // Cierre de sesión invalida la cookie
  const efimero = ctx.cliente();
  await efimero.iniciarSesion(u.encargado_hyo.correo, u.encargado_hyo.clave);
  const cookieVieja = (await efimero.pedir('GET', '/api/sesion')).estado;
  await efimero.pedir('DELETE', '/api/sesion');
  r = await efimero.pedir('GET', '/api/sesion');
  verificar('tras cerrar sesión la cookie no sirve', cookieVieja === 200 && r.estado === 401);
  const [ses] = ctx.sqlTodo("SELECT COUNT(*) AS total, SUM(length(id_hash) = 64 AND id_hash NOT GLOB '*[^0-9a-f]*') AS validos FROM sesiones;");
  verificar('sesiones guardan solo SHA-256 (64 hex)', ses[0].total > 0 && ses[0].total === ses[0].validos, `${ses[0].validos}/${ses[0].total}`);

  // Entrada maliciosa o inválida
  r = await anon.pedir('GET', `/api/seguimiento/${'0'.repeat(32)}`);
  verificar('código inexistente -> 404', r.estado === 404);
  const mensajeInexistente = JSON.stringify(r.datos);
  r = await anon.pedir('GET', '/api/seguimiento/abc');
  verificar('código mal formado -> mismo 404 que uno inexistente', r.estado === 404 && JSON.stringify(r.datos) === mensajeInexistente);
  const antes = contar('reclamos');
  const malos = ["' OR '1'='1", "'; DROP TABLE reclamos;--", `${'a'.repeat(31)}'`, '%27%20OR%201%3D1--', 'abc', `${'0'.repeat(32)}%00`];
  let todos404 = true;
  for (const m of malos) {
    const rr = await anon.pedir('GET', `/api/seguimiento/${m.includes('%') ? m : encodeURIComponent(m)}`);
    // En la nube, la red de Cloudflare rechaza por sí misma una URL con byte nulo (%00) con un 400,
    // antes de que la solicitud llegue al Worker. Es un rechazo igual de válido que el 404 del Worker.
    const rechazoDelBorde = m.includes('%00') && rr.estado === 400;
    if (rr.estado !== 404 && !rechazoDelBorde) todos404 = false;
  }
  verificar('códigos con comilla/inyección -> rechazados (404, o 400 del borde para %00)', todos404);
  const despues = contar('reclamos');
  verificar('la inyección no tuvo efecto (tabla y filas intactas)', despues === antes, `filas ${antes} -> ${despues}`);
  r = await anon.pedir('POST', '/api/sesion', { correo: "' OR 1=1 --", clave: "' OR 1=1 --" });
  verificar("login con ' OR 1=1 -> 401", r.estado === 401);

  r = await anon.pedir('POST', '/api/reclamos', { ...solicitudValida('HYO-01'), campo_extra: 'x' });
  verificar('campo desconocido -> 400', r.estado === 400 && r.datos.campos?.campo_extra, JSON.stringify(r.datos?.campos));
  r = await anon.pedir('POST', '/api/reclamos', solicitudValida('HYO-01', { consumidor: { ...solicitudValida('x').consumidor, rol: 'admin' } }));
  verificar('campo desconocido anidado -> 400', r.estado === 400 && r.datos.campos?.['consumidor.rol']);
  r = await hyo.pedir('PATCH', `/api/reclamos/${idHyo}`, { estado: 'respondido' });
  verificar('encargado no puede marcar respondido por PATCH -> 400', r.estado === 400);
  r = await anon.pedir('POST', '/api/reclamos', 'x'.repeat(150_000));
  verificar('cuerpo mayor de 100 KB -> 400', r.estado === 400);

  // Consistencia bajo concurrencia sobre la hoja propia: sin historial duplicado y una sola respuesta.
  const lote = (n, f) => Promise.all(Array.from({ length: n }, f));
  const rA = await lote(6, () => hyo.pedir('PATCH', `/api/reclamos/${idHyo}`, { estado: 'en_atencion' }));
  verificar('6 PATCH simultáneos a en_atencion -> todos 200', rA.every((x) => x.estado === 200), rA.map((x) => x.estado).join(','));
  const rB = await lote(6, () => hyo.pedir('PATCH', `/api/reclamos/${idHyo}`, { tipo: 'queja' }));
  verificar('6 reclasificaciones simultáneas -> todas 200', rB.every((x) => x.estado === 200), rB.map((x) => x.estado).join(','));
  const [evA, evB] = ctx.sqlTodo(`
    SELECT COUNT(*) AS n FROM eventos WHERE reclamo_id = ${Number(idHyo)} AND accion = 'reclamo_en_atencion';
    SELECT COUNT(*) AS n FROM eventos WHERE reclamo_id = ${Number(idHyo)} AND accion = 'reclamo_reclasificado';`);
  verificar('historial: una sola anotación de atención', evA[0].n === 1, `${evA[0].n}`);
  verificar('historial: una sola anotación de reclasificación', evB[0].n === 1, `${evB[0].n}`);
  const rC = await lote(6, (_, i) => hyo.pedir('POST', `/api/reclamos/${idHyo}/respuesta`, { texto: `PRUEBA: respuesta simultánea número ${i + 1}.`, medio_comunicacion: 'correo', fecha_comunicacion: hoy }));
  const cuenta = rC.reduce((a, x) => ({ ...a, [x.estado]: (a[x.estado] ?? 0) + 1 }), {});
  verificar('6 respuestas simultáneas: una 200 y cinco 409', cuenta[200] === 1 && cuenta[409] === 5, JSON.stringify(cuenta));
  const [rs, evR] = ctx.sqlTodo(`
    SELECT COUNT(*) AS n FROM respuestas WHERE reclamo_id = ${Number(idHyo)};
    SELECT COUNT(*) AS n FROM eventos WHERE reclamo_id = ${Number(idHyo)} AND accion = 'respuesta_registrada';`);
  verificar('una sola respuesta y un solo evento en la base', rs[0].n === 1 && evR[0].n === 1, `${rs[0].n} respuestas, ${evR[0].n} eventos`);
  r = await hyo.pedir('PATCH', `/api/reclamos/${idHyo}`, { tipo: 'reclamo' });
  verificar('reclasificar un caso respondido -> 409', r.estado === 409);

  // Consulta segura de la respuesta (sobre la hoja propia, ya respondida; su documento es 12345678)
  const consultar = (codigo, documento) => anon.pedir('POST', `/api/seguimiento/${codigo}/respuesta`, { numero_documento: documento });
  const rNoResp = await anon.pedir('POST', '/api/reclamos', solicitudValida('HYO-01'));
  r = await consultar(rNoResp.datos?.codigo_seguimiento, '12345678');
  verificar('consulta segura sin respuesta -> 409', r.estado === 409, `estado ${r.estado}`);
  r = await consultar('0'.repeat(32), '12345678');
  verificar('consulta segura con código inexistente -> 404', r.estado === 404, `estado ${r.estado}`);
  const msgInexistente = JSON.stringify(r.datos);
  r = await consultar('abc', '12345678');
  verificar('consulta segura con código mal formado -> mismo 404', r.estado === 404 && JSON.stringify(r.datos) === msgInexistente);
  r = await anon.pedir('POST', `/api/seguimiento/${codigoHyo}/respuesta`, { numero_documento: 12345678 });
  verificar('documento no textual -> 400', r.estado === 400, `estado ${r.estado}`);
  r = await consultar(codigoHyo, '12345678');
  verificar('consulta segura correcta -> 200 con carta', r.estado === 200 && r.datos.numero === numeroHyo && r.datos.carta?.destinatario?.nombres && r.datos.respuesta?.texto, `estado ${r.estado}`);
  const intentosConsulta = [];
  for (const mal of ["' OR '1'='1", '00000000', '12345679', '1234567', 'ABCDEFGH']) intentosConsulta.push((await consultar(codigoHyo, mal)).estado);
  verificar('documento incorrecto -> 403 (cinco fallos, incluida una inyección SQL)', intentosConsulta.join(',') === '403,403,403,403,403', intentosConsulta.join(','));
  r = await consultar(codigoHyo, '99999999');
  verificar('sexto intento -> 429 con Retry-After', r.estado === 429 && Number(r.cabeceras.get('retry-after')) > 0, `estado ${r.estado}, Retry-After ${r.cabeceras.get('retry-after')}`);
  r = await consultar(codigoHyo, '12345678');
  verificar('con el código bloqueado, ni el documento correcto -> 429', r.estado === 429);
  const [ic] = ctx.sqlTodo("SELECT COUNT(*) AS total, SUM(length(codigo_hash) = 64 AND codigo_hash NOT GLOB '*[^0-9a-f]*') AS validos FROM intentos_consulta;");
  verificar('intentos_consulta guarda solo SHA-256 (64 hex), no el código', ic[0].total >= 6 && ic[0].total === ic[0].validos, `${ic[0].validos}/${ic[0].total}`);
  r = await hyo.pedir('GET', `/api/reclamos/${idHyo}`);
  verificar('respuesta_consultada anotada una vez (solo la consulta correcta)', r.datos.eventos.filter((e) => e.accion === 'respuesta_consultada').length === 1);

  // Límite de registros por origen: se fija en (registros recientes de ESTE origen + 3).
  const recientes = ctx.sql(`SELECT COUNT(*) AS n FROM reclamos WHERE huella_origen = (SELECT huella_origen FROM reclamos WHERE id = ${Number(idHyo)}) AND creado_en > strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 hour');`)[0].n;
  ctx.fijarLimite(recientes + 3);
  const estados = [];
  let ultimo;
  for (let i = 0; i < 4; i++) {
    ultimo = await anon.pedir('POST', '/api/reclamos', solicitudValida('TAM-01'));
    estados.push(ultimo.estado);
  }
  verificar('límite por origen: 3 registros y el cuarto -> 429', estados.join(',') === '201,201,201,429', `${estados.join(',')} (registros recientes del origen: ${recientes})`);
  verificar('429 incluye Retry-After', Number(ultimo.cabeceras.get('retry-after')) > 0, `Retry-After ${ultimo.cabeceras.get('retry-after')}`);

  // Bloqueo de acceso: 5 fallos por correo, el sexto intento -> 429. Solo con correos inexistentes y el usuario desechable B.
  ctx.limpiarIntentos();
  const atacante = ctx.cliente();
  const respuestas = [];
  for (let i = 0; i < 6; i++) respuestas.push((await atacante.iniciarSesion(noExiste, `clave-incorrecta-${i}`)).estado);
  verificar('correo inexistente: 5 fallos (401) y el sexto -> 429', respuestas.join(',') === '401,401,401,401,401,429', respuestas.join(','));
  r = await atacante.pedir('POST', '/api/sesion', { correo: noExiste, clave: 'otra' });
  verificar('429 de login incluye Retry-After', r.estado === 429 && Number(r.cabeceras.get('retry-after')) > 0, `Retry-After ${r.cabeceras.get('retry-after')}`);
  ctx.limpiarIntentos();
  const real = ctx.cliente();
  const rr = [];
  for (let i = 0; i < 5; i++) rr.push((await real.iniciarSesion(B.correo, `mala-clave-${i}`)).estado);
  rr.push((await real.iniciarSesion(B.correo, B.clave)).estado);
  verificar('usuario desechable: sexto intento con clave correcta -> 429', rr.join(',') === '401,401,401,401,401,429', rr.join(','));
  ctx.limpiarIntentos();
  const m1 = await ctx.cliente().pedir('POST', '/api/sesion', { correo: A.correo, clave: 'incorrecta-1234' });
  const m2 = await ctx.cliente().pedir('POST', '/api/sesion', { correo: `prueba.otro.${sufijoAleatorio(5)}@example.com`, clave: 'incorrecta-1234' });
  verificar('mensaje de error idéntico para correo existente e inexistente', m1.estado === 401 && m2.estado === 401 && JSON.stringify(m1.datos) === JSON.stringify(m2.datos), JSON.stringify(m1.datos));
  const okA = await ctx.cliente().iniciarSesion(A.correo, A.clave);
  verificar('un acierto reinicia el conteo de fallos del correo', okA.estado === 200, `estado ${okA.estado}`);

  // Los registros no deben filtrar datos personales por rutas públicas
  r = await anon.pedir('GET', '/api/publico/establecimientos');
  verificar('rutas públicas sin datos personales', !/Ficticia|12345678|example\.com/.test(JSON.stringify(r.datos)));
  const dump = ctx.sql("SELECT COUNT(*) AS n FROM reclamos WHERE huella_origen IN ('127.0.0.1','local','::1');")[0].n;
  verificar('la IP no se guarda en claro', dump === 0);
  await adm.pedir('DELETE', '/api/sesion');
} catch (e) {
  verificar('ejecución sin excepciones', false, e.stack?.split('\n').slice(0, 2).join(' ') ?? e);
}
ctx.limpiarIntentos();
process.exit(await ctx.finalizar());
