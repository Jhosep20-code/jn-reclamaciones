// Verificación final de la interfaz (solo local, base de demostración):
//  1. ninguna pantalla muestra «undefined», «null» ni «NaN»;
//  2. contraste AA del texto visible en claro y oscuro;
//  3. sin desborde horizontal a 390, 768 y 1366 px;
//  4. capturas de Usuarios, Tiendas, Historial y Correo;
//  5. impresión de la constancia (PDF A4 con los estilos de impresión).
// Uso: node scripts/verificacion_final.mjs [urlBase=http://localhost:8788] [carpetaSalida]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { solicitudValida } from '../pruebas/_comun.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = (process.argv[2] ?? 'http://localhost:8788').replace(/\/$/, '');
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Solo local.');
const salida = resolve(process.argv[3] ?? join(raiz, '..', '..', '05_DISENO_Y_PROTOTIPO', 'capturas', 'jn_refinado', 'verificacion'));
mkdirSync(salida, { recursive: true });
const cuentas = JSON.parse(readFileSync(join(raiz, 'pruebas', 'usuarios_de_prueba.local.json'), 'utf8'));
const codigosDemo = JSON.parse(readFileSync(join(raiz, '.wrangler', 'estado-capturas', 'codigos_demo.json'), 'utf8'));
const ejecutable = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((r) => existsSync(r));
const VISTAS = {
  movil: { width: 390, height: 844, deviceScaleFactor: 1 },
  tablet: { width: 768, height: 1024, deviceScaleFactor: 1 },
  escritorio: { width: 1366, height: 768, deviceScaleFactor: 1 },
};
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const resultados = [];
const errores = [];
const VACIOS = /\b(undefined|NaN)\b|\bnull\b/g;

