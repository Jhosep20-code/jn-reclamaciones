// Cartas de respuesta en PDF de los CINCO establecimientos, con datos REALES de la API local (no escritos a mano):
// registra una hoja ficticia por tienda (respuesta por carta), la responde como administrador, pide la carta por la
// consulta segura pública y genera el PDF con el mismo código de la interfaz. Después comprueba el texto del PDF.
// Solo local. Uso: node scripts/muestra_carta.mjs [urlBase=http://localhost:8787] [carpetaSalida]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { createServer } from 'vite';
import { crearCliente, fechaHoyLima, solicitudValida } from '../pruebas/_comun.mjs';
import { ejecutarSql } from './d1.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = (process.argv[2] ?? 'http://localhost:8787').replace(/\/$/, '');
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Solo local.');
const salida = resolve(process.argv[3] ?? join(raiz, '..', '..', '05_DISENO_Y_PROTOTIPO', 'capturas', 'jn_refinado', 'cartas'));
mkdirSync(salida, { recursive: true });

// Texto visible de un PDF de jsPDF (Helvetica, cadenas literales dentro de flujos comprimidos).
function textoPdf(buf) {
  const trozos = [];
  let i = 0;
  for (;;) {
    const a = buf.indexOf('stream\n', i);
    if (a < 0) break;
    const b = buf.indexOf('endstream', a);
    let datos = buf.subarray(a + 7, b);
    try { datos = inflateSync(datos); } catch { /* flujo sin comprimir */ }
    trozos.push(datos.toString('latin1'));
    i = b + 9;
  }
  return [...trozos.join('\n').matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)].map((m) => m[1].replace(/\\([()\\])/g, '$1')).join('\n');
}

const cuentas = JSON.parse(readFileSync(join(raiz, 'pruebas', 'usuarios_de_prueba.local.json'), 'utf8'));
const admin = crearCliente(base);
if ((await admin.iniciarSesion(cuentas.admin.correo, cuentas.admin.clave)).estado !== 200) throw new Error('No se pudo iniciar sesión como administrador de prueba.');
const tiendas = (await admin.pedir('GET', '/api/admin/establecimientos')).datos;
const lista = Array.isArray(tiendas) ? tiendas : tiendas.establecimientos ?? tiendas.items;
const vite = await createServer({ root: raiz, logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const { generarCartaPdf } = await vite.ssrLoadModule('/src/web/carta/generarCarta.ts');
const anon = crearCliente(base);
let fallos = 0;
try {
  for (const t of lista.filter((x) => x.activo !== false)) {
    const consumidor = { ...solicitudValida('x').consumidor, nombres: 'Persona Ficticia PRUEBA', domicilio: 'Jr. Ficticio 123 (PRUEBA)' };
    const reg = await anon.pedir('POST', '/api/reclamos', solicitudValida(t.codigo, { medio_respuesta: 'carta', consumidor }));
    if (reg.estado !== 201) throw new Error(`${t.codigo}: registro ${reg.estado}`);
    const sql = `SELECT id FROM reclamos WHERE codigo_seguimiento = '${reg.datos.codigo_seguimiento.replace(/[^0-9a-f]/g, '')}';`;
    const id = ejecutarSql(sql)[0]?.id;
    const resp = await admin.pedir('POST', `/api/reclamos/${id}/respuesta`, { texto: 'PRUEBA: se atendió el caso y se coordinó el cambio del producto.', medio_comunicacion: 'carta', fecha_comunicacion: fechaHoyLima() });
    if (resp.estado !== 200 && resp.estado !== 201) throw new Error(`${t.codigo}: respuesta ${resp.estado}`);
    const seg = await anon.pedir('POST', `/api/seguimiento/${reg.datos.codigo_seguimiento}/respuesta`, { numero_documento: consumidor.numero_documento });
    if (seg.estado !== 200) throw new Error(`${t.codigo}: consulta segura ${seg.estado}`);
    const carta = seg.datos.carta;
    const { blob, nombreArchivo, paginas } = await generarCartaPdf(carta);
    const buf = Buffer.from(await blob.arrayBuffer());
    writeFileSync(join(salida, nombreArchivo), buf);
    const texto = textoPdf(buf);
    const malos = texto.match(/\b(undefined|null|NaN)\b/g) ?? [];
    const ciudadOk = typeof carta.establecimiento.ciudad === 'string' && carta.establecimiento.ciudad.length > 0 && texto.includes(`${carta.establecimiento.ciudad}, `);
    const direccionOk = texto.includes(carta.establecimiento.direccion);
    const ok = malos.length === 0 && ciudadOk && direccionOk && texto.includes(t.codigo);
    if (!ok) fallos++;
    console.log(`${ok ? 'OK   ' : 'FALLA'} ${t.codigo} | ciudad de la API: «${carta.establecimiento.ciudad}» | dirección: «${carta.establecimiento.direccion}» | páginas: ${paginas} | valores vacíos: ${malos.length} | ${nombreArchivo}`);
  }
} finally {
  await vite.close();
}
console.log(fallos === 0 ? `RESULTADO: APROBADO (${lista.filter((x) => x.activo !== false).length} establecimientos activos)` : `RESULTADO: FALLIDO (${fallos})`);
process.exit(fallos === 0 ? 0 : 1);
