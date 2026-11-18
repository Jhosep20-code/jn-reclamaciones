// Muestras para la revisión visual: los dos correos (con las plantillas reales) y la constancia en claro y oscuro.
// Solo local. Uso: node scripts/muestras_revision.mjs [urlBase=http://localhost:8787] [carpetaSalida]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { plantillaConstancia, plantillaRespuesta } from '../src/worker/correo/plantillas.ts';
import { diaLimite, fechaLima, finDeDiaLimaISO } from '../src/worker/dominio/plazos.ts';
import { solicitudValida } from '../pruebas/_comun.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = (process.argv[2] ?? 'http://localhost:8787').replace(/\/$/, '');
const salida = resolve(process.argv[3] ?? join(raiz, '..', '..', '05_DISENO_Y_PROTOTIPO', 'capturas', 'jn'));
mkdirSync(join(salida, 'correos'), { recursive: true });

const ejecutable = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((r) => existsSync(r));
if (!ejecutable) throw new Error('No se encontró Chrome ni Edge.');

const empresa = 'Comercial del Centro S.A.C. (empresa ficticia)';
// Cada muestra usa SU número, SU código y SU enlace (datos ficticios, coherentes entre sí).
const ORIGEN = 'https://reclamaciones.jnsoluciones.workers.dev';
const casoA = { numero: 'HYO-01-2026-000031', codigo: 'a8211322df33fdbd1fb9ed8c8bf9366a', creadoEn: '2026-11-13T16:36:00.000Z' };
const casoB = { numero: 'HYO-01-2026-000006', codigo: '4a4312eeafd294a0052ebd793a1873c4' };
// La fecha límite se calcula con la misma función del sistema (15 días hábiles, feriados de la migración inicial).
const feriados = new Set((readFileSync(join(raiz, 'migrations', '0002_datos_iniciales.sql'), 'utf8').match(/'20dd-dd-dd'/g) ?? []).map((f) => f.slice(1, -1)));
const correos = {
  correo_constancia: plantillaConstancia({
    numero: casoA.numero,
    creadoEn: casoA.creadoEn,
    establecimiento: 'Tienda Huancayo Centro (HYO-01)',
    tipo: 'reclamo',
    fechaLimite: finDeDiaLimaISO(diaLimite(fechaLima(casoA.creadoEn), feriados)),
    codigoSeguimiento: casoA.codigo,
    urlSeguimiento: `${ORIGEN}/seguimiento/${casoA.codigo}`,
    empresa,
  }),
  correo_respuesta: plantillaRespuesta({
    numero: casoB.numero,
    texto: 'Lamentamos lo ocurrido. Se conversó con el personal de seguridad y se reforzó la norma de ingreso familiar.\n\nQuedamos atentos a cualquier otra observación.',
    responsable: 'Luis Paredes (ficticio)',
    cargo: 'Encargado de tienda',
    urlSeguimiento: `${ORIGEN}/seguimiento/${casoB.codigo}`,
    empresa,
  }),
};

const navegador = await puppeteer.launch({ executablePath: ejecutable, headless: true, args: ['--no-first-run', '--disable-extensions'] });
try {
  const page = await navegador.newPage();
  for (const [nombre, c] of Object.entries(correos)) {
    writeFileSync(join(salida, 'correos', `${nombre}.txt`), `Asunto: ${c.asunto}\n\n${c.texto}\n`);
    for (const [vista, ancho, escala] of [['escritorio', 1000, 1], ['390', 390, 2]]) {
      await page.setViewport({ width: ancho, height: 600, deviceScaleFactor: escala });
      await page.setContent(c.html.replaceAll(`${ORIGEN}/marca/`, `${base}/marca/`), { waitUntil: 'load' });
      await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
      await page.screenshot({ path: join(salida, 'correos', `${nombre}_${vista}.png`), fullPage: true });
    }
  }

  if (process.argv.includes('--solo-correos')) { console.log('Correos generados en', salida); process.exit(0); }
  // Constancia: se registra una hoja ficticia por la API y se abre la página con ese resultado en el estado de navegación.
  const r = await fetch(`${base}/api/reclamos`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify(solicitudValida('TAM-01')) });
  if (r.status !== 201) throw new Error(`registro: ${r.status}`);
  const constancia = await r.json();
  for (const tema of ['claro', 'oscuro']) {
    for (const [vista, ancho, alto, escala] of [['escritorio', 1366, 768, 1], ['movil', 390, 844, 2]]) {
      await page.setViewport({ width: ancho, height: alto, deviceScaleFactor: escala });
      await page.goto(base, { waitUntil: 'networkidle0' });
      await page.evaluate((t, c) => {
        localStorage.setItem('jn-tema', t);
        history.replaceState({ usr: { constancia: c }, key: 'muestra', idx: 0 }, '', '/constancia');
      }, tema, constancia);
      await page.reload({ waitUntil: 'networkidle0' });
      if (!page.url().endsWith('/constancia')) throw new Error('la constancia no se mostró');
      await page.screenshot({ path: join(salida, `05_constancia_revisada_${vista}_${tema}.png`), fullPage: true });
    }
  }
  console.log('Muestras generadas en', salida);
} finally {
  await navegador.close();
}
