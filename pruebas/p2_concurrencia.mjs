// P2: concurrencia de la numeración correlativa. 100 registros, 10 en paralelo, repartidos en 3 tiendas.
// Local : node pruebas/p2_concurrencia.mjs [urlBase=http://localhost:8787]
// Nube  : node pruebas/p2_concurrencia.mjs --remoto
// Sube temporalmente configuracion.limite_registros_por_origen_hora a 100000 y lo restaura al final.
// La base puede tener hojas previas: se verifica la serie completa 1..N de cada tienda y año, sin suponer que empieza vacía.
// Solo consulta conteos, correlativos y ids: nunca columnas personales.
import { iniciarPrueba, solicitudValida } from './_comun.mjs';

const ctx = await iniciarPrueba({ id: 'P2', titulo: 'P2 concurrencia (numeración correlativa)' });
const { base, verificar } = ctx;
const TOTAL = 100;
const PARALELO = 10;
const TIENDAS = ['HYO-01', 'TAM-01', 'JAU-01'];

const SQL_SERIE = `
  SELECT e.codigo AS codigo, r.anio AS anio, COUNT(*) AS n, MIN(r.correlativo) AS minimo, MAX(r.correlativo) AS maximo,
         COUNT(DISTINCT r.correlativo) AS distintos, c.ultimo AS contador
  FROM reclamos r
  JOIN establecimientos e ON e.id = r.establecimiento_id
  JOIN contadores c ON c.establecimiento_id = r.establecimiento_id AND c.anio = r.anio
  GROUP BY e.codigo, r.anio ORDER BY e.codigo, r.anio;`;

