// Relevo de correo SIMULADO (solo para pruebas locales). Imita a integraciones/apps_script/Codigo.gs:
//  - firma HMAC-SHA256 en hexadecimal sobre la cadena `carga`, comparada en tiempo constante;
//  - rechaza solicitudes con más de 300 s de diferencia, nonces repetidos y destinatarios mal formados;
//  - responde siempre HTTP 200 con { ok: true, restante } o { ok: false, error }, y lo hace con una redirección 302
//    (como Apps Script) para comprobar que el cliente usa redirect: 'follow'.
// No envía nada: solo cuenta y guarda en memoria lo que recibiría. Escucha únicamente en 127.0.0.1.
//
// Uso en pruebas:  const relevo = await crearRelevo({ secreto, puerto }); ... await relevo.cerrar();
// Uso manual:      node pruebas/relevo_simulado.mjs   (lee URL_RELEVO_CORREO y SECRETO_CORREO de .dev.vars)
import { createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VENTANA_SEGUNDOS = 300;
const RE_DESTINATARIO = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/;

export function firmaEsperada(secreto, carga) {
  return createHmac('sha256', secreto).update(carga, 'utf8').digest('hex');
}

function igualesTiempoConstante(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function crearRelevo({ secreto, puerto, redirigir = true }) {
  const nonces = new Set();
  const resultados = new Map(); // id -> cuerpo JSON (para la redirección)
  let contador = 0;
  const estado = {
    solicitudes: 0, // POST recibidos
    enviados: [], // correos aceptados: { para, asunto, html, texto, ts }
    rechazos: {}, // código de error -> cantidad
    fallosForzados: 0,
    demoraMs: 0,
  };

  function validar(cuerpoCrudo) {
    let sobre;
    try { sobre = JSON.parse(cuerpoCrudo); } catch { return { ok: false, error: 'interno' }; }
    if (typeof sobre.carga !== 'string' || typeof sobre.firma !== 'string') return { ok: false, error: 'formato' };
    if (!igualesTiempoConstante(firmaEsperada(secreto, sobre.carga), String(sobre.firma).toLowerCase())) return { ok: false, error: 'firma' };
    let d;
    try { d = JSON.parse(sobre.carga); } catch { return { ok: false, error: 'interno' }; }
    const ahora = Math.floor(Date.now() / 1000);
    if (d.v !== 1 || typeof d.ts !== 'number' || Math.abs(ahora - d.ts) > VENTANA_SEGUNDOS) return { ok: false, error: 'caducada' };
    if (typeof d.nonce !== 'string' || !/^[0-9a-f]{32}$/.test(d.nonce)) return { ok: false, error: 'nonce' };
    if (nonces.has(d.nonce)) return { ok: false, error: 'repetida' };
    nonces.add(d.nonce);
    if (typeof d.para !== 'string' || !RE_DESTINATARIO.test(d.para) || d.para.length > 254) return { ok: false, error: 'destinatario' };
    if (typeof d.asunto !== 'string' || d.asunto.length < 3 || d.asunto.length > 200) return { ok: false, error: 'asunto' };
    if (typeof d.html !== 'string' || d.html.length > 60000 || typeof d.texto !== 'string') return { ok: false, error: 'contenido' };
    if (estado.fallosForzados > 0) { estado.fallosForzados--; return { ok: false, error: 'interno' }; }
    estado.enviados.push({ para: d.para, asunto: d.asunto, html: d.html, texto: d.texto, ts: d.ts });
    return { ok: true, restante: 100 - estado.enviados.length };
  }

  const servidor = createServer((req, res) => {
    const partes = [];
    req.on('data', (p) => partes.push(p));
    req.on('end', async () => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (req.method === 'GET' && url.pathname.startsWith('/resultado/')) {
        const cuerpo = resultados.get(url.pathname.split('/').pop());
        resultados.delete(url.pathname.split('/').pop());
        res.writeHead(cuerpo ? 200 : 404, { 'Content-Type': 'application/json' });
        res.end(cuerpo ?? '{"ok":false,"error":"interno"}');
        return;
      }
      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true,"servicio":"relevo-simulado"}');
        return;
      }
      if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
      estado.solicitudes++;
      if (estado.demoraMs) await new Promise((r) => setTimeout(r, estado.demoraMs));
      const r = validar(Buffer.concat(partes).toString('utf8'));
      if (!r.ok) estado.rechazos[r.error] = (estado.rechazos[r.error] ?? 0) + 1;
      const cuerpo = JSON.stringify(r);
      if (redirigir) {
        const id = String(++contador);
        resultados.set(id, cuerpo);
        res.writeHead(302, { Location: `/resultado/${id}` });
        res.end();
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(cuerpo);
      }
    });
  });
  await new Promise((resolver, rechazar) => {
    servidor.once('error', rechazar);
    servidor.listen(puerto, '127.0.0.1', resolver);
  });

  return {
    puerto,
    estado,
    // Los próximos `n` envíos válidos responderán { ok: false, error: 'interno' }.
    forzarFallos(n) { estado.fallosForzados = n; },
    demorar(ms) { estado.demoraMs = ms; },
    reiniciarConteos() { estado.solicitudes = 0; estado.enviados.length = 0; estado.rechazos = {}; },
    cerrar() {
      return new Promise((resolver) => {
        servidor.closeAllConnections?.();
        servidor.close(() => resolver());
      });
    },
  };
}

// Lee un archivo tipo .dev.vars (CLAVE=valor por línea).
export function leerDevVars(ruta) {
  const salida = {};
  if (!existsSync(ruta)) return salida;
  for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) salida[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return salida;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const vars = leerDevVars(join(dirname(fileURLToPath(import.meta.url)), '..', '.dev.vars'));
  const url = new URL(vars.URL_RELEVO_CORREO ?? 'http://localhost:8799');
  if (!vars.SECRETO_CORREO) { console.error('Falta SECRETO_CORREO en .dev.vars'); process.exit(2); }
  const relevo = await crearRelevo({ secreto: vars.SECRETO_CORREO, puerto: Number(url.port) || 8799 });
  console.log(`Relevo simulado escuchando en http://127.0.0.1:${relevo.puerto} (Ctrl+C para detener)`);
  process.on('SIGINT', async () => { await relevo.cerrar(); console.log(`Recibió ${relevo.estado.solicitudes} solicitudes, aceptó ${relevo.estado.enviados.length}.`); process.exit(0); });
}
