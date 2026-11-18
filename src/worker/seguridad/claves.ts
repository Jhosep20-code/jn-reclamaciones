// Contraseñas con PBKDF2-HMAC-SHA256 (WebCrypto). Sin dependencias: sirve en Workers y en Node.
// Formato guardado: pbkdf2-sha256$100000$<sal_base64>$<hash_base64>

export const ITERACIONES = 100_000;
const LARGO_SAL = 16;
const LARGO_HASH = 32;
const codificador = new TextEncoder();
// Sal fija solo para la derivación ficticia cuando el usuario no existe.
const SAL_FICTICIA = new Uint8Array(LARGO_SAL).fill(7);

export function aBase64(bytes: Uint8Array): string {
  let texto = '';
  for (const b of bytes) texto += String.fromCharCode(b);
  return btoa(texto);
}

function deBase64(texto: string): Uint8Array | null {
  try {
    const binario = atob(texto);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

export function aleatorioBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function aHex(bytes: Uint8Array): string {
  let texto = '';
  for (const b of bytes) texto += b.toString(16).padStart(2, '0');
  return texto;
}

export async function sha256Hex(texto: string): Promise<string> {
  const resumen = await crypto.subtle.digest('SHA-256', codificador.encode(texto));
  return aHex(new Uint8Array(resumen));
}

// Comparación en tiempo constante. Usa la primitiva nativa del Worker si existe; si no, un respaldo propio.
export function igualesTiempoConstante(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  const nativa = (crypto.subtle as unknown as { timingSafeEqual?: (x: Uint8Array, y: Uint8Array) => boolean })
    .timingSafeEqual;
  if (typeof nativa === 'function') return nativa.call(crypto.subtle, a, b);
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diferencia === 0;
}

export function igualesTextoTiempoConstante(a: string, b: string): boolean {
  return igualesTiempoConstante(codificador.encode(a), codificador.encode(b));
}

async function derivar(clave: string, sal: Uint8Array, iteraciones: number): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey('raw', codificador.encode(clave), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: sal as BufferSource, iterations: iteraciones },
    material,
    LARGO_HASH * 8,
  );
  return new Uint8Array(bits);
}

export async function hashearClave(clave: string): Promise<string> {
  const sal = aleatorioBytes(LARGO_SAL);
  const hash = await derivar(clave, sal, ITERACIONES);
  return `pbkdf2-sha256$${ITERACIONES}$${aBase64(sal)}$${aBase64(hash)}`;
}

// Si `guardado` es null (usuario inexistente) o está mal formado, hace igualmente una derivación completa
// para que el tiempo de respuesta no revele qué correos existen.
export async function verificarClave(clave: string, guardado: string | null): Promise<boolean> {
  const p = guardado ? guardado.split('$') : [];
  const iteraciones = Number(p[1]);
  const sal = p[2] ? deBase64(p[2]) : null;
  const esperado = p[3] ? deBase64(p[3]) : null;
  const valido =
    p.length === 4 &&
    p[0] === 'pbkdf2-sha256' &&
    Number.isInteger(iteraciones) &&
    iteraciones >= 1 &&
    iteraciones <= ITERACIONES &&
    sal !== null &&
    esperado !== null &&
    esperado.length === LARGO_HASH;
  if (!valido || !sal || !esperado) {
    await derivar(clave, SAL_FICTICIA, ITERACIONES);
    return false;
  }
  const obtenido = await derivar(clave, sal, iteraciones);
  return igualesTiempoConstante(obtenido, esperado);
}