try {
  ctx.leerLimite();
  ctx.fijarLimite(100000);

  const antes = ctx.sql(SQL_SERIE);
  const claveSerie = (f) => `${f.codigo}/${f.anio}`;
  const previo = new Map(antes.map((f) => [claveSerie(f), f]));
  console.log(`Hojas previas en la base: ${antes.reduce((a, f) => a + f.n, 0)} (en ${antes.length} series tienda/año).`);

  const cliente = ctx.cliente();
  const numeros = [];
  const estados = {};
  let siguiente = 0;
  const inicio = performance.now();
  async function trabajador() {
    while (siguiente < TOTAL) {
      const i = siguiente++;
      const r = await cliente.pedir('POST', '/api/reclamos', solicitudValida(TIENDAS[i % TIENDAS.length]));
      estados[r.estado] = (estados[r.estado] ?? 0) + 1;
      if (r.estado === 201) numeros.push(r.datos.numero);
    }
  }
  await Promise.all(Array.from({ length: PARALELO }, trabajador));
  const duracion = (performance.now() - inicio) / 1000;
  ctx.extra.duracion_total_s = Math.round(duracion * 100) / 100;
  ctx.extra.solicitudes_por_segundo = Math.round((TOTAL / duracion) * 10) / 10;
  ctx.extra.paralelismo = PARALELO;
  ctx.extra.tiendas = TIENDAS.join(',');

  verificar(`${TOTAL} solicitudes respondidas 201`, estados[201] === TOTAL, `respuestas ${JSON.stringify(estados)} en ${duracion.toFixed(1)} s (${(TOTAL / duracion).toFixed(1)} sol/s)`);
  verificar('números devueltos únicos', new Set(numeros).size === numeros.length, `${new Set(numeros).size} únicos de ${numeros.length}`);

  // Correlativos devueltos por tienda y año en esta ejecución.
  const devueltos = new Map();
  for (const n of numeros) {
    const m = n.match(/^([A-Z]{3}-\d{2})-(\d{4})-(\d{6})$/);
    if (!m) continue;
    const k = `${m[1]}/${m[2]}`;
    if (!devueltos.has(k)) devueltos.set(k, []);
    devueltos.get(k).push(Number(m[3]));
  }

  const despues = ctx.sql(SQL_SERIE);
  console.log('\nTienda   Año   Hojas  Mín  Máx  Distintos  Contador  Nuevas');
  for (const f of despues) {
    const k = claveSerie(f);
    const p = previo.get(k);
    const nuevas = f.n - (p?.n ?? 0);
    console.log(`${f.codigo}   ${f.anio}  ${String(f.n).padStart(5)}  ${String(f.minimo).padStart(3)}  ${String(f.maximo).padStart(3)}  ${String(f.distintos).padStart(9)}  ${String(f.contador).padStart(8)}  ${String(nuevas).padStart(6)}`);
    verificar(
      `${k} serie 1..N sin duplicados ni saltos`,
      f.minimo === 1 && f.maximo === f.n && f.distintos === f.n && f.contador === f.maximo,
      `hojas ${f.n}, mín ${f.minimo}, máx ${f.maximo}, contador ${f.contador}`,
    );
    const mios = (devueltos.get(k) ?? []).sort((a, b) => a - b);
    if (mios.length) {
      const desde = (p?.maximo ?? 0) + 1;
      const contiguos = mios.every((v, i) => v === desde + i);
      verificar(`${k} los ${mios.length} números de esta ejecución son contiguos`, nuevas === mios.length && contiguos && mios[mios.length - 1] === f.maximo, `${desde}..${mios[mios.length - 1]}`);
    }
  }
  verificar('las 3 tiendas recibieron hojas', TIENDAS.every((t) => [...devueltos.keys()].some((k) => k.startsWith(`${t}/`))));
  ctx.extra.hojas_por_tienda_esta_ejecucion = Object.fromEntries(TIENDAS.map((t) => [t, [...devueltos.entries()].filter(([k]) => k.startsWith(`${t}/`)).reduce((a, [, v]) => a + v.length, 0)]));

  const [rEv, rHu] = ctx.sqlTodo(`
    SELECT COUNT(*) AS n FROM reclamos r WHERE NOT EXISTS (SELECT 1 FROM eventos e WHERE e.reclamo_id = r.id AND e.accion = 'reclamo_registrado');
    SELECT COUNT(*) AS n FROM reclamos WHERE huella_origen IS NOT NULL AND huella_origen NOT GLOB '*[^0-9a-f]*' AND length(huella_origen) = 64;`);
  verificar('toda hoja tiene su evento de registro', rEv[0]?.n === 0, `${rEv[0]?.n} sin evento`);
  verificar('huella de origen es SHA-256 hex (no IP)', rHu[0]?.n >= TOTAL, `${rHu[0]?.n} con huella válida`);

  // 1.0: la comunicación nace en el mismo lote que la numeración; la concurrencia no puede dejar hojas sin ella ni duplicarla.
  const [rSin, rDup, rEst] = ctx.sqlTodo(`
    SELECT COUNT(*) AS n FROM reclamos r WHERE r.medio_respuesta IS NOT NULL AND NOT EXISTS (SELECT 1 FROM comunicaciones c WHERE c.reclamo_id = r.id AND c.tipo = 'constancia_correo');
    SELECT COUNT(*) AS n FROM (SELECT reclamo_id, tipo FROM comunicaciones GROUP BY reclamo_id, tipo HAVING COUNT(*) > 1);
    SELECT COUNT(*) AS n FROM comunicaciones WHERE tipo = 'constancia_correo' AND estado = 'omitido' AND reclamo_id IN (SELECT id FROM reclamos WHERE huella_origen IS NOT NULL);`);
  verificar('toda hoja 1.0 tiene su comunicación de constancia (mismo lote)', rSin[0]?.n === 0, `${rSin[0]?.n} sin comunicación`);
  verificar('sin comunicaciones duplicadas (reclamo, tipo)', rDup[0]?.n === 0, `${rDup[0]?.n} duplicadas`);
  verificar('las constancias de la prueba (example.com) quedaron omitidas', rEst[0]?.n >= TOTAL, `${rEst[0]?.n} omitidas`);
} catch (e) {
  verificar('ejecución sin excepciones', false, e.stack?.split('\n')[0] ?? e);
}
process.exit(await ctx.finalizar());
