// Respaldo adicional de la base D1 de producción: exporta el SQL completo, lo cifra con AES-256-GCM y borra la copia en claro.
// El archivo cifrado queda en respaldos/ con extensión .local (ignorada por Git). La clave se guarda FUERA de la carpeta del
// proyecto (y fuera de OneDrive), en la carpeta personal del usuario. Ni la clave ni el contenido se imprimen.
// Uso:  node scripts/respaldo_cifrado.mjs            crea el respaldo
//       node scripts/respaldo_cifrado.mjs --verificar <archivo.local>   descifra en memoria y comprueba la integridad (no escribe nada)
//       node scripts/respaldo_cifrado.mjs --descifrar <archivo.local> <salida.sql>   solo para una recuperación
import { spawnSync } from 'node:child_process';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const carpetaClave = join(homedir(), '.jn_reclamaciones');
const archivoClave = join(carpetaClave, 'clave_respaldo_d1.key');
const MAGIA = Buffer.from('JNRD1v1\n');

function clave(crear) {
  if (!existsSync(archivoClave)) {
    if (!crear) throw new Error(`No existe la clave en ${archivoClave}`);
    mkdirSync(carpetaClave, { recursive: true });
    writeFileSync(archivoClave, randomBytes(32).toString('hex'), { mode: 0o600 });
  }
  return Buffer.from(readFileSync(archivoClave, 'utf8').trim(), 'hex');
}
function descifrar(ruta) {
  const b = readFileSync(ruta);
  if (!b.subarray(0, MAGIA.length).equals(MAGIA)) throw new Error('Formato no reconocido');
  const iv = b.subarray(MAGIA.length, MAGIA.length + 12);
  const etiqueta = b.subarray(MAGIA.length + 12, MAGIA.length + 28);
  const d = createDecipheriv('aes-256-gcm', clave(false), iv);
  d.setAuthTag(etiqueta);
  return Buffer.concat([d.update(b.subarray(MAGIA.length + 28)), d.final()]);
}

const args = process.argv.slice(2);
if (args[0] === '--verificar') {
  const claro = descifrar(resolve(args[1]));
  const texto = claro.toString('utf8');
  console.log(JSON.stringify({ integridad: 'correcta', bytes: claro.length, sha256: createHash('sha256').update(claro).digest('hex').slice(0, 16), tablas: (texto.match(/CREATE TABLE/g) ?? []).length, disparadores: (texto.match(/CREATE TRIGGER/g) ?? []).length, sentenciasInsert: (texto.match(/^INSERT INTO/gm) ?? []).length }));
  process.exit(0);
}
if (args[0] === '--descifrar') {
  writeFileSync(resolve(args[2]), descifrar(resolve(args[1])));
  console.log('Descifrado. Borre la copia en claro cuando termine.');
  process.exit(0);
}

const carpeta = join(raiz, 'respaldos');
mkdirSync(carpeta, { recursive: true });
const marca = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const enClaro = join(carpeta, `tmp_${marca}.sql.local`);
const cifrado = join(carpeta, `d1_reclamoclaro-db_${marca}.sql.enc.local`);
const r = spawnSync(process.execPath, [join(raiz, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), 'd1', 'export', 'reclamoclaro-db', '--remote', '--output', enClaro], { cwd: raiz, encoding: 'utf8', env: { ...process.env, CI: 'true' } });
try {
  if (r.status !== 0 || !existsSync(enClaro)) throw new Error(`La exportación falló: ${(r.stderr || r.stdout).slice(0, 400)}`);
  const claro = readFileSync(enClaro);
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', clave(true), iv);
  const cuerpo = Buffer.concat([c.update(claro), c.final()]);
  writeFileSync(cifrado, Buffer.concat([MAGIA, iv, c.getAuthTag(), cuerpo]));
  console.log(JSON.stringify({ archivo: cifrado, bytesEnClaro: claro.length, sha256: createHash('sha256').update(claro).digest('hex').slice(0, 16), claveEn: archivoClave }));
} finally {
  rmSync(enClaro, { force: true });
}
