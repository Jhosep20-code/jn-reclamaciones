// P1: flujo funcional completo.
// Local : node pruebas/p1_funcional.mjs [urlBase=http://localhost:8787]
// Nube  : node pruebas/p1_funcional.mjs --remoto [--con-establecimiento]
// Opciones: --sin-archivo (no guarda evidencia).
// Ajusta temporalmente (y restaura) configuracion.limite_registros_por_origen_hora.
// En la nube solo toca datos creados por este mismo script (hojas, usuarios desechables) y nunca imprime datos personales.
// El correo real nunca se enciende: si correo_activo estaba en 1, se apaga durante la ejecución y se restaura al final.
// Todas las hojas usan direcciones @example.com (dominio de prueba: la comunicación queda "omitida").
import { fechaHoyLima, iniciarPrueba, solicitudValida, VERSION_ESPERADA } from './_comun.mjs';

const ctx = await iniciarPrueba({ id: 'P1', titulo: 'P1 funcional' });
const { base, nube, verificar } = ctx;
const u = ctx.cuentas();
const conEstablecimiento = !nube || process.argv.includes('--con-establecimiento');

try {
  ctx.leerLimite();
  ctx.fijarLimite(1000);
  ctx.limpiarIntentos();

  const anon = ctx.cliente();
  let r = await anon.pedir('GET', '/api/salud');
  verificar('GET /api/salud', r.estado === 200 && r.datos.version === VERSION_ESPERADA && r.datos.establecimientos >= 5, `version ${r.datos?.version}, esperada ${VERSION_ESPERADA}`);
  verificar('cabeceras de seguridad', r.cabeceras.get('x-content-type-options') === 'nosniff' && r.cabeceras.get('referrer-policy') === 'no-referrer' && r.cabeceras.get('cache-control') === 'no-store');

  r = await anon.pedir('GET', '/api/publico/empresa');
  verificar('GET empresa', r.estado === 200 && r.datos.ruc?.length === 11);
  r = await anon.pedir('GET', '/api/publico/establecimientos');
  verificar('GET establecimientos activos', r.estado === 200 && r.datos.length >= 5 && r.datos[0].codigo, `${r.datos?.length} tiendas`);

  // Registro
  r = await anon.pedir('POST', '/api/reclamos', solicitudValida('HYO-01', { tipo: 'queja' }));
  verificar('POST /api/reclamos 201', r.estado === 201, `estado ${r.estado}`);
  const c1 = r.datos;
  verificar('número con formato', /^HYO-01-\d{4}-\d{6}$/.test(c1?.numero ?? ''), c1?.numero);
  verificar('código de seguimiento 32 hex', /^[0-9a-f]{32}$/.test(c1?.codigo_seguimiento ?? ''));
  verificar('plazo inicial', c1?.plazo?.dias_habiles_restantes === 15 && c1.plazo.semaforo === 'verde', JSON.stringify(c1?.plazo));
  verificar('constancia con empresa y tienda', c1?.empresa?.ruc && c1?.establecimiento?.codigo === 'HYO-01' && c1?.hoja?.detalle);
  verificar('constancia 1.0: medio_respuesta y correo_constancia (example.com -> omitido)', c1?.medio_respuesta === 'correo' && c1?.correo_constancia === 'omitido', `${c1?.medio_respuesta}/${c1?.correo_constancia}`);

  r = await anon.pedir('POST', '/api/reclamos', solicitudValida('HYO-01'));
  const c2 = r.datos;
  const n1 = Number(c1.numero.split('-').pop());
  const n2 = Number(c2?.numero?.split('-').pop());
  verificar('correlativo consecutivo', n2 === n1 + 1, `${n1} -> ${n2}`);

  // Registro por carta (sin correo): el medio exige el dato de contacto correspondiente
  const conDomicilio = { nombres: 'Persona Carta PRUEBA', tipo_documento: 'DNI', numero_documento: '87654321', domicilio: 'Av. Ficticia PRUEBA 123', es_menor: false };
  r = await anon.pedir('POST', '/api/reclamos', solicitudValida('HYO-01', { medio_respuesta: 'carta', consumidor: conDomicilio }));
  verificar('registro por carta 201 con correo_constancia omitido', r.estado === 201 && r.datos.medio_respuesta === 'carta' && r.datos.correo_constancia === 'omitido', `estado ${r.estado}, ${r.datos?.correo_constancia}`);
  const c3 = r.datos;

  // Validaciones
  r = await anon.pedir('POST', '/api/reclamos', (() => { const x = solicitudValida('HYO-01'); delete x.medio_respuesta; return x; })());
  verificar('sin medio_respuesta -> 400', r.estado === 400 && r.datos.campos?.medio_respuesta, JSON.stringify(r.datos?.campos));
  r = await anon.pedir('POST', '/api/reclamos', solicitudValida('HYO-01', { medio_respuesta: 'paloma' }));
  verificar('medio_respuesta inválido -> 400', r.estado === 400);
  r = await anon.pedir('POST', '/api/reclamos', solicitudValida('HYO-01', { medio_respuesta: 'correo', consumidor: conDomicilio }));
  verificar('medio correo sin correo -> 400', r.estado === 400 && r.datos.campos?.['consumidor.correo'], JSON.stringify(r.datos?.campos));
  r = await anon.pedir('POST', '/api/reclamos', solicitudValida('HYO-01', { medio_respuesta: 'carta' }));
  verificar('medio carta sin domicilio -> 400', r.estado === 400 && r.datos.campos?.['consumidor.domicilio'], JSON.stringify(r.datos?.campos));
  r = await anon.pedir('POST', '/api/reclamos', solicitudValida('HYO-01', { consumidor: { ...solicitudValida('x').consumidor, numero_documento: '1234' } }));
  verificar('DNI de 4 dígitos -> 400', r.estado === 400 && r.datos.campos?.['consumidor.numero_documento'], JSON.stringify(r.datos?.campos));
  r = await anon.pedir('POST', '/api/reclamos', solicitudValida('HYO-01', { consumidor: { nombres: 'Sin Contacto PRUEBA', tipo_documento: 'DNI', numero_documento: '12345678', es_menor: false } }));
  verificar('sin domicilio ni correo -> 400', r.estado === 400);
  r = await anon.pedir('POST', '/api/reclamos', solicitudValida('HYO-01', { consumidor: { ...solicitudValida('x').consumidor, es_menor: true } }));
  verificar('menor sin apoderado -> 400', r.estado === 400 && r.datos.campos?.['consumidor.apoderado_nombres']);
  r = await anon.pedir('POST', '/api/reclamos', solicitudValida('HYO-01', { acepta_tratamiento_datos: false }));
  verificar('sin aceptar datos -> 400', r.estado === 400);
  r = await anon.pedir('POST', '/api/reclamos', solicitudValida('HYO-01', { bien: { tipo: 'producto', descripcion: 'Algo PRUEBA', monto: 10.123 } }));
  verificar('monto con 3 decimales -> 400', r.estado === 400);
  r = await anon.pedir('POST', '/api/reclamos', solicitudValida('XXX-99'));
  verificar('establecimiento inexistente -> 400', r.estado === 400);
  r = await anon.pedir('POST', '/api/reclamos', '{no es json');
  verificar('JSON roto -> 400', r.estado === 400);

  // Seguimiento
  r = await anon.pedir('GET', `/api/seguimiento/${c1.codigo_seguimiento}`);
  verificar('seguimiento 200', r.estado === 200 && r.datos.numero === c1.numero && r.datos.estado === 'registrado');
  const { medio_respuesta: medioPublico, ...sinMedio } = r.datos;
  verificar('seguimiento sin datos personales', !/Ficticia|12345678|example\.com|nombres|correo|detalle|domicilio/i.test(JSON.stringify(sinMedio)), Object.keys(r.datos).join(','));
  verificar('seguimiento: 3 etapas en orden, solo la primera con fecha', Array.isArray(r.datos.etapas) && r.datos.etapas.map((e) => e.etapa).join() === 'registrado,en_atencion,respondido' && r.datos.etapas[0].fecha === c1.creado_en && r.datos.etapas[1].fecha === null && r.datos.etapas[2].fecha === null, JSON.stringify(r.datos.etapas?.map((e) => !!e.fecha)));
  verificar('seguimiento: tiene_respuesta false y medio_respuesta correo', r.datos.tiene_respuesta === false && medioPublico === 'correo');
  r = await anon.pedir('POST', `/api/seguimiento/${c2.codigo_seguimiento}/respuesta`, { numero_documento: '12345678' });
  verificar('consulta segura sin respuesta -> 409', r.estado === 409, `estado ${r.estado}`);

  // Sesión del encargado
  const hyo = ctx.cliente();
  r = await hyo.iniciarSesion(u.encargado_hyo.correo, u.encargado_hyo.clave);
  verificar('login encargado 200', r.estado === 200 && r.datos.usuario.establecimiento?.codigo === 'HYO-01' && r.datos.token_csrf?.length === 64);
  const sc = r.setCookie ?? '';
  if (nube) {
    verificar('cookie __Host-, HttpOnly, Secure, SameSite=Lax', /^__Host-rc_sesion=[0-9a-f]{64}/.test(sc) && /HttpOnly/.test(sc) && /Secure/.test(sc) && /SameSite=Lax/.test(sc) && /Path=\//.test(sc) && !/Domain=/i.test(sc));
  } else {
    verificar('cookie HttpOnly SameSite=Lax (local, sin Secure)', /^rc_sesion=[0-9a-f]{64}/.test(sc) && /HttpOnly/.test(sc) && /SameSite=Lax/.test(sc) && !/Secure/.test(sc));
  }
  r = await hyo.pedir('GET', '/api/sesion');
  verificar('GET /api/sesion', r.estado === 200 && r.datos.usuario.rol === 'encargado');

  // El id de las hojas propias se obtiene por SQL (solo ids): no se recorre la bandeja buscando hojas ajenas.
  const idDe = (numero) => {
    const [, anio, corr] = numero.match(/^[A-Z]{3}-\d{2}-(\d{4})-(\d{6})$/) ?? [];
    const cod = numero.slice(0, 6);
    return ctx.sql(`SELECT r.id AS id FROM reclamos r JOIN establecimientos e ON e.id = r.establecimiento_id WHERE e.codigo = '${cod}' AND r.anio = ${Number(anio)} AND r.correlativo = ${Number(corr)};`)[0]?.id;
  };
  const idCaso = idDe(c1.numero);
  verificar('localiza la hoja registrada (por SQL, solo id)', Boolean(idCaso), `id ${idCaso}`);

  const idC2 = idDe(c2.numero);
  const idC3 = idDe(c3.numero);
  r = await hyo.pedir('GET', `/api/reclamos/${idCaso}`);
  verificar('detalle 1.0: medio, comunicaciones, carta y navegación', r.estado === 200 && r.datos.medio_respuesta === 'correo' && r.datos.carta === null && r.datos.comunicaciones.length === 1 && r.datos.comunicaciones[0].tipo === 'constancia_correo' && r.datos.comunicaciones[0].estado === 'omitido' && r.datos.comunicaciones[0].intentos === 0, JSON.stringify(r.datos?.comunicaciones?.map((x) => `${x.tipo}:${x.estado}`)));
  verificar('navegación: la hoja registrada justo después (c2) es su anterior_id', r.datos.anterior_id === idC2, `anterior ${r.datos?.anterior_id}, esperado ${idC2}`);
  r = await hyo.pedir('GET', `/api/reclamos/${idC2}`);
  verificar('navegación: c2 tiene a c1 como siguiente_id y a c3 como anterior_id', r.datos.siguiente_id === idCaso && r.datos.anterior_id === idC3, `siguiente ${r.datos?.siguiente_id}, anterior ${r.datos?.anterior_id}`);
  r = await hyo.pedir('GET', '/api/reclamos');
  const lista = r.datos?.reclamos ?? [];
  const cabeza = lista[0];
  const rCab = cabeza ? await hyo.pedir('GET', `/api/reclamos/${cabeza.id}`) : null;
  const rSig = lista[1] ? await hyo.pedir('GET', `/api/reclamos/${lista[1].id}`) : null;
  verificar('navegación sigue el orden de la bandeja (más recientes primero)', rCab?.datos?.anterior_id === null && rCab?.datos?.siguiente_id === lista[1]?.id && rSig?.datos?.anterior_id === cabeza?.id && (lista[2] ? rSig?.datos?.siguiente_id === lista[2].id : true), `cabeza ${cabeza?.id}`);
  verificar('ResumenReclamo incluye medio_respuesta', lista.length > 0 && lista.every((x) => 'medio_respuesta' in x) && lista.find((x) => x.id === idC3)?.medio_respuesta === 'carta');
  r = await hyo.pedir('GET', '/api/reclamos');
  verificar('bandeja del encargado', r.estado === 200 && r.datos.total >= 2 && r.datos.reclamos.length <= 20 && r.datos.reclamos.every((x) => x.establecimiento.codigo === 'HYO-01'), `total ${r.datos?.total}`);
  r = await hyo.pedir('GET', '/api/reclamos?tipo=queja&estado=registrado&pagina=1');
  verificar('filtros tipo+estado', r.estado === 200 && r.datos.reclamos.every((x) => x.tipo === 'queja' && x.estado === 'registrado') && r.datos.reclamos.some((x) => x.id === idCaso));
  r = await hyo.pedir('GET', '/api/reclamos?pagina=0');
  verificar('pagina=0 -> 400', r.estado === 400);
  r = await hyo.pedir('GET', '/api/reclamos?pagina=999999');
  verificar('página lejana -> lista vacía', r.estado === 200 && r.datos.reclamos.length === 0);
  r = await hyo.pedir('GET', '/api/reclamos?estado=cualquiera');
  verificar('estado no válido -> 400', r.estado === 400);

  r = await hyo.pedir('GET', `/api/reclamos/${idCaso}`);
  verificar('detalle', r.estado === 200 && r.datos.consumidor.numero_documento === '12345678' && r.datos.bien.monto === 199.9 && r.datos.eventos.length >= 1 && r.datos.respuesta === null);

  r = await hyo.pedir('PATCH', `/api/reclamos/${idCaso}`, { estado: 'en_atencion', tipo: 'reclamo' });
  verificar('PATCH en atención + reclasificar', r.estado === 200 && r.datos.estado === 'en_atencion' && r.datos.tipo === 'reclamo');
  const acciones = (r.datos?.eventos ?? []).map((e) => e.accion);
  verificar('eventos anotados', acciones.includes('reclamo_en_atencion') && acciones.includes('reclamo_reclasificado'), acciones.join(','));
  r = await anon.pedir('GET', `/api/seguimiento/${c1.codigo_seguimiento}`);
  verificar('seguimiento: etapa en_atencion con fecha', r.estado === 200 && r.datos.etapas[1].etapa === 'en_atencion' && Boolean(r.datos.etapas[1].fecha) && r.datos.etapas[2].fecha === null, JSON.stringify(r.datos?.etapas?.map((e) => !!e.fecha)));
  r = await hyo.pedir('PATCH', `/api/reclamos/${idCaso}`, { estado: 'en_atencion', tipo: 'reclamo' });
  const nEventos = (r.datos?.eventos ?? []).filter((e) => e.accion.startsWith('reclamo_')).length;
  verificar('repetir el mismo cambio no duplica el historial', r.estado === 200 && nEventos === 3, `eventos de reclamo: ${nEventos} (registro + atención + reclasificación)`);
  r = await hyo.pedir('PATCH', `/api/reclamos/${idCaso}`, {});
  verificar('PATCH vacío -> 400', r.estado === 400);

  const hoy = fechaHoyLima();
  r = await hyo.pedir('POST', `/api/reclamos/${idCaso}/respuesta`, { texto: 'PRUEBA: se procedió al cambio del producto.', medio_comunicacion: 'correo', fecha_comunicacion: '2999-01-01' });
  verificar('respuesta con fecha futura -> 400', r.estado === 400);
  r = await hyo.pedir('POST', `/api/reclamos/${idCaso}/respuesta`, { texto: 'PRUEBA: se procedió al cambio del producto.', medio_comunicacion: 'correo', fecha_comunicacion: '2020-01-01' });
  verificar('respuesta con fecha anterior al registro -> 400', r.estado === 400, `estado ${r.estado}`);
  r = await hyo.pedir('POST', `/api/reclamos/${idC2}/respuesta`, { texto: 'PRUEBA: respuesta por un medio distinto al elegido.', medio_comunicacion: 'carta' });
  verificar('medio distinto al elegido por el consumidor -> 400', r.estado === 400 && r.datos.campos?.medio_comunicacion, JSON.stringify(r.datos?.campos));
  r = await hyo.pedir('POST', `/api/reclamos/${idCaso}/respuesta`, { texto: 'PRUEBA: se procedió al cambio del producto.', medio_comunicacion: 'correo', fecha_comunicacion: hoy });
  verificar('respuesta 200 y respondido', r.estado === 200 && r.datos.estado === 'respondido' && r.datos.respuesta?.autor && r.datos.plazo.semaforo === 'cerrado', `estado ${r.estado}`);
  const comRespuesta = r.datos?.comunicaciones?.find((x) => x.tipo === 'respuesta_correo');
  verificar('se creó respuesta_correo (omitida: dominio de prueba) y la constancia sigue', r.datos.comunicaciones?.length === 2 && comRespuesta?.estado === 'omitido', JSON.stringify(r.datos?.comunicaciones?.map((x) => `${x.tipo}:${x.estado}`)));
  verificar('carta presente al haber respuesta', r.datos.carta?.numero === c1.numero && r.datos.carta.responsable?.cargo === 'Encargado de tienda' && r.datos.carta.empresa?.ruc?.length === 11 && r.datos.carta.destinatario?.nombres && r.datos.carta.texto?.startsWith('PRUEBA'), JSON.stringify(Object.keys(r.datos?.carta ?? {})));
  r = await hyo.pedir('POST', `/api/reclamos/${idCaso}/respuesta`, { texto: 'PRUEBA: segunda respuesta no permitida.', fecha_comunicacion: hoy });
  verificar('segunda respuesta -> 409', r.estado === 409);
  r = await hyo.pedir('POST', `/api/reclamos/${idCaso}/comunicaciones/${comRespuesta?.id}/reintentar`);
  verificar('reintentar una comunicación omitida -> 409', r.estado === 409, `estado ${r.estado}`);
  r = await hyo.pedir('POST', `/api/reclamos/${idCaso}/comunicaciones/999999999/reintentar`);
  verificar('reintentar comunicación inexistente -> 404', r.estado === 404, `estado ${r.estado}`);
  r = await hyo.pedir('POST', `/api/reclamos/${idCaso}/carta/entrega`, { fecha_entrega: hoy });
  verificar('entrega de carta sin carta pendiente -> 409', r.estado === 409, `estado ${r.estado}`);

  // Consulta segura de la respuesta
  r = await anon.pedir('POST', `/api/seguimiento/${c1.codigo_seguimiento}/respuesta`, { numero_documento: '12345678' });
  verificar('consulta segura con el documento correcto -> 200', r.estado === 200 && r.datos.numero === c1.numero && r.datos.respuesta?.medio === 'correo' && r.datos.respuesta.texto.startsWith('PRUEBA') && r.datos.carta?.destinatario?.nombres && r.datos.carta.responsable?.nombre, `estado ${r.estado}`);
  r = await anon.pedir('POST', `/api/seguimiento/${c1.codigo_seguimiento}/respuesta`, { numero_documento: ' 12345678 ' });
  verificar('el documento se compara sin espacios sobrantes', r.estado === 200);
  r = await hyo.pedir('GET', `/api/reclamos/${idCaso}`);
  verificar('la consulta anotó respuesta_consultada (sin datos personales)', r.datos.eventos.filter((e) => e.accion === 'respuesta_consultada').length === 2 && r.datos.eventos.every((e) => e.accion !== 'respuesta_consultada' || e.detalle === null));
  r = await anon.pedir('POST', `/api/seguimiento/${c1.codigo_seguimiento}/respuesta`, { numero_documento: '12345678', extra: 1 });
  verificar('consulta segura con campo extra -> 400', r.estado === 400);

  // Carta física: pendiente de entrega -> entrega registrada
  r = await hyo.pedir('POST', `/api/reclamos/${idC3}/respuesta`, { texto: 'PRUEBA: respuesta enviada por carta al domicilio.', medio_comunicacion: 'correo' });
  verificar('medio distinto en hoja de carta -> 400', r.estado === 400);
  r = await hyo.pedir('POST', `/api/reclamos/${idC3}/respuesta`, { texto: 'PRUEBA: respuesta enviada por carta al domicilio.' });
  const comCarta = r.datos?.comunicaciones?.find((x) => x.tipo === 'respuesta_carta');
  verificar('respuesta sin medio ni fecha (usa el del consumidor y hoy) -> carta pendiente_entrega', r.estado === 200 && r.datos.respuesta?.medio_comunicacion === 'carta' && r.datos.respuesta.fecha_comunicacion === hoy && comCarta?.estado === 'pendiente_entrega' && r.datos.carta?.destinatario?.domicilio === 'Av. Ficticia PRUEBA 123', `estado ${r.estado}`);
  r = await hyo.pedir('POST', `/api/reclamos/${idC3}/carta/entrega`, { fecha_entrega: '2999-01-01' });
  verificar('entrega con fecha futura -> 400', r.estado === 400);
  r = await hyo.pedir('POST', `/api/reclamos/${idC3}/carta/entrega`, { fecha_entrega: '2020-01-01' });
  verificar('entrega anterior a la respuesta -> 400', r.estado === 400);
  r = await hyo.pedir('POST', `/api/reclamos/${idC3}/carta/entrega`, { fecha_entrega: hoy, observacion: 'PRUEBA: recibida en mostrador' });
  const comCarta2 = r.datos?.comunicaciones?.find((x) => x.tipo === 'respuesta_carta');
  verificar('registrar entrega -> entrega_registrada', r.estado === 200 && comCarta2?.estado === 'entrega_registrada' && comCarta2.detalle === 'PRUEBA: recibida en mostrador' && r.datos.eventos.some((e) => e.accion === 'carta_entrega_registrada'), `estado ${r.estado}`);
  r = await hyo.pedir('POST', `/api/reclamos/${idC3}/carta/entrega`, { fecha_entrega: hoy });
  verificar('segunda entrega -> 409', r.estado === 409);
  r = await hyo.pedir('POST', `/api/reclamos/${idC3}/comunicaciones/${comCarta?.id}/reintentar`);
  verificar('reintentar una carta -> 409', r.estado === 409);
  r = await hyo.pedir('PATCH', `/api/reclamos/${idCaso}`, { tipo: 'queja' });
  verificar('modificar respondido -> 409', r.estado === 409);

  r = await anon.pedir('GET', `/api/seguimiento/${c1.codigo_seguimiento}`);
  verificar('seguimiento refleja respondido', r.estado === 200 && r.datos.estado === 'respondido' && r.datos.respondido_en);
  verificar('seguimiento: 3 etapas con fecha y tiene_respuesta', r.datos.etapas.every((e) => Boolean(e.fecha)) && r.datos.etapas[2].fecha === r.datos.respondido_en && r.datos.tiene_respuesta === true);
  const [fa] = ctx.sqlTodo("SELECT COUNT(*) AS n FROM reclamos r WHERE r.medio_respuesta IS NOT NULL AND NOT EXISTS (SELECT 1 FROM comunicaciones c WHERE c.reclamo_id = r.id AND c.tipo = 'constancia_correo');");
  verificar('toda hoja 1.0 tiene su comunicación de constancia', fa[0].n === 0, `${fa[0].n} sin comunicación`);

  r = await hyo.pedir('GET', '/api/panel');
  verificar('panel del encargado', r.estado === 200 && r.datos.total >= 2 && r.datos.por_estado.respondido >= 1 && r.datos.respondidos_en_plazo >= 1 && r.datos.por_establecimiento.length === 1, JSON.stringify(r.datos?.por_estado));

  // Admin
  const adm = ctx.cliente();
  r = await adm.iniciarSesion(u.admin.correo, u.admin.clave);
  verificar('login admin', r.estado === 200 && r.datos.usuario.establecimiento === null);
  r = await adm.pedir('GET', '/api/reclamos');
  verificar('admin ve todas las tiendas', r.estado === 200 && r.datos.total >= 2);
  r = await adm.pedir('GET', '/api/reclamos?establecimiento=HYO-01');
  verificar('admin filtra por tienda', r.estado === 200 && r.datos.reclamos.every((x) => x.establecimiento.codigo === 'HYO-01'));
  r = await adm.pedir('GET', '/api/panel');
  verificar('panel admin con todas las tiendas', r.estado === 200 && r.datos.por_establecimiento.length >= 5, `${r.datos?.por_establecimiento?.length} tiendas`);
  const sumaEstados = r.datos ? Object.values(r.datos.por_estado).reduce((a, b) => a + b, 0) : -1;
  verificar('panel: total = suma por estado = suma por tipo', r.datos.total === sumaEstados && r.datos.total === Object.values(r.datos.por_tipo).reduce((a, b) => a + b, 0), `total ${r.datos?.total}`);
  r = await adm.pedir('GET', '/api/admin/correo');
  verificar('GET /api/admin/correo (apagado en la prueba)', r.estado === 200 && r.datos.activo === false && typeof r.datos.configurado === 'boolean' && Number.isInteger(r.datos.enviados_hoy) && Number.isInteger(r.datos.limite_diario) && Number.isInteger(r.datos.fallidos_pendientes), JSON.stringify(r.datos));
  r = await adm.pedir('PATCH', '/api/admin/correo', { activo: 'si' });
  verificar('PATCH /api/admin/correo con valor no booleano -> 400', r.estado === 400);
  r = await adm.pedir('PATCH', '/api/admin/correo', { activo: false });
  verificar('PATCH /api/admin/correo activo=false -> 200 (nunca se enciende desde la prueba)', r.estado === 200 && r.datos.activo === false);

  // Reportes: los totales deben coincidir con lo que la base contiene para hoy (hora de Lima)
  const [tHoy] = ctx.sqlTodo(`SELECT COUNT(*) AS total, COALESCE(SUM(estado = 'respondido'), 0) AS respondidos FROM reclamos WHERE date(creado_en, '-5 hours') = '${hoy}';`);
  const [tHyo] = ctx.sqlTodo(`SELECT COUNT(*) AS total, COALESCE(SUM(r.estado = 'respondido'), 0) AS respondidos FROM reclamos r JOIN establecimientos e ON e.id = r.establecimiento_id WHERE e.codigo = 'HYO-01' AND date(r.creado_en, '-5 hours') = '${hoy}';`);
  r = await adm.pedir('GET', `/api/reportes?desde=${hoy}&hasta=${hoy}`);
  const rep = r.datos;
  verificar('reporte admin de hoy: totales = base', r.estado === 200 && rep.resumen.total === tHoy[0].total && rep.resumen.respondidos === tHoy[0].respondidos && rep.resumen.pendientes === tHoy[0].total - tHoy[0].respondidos, `API ${rep?.resumen?.total}/${rep?.resumen?.respondidos}, base ${tHoy[0].total}/${tHoy[0].respondidos}`);
  verificar('reporte: en plazo + fuera de plazo = respondidos', rep.resumen.respondidos_en_plazo + rep.resumen.respondidos_fuera_de_plazo === rep.resumen.respondidos && rep.resumen.cumplimiento_pct === Math.round((rep.resumen.respondidos_en_plazo / rep.resumen.respondidos) * 1000) / 10 && rep.resumen.promedio_dias_habiles_respuesta === 0, JSON.stringify(rep.resumen));
  verificar('reporte: suma por establecimiento = resumen', rep.por_establecimiento.reduce((a, e) => a + e.total, 0) === rep.resumen.total && rep.por_establecimiento.length >= 5, `${rep.por_establecimiento.length} tiendas`);
  verificar('reporte: casos = total (hasta 500) y sin datos personales', rep.casos.length === Math.min(rep.resumen.total, 500) && rep.truncado === (rep.resumen.total > 500) && !/Persona|12345678|87654321|example\.com|nombres|correo|detalle|domicilio|documento/i.test(JSON.stringify(rep)), `${rep.casos.length} casos`);
  const caso1 = rep.casos.find((x) => x.numero === c1.numero);
  verificar('reporte: el caso respondido hoy tiene 0 días hábiles y semáforo cerrado', caso1?.estado === 'respondido' && caso1.dias_habiles === 0 && caso1.semaforo === 'cerrado' && caso1.establecimiento_codigo === 'HYO-01' && Boolean(caso1.respondido_en), JSON.stringify(caso1));
  const caso2 = rep.casos.find((x) => x.numero === c2.numero);
  verificar('reporte: el caso pendiente figura como pendiente en verde', caso2?.estado === 'registrado' && caso2.respondido_en === null && caso2.semaforo === 'verde', JSON.stringify(caso2));
  r = await hyo.pedir('GET', `/api/reportes?desde=${hoy}&hasta=${hoy}`);
  verificar('reporte del encargado: solo su tienda y totales = base', r.estado === 200 && r.datos.por_establecimiento.length === 1 && r.datos.por_establecimiento[0].codigo === 'HYO-01' && r.datos.resumen.total === tHyo[0].total && r.datos.casos.every((x) => x.establecimiento_codigo === 'HYO-01'), `API ${r.datos?.resumen?.total}, base ${tHyo[0].total}`);
  r = await hyo.pedir('GET', `/api/reportes?desde=${hoy}&hasta=${hoy}&establecimiento=HYO-01`);
  verificar('encargado pidiendo su propia tienda -> 200', r.estado === 200 && r.datos.filtros.establecimiento === 'HYO-01');
  r = await adm.pedir('GET', `/api/reportes?desde=${hoy}&hasta=${hoy}&establecimiento=HYO-01&tipo=queja&estado=registrado`);
  verificar('reporte con filtros tienda+tipo+estado', r.estado === 200 && r.datos.casos.every((x) => x.tipo === 'queja' && x.estado === 'registrado' && x.establecimiento_codigo === 'HYO-01') && r.datos.por_establecimiento.length === 1 && r.datos.filtros.tipo === 'queja');
  r = await adm.pedir('GET', '/api/reportes');
  const hace29 = new Date(Date.parse(`${hoy}T00:00:00Z`) - 29 * 86400000).toISOString().slice(0, 10);
  verificar('reporte por defecto: últimos 30 días', r.estado === 200 && r.datos.filtros.hasta === hoy && r.datos.filtros.desde === hace29 && r.datos.filtros.estado === null, JSON.stringify(r.datos?.filtros));
  r = await adm.pedir('GET', `/api/reportes?desde=${hoy}&hasta=2020-01-01`);
  verificar('reporte con desde > hasta -> 400', r.estado === 400);
  r = await adm.pedir('GET', '/api/reportes?desde=2025-01-01&hasta=2026-12-31');
  verificar('reporte de más de 366 días -> 400', r.estado === 400);
  r = await adm.pedir('GET', '/api/reportes?desde=2026-02-30');
  verificar('reporte con fecha inexistente -> 400', r.estado === 400);
  r = await adm.pedir('GET', '/api/reportes?estado=otro');
  verificar('reporte con estado inválido -> 400', r.estado === 400);

  r = await adm.pedir('GET', '/api/admin/usuarios');
  verificar('listar usuarios', r.estado === 200 && r.datos.length >= 3 && r.datos.every((x) => !('hash_clave' in x)));

  const d1 = await ctx.crearDesechable(adm, { rol: 'encargado', establecimiento_codigo: 'JAU-01', rotulo: 'P1' });
  verificar('crear usuario 201', d1.respuesta.estado === 201 && d1.respuesta.datos.establecimiento?.codigo === 'JAU-01', `estado ${d1.respuesta.estado}`);
  const idNuevo = d1.id;
  r = await adm.pedir('POST', '/api/admin/usuarios', { nombre: 'Usuario PRUEBA repetido', correo: d1.correo.toUpperCase(), clave: d1.clave, rol: 'admin' });
  verificar('correo repetido (otra capitalización) -> 409', r.estado === 409);
  if (r.estado === 201) ctx.registrarDesechable(r.datos.id, 'P1 repetido');
  r = await adm.pedir('POST', '/api/admin/usuarios', { nombre: 'Clave Corta PRUEBA', correo: `prueba.corta.${Date.now()}@example.com`, clave: 'corta', rol: 'admin' });
  verificar('clave corta -> 400', r.estado === 400);
  const nuevo = ctx.cliente();
  r = await nuevo.iniciarSesion(d1.correo, d1.clave);
  verificar('el usuario nuevo inicia sesión', r.estado === 200);
  r = await adm.pedir('PATCH', `/api/admin/usuarios/${idNuevo}`, { activo: false });
  verificar('desactivar usuario', r.estado === 200 && r.datos.activo === false);
  r = await nuevo.pedir('GET', '/api/sesion');
  verificar('sesión del desactivado cae (401)', r.estado === 401);
  r = await ctx.cliente().iniciarSesion(d1.correo, d1.clave);
  verificar('desactivado no puede iniciar (401)', r.estado === 401);

  r = await adm.pedir('GET', '/api/admin/establecimientos');
  verificar('admin lista establecimientos', r.estado === 200 && r.datos.length >= 5 && typeof r.datos[0].activo === 'boolean');
  if (conEstablecimiento) {
    // Código único por ejecución; queda desactivado (los establecimientos no se pueden borrar).
    const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const t = Date.now();
    const codigoNuevo = `Z${L[t % 26]}${L[Math.floor(t / 26) % 26]}-${String(t % 100).padStart(2, '0')}`;
    r = await adm.pedir('POST', '/api/admin/establecimientos', { codigo: codigoNuevo, nombre: 'PRUEBA Tienda de prueba P1 (ficticia)', direccion: 'Av. Ficticia PRUEBA 1', ciudad: 'Huancayo' });
    verificar('crear establecimiento', r.estado === 201 || r.estado === 409, `estado ${r.estado}`);
    if (r.estado === 201) {
      r = await adm.pedir('PATCH', `/api/admin/establecimientos/${codigoNuevo}`, { activo: false });
      verificar('desactivar establecimiento', r.estado === 200 && r.datos.activo === false);
      r = await anon.pedir('GET', '/api/publico/establecimientos');
      verificar('inactivo no aparece en público', !r.datos.some((e) => e.codigo === codigoNuevo));
      r = await anon.pedir('POST', '/api/reclamos', solicitudValida(codigoNuevo));
      verificar('no se puede registrar en un establecimiento inactivo -> 400', r.estado === 400);
    }
  } else {
    ctx.omitir('crear/desactivar establecimiento', 'en la nube no se crean establecimientos (use --con-establecimiento para incluirlo)');
  }
  r = await adm.pedir('GET', '/api/admin/eventos');
  verificar('historial general', r.estado === 200 && r.datos.length > 0 && r.datos.length <= 50 && r.datos.some((e) => e.numero) && r.datos.some((e) => e.accion === 'sesion_iniciada'), `${r.datos?.length} eventos`);
  r = await adm.pedir('GET', '/api/admin/eventos?pagina=2');
  verificar('historial página 2', r.estado === 200 && Array.isArray(r.datos));

  // Cierre de sesión
  r = await hyo.pedir('DELETE', '/api/sesion');
  verificar('DELETE sesión 204', r.estado === 204);
  r = await hyo.pedir('GET', '/api/sesion');
  verificar('sesión cerrada -> 401', r.estado === 401);
  await adm.pedir('DELETE', '/api/sesion');
  r = await anon.pedir('GET', '/api/ruta-inexistente');
  verificar('ruta inexistente -> 404 JSON', r.estado === 404 && r.datos?.error);
} catch (e) {
  verificar('ejecución sin excepciones', false, e.stack?.split('\n')[0] ?? e);
}
process.exit(await ctx.finalizar());