/** Revisa en la página: contraste AA del texto visible, desborde horizontal y (en oscuro) fondos casi blancos. */
async function auditar(page) {
  return page.evaluate(() => {
    const lienzo = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    lienzo.canvas.width = lienzo.canvas.height = 1;
    const norm = (c) => {
      lienzo.clearRect(0, 0, 1, 1);
      lienzo.fillStyle = '#000';
      lienzo.fillStyle = c;
      lienzo.fillRect(0, 0, 1, 1);
      const d = lienzo.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2], d[3] / 255];
    };
    const lum = ([r, g, b]) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const mezcla = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3]));
    const fondoEfectivo = (el) => {
      const capas = [];
      for (let e = el; e; e = e.parentElement) {
        const c = norm(getComputedStyle(e).backgroundColor);
        if (c[3] > 0) capas.push(c);
        if (c[3] >= 1) break;
      }
      let base = [255, 255, 255];
      if (!capas.length || capas[capas.length - 1][3] < 1) base = norm(getComputedStyle(document.body).backgroundColor).slice(0, 3);
      for (let i = capas.length - 1; i >= 0; i--) base = mezcla(capas[i], base);
      return base;
    };
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
    };
    const malos = [];
    const vistos = new Set();
    const tema = document.documentElement.dataset.tema;
    const blancos = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!visible(el)) continue;
      const cs = getComputedStyle(el);
      const propio = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      const esCampo = /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName);
      if ((propio || esCampo) && !el.closest('[disabled],[aria-disabled="true"]') && !(el.tagName === 'INPUT' && ['checkbox', 'radio'].includes(el.type))) {
        const fg = norm(cs.color);
        const bg = fondoEfectivo(el);
        const f = mezcla(fg, bg);
        const l1 = lum(f), l2 = lum(bg);
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        const px = parseFloat(cs.fontSize);
        const grande = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700);
        const minimo = grande ? 3 : 4.5;
        if (ratio < minimo) {
          const clave = el.tagName + el.className + ratio.toFixed(2);
          if (!vistos.has(clave)) {
            vistos.add(clave);
            malos.push({ el: `${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 3).join('.')}`, texto: (el.textContent ?? '').trim().slice(0, 40), ratio: Number(ratio.toFixed(2)), minimo });
          }
        }
      }
      if (tema === 'oscuro') {
        const c = norm(cs.backgroundColor);
        if (c[3] > 0.5 && lum(c) > 0.55 && !['IMG', 'SVG', 'CANVAS'].includes(el.tagName.toUpperCase())) blancos.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 3).join('.')}`);
      }
    }
    const desborde = document.documentElement.scrollWidth - window.innerWidth;
    return { contraste: malos.slice(0, 8), contrasteTotal: malos.length, desborde: desborde > 1 ? desborde : 0, fondosClaros: [...new Set(blancos)].slice(0, 6), tema };
  });
}

/** Captura la pantalla actual en tema claro y en oscuro (alternando con el selector) y la audita. */

async function listo(page) {
  try {
    await page.waitForNetworkIdle({ idleTime: 350, timeout: 8000 });
  } catch {
    /* sigue */
  }
  await page.evaluate(() => document.fonts?.ready);
  await dormir(200);
}
async function ir(page, ruta) {
  await page.goto(base + ruta, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#raiz *', { timeout: 10000 });
  await listo(page);
}
async function nueva(browser, vista, tema) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(VISTAS[vista]);
  await page.evaluateOnNewDocument((t) => {
    try {
      localStorage.setItem('jn-tema', t);
    } catch {
      /* nada */
    }
  }, tema);
  page.setDefaultTimeout(12000);
  page.on('pageerror', (e) => errores.push(`error de página (${vista}/${tema}): ${String(e.message).slice(0, 140)}`));
  return { ctx, page };
}
async function iniciarSesion(page, cuenta) {
  await ir(page, '/acceso');
  await page.type('#correo', cuenta.correo);
  await page.type('#clave', cuenta.clave);
  await Promise.all([page.waitForFunction(() => location.pathname.startsWith('/panel'), { timeout: 10000 }), page.click('button[type="submit"]')]);
  await listo(page);
}
async function revisar(page, nombre, vista, tema) {
  const a = await auditar(page);
  const texto = await page.evaluate(() => document.body.innerText);
  const vacios = [...new Set(texto.match(VACIOS) ?? [])];
  resultados.push({ pantalla: nombre, vista, tema, vacios, contraste: a.contraste, contrasteTotal: a.contrasteTotal, desborde: a.desborde, fondosClaros: tema === 'oscuro' ? a.fondosClaros : [] });
}

const PUBLICAS = [
  ['inicio', '/'],
  ['registro', '/registrar'],
  ['seguimiento vacío', '/seguimiento'],
  ['acceso', '/acceso'],
  ['no encontrada', '/ruta-que-no-existe'],
];
const ADMIN = [
  ['admin panel', '/panel'],
  ['admin bandeja', '/panel/reclamos'],
  ['admin reportes', '/panel/reportes'],
  ['usuarios', '/panel/usuarios'],
  ['tiendas', '/panel/establecimientos'],
  ['historial', '/panel/historial'],
  ['correo', '/panel/correo'],
];
const ENCARGADO = [
  ['encargado panel', '/panel'],
  ['encargado bandeja', '/panel/reclamos'],
  ['encargado reportes', '/panel/reportes'],
];
const CAPTURAR = new Set(['usuarios', 'tiendas', 'historial', 'correo']);
const codigos = Object.entries(codigosDemo).filter(([, v]) => typeof v === 'string' && /^[0-9a-f]{32}$/.test(v));

const navegador = await puppeteer.launch({ executablePath: ejecutable, headless: true, args: ['--no-first-run', '--disable-extensions'] });
try {
  for (const tema of ['claro', 'oscuro']) {
    for (const vista of Object.keys(VISTAS)) {
      // Público
      let { ctx, page } = await nueva(navegador, vista, tema);
      for (const [n, r] of PUBLICAS) {
        await ir(page, r);
        await revisar(page, n, vista, tema);
      }
      for (const [clave, codigo] of codigos.slice(0, 5)) {
        await ir(page, `/seguimiento/${codigo}`);
        await revisar(page, `seguimiento ${clave}`, vista, tema);
      }
      await ctx.close();
      // Administrador
      ({ ctx, page } = await nueva(navegador, vista, tema));
      await iniciarSesion(page, cuentas.admin);
      for (const [n, r] of ADMIN) {
        await ir(page, r);
        await revisar(page, n, vista, tema);
        if (CAPTURAR.has(n) && vista !== 'tablet') await page.screenshot({ path: join(salida, `${n}_${vista}_${tema}.png`), fullPage: true });
      }
      // Detalle de los casos de la bandeja (distintos estados y medios)
      const lista = await page.evaluate(async () => (await fetch('/api/reclamos', { credentials: 'same-origin' })).json());
      const filas = Array.isArray(lista) ? lista : (Object.values(lista).find((v) => Array.isArray(v)) ?? []);
      const ids = filas.map((x) => x.id).filter(Boolean);
      for (const id of vista === 'escritorio' ? ids : ids.slice(0, 5)) {
        await ir(page, `/panel/reclamos/${id}`);
        await revisar(page, `detalle ${id}`, vista, tema);
      }
      await ctx.close();
      // Encargado
      ({ ctx, page } = await nueva(navegador, vista, tema));
      await iniciarSesion(page, cuentas.encargado_hyo);
      for (const [n, r] of ENCARGADO) {
        await ir(page, r);
        await revisar(page, n, vista, tema);
      }
      await ctx.close();
      console.log('revisado', tema, vista, '| detalles:', vista === 'escritorio' ? ids.length : Math.min(5, ids.length));
    }
  }

  // Constancia: en pantalla (claro y oscuro) e impresa (siempre clara, A4).
  const reg = await fetch(`${base}/api/reclamos`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify(solicitudValida('JAU-01')) });
  if (reg.status !== 201) throw new Error(`registro para la constancia: ${reg.status}`);
  const constancia = await reg.json();
  for (const tema of ['claro', 'oscuro']) {
    for (const vista of ['movil', 'escritorio']) {
      const { ctx, page } = await nueva(navegador, vista, tema);
      await ir(page, '/');
      await page.evaluate((c) => history.replaceState({ usr: { constancia: c }, key: 'verif', idx: 0 }, '', '/constancia'), constancia);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await listo(page);
      if (!page.url().endsWith('/constancia')) throw new Error('la constancia no se mostró');
      await revisar(page, 'constancia', vista, tema);
      if (vista === 'escritorio') {
        await page.emulateMediaType('print');
        await page.pdf({ path: join(salida, `constancia_impresa_desde_tema_${tema}.pdf`), format: 'A4', printBackground: true });
        const impresa = await page.evaluate(() => {
          const visible = (e) => e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0;
          const art = document.querySelector('.constancia');
          return {
            fondoCuerpo: getComputedStyle(document.body).backgroundColor,
            fondoHoja: art ? getComputedStyle(art).backgroundColor : null,
            colorTexto: art ? getComputedStyle(art).color : null,
            controlesVisibles: [...document.querySelectorAll('button, a.btn, nav')].filter(visible).length,
            texto: document.body.innerText,
          };
        });
        resultados.push({
          pantalla: 'constancia IMPRESA', vista: 'A4', tema, vacios: [...new Set(impresa.texto.match(VACIOS) ?? [])], contraste: [], contrasteTotal: 0, desborde: 0, fondosClaros: [],
          impresion: {
            fondoCuerpo: impresa.fondoCuerpo, fondoHoja: impresa.fondoHoja, colorTexto: impresa.colorTexto, controlesVisibles: impresa.controlesVisibles,
            conNumero: impresa.texto.includes(constancia.numero), conCodigo: impresa.texto.includes(constancia.codigo_seguimiento),
            conLeyendas: /INDECOPI/.test(impresa.texto) && /quince \(15\) días hábiles/.test(impresa.texto),
          },
        });
        await page.emulateMediaType('screen');
      }
      await ctx.close();
    }
  }
} finally {
  await navegador.close();
}

writeFileSync(join(salida, '_verificacion_final.json'), JSON.stringify({ fecha: new Date().toISOString(), base, resultados, errores }, null, 2));
const conVacios = resultados.filter((r) => r.vacios.length);
const conContraste = resultados.filter((r) => r.contrasteTotal > 0);
const conDesborde = resultados.filter((r) => r.desborde > 0);
const conFondos = resultados.filter((r) => r.fondosClaros.length);
console.log(`\nPantallas revisadas: ${resultados.length}`);
console.log(`Con «undefined», «null» o «NaN» visibles: ${conVacios.length}`);
for (const r of conVacios) console.log(`  - ${r.pantalla} (${r.vista}/${r.tema}): ${r.vacios.join(', ')}`);
console.log(`Con texto bajo contraste AA: ${conContraste.length}`);
const agrupado = new Map();
for (const r of conContraste) {
  for (const c of r.contraste) {
    const k = `${r.tema} | ${c.el} | ${c.ratio} (mín. ${c.minimo}) | «${c.texto}»`;
    agrupado.set(k, (agrupado.get(k) ?? 0) + 1);
  }
}
for (const [k, n] of [...agrupado].slice(0, 40)) console.log(`  - ${k}  ×${n}`);
console.log(`Con desborde horizontal: ${conDesborde.length}`);
for (const r of conDesborde) console.log(`  - ${r.pantalla} (${r.vista}/${r.tema}): ${r.desborde}px`);
console.log(`En oscuro con fondos casi blancos: ${conFondos.length}`);
for (const r of conFondos.slice(0, 10)) console.log(`  - ${r.pantalla} (${r.vista}): ${r.fondosClaros.join(', ')}`);
for (const r of resultados.filter((x) => x.impresion)) console.log(`Impresión (desde tema ${r.tema}):`, JSON.stringify(r.impresion));
console.log(`Errores de página: ${errores.length}`);
for (const e of errores.slice(0, 10)) console.log('  -', e);
