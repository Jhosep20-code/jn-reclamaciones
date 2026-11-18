// Prepara una base LOCAL que reproduce el camino de actualización real 0.3.1 -> 1.0.0:
//   1) borra .wrangler/state y las cuentas de prueba locales,
//   2) aplica solo las migraciones 0001-0003 (aparta 0004 mientras tanto y la devuelve siempre),
//   3) crea las cuentas de prueba y tres hojas "antiguas" (sin medio_respuesta) con el esquema anterior,
//   4) aplica 0004 sobre esa base con datos.
// Después se comprueba con:  node pruebas/_actualizacion_esquema.mjs   (con `wrangler dev --port 8787` en marcha).
// Solo local. No toca la nube. Detenga `wrangler dev` antes de ejecutarlo.
import { spawnSync } from 'node:child_process';
import { existsSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ejecutarSql } from './d1.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const m4 = join(raiz, 'migrations', '0004_v1.sql');
const apartada = join(raiz, 'migrations', '0004_v1.sql.apartada');
const wrangler = join(raiz, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

function correr(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: raiz, encoding: 'utf8', env: { ...process.env, CI: 'true' } });
  if (r.status !== 0) throw new Error(`${args.join(' ')} falló: ${(r.stderr || r.stdout).slice(0, 400)}`);
  return r.stdout;
}
const migrar = () => correr(process.execPath, [wrangler, 'd1', 'migrations', 'apply', 'reclamoclaro-db', '--local']);

const LEGACY = `
INSERT INTO contadores (establecimiento_id, anio, ultimo) VALUES (1, 2026, 3);
INSERT INTO reclamos (establecimiento_id, anio, correlativo, codigo_seguimiento, tipo, nombres, tipo_documento, numero_documento, domicilio, correo, es_menor, tipo_bien, descripcion_bien, detalle, pedido, acepta_tratamiento_datos, estado, creado_en)
VALUES (1, 2026, 1, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1', 'reclamo', 'Antigua Uno PRUEBA', 'DNI', '11111111', 'Calle Vieja 1', 'antigua1@example.com', 0, 'producto', 'Cosa PRUEBA', 'Detalle antiguo de prueba uno', 'Pedido antiguo 1', 1, 'registrado', '2026-11-10T15:00:00.000Z');
INSERT INTO reclamos (establecimiento_id, anio, correlativo, codigo_seguimiento, tipo, nombres, tipo_documento, numero_documento, domicilio, es_menor, tipo_bien, descripcion_bien, detalle, pedido, acepta_tratamiento_datos, estado, creado_en)
VALUES (1, 2026, 2, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2', 'queja', 'Antigua Dos PRUEBA', 'DNI', '22222222', 'Calle Vieja 2', 0, 'servicio', 'Servicio PRUEBA', 'Detalle antiguo de prueba dos', 'Pedido antiguo 2', 1, 'en_atencion', '2026-11-11T15:00:00.000Z');
INSERT INTO reclamos (establecimiento_id, anio, correlativo, codigo_seguimiento, tipo, nombres, tipo_documento, numero_documento, domicilio, es_menor, tipo_bien, descripcion_bien, detalle, pedido, acepta_tratamiento_datos, estado, creado_en, respondido_en)
VALUES (1, 2026, 3, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa3', 'reclamo', 'Antigua Tres PRUEBA', 'DNI', '33333333', 'Calle Vieja 3', 0, 'producto', 'Cosa PRUEBA', 'Detalle antiguo de prueba tres', 'Pedido antiguo 3', 1, 'respondido', '2026-11-05T15:00:00.000Z', '2026-11-09T15:00:00.000Z');
INSERT INTO respuestas (reclamo_id, texto, medio_comunicacion, fecha_comunicacion, usuario_id, creado_en)
SELECT r.id, 'Respuesta antigua de prueba, enviada por carta.', 'carta', '2026-11-09', (SELECT id FROM usuarios WHERE rol = 'admin'), '2026-11-09T15:00:00.000Z' FROM reclamos r WHERE r.correlativo = 3;
INSERT INTO eventos (reclamo_id, usuario_id, accion, creado_en) SELECT id, NULL, 'reclamo_registrado', creado_en FROM reclamos;
`;

rmSync(join(raiz, '.wrangler', 'state'), { recursive: true, force: true });
rmSync(join(raiz, 'pruebas', 'usuarios_de_prueba.local.json'), { force: true });
if (existsSync(apartada)) renameSync(apartada, m4); // resto de una ejecución interrumpida
renameSync(m4, apartada);
try {
  migrar();
  console.log('1/4 migraciones 0001-0003 aplicadas (esquema 0.3.1)');
  correr(process.execPath, [join(raiz, 'scripts', 'crear_usuarios_de_prueba.mjs')]);
  ejecutarSql(LEGACY, 'local');
  console.log('2/4 cuentas de prueba y 3 hojas antiguas creadas');
} finally {
  renameSync(apartada, m4);
}
console.log(migrar().split('\n').filter((l) => /0004|executed/.test(l)).join('\n'));
console.log('4/4 migración 0004 aplicada sobre la base con datos. Ahora: wrangler dev --port 8787 y node pruebas/_actualizacion_esquema.mjs');
