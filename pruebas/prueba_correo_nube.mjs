// Prueba controlada de correo REAL desde el Worker desplegado. Envía como máximo 2 correos al destinatario indicado.
// Uso: node pruebas/prueba_correo_nube.mjs <destinatario>
// Enciende el envío solo durante la prueba y lo apaga al terminar (también si falla).
import { readFileSync, writeFileSync } from 'node:fs';
import { ejecutarSql } from '../scripts/d1.mjs';

const BASE = 'https://reclamaciones.jnsoluciones.workers.dev';
const para = process.argv[2];
if (!para) { console.error('Falta el destinatario'); process.exit(2); }
const DOCUMENTO = '40009999'; // documento de relleno del caso de verificación
const { usuarios } = JSON.parse(readFileSync('pruebas/usuarios_nube.local.json', 'utf8'));
const clave = (correo) => usuarios.find((u) => u.correo === correo).clave;
// Las cuentas se eligen por tienda (null = administrador), no por un correo fijo.
const correoDe = (tienda) => usuarios.find((u) => (tienda ? u.establecimiento === tienda : u.rol === 'admin')).correo;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const filas = [];
let fallos = 0;
const anotar = (nombre, ok, detalle = '') => { if (!ok) fallos++; filas.push(`${ok ? 'OK    ' : 'FALLA '} ${nombre.padEnd(60)} ${detalle}`); };

