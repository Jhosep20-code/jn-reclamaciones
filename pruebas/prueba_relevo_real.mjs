// Prueba controlada del relevo REAL de correo (Google Apps Script). Envía UN correo.
// Uso: node pruebas/prueba_relevo_real.mjs <destinatario>
// Lee la URL de .url_relevo.local y el secreto de .secreto_correo.local (ninguno se versiona ni se imprime).
import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

const para = process.argv[2];
if (!para) { console.error('Falta el destinatario'); process.exit(2); }
const url = readFileSync('.url_relevo.local', 'utf8').trim();
const secreto = readFileSync('.secreto_correo.local', 'utf8').trim();

const filas = [];
let fallos = 0;
const anotar = (nombre, ok, detalle = '') => { if (!ok) fallos++; filas.push(`${ok ? 'OK    ' : 'FALLA '} ${nombre.padEnd(52)} ${detalle}`); };

function sobre(datos, clave = secreto) {
  const carga = JSON.stringify(datos);
  return { carga, firma: createHmac('sha256', clave).update(carga, 'utf8').digest('hex') };
}
async function enviar(cuerpo) {
  const inicio = Date.now();
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo), redirect: 'follow' });
  const texto = await r.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* no es JSON */ }
  return { estado: r.status, json, ms: Date.now() - inicio, inicioTexto: texto.slice(0, 60) };
}
const ahora = () => Math.floor(Date.now() / 1000);
const base = () => ({
  v: 1, ts: ahora(), nonce: randomBytes(16).toString('hex'), para,
  asunto: 'Prueba controlada del relevo de correo (prototipo académico)',
  texto: 'Este es un correo de prueba del relevo de JN Reclamaciones. Si lo recibió, la conexión y la firma funcionan.',
  html: '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #d9cfc0;border-radius:10px;overflow:hidden"><div style="background:#0B1220;color:#F8F7F4;padding:16px 20px;font-size:18px;font-weight:700;border-bottom:3px solid #C5A059">JN Reclamaciones</div><div style="padding:20px;color:#12292c;font-size:15px;line-height:1.5"><p><strong>Prueba controlada del relevo de correo.</strong></p><p>Si recibió este mensaje, la conexión entre el sistema y Google Apps Script funciona y la firma HMAC fue aceptada.</p><p style="color:#4b5563;font-size:13px">Mensaje automático de un prototipo académico. No responda a este correo.</p></div></div>',
});

// 1. La aplicación web responde.
const g = await fetch(url, { redirect: 'follow' });
const gj = await g.json().catch(() => null);
anotar('GET: la aplicación web está publicada', g.status === 200 && gj?.ok === true, `HTTP ${g.status}`);

// 2. Firma inválida (otro secreto): debe rechazar SIN enviar.
let r = await enviar(sobre(base(), 'secreto-incorrecto'));
anotar('firma inválida -> rechazada', r.json?.ok === false && r.json?.error === 'firma', JSON.stringify(r.json ?? r.inicioTexto));

// 3. Solicitud caducada (hace 10 minutos): debe rechazar SIN enviar.
r = await enviar(sobre({ ...base(), ts: ahora() - 600 }));
anotar('solicitud caducada -> rechazada', r.json?.ok === false && r.json?.error === 'caducada', JSON.stringify(r.json ?? r.inicioTexto));

// 4. Carga alterada después de firmar: debe rechazar SIN enviar.
const alterado = sobre(base());
alterado.carga = alterado.carga.replace('Prueba controlada', 'Texto alterado');
r = await enviar(alterado);
anotar('contenido alterado tras firmar -> rechazado', r.json?.ok === false && r.json?.error === 'firma', JSON.stringify(r.json ?? r.inicioTexto));

// 5. Envío válido: el ÚNICO correo real de esta prueba.
const valido = sobre(base());
r = await enviar(valido);
anotar('envío válido -> aceptado', r.json?.ok === true, `restante hoy: ${r.json?.restante}, ${r.ms} ms`);

// 6. Repetir exactamente la misma solicitud: debe rechazar (no duplica el correo).
r = await enviar(valido);
anotar('misma solicitud repetida -> rechazada', r.json?.ok === false && r.json?.error === 'repetida', JSON.stringify(r.json ?? r.inicioTexto));

console.log(`\n=== Prueba del relevo real de correo ===\nFecha: ${new Date().toISOString()}`);
for (const f of filas) console.log(f);
console.log(`--- ${filas.length - fallos}/${filas.length} verificaciones correctas · correos reales enviados: ${fallos ? 'ver arriba' : '1'} ---`);
process.exit(fallos ? 1 : 0);
