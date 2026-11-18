// Validación de la base de demostración. SOLO LECTURA: no registra hojas ni responde casos, para no ensuciar la base sembrada.
// (Los inicios de sesión crean sesiones, que se cierran al terminar.)
// Uso: node pruebas/validacion_demo.mjs            (local, http://localhost:8787, cuentas de usuarios_demo_local.local.json)
//      node pruebas/validacion_demo.mjs --remoto   (nube, cuentas de usuarios_nube.local.json)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { createServer } from 'vite';

const DIR = dirname(fileURLToPath(import.meta.url));
const raiz = join(DIR, '..');
const remoto = process.argv.includes('--remoto');
const base = remoto ? 'https://reclamaciones.jnsoluciones.workers.dev' : 'http://localhost:8787';
const { usuarios } = JSON.parse(readFileSync(join(DIR, remoto ? 'usuarios_nube.local.json' : 'usuarios_demo_local.local.json'), 'utf8'));
const { casos } = JSON.parse(readFileSync(join(DIR, remoto ? 'casos_demo_nube.local.json' : 'casos_demo_local.local.json'), 'utf8'));
const carpetaCartas = process.argv.find((a) => a.startsWith('--cartas='))?.slice(9);

const RAZON = 'Comercial del Centro S.A.C.';
// Expresiones que ya no deben aparecer en ningún dato visible.
// Incluye cualquier URL del Worker con su nombre anterior («reclamoclaro.<subdominio>.workers.dev»).
const PROHIBIDO = /fictici|\(demo\)|\bPRUEBA\b|ReclamoClaro|reclamoclaro\.[a-z0-9-]+\.workers\.dev|\bundefined\b|\bNaN\b/i;
const filas = [];
let fallos = 0;
const textos = []; // todo lo recibido de la API, para el barrido final
function anotar(nombre, ok, detalle = '') {
  if (!ok) fallos++;
  filas.push(`${ok ? 'OK    ' : 'FALLA '} ${nombre.padEnd(74)} ${detalle}`);
}
async function pedir(metodo, ruta, { cuerpo, cookie, csrf } = {}) {
  const cabeceras = { Origin: base };
  if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';
  if (cookie) cabeceras.Cookie = cookie;
  if (csrf) cabeceras['X-CSRF-Token'] = csrf;
  const r = await fetch(base + ruta, { method: metodo, headers: cabeceras, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  const texto = await r.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* no es JSON */ }
  if (r.status === 200) textos.push([`${metodo} ${ruta.replace(/[0-9a-f]{32}/, '<código>')}`, texto]);
  return { estado: r.status, json, texto, cookie: r.headers.get('set-cookie') };
}
async function ingresar(u) {
  const r = await pedir('POST', '/api/sesion', { cuerpo: { correo: u.correo, clave: u.clave } });
  return { estado: r.estado, cookie: r.cookie?.split(';')[0], csrf: r.json?.token_csrf, usuario: r.json?.usuario };
}
function textoPdf(buf) {
  const trozos = [];
  let i = 0;
  for (;;) {
    const a = buf.indexOf('stream\n', i);
    if (a < 0) break;
    const b = buf.indexOf('endstream', a);
    let datos = buf.subarray(a + 7, b);
    try { datos = inflateSync(datos); } catch { /* sin comprimir */ }
    trozos.push(datos.toString('latin1'));
    i = b + 9;
  }
  return [...trozos.join('\n').matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)].map((m) => m[1].replace(/\\([()\\])/g, '$1')).join('\n');
}

