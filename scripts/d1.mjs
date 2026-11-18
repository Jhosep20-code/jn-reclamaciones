// Ayuda para ejecutar SQL en D1 mediante wrangler (sin shell, funciona igual en Windows y Linux).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const wrangler = join(raiz, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

// modo: 'local' | 'remoto'. Devuelve las filas del último resultado.
export function ejecutarSql(sql, modo = 'local') {
  const todo = ejecutarSqlTodo(sql, modo);
  return todo[todo.length - 1] ?? [];
}

// Igual, pero devuelve las filas de cada sentencia (un arreglo por sentencia).
export function ejecutarSqlTodo(sql, modo = 'local') {
  const carpeta = mkdtempSync(join(tmpdir(), 'rc-sql-'));
  const archivo = join(carpeta, 'consulta.sql');
  writeFileSync(archivo, sql, 'utf8');
  try {
    // En remoto, `--file` importa el archivo y no devuelve las filas de los SELECT.
    // Por eso contra la nube se usa `--command`, que sí las devuelve. No hay shell de por medio:
    // el SQL viaja como un argumento único.
    const origen = modo === 'remoto' ? ['--remote', '--json', '--command', sql] : ['--local', '--json', '--file', archivo];
    const r = spawnSync(
      process.execPath,
      [wrangler, 'd1', 'execute', 'reclamoclaro-db', ...origen],
      { cwd: raiz, encoding: 'utf8', env: { ...process.env, CI: 'true' } },
    );
    if (r.status !== 0) throw new Error(`wrangler falló (${r.status}): ${(r.stderr || r.stdout).slice(0, 600)}`);
    const inicio = r.stdout.indexOf('[');
    const datos = JSON.parse(r.stdout.slice(inicio));
    return datos.map((d) => d?.results ?? []);
  } finally {
    rmSync(carpeta, { recursive: true, force: true });
  }
}

export const comilla = (t) => `'${String(t).replaceAll("'", "''")}'`;
