// Crea en la base LOCAL un admin y dos encargados ficticios, con claves aleatorias.
// Las claves se guardan solo en pruebas/usuarios_de_prueba.local.json (ignorado por git).
import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashearClave } from '../src/worker/seguridad/claves.ts';
import { comilla, ejecutarSql } from './d1.mjs';

const archivo = join(dirname(fileURLToPath(import.meta.url)), '..', 'pruebas', 'usuarios_de_prueba.local.json');
if (existsSync(archivo)) {
  console.log('Ya existe pruebas/usuarios_de_prueba.local.json; no se crea nada.');
  process.exit(0);
}
const definiciones = [
  { clave_id: 'admin', nombre: 'Admin de Prueba', correo: 'admin.prueba@example.com', rol: 'admin', establecimiento: null },
  { clave_id: 'encargado_hyo', nombre: 'Encargado Huancayo (prueba)', correo: 'hyo.prueba@example.com', rol: 'encargado', establecimiento: 'HYO-01' },
  { clave_id: 'encargado_tam', nombre: 'Encargado El Tambo (prueba)', correo: 'tam.prueba@example.com', rol: 'encargado', establecimiento: 'TAM-01' },
];
const salida = {};
let sql = '';
for (const d of definiciones) {
  const clave = randomBytes(18).toString('base64url');
  salida[d.clave_id] = { correo: d.correo, clave, rol: d.rol, establecimiento: d.establecimiento };
  const est = d.establecimiento ? `(SELECT id FROM establecimientos WHERE codigo = ${comilla(d.establecimiento)})` : 'NULL';
  sql += `INSERT INTO usuarios (correo, nombre, hash_clave, rol, establecimiento_id) VALUES (${comilla(d.correo)}, ${comilla(d.nombre)}, ${comilla(await hashearClave(clave))}, ${comilla(d.rol)}, ${est});\n`;
}
ejecutarSql(sql, 'local');
writeFileSync(archivo, JSON.stringify(salida, null, 2));
console.log('Usuarios de prueba locales creados (claves en pruebas/usuarios_de_prueba.local.json).');