// --- 1. Datos públicos ---------------------------------------------------------------------------------
const salud = await pedir('GET', '/api/salud');
anotar('salud 200, servicio jn-reclamaciones', salud.estado === 200 && salud.json?.servicio === 'jn-reclamaciones', `versión ${salud.json?.version}`);
const emp = (await pedir('GET', '/api/publico/empresa')).json;
anotar('razón social sin sufijos', emp?.razon_social === RAZON, `«${emp?.razon_social}»`);
anotar('dirección fiscal de demostración', emp?.direccion_fiscal === 'Av. Los Mercaderes 120, Huancayo, Junín', `«${emp?.direccion_fiscal}»`);
const pubEst = (await pedir('GET', '/api/publico/establecimientos')).json;
const tiendas = Array.isArray(pubEst) ? pubEst : (Object.values(pubEst ?? {}).find(Array.isArray) ?? []);
anotar('5 establecimientos con dirección y ciudad, sin sufijos', tiendas.length === 5 && tiendas.every((t) => t.direccion && t.ciudad && !PROHIBIDO.test(JSON.stringify(t))), tiendas.map((t) => t.codigo).join(' '));
const html = await (await fetch(base + '/')).text();
const js = await (await fetch(base + '/' + (html.match(/assets\/index-[^"]+\.js/) ?? [''])[0])).text();
anotar('portal: aviso «Prototipo académico — entorno de demostración»', js.includes('Prototipo académico — entorno de demostración'));
anotar('interfaz publicada sin «ReclamoClaro» ni la URL anterior', !/ReclamoClaro|reclamoclaro\.[a-z0-9-]+\.workers\.dev/.test(html + js));

// --- 2. Cuentas, cargos y permisos ----------------------------------------------------------------------
const sesiones = {};
for (const u of usuarios) {
  const s = await ingresar(u);
  sesiones[u.correo] = s;
  anotar(`inicia sesión: ${u.nombre} (${u.rol}${u.establecimiento ? ' ' + u.establecimiento : ''})`, s.estado === 200 && s.usuario?.nombre === u.nombre && s.usuario?.rol === u.rol, `HTTP ${s.estado}`);
}
const admin = sesiones[usuarios.find((u) => u.rol === 'admin').correo];
const de = (codigo) => sesiones[usuarios.find((u) => u.establecimiento === codigo).correo];
const todos = (await pedir('GET', '/api/reclamos?por_pagina=50', { cookie: admin.cookie })).json;
const lista = todos?.reclamos ?? [];
anotar('administrador ve las 12 hojas', todos?.total === 12 && lista.length === 12, `total ${todos?.total}`);
for (const codigo of ['HYO-01', 'TAM-01', 'JAU-01', 'CON-01', 'TAR-01']) {
  const b = (await pedir('GET', '/api/reclamos?por_pagina=50', { cookie: de(codigo).cookie })).json;
  const esperadas = casos.filter((c) => c.tienda === codigo).length;
  anotar(`encargado de ${codigo}: solo su tienda`, b?.total === esperadas && (b?.reclamos ?? []).every((x) => x.establecimiento.codigo === codigo), `${b?.total} de ${esperadas}`);
}
const ajena = lista.find((x) => x.establecimiento.codigo === 'HYO-01');
anotar('encargado de El Tambo pide un caso de Huancayo -> 403', (await pedir('GET', `/api/reclamos/${ajena?.id}`, { cookie: de('TAM-01').cookie })).estado === 403);
anotar('encargado en ruta de administración -> 403', (await pedir('GET', '/api/admin/usuarios', { cookie: de('JAU-01').cookie })).estado === 403);
anotar('bandeja sin sesión -> 401', (await pedir('GET', '/api/reclamos')).estado === 401);

// --- 3. Indicadores, plazos (calculados por el sistema) y reportes ---------------------------------------
const cuenta = (xs, f) => xs.reduce((m, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), {});
const porEstado = cuenta(lista, (x) => x.estado);
const porSemaforo = cuenta(lista, (x) => x.plazo?.semaforo);
anotar('estados: registrado, en atención y respondido presentes', porEstado.registrado > 0 && porEstado.en_atencion > 0 && porEstado.respondido > 0, JSON.stringify(porEstado));
const semaforos = Object.keys(porSemaforo);
anotar('semáforo calculado: en plazo, por vencer, último tramo, vencido y cerrado presentes', ['verde', 'ambar', 'rojo', 'vencido', 'cerrado'].every((k) => semaforos.includes(k)), JSON.stringify(porSemaforo));
const panel = await pedir('GET', '/api/panel', { cookie: admin.cookie });
anotar('indicadores del panel coherentes con la bandeja', panel.estado === 200 && JSON.stringify(panel.json).includes('"total":12'), `HTTP ${panel.estado}`);
const hoy = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
const desde = new Date(Date.now() - 60 * 86400e3).toISOString().slice(0, 10);
const rep = await pedir('GET', `/api/reportes?desde=${desde}&hasta=${hoy}`, { cookie: admin.cookie });
const ind = rep.json?.indicadores ?? rep.json?.resumen ?? {};
anotar('reporte de 60 días: respondidos dentro y fuera de plazo', rep.estado === 200 && ind.respondidos_en_plazo >= 1 && ind.respondidos_fuera_de_plazo >= 1, `en plazo ${ind.respondidos_en_plazo}, fuera ${ind.respondidos_fuera_de_plazo}, cumplimiento ${ind.cumplimiento_pct} %`);
anotar('encargado pide el reporte de otra tienda -> 403', (await pedir('GET', `/api/reportes?desde=${desde}&hasta=${hoy}&establecimiento=HYO-01`, { cookie: de('TAM-01').cookie })).estado === 403);
for (const [n, r] of [['usuarios', '/api/admin/usuarios'], ['establecimientos', '/api/admin/establecimientos'], ['historial', '/api/admin/eventos'], ['correo', '/api/admin/correo']]) {
  anotar(`administración: ${n} -> 200`, (await pedir('GET', r, { cookie: admin.cookie })).estado === 200);
}
const correo = (await pedir('GET', '/api/admin/correo', { cookie: admin.cookie })).json;
anotar('envío real de correo apagado', JSON.stringify(correo).includes('"activo":false'), JSON.stringify(correo).slice(0, 90));

// --- 4. Detalle, seguimiento y cartas con los datos actualizados -----------------------------------------
let comunicaciones = 0;
let comunicacionesClaras = 0;
for (const x of lista) {
  const d = (await pedir('GET', `/api/reclamos/${x.id}`, { cookie: admin.cookie })).json;
  for (const c of d?.comunicaciones ?? []) {
    comunicaciones++;
    // Ninguna comunicación sembrada figura como envío real: o dice que es simulada o es una carta sin entregar.
    if (c.estado !== 'enviado' && (/simulad/i.test(c.detalle ?? '') || c.estado === 'pendiente_entrega')) comunicacionesClaras++;
  }
}
anotar('comunicaciones sembradas identificadas como simuladas (ninguna «enviado»)', comunicaciones > 0 && comunicaciones === comunicacionesClaras, `${comunicacionesClaras} de ${comunicaciones}`);
const vite = await createServer({ root: raiz, logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
try {
  const { generarCartaPdf } = await vite.ssrLoadModule('/src/web/carta/generarCarta.ts');
  if (carpetaCartas) mkdirSync(resolve(carpetaCartas), { recursive: true });
  for (const c of casos) {
    const seg = await pedir('GET', `/api/seguimiento/${c.codigo}`);
    const sinPersonales = !seg.texto.includes(c.documento) && !/nombres|domicilio|telefono/.test(seg.texto);
    if (c.estado !== 'respondido') {
      anotar(`seguimiento ${c.numero}: 200, sin datos personales`, seg.estado === 200 && sinPersonales, `estado ${seg.json?.estado}`);
      continue;
    }
    const mal = await pedir('POST', `/api/seguimiento/${c.codigo}/respuesta`, { cuerpo: { numero_documento: '99999999' } });
    const bien = await pedir('POST', `/api/seguimiento/${c.codigo}/respuesta`, { cuerpo: { numero_documento: c.documento } });
    const carta = bien.json?.carta;
    const responsable = usuarios.find((u) => u.establecimiento === c.tienda);
    const { blob, nombreArchivo } = await generarCartaPdf(carta);
    const buf = Buffer.from(await blob.arrayBuffer());
    if (carpetaCartas) writeFileSync(join(resolve(carpetaCartas), nombreArchivo), buf);
    const pdf = textoPdf(buf);
    const ok =
      seg.estado === 200 && sinPersonales && mal.estado !== 200 && bien.estado === 200 &&
      carta.empresa.razon_social === RAZON && carta.responsable.nombre === responsable.nombre && carta.responsable.cargo === (responsable.cargo ?? 'Encargado de tienda') && pdf.includes(carta.responsable.cargo) &&
      pdf.includes(RAZON) && pdf.includes(carta.establecimiento.direccion) && pdf.includes(`${carta.establecimiento.ciudad}, `) && pdf.includes(responsable.nombre) && !PROHIBIDO.test(pdf);
    anotar(`carta ${c.numero}: protegida, razón social, tienda y responsable correctos`, ok, `${carta?.establecimiento?.ciudad} · ${carta?.responsable?.nombre}, ${carta?.responsable?.cargo} · documento incorrecto -> HTTP ${mal.estado}`);
  }
  // Correos: las mismas plantillas del Worker, con la razón social que devuelve la API.
  const { plantillaConstancia, plantillaRespuesta } = await vite.ssrLoadModule('/src/worker/correo/plantillas.ts');
  const c0 = casos[0];
  const m1 = plantillaConstancia({ numero: c0.numero, creadoEn: new Date().toISOString(), establecimiento: 'Tienda', tipo: c0.tipo, fechaLimite: new Date().toISOString(), codigoSeguimiento: c0.codigo, urlSeguimiento: `${base}/seguimiento/${c0.codigo}`, empresa: emp.razon_social });
  const m2 = plantillaRespuesta({ numero: c0.numero, texto: 'Texto', responsable: usuarios[1].nombre, cargo: 'Encargado de tienda', urlSeguimiento: `${base}/seguimiento/${c0.codigo}`, empresa: emp.razon_social });
  const correos = m1.html + m1.texto + m1.asunto + m2.html + m2.texto + m2.asunto;
  anotar('correos: razón social de la base, enlace del caso e identificación de demostración', correos.includes(RAZON) && correos.includes(`/seguimiento/${c0.codigo}`) && /Entorno de demostración/.test(correos) && !PROHIBIDO.test(correos));
} finally {
  await vite.close();
}

// --- 5. Barrido de todo lo recibido de la API ------------------------------------------------------------
const sucios = textos.filter(([, t]) => PROHIBIDO.test(t));
anotar(`barrido de ${textos.length} respuestas de la API: sin textos antiguos`, sucios.length === 0, sucios.slice(0, 4).map(([r, t]) => `${r}: «${t.match(PROHIBIDO)[0]}»`).join(' | '));

for (const s of Object.values(sesiones)) if (s.cookie) await fetch(base + '/api/sesion', { method: 'DELETE', headers: { Origin: base, Cookie: s.cookie, 'X-CSRF-Token': s.csrf ?? '' } }).catch(() => {});

console.log(`\n=== Validación de la base de demostración (${remoto ? 'nube' : 'local'}): ${base} ===`);
console.log(`Fecha: ${new Date().toISOString()}`);
console.log(filas.join('\n'));
console.log(`--- ${filas.length - fallos}/${filas.length} verificaciones correctas ---`);
process.exit(fallos === 0 ? 0 : 1);
