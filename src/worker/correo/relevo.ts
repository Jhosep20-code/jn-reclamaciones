// Cliente del relevo de correo (Google Apps Script). Protocolo: ver docs/CONTRATO_API_v1.md, sección 6.
// Sin dependencias del proyecto para poder probarlo directamente con Node.

export const TIEMPO_MAXIMO_MS = 10_000;
const codificador = new TextEncoder();

function aHex(bytes: Uint8Array): string {
  let t = '';
  for (const b of bytes) t += b.toString(16).padStart(2, '0');
  return t;
}

// HMAC-SHA256 en hexadecimal de `carga` (texto UTF-8) con `secreto`.
export async function firmarCarga(secreto: string, carga: string): Promise<string> {
  const clave = await crypto.subtle.importKey('raw', codificador.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const firma = await crypto.subtle.sign('HMAC', clave, codificador.encode(carga));
  return aHex(new Uint8Array(firma));
}

export interface MensajeRelevo {
  para: string;
  asunto: string;
  html: string;
  texto: string;
}

export interface ResultadoRelevo {
  ok: boolean;
  // Motivo corto, sin datos personales, para guardar en comunicaciones.detalle.
  motivo: string | null;
}

export async function construirSobre(secreto: string, mensaje: MensajeRelevo, ahoraSeg = Math.floor(Date.now() / 1000)) {
  const nonce = new Uint8Array(16);
  crypto.getRandomValues(nonce);
  const carga = JSON.stringify({ v: 1, ts: ahoraSeg, nonce: aHex(nonce), ...mensaje });
  return { carga, firma: await firmarCarga(secreto, carga) };
}

// Solo se admite HTTPS, salvo un relevo simulado en la propia máquina (localhost) durante las pruebas locales.
export function urlRelevoValida(valor: string): boolean {
  try {
    const u = new URL(valor);
    if (u.protocol === 'https:') return true;
    return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

// Nunca lanza: cualquier error se traduce en { ok: false, motivo }.
export async function enviarARelevo(url: string, secreto: string, mensaje: MensajeRelevo): Promise<ResultadoRelevo> {
  if (!urlRelevoValida(url)) return { ok: false, motivo: 'URL del relevo no válida' };
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), TIEMPO_MAXIMO_MS);
  try {
    const sobre = await construirSobre(secreto, mensaje);
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sobre),
      redirect: 'follow', // Apps Script responde con una redirección 302
      signal: control.signal,
    });
    if (!r.ok) return { ok: false, motivo: `relevo respondió HTTP ${r.status}` };
    let cuerpo: unknown;
    try {
      cuerpo = await r.json();
    } catch {
      return { ok: false, motivo: 'respuesta del relevo no válida' };
    }
    const o = cuerpo as { ok?: unknown; error?: unknown } | null;
    if (o && o.ok === true) return { ok: true, motivo: null };
    const codigo = o && typeof o.error === 'string' && /^[a-z_]{1,30}$/.test(o.error) ? o.error : 'desconocido';
    return { ok: false, motivo: `relevo rechazó el envío: ${codigo}` };
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') return { ok: false, motivo: 'tiempo de espera agotado (10 s)' };
    return { ok: false, motivo: 'no se pudo contactar al relevo' };
  } finally {
    clearTimeout(temporizador);
  }
}
