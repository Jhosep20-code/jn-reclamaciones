// Crea en la base de la NUBE las cuentas de demostración (todas ficticias) con claves aleatorias.
// Las claves se guardan solo en pruebas/usuarios_nube.local.json, que está excluido del repositorio.
// No hace nada si ese archivo ya existe. Uso: node scripts/crear_usuarios_nube.mjs
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';

const ARCHIVO = 'pruebas/usuarios_nube.local.json';
if (existsSync(ARCHIVO)) {
  console.log(`Ya existe ${ARCHIVO}: no se crea nada.`);
  process.exit(0);
}

const cuentas = [
  { nombre: 'Administración (demo)', correo: 'admin.demo@example.com', rol: 'admin', establecimiento: null },
  { nombre: 'Encargado Huancayo (demo)', correo: 'huancayo.demo@example.com', rol: 'encargado', establecimiento: 'HYO-01' },
  { nombre: 'Encargado El Tambo (demo)', correo: 'tambo.demo@example.com', rol: 'encargado', establecimiento: 'TAM-01' },
];

const creadas = [];
for (const c of cuentas) {
  const clave = randomBytes(15).toString('base64url');
  const args = ['scripts/crear_usuario.mjs', '--nombre', c.nombre, '--correo', c.correo, '--rol', c.rol, '--remote'];
  if (c.establecimiento) args.push('--establecimiento', c.establecimiento);
  // La clave viaja por variable de entorno, no por la línea de comandos.
  const r = spawnSync(process.execPath, args, { env: { ...process.env, RC_CLAVE: clave, CI: 'true' }, encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(`No se pudo crear ${c.correo}:`, (r.stderr || r.stdout || '').slice(0, 300));
    process.exit(1);
  }
  creadas.push({ ...c, clave });
  console.log(`Creada: ${c.correo} (${c.rol}${c.establecimiento ? ', ' + c.establecimiento : ''})`);
}

writeFileSync(ARCHIVO, JSON.stringify({ aviso: 'Cuentas ficticias de demostración. No subir al repositorio.', usuarios: creadas }, null, 2));
console.log(`Claves guardadas en ${ARCHIVO}`);
