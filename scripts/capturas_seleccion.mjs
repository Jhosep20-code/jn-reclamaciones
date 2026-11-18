// Selección de 20 capturas para la revisión visual del refinamiento de interfaz (solo local).
// Uso: node scripts/capturas_seleccion.mjs [urlBase=http://localhost:8788] [carpetaSalida]
// Requisitos: `wrangler dev` local con la base de demostración (scripts/sembrar_demo_local.mjs) y Chrome o Edge.
// Las cuentas salen de pruebas/usuarios_de_prueba.local.json (las claves nunca se imprimen).
// El tema se fija con localStorage['jn-tema'] antes de cargar cada página.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { solicitudValida } from '../pruebas/_comun.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = (process.argv[2] ?? 'http://localhost:8788').replace(/\/$/, '');
const salida = resolve(process.argv[3] ?? join(raiz, '..', '..', '05_DISENO_Y_PROTOTIPO', 'capturas', 'jn_refinado'));
const host = new URL(base).hostname;
if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) {
  console.error(`Solo se permite un servidor local (recibido: ${host}).`);
  process.exit(1);
}
mkdirSync(salida, { recursive: true });

const cuentas = JSON.parse(readFileSync(join(raiz, 'pruebas', 'usuarios_de_prueba.local.json'), 'utf8'));
const ADMIN = cuentas.admin;
const ENCARGADO = cuentas.encargado_hyo;
const codigosDemo = JSON.parse(readFileSync(join(raiz, '.wrangler', 'estado-capturas', 'codigos_demo.json'), 'utf8'));
const DOC_SEGUIMIENTO = '00000004'; // Julio Mendoza (ficticio), en atención

const ejecutable = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  join(process.env.LOCALAPPDATA ?? '', 'Google\\Chrome\\Application\\chrome.exe'),
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((r) => existsSync(r));
if (!ejecutable) {
  console.error('No se encontró Chrome ni Edge.');
  process.exit(1);
}

