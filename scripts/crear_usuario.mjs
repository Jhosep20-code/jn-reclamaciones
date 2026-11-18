// Crea un usuario con la clave hasheada en el mismo formato que usa el Worker.
// Uso: node scripts/crear_usuario.mjs --nombre "Ana Perez" --correo ana@example.com --rol encargado \
//        --establecimiento HYO-01 --clave "una clave larga" [--local | --remote]
// Variables de entorno equivalentes: RC_NOMBRE, RC_CORREO, RC_ROL, RC_ESTABLECIMIENTO, RC_CLAVE.
// Modo por defecto: --local. Con --remote escribe en la base de la nube (solo si usted lo decide).
import { hashearClave } from '../src/worker/seguridad/claves.ts';
import { comilla, ejecutarSql } from './d1.mjs';

const args = process.argv.slice(2);
const valor = (nombre, variable) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 ? args[i + 1] : process.env[variable];
};

const nombre = valor('nombre', 'RC_NOMBRE');
const correo = valor('correo', 'RC_CORREO')?.trim().toLowerCase();
const rol = valor('rol', 'RC_ROL');
const establecimiento = valor('establecimiento', 'RC_ESTABLECIMIENTO');
const clave = valor('clave', 'RC_CLAVE');
const modo = args.includes('--remote') ? 'remoto' : 'local';

function fallar(mensaje) {
  console.error(`Error: ${mensaje}`);
  process.exit(1);
}

if (!nombre || nombre.length < 3) fallar('falta --nombre (mínimo 3 caracteres)');
if (!correo || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) fallar('falta --correo válido');
if (rol !== 'admin' && rol !== 'encargado') fallar('--rol debe ser admin o encargado');
if (rol === 'encargado' && !/^[A-Z]{3}-\d{2}$/.test(establecimiento ?? '')) fallar('un encargado requiere --establecimiento (p. ej. HYO-01)');
if (rol === 'admin' && establecimiento) fallar('un admin no lleva establecimiento');
if (!clave || clave.length < 10) fallar('la clave debe tener 10 caracteres o más');

const hash = await hashearClave(clave);
const estSql = rol === 'admin' ? 'NULL' : `(SELECT id FROM establecimientos WHERE codigo = ${comilla(establecimiento)})`;
ejecutarSql(
  `INSERT INTO usuarios (correo, nombre, hash_clave, rol, establecimiento_id)
   VALUES (${comilla(correo)}, ${comilla(nombre)}, ${comilla(hash)}, ${comilla(rol)}, ${estSql});`,
  modo,
);
console.log(`Usuario creado (${modo}): ${correo} [${rol}${establecimiento ? ' ' + establecimiento : ''}]`);