async function pedir(metodo, ruta, { cuerpo, s } = {}) {
  const cab = { Origin: BASE };
  if (cuerpo !== undefined) cab['Content-Type'] = 'application/json';
  if (s) { cab.Cookie = s.cookie; if (metodo !== 'GET') cab['X-CSRF-Token'] = s.csrf; }
  const t = Date.now();
  const r = await fetch(BASE + ruta, { method: metodo, headers: cab, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  const texto = await r.text();
  let json = null; try { json = JSON.parse(texto); } catch { /* vacío */ }
  return { estado: r.status, json, ms: Date.now() - t, cookie: r.headers.get('set-cookie') };
}
async function ingresar(correo) {
  const r = await pedir('POST', '/api/sesion', { cuerpo: { correo, clave: clave(correo) } });
  return { cookie: r.cookie?.split(';')[0], csrf: r.json?.token_csrf };
}
async function esperarComunicacion(s, id, tipo) {
  for (let i = 0; i < 15; i++) {
    const r = await pedir('GET', `/api/reclamos/${id}`, { s });
    const c = r.json?.comunicaciones?.find((x) => x.tipo === tipo);
    if (c && c.estado !== 'pendiente') return c;
    await dormir(1500);
  }
  const r = await pedir('GET', `/api/reclamos/${id}`, { s });
  return r.json?.comunicaciones?.find((x) => x.tipo === tipo);
}

const limiteOriginal = ejecutarSql("SELECT valor FROM configuracion WHERE clave = 'limite_registros_por_origen_hora'", 'remoto')[0]?.valor;
const adm = await ingresar(correoDe(null));
const enc = await ingresar(correoDe('HYO-01'));
try {
  ejecutarSql("UPDATE configuracion SET valor = '1000' WHERE clave = 'limite_registros_por_origen_hora'", 'remoto');
  let r = await pedir('GET', '/api/admin/correo', { s: adm });
  anotar('el sistema ve el relevo configurado', r.json?.configurado === true, JSON.stringify(r.json));
  const enviadosAntes = r.json?.enviados_hoy ?? 0;

  r = await pedir('PATCH', '/api/admin/correo', { s: adm, cuerpo: { activo: true } });
  anotar('el administrador enciende el envío', r.estado === 200);

  r = await pedir('POST', '/api/reclamos', { cuerpo: {
    establecimiento_codigo: 'HYO-01', tipo: 'reclamo', medio_respuesta: 'correo',
    consumidor: { nombres: 'Cliente de Verificación', tipo_documento: 'DNI', numero_documento: DOCUMENTO, correo: para, es_menor: false },
    bien: { tipo: 'producto', descripcion: 'Hervidor eléctrico de 1,7 litros', monto: 89.9 },
    detalle: 'El hervidor dejó de calentar a la semana de la compra. Registro de verificación del envío de correo de la plataforma.',
    pedido: 'Solicito el cambio del producto por una unidad en buen estado.',
    acepta_tratamiento_datos: true,
  } });
  anotar('registro -> 201 con constancia por correo pendiente', r.estado === 201 && r.json?.correo_constancia === 'pendiente', `${r.json?.numero}, ${r.ms} ms, correo_constancia=${r.json?.correo_constancia}`);
  const numero = r.json?.numero;
  // Datos del caso de la prueba, para las comprobaciones posteriores (archivo local, fuera de Git).
  writeFileSync('pruebas/prueba_correo_ultima.local.json', JSON.stringify({ numero, codigo: r.json?.codigo_seguimiento, documento: DOCUMENTO, fecha_limite: r.json?.plazo?.fecha_limite ?? r.json?.fecha_limite ?? null, registrada: new Date().toISOString() }, null, 2));

  const lista = await pedir('GET', '/api/reclamos', { s: enc });
  const id = lista.json?.reclamos?.find((x) => x.numero === numero)?.id;
  let c = await esperarComunicacion(enc, id, 'constancia_correo');
  anotar('constancia: el Worker la envió por el relevo', c?.estado === 'enviado', `estado=${c?.estado}, intentos=${c?.intentos}, detalle=${c?.detalle}`);

  r = await pedir('POST', `/api/reclamos/${id}/respuesta`, { s: enc, cuerpo: { texto: 'Estimado cliente: revisamos su caso y confirmamos la falla del hervidor eléctrico. Procede el cambio por una unidad nueva, que puede recoger en nuestra tienda de Huancayo presentando su comprobante de compra. Lamentamos las molestias ocasionadas.' } });
  anotar('respuesta -> 200', r.estado === 200, `${r.ms} ms`);
  c = await esperarComunicacion(enc, id, 'respuesta_correo');
  anotar('respuesta: el Worker la envió por el relevo', c?.estado === 'enviado', `estado=${c?.estado}, intentos=${c?.intentos}, detalle=${c?.detalle}`);

  r = await pedir('GET', '/api/admin/correo', { s: adm });
  anotar('el contador diario subió en 2', r.json?.enviados_hoy === enviadosAntes + 2, `enviados_hoy=${r.json?.enviados_hoy}`);
  const dup = ejecutarSql(`SELECT COUNT(*) AS n FROM comunicaciones WHERE reclamo_id = ${Number(id)}`, 'remoto')[0]?.n;
  anotar('sin comunicaciones duplicadas (2 filas: constancia y respuesta)', dup === 2, `filas=${dup}`);
} finally {
  const r = await pedir('PATCH', '/api/admin/correo', { s: adm, cuerpo: { activo: false } });
  const fin = await pedir('GET', '/api/admin/correo', { s: adm });
  anotar('el envío queda apagado al terminar', r.estado === 200 && fin.json?.activo === false, `activo=${fin.json?.activo}`);
  if (limiteOriginal !== undefined) ejecutarSql(`UPDATE configuracion SET valor = '${Number(limiteOriginal)}' WHERE clave = 'limite_registros_por_origen_hora'`, 'remoto');
  const lim = ejecutarSql("SELECT valor FROM configuracion WHERE clave = 'limite_registros_por_origen_hora'", 'remoto')[0]?.valor;
  anotar('límite por origen restaurado', lim === limiteOriginal, `valor=${lim}`);
  for (const s of [adm, enc]) await pedir('DELETE', '/api/sesion', { s });
}

console.log(`\n=== Prueba de correo real desde el Worker ===\nFecha: ${new Date().toISOString()} · ${BASE}`);
for (const f of filas) console.log(f);
console.log(`--- ${filas.length - fallos}/${filas.length} verificaciones correctas ---`);
process.exit(fallos ? 1 : 0);