const VISTAS = {
  escritorio: { width: 1366, height: 768, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  tablet: { width: 768, height: 1024, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  movil: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const problemas = [];

async function listo(page) {
  try {
    await page.waitForNetworkIdle({ idleTime: 350, timeout: 8000 });
  } catch {
    /* sigue */
  }
  await page.evaluate(() => document.fonts?.ready);
  await dormir(200);
}

async function nueva(browser, vista, tema) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(VISTAS[vista]);
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await page.evaluateOnNewDocument((t) => {
    try {
      localStorage.setItem('jn-tema', t);
    } catch {
      /* sin almacenamiento */
    }
  }, tema);
  page.setDefaultTimeout(12000);
  page.on('pageerror', (e) => problemas.push(`error de página (${vista}/${tema}): ${String(e.message).slice(0, 140)}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problemas.push(`consola (${vista}/${tema}): ${m.text().slice(0, 140)}`);
  });
  return { ctx, page };
}

async function ir(page, ruta) {
  await page.goto(base + ruta, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#raiz *', { timeout: 10000 });
  await listo(page);
}

async function iniciarSesion(page, cuenta) {
  await ir(page, '/acceso');
  await page.type('#correo', cuenta.correo);
  await page.type('#clave', cuenta.clave);
  await Promise.all([page.waitForFunction(() => location.pathname.startsWith('/panel'), { timeout: 10000 }), page.click('button[type="submit"]')]);
  await listo(page);
}

async function medir(page, nombre) {
  const r = await page.evaluate(() => ({ desborde: document.documentElement.scrollWidth - window.innerWidth, tema: document.documentElement.dataset.tema }));
  if (r.desborde > 1) problemas.push(`${nombre}: desborde horizontal de ${r.desborde}px`);
}

async function foto(page, nombre) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await dormir(150);
  await page.screenshot({ path: join(salida, nombre), fullPage: true });
  await medir(page, nombre);
  console.log('OK', nombre);
}

async function json(page, ruta) {
  return page.evaluate(async (r) => {
    const x = await fetch(r, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    return { estado: x.status, datos: await x.json().catch(() => null) };
  }, ruta);
}

const navegador = await puppeteer.launch({ executablePath: ejecutable, headless: true, args: ['--no-first-run', '--disable-extensions'] });
try {
  // Constancia: se registra una hoja ficticia por la API (una sola vez) y se abre /constancia con ese resultado.
  const r = await fetch(`${base}/api/reclamos`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify(solicitudValida('HYO-01')) });
  if (r.status !== 201) throw new Error(`registro de la constancia: ${r.status}`);
  const constancia = await r.json();

  // Públicas
  for (const [archivo, ruta, vista, tema] of [
    ['01_portal_claro.png', '/', 'escritorio', 'claro'],
    ['02_portal_oscuro.png', '/', 'escritorio', 'oscuro'],
    ['03_portal_movil_claro.png', '/', 'movil', 'claro'],
    ['04_login_escritorio_oscuro.png', '/acceso', 'escritorio', 'oscuro'],
    ['05_login_escritorio_claro.png', '/acceso', 'escritorio', 'claro'],
    ['06_login_movil.png', '/acceso', 'movil', 'claro'],
    ['07_registro_escritorio_claro.png', '/registrar', 'escritorio', 'claro'],
    ['08_registro_movil_claro.png', '/registrar', 'movil', 'claro'],
    ['18_seguimiento_claro.png', `/seguimiento/${codigosDemo[DOC_SEGUIMIENTO]}`, 'escritorio', 'claro'],
  ]) {
    const { ctx, page } = await nueva(navegador, vista, tema);
    try {
      await ir(page, ruta);
      await foto(page, archivo);
    } finally {
      await ctx.close();
    }
  }

  // Constancia
  for (const [archivo, tema] of [['19_constancia_claro.png', 'claro'], ['20_constancia_oscuro.png', 'oscuro']]) {
    const { ctx, page } = await nueva(navegador, 'escritorio', tema);
    try {
      await ir(page, '/');
      await page.evaluate((c) => history.replaceState({ usr: { constancia: c }, key: 'muestra', idx: 0 }, '', '/constancia'), constancia);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-testid="codigo-seguimiento"]');
      await listo(page);
      await foto(page, archivo);
    } finally {
      await ctx.close();
    }
  }

  // Panel de administración
  for (const [archivo, ruta, cuenta, vista, tema] of [
    ['09_admin_panel_claro.png', '/panel', ADMIN, 'escritorio', 'claro'],
    ['10_admin_panel_oscuro.png', '/panel', ADMIN, 'escritorio', 'oscuro'],
    ['11_encargado_panel_claro.png', '/panel', ENCARGADO, 'escritorio', 'claro'],
    ['12_encargado_panel_movil_oscuro.png', '/panel', ENCARGADO, 'movil', 'oscuro'],
    ['13_reportes_claro.png', '/panel/reportes', ADMIN, 'escritorio', 'claro'],
    ['14_reportes_oscuro.png', '/panel/reportes', ADMIN, 'escritorio', 'oscuro'],
    ['15_bandeja_claro.png', '/panel/reclamos', ADMIN, 'escritorio', 'claro'],
    ['21_extra_admin_panel_768_claro.png', '/panel', ADMIN, 'tablet', 'claro'],
  ]) {
    const { ctx, page } = await nueva(navegador, vista, tema);
    try {
      await iniciarSesion(page, cuenta);
      await ir(page, ruta);
      if (ruta === '/panel/reportes') await page.waitForSelector('[data-testid="periodo-reporte"]');
      await listo(page);
      await foto(page, archivo);
    } finally {
      await ctx.close();
    }
  }

  // Detalle del caso (claro y oscuro)
  for (const [archivo, tema] of [['16_detalle_claro.png', 'claro'], ['17_detalle_oscuro.png', 'oscuro']]) {
    const { ctx, page } = await nueva(navegador, 'escritorio', tema);
    try {
      await iniciarSesion(page, ADMIN);
      const lista = await json(page, '/api/reclamos?pagina=1');
      const items = Array.isArray(lista.datos) ? lista.datos : (lista.datos?.items ?? lista.datos?.reclamos ?? []);
      const caso = items.find((c) => c.consumidor_nombres.startsWith('Julio')) ?? items[0];
      await ir(page, `/panel/reclamos/${caso.id}`);
      await page.waitForSelector('h1');
      await listo(page);
      await foto(page, archivo);
    } finally {
      await ctx.close();
    }
  }
  console.log('Capturas en', salida);
  if (problemas.length) {
    console.log('Avisos:');
    for (const p of problemas) console.log(' -', p);
  }
} finally {
  await navegador.close();
}
