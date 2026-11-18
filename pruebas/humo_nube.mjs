// Comprobación breve ("de humo") contra el despliegue real. Crea UNA hoja ficticia y no modifica nada más.
// Uso: node pruebas/humo_nube.mjs [URL]
import { readFileSync } from 'node:fs';

const BASE = (process.argv[2] ?? 'https://reclamaciones.jnsoluciones.workers.dev').replace(/\/$/, '');
const { usuarios } = JSON.parse(readFileSync('pruebas/usuarios_nube.local.json', 'utf8'));
const cuenta = (correo) => usuarios.find((u) => u.correo === correo);
// Las cuentas se eligen por tienda (null = administrador), no por un correo fijo.
const correoDe = (tienda) => usuarios.find((u) => (tienda ? u.establecimiento === tienda : u.rol === 'admin')).correo;

const filas = [];
let fallos = 0;
function anotar(nombre, ok, detalle = '') {
  if (!ok) fallos++;
  filas.push(`${ok ? 'OK    ' : 'FALLA '} ${nombre.padEnd(58)} ${detalle}`);
}

async function pedir(metodo, ruta, { cuerpo, cookie, csrf } = {}) {
  const cabeceras = { Origin: BASE };
  if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';
  if (cookie) cabeceras.Cookie = cookie;
  if (csrf) cabeceras['X-CSRF-Token'] = csrf;
  const inicio = Date.now();
  const r = await fetch(BASE + ruta, { method: metodo, headers: cabeceras, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  const texto = await r.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* no es JSON */ }
  return { estado: r.status, json, texto, ms: Date.now() - inicio, cookie: r.headers.get('set-cookie') };
}

async function ingresar(correo) {
  const r = await pedir('POST', '/api/sesion', { cuerpo: { correo, clave: cuenta(correo).clave } });
  const cookie = r.cookie ? r.cookie.split(';')[0] : null;
  return { ...r, cookie, csrf: r.json?.token_csrf, atributos: r.cookie ?? '' };
}

const salud = await pedir('GET', '/api/salud');
anotar('salud 200 y lee de D1', salud.estado === 200 && salud.json?.establecimientos >= 5, `version ${salud.json?.version}, ${salud.ms} ms`);

const inicio = await fetch(BASE + '/');
anotar('la interfaz se sirve en /', inicio.status === 200 && (inicio.headers.get('content-type') ?? '').includes('text/html'));

const tiendas = await pedir('GET', '/api/publico/establecimientos');
anotar('establecimientos públicos', tiendas.estado === 200 && tiendas.json?.length >= 5, `${tiendas.json?.length} tiendas`);

const sinSesion = await pedir('GET', '/api/reclamos');
anotar('bandeja sin sesión -> 401', sinSesion.estado === 401, `HTTP ${sinSesion.estado}`);

const registro = await pedir('POST', '/api/reclamos', {
  cuerpo: {
    establecimiento_codigo: 'HYO-01',
    tipo: 'reclamo',
    medio_respuesta: 'correo',
    consumidor: { nombres: 'Persona Ficticia de Humo', tipo_documento: 'DNI', numero_documento: '00000001', correo: 'humo@example.com', es_menor: false },
    bien: { tipo: 'producto', descripcion: 'Producto ficticio de comprobación', monto: 10.5 },
    detalle: 'Registro ficticio para comprobar el despliegue en la nube.',
    pedido: 'Ninguno: es una comprobación técnica.',
    acepta_tratamiento_datos: true,
  },
});
anotar('registro público -> 201 con número y código', registro.estado === 201 && /^[0-9a-f]{32}$/.test(registro.json?.codigo_seguimiento ?? ''), `${registro.json?.numero ?? registro.texto.slice(0, 80)}, ${registro.ms} ms`);

const codigo = registro.json?.codigo_seguimiento;
const seg = await pedir('GET', `/api/seguimiento/${codigo}`);
const sinDatos = seg.texto && !seg.texto.includes('Humo') && !seg.texto.includes('00000001') && !seg.texto.includes('humo@example.com');
anotar('seguimiento 200 y sin datos personales', seg.estado === 200 && sinDatos, `estado "${seg.json?.estado}", límite ${seg.json?.plazo?.fecha_limite?.slice(0, 10)}`);

const hyo = await ingresar(correoDe('HYO-01'));
anotar('inicio de sesión (PBKDF2 en el Worker real) -> 200', hyo.estado === 200 && !!hyo.csrf, `HTTP ${hyo.estado}, ${hyo.ms} ms`);
anotar('cookie __Host-, HttpOnly, Secure, SameSite=Lax', /^__Host-rc_sesion=/.test(hyo.atributos) && /HttpOnly/i.test(hyo.atributos) && /Secure/i.test(hyo.atributos) && /SameSite=Lax/i.test(hyo.atributos));

const lista = await pedir('GET', '/api/reclamos', { cookie: hyo.cookie });
const mio = lista.json?.reclamos?.find((x) => x.numero === registro.json?.numero);
anotar('el encargado de Huancayo ve la hoja nueva', lista.estado === 200 && !!mio, `${lista.json?.total} en su bandeja`);
anotar('su bandeja solo tiene su tienda', (lista.json?.reclamos ?? []).every((x) => x.establecimiento.codigo === 'HYO-01'));

const tam = await ingresar(correoDe('TAM-01'));
const ajeno = await pedir('GET', `/api/reclamos/${mio?.id}`, { cookie: tam.cookie });
anotar('encargado de El Tambo pide un caso de Huancayo -> 403', ajeno.estado === 403, `HTTP ${ajeno.estado}`);

const admin = await pedir('GET', '/api/admin/usuarios', { cookie: tam.cookie });
anotar('encargado en ruta de administración -> 403', admin.estado === 403, `HTTP ${admin.estado}`);

const sinCsrf = await pedir('PATCH', `/api/reclamos/${mio?.id}`, { cookie: hyo.cookie, cuerpo: { estado: 'en_atencion' } });
anotar('cambio sin token CSRF -> 403', sinCsrf.estado === 403, `HTTP ${sinCsrf.estado}`);

for (const s of [hyo, tam]) await pedir('DELETE', '/api/sesion', { cookie: s.cookie, csrf: s.csrf });
const cerrada = await pedir('GET', '/api/sesion', { cookie: hyo.cookie });
anotar('sesión cerrada -> 401', cerrada.estado === 401, `HTTP ${cerrada.estado}`);

console.log(`\n=== Comprobación en la nube: ${BASE} ===`);
console.log(`Fecha: ${new Date().toISOString()}`);
for (const f of filas) console.log(f);
console.log(`--- ${filas.length - fallos}/${filas.length} verificaciones correctas ---`);
process.exit(fallos ? 1 : 0);
