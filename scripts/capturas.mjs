// Capturas y comprobación de flujos de JN Reclamaciones 3.0.0, en tema claro y oscuro, en celular (390x844 @2x),
// tablet (820x1180) y escritorio (1366x768; 1920x1080 solo para reportes y panel).
// Uso: node scripts/capturas.mjs [urlBase=http://localhost:8788] [carpetaSalida=../../05_DISENO_Y_PROTOTIPO/capturas/jn]
// Requisitos: servidor LOCAL con datos ficticios (scripts/sembrar_demo_local.mjs, que también deja codigos_demo.json) y Chrome o Edge.
// Las cuentas salen de pruebas/usuarios_de_prueba.local.json; las claves nunca se imprimen.
// Seguridad: se niega a trabajar contra un host que no sea local.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';
import puppeteer from 'puppeteer-core';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = (process.argv[2] ?? 'http://localhost:8788').replace(/\/$/, '');
const salida = resolve(process.argv[3] ?? join(raiz, '..', '..', '05_DISENO_Y_PROTOTIPO', 'capturas', 'jn'));
const muestras = join(salida, 'muestras');
const carpetaCorreos = join(salida, 'correos');
const host = new URL(base).hostname;
if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) {
  console.error(`Solo se permite un servidor local (recibido: ${host}).`);
  process.exit(1);
}
mkdirSync(salida, { recursive: true });
mkdirSync(muestras, { recursive: true });
mkdirSync(carpetaCorreos, { recursive: true });

const cuentas = JSON.parse(readFileSync(join(raiz, 'pruebas', 'usuarios_de_prueba.local.json'), 'utf8'));
const ADMIN = cuentas.admin;
const ENCARGADO = cuentas.encargado_hyo;
const codigosDemo = JSON.parse(readFileSync(join(raiz, '.wrangler', 'estado-capturas', 'codigos_demo.json'), 'utf8'));
// Documentos ficticios del sembrado: 06 = Ricardo Poma (correo, respondido), 16 = Teresa Salazar (carta), 04 = Julio Mendoza (en atención), 11 = Diana Castro (carta, TAM)
const DOC = { ricardo: '00000006', teresa: '00000016', julio: '00000004', diana: '00000011', nelly: '00000017' };

const CANDIDATOS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  join(process.env.LOCALAPPDATA ?? '', 'Google\\Chrome\\Application\\chrome.exe'),
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const ejecutable = CANDIDATOS.find((r) => existsSync(r));
if (!ejecutable) {
  console.error('No se encontró Chrome ni Edge.');
  process.exit(1);
}

const VISTAS = {
  movil: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  tablet: { width: 820, height: 1180, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  escritorio: { width: 1366, height: 768, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  grande: { width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
};

const resultados = [];
const anotar = (paso, ok, detalle = '') => {
  resultados.push({ paso, ok, detalle });
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${paso}${detalle ? ' — ' + detalle : ''}`);
};
/** Ejecuta un paso; si lanza, lo anota como falla y sigue con el siguiente. */
async function paso(nombre, fn) {
  try {
    await fn();
  } catch (e) {
    anotar(nombre, false, String(e.message ?? e).slice(0, 220));
  }
}

const SEC = 'section[aria-labelledby="t-consulta"]';
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function listo(page) {
  try {
    await page.waitForNetworkIdle({ idleTime: 350, timeout: 8000 });
  } catch {
    /* sigue */
  }
  await page.evaluate(() => document.fonts?.ready);
  await dormir(150);
}

async function ir(page, ruta) {
  await page.goto(base + ruta, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#raiz *', { timeout: 10000 });
  await listo(page);
}

const auditoria = []; // contraste, desbordes y fondos claros sueltos por captura y tema

/** Cambia la apariencia con el selector real de la interfaz (también verifica que el selector funciona). */
async function fijarTema(page, tema) {
  const hay = await page.$('select[aria-label="Apariencia"]');
  if (hay) await page.select('select[aria-label="Apariencia"]', tema);
  else await page.evaluate((t) => { document.documentElement.dataset.tema = t; }, tema);
  await dormir(260);
}

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
async function foto(page, nombre, vista, { completa = true, temas = ['claro', 'oscuro'] } = {}) {
  for (const t of temas) {
    await fijarTema(page, t);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: join(salida, `${nombre}_${vista}_${t}.png`), fullPage: completa });
    if (vista !== 'grande' || true) {
      try {
        const a = await auditar(page);
        auditoria.push({ captura: `${nombre}_${vista}_${t}`, ...a });
      } catch {
        /* la auditoría nunca debe frenar las capturas */
      }
    }
  }
  if (temas.length > 1) await fijarTema(page, 'claro');
}

async function iniciarSesion(page, cuenta) {
  await ir(page, '/acceso');
  await page.type('#correo', cuenta.correo);
  await page.type('#clave', cuenta.clave);
  await Promise.all([
    page.waitForFunction(() => location.pathname.startsWith('/panel'), { timeout: 10000 }),
    page.click('button[type="submit"]'),
  ]);
  await listo(page);
}

async function json(page, ruta) {
  return page.evaluate(async (r) => {
    const x = await fetch(r, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    return { estado: x.status, datos: await x.json().catch(() => null) };
  }, ruta);
}

async function todosLosCasos(page) {
  const todos = [];
  for (let p = 1; p <= 8; p++) {
    const r = await json(page, `/api/reclamos?pagina=${p}`);
    const items = Array.isArray(r.datos) ? r.datos : (r.datos?.items ?? r.datos?.reclamos ?? []);
    todos.push(...items);
    if (items.length < 20) break;
  }
  return todos;
}

const porNombre = (todos, texto) => todos.find((c) => c.consumidor_nombres.startsWith(texto));

async function nuevaPagina(browser, vista) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(VISTAS[vista]);
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  page.setDefaultTimeout(12000);
  page.on('pageerror', (e) => anotar(`error de página (${vista})`, false, String(e.message).slice(0, 160)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) anotar(`consola (${vista})`, false, m.text().slice(0, 160));
  });
  return { ctx, page };
}

const clicTexto = (page, selector, regex) =>
  page.evaluate(
    (sel, src) => {
      const re = new RegExp(src);
      const el = [...document.querySelectorAll(sel)].find((e) => re.test(e.textContent));
      if (!el) return false;
      el.click();
      return true;
    },
    selector,
    regex.source,
  );

async function ponerValor(page, selector, valor) {
  await page.$eval(
    selector,
    (el, v) => {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    valor,
  );
}

// ---------------------------------------------------------------- Descargas y PDF
async function activarDescargas(browser, ctx, dir) {
  const s = await browser.target().createCDPSession();
  await s.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dir, browserContextId: ctx.id });
  return s;
}

/** Hace clic y espera a que aparezca un archivo nuevo en `dir`; lo copia a muestras con su nombre. */
async function descargar(page, dir, accion, nombreFinal) {
  for (const f of readdirSync(dir)) rmSync(join(dir, f), { force: true });
  await accion();
  for (let i = 0; i < 60; i++) {
    await dormir(250);
    const fs = readdirSync(dir).filter((f) => !f.endsWith('.crdownload'));
    if (fs.length) {
      const origen = join(dir, fs[0]);
      await dormir(200);
      const destino = join(muestras, nombreFinal ?? fs[0]);
      copyFileSync(origen, destino);
      return { ruta: destino, nombre: fs[0], bytes: readFileSync(destino) };
    }
  }
  throw new Error('la descarga no llegó');
}

const paginasPdf = (buf) => (buf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) ?? []).length;

function textoPdf(buf) {
  const s = buf.toString('latin1');
  let out = '';
  const re = /(?<!end)stream\r?\n/g;
  let m;
  while ((m = re.exec(s))) {
    const ini = m.index + m[0].length;
    const fin = s.indexOf('endstream', ini);
    if (fin < 0) break;
    try {
      out += inflateSync(Buffer.from(s.slice(ini, fin), 'latin1')).toString('latin1');
    } catch {
      /* no comprimido o no es flujo de texto */
    }
    re.lastIndex = fin + 9;
  }
  return out;
}

/** ¿El PDF contiene la palabra con sus acentos en WinAnsi (byte directo u octal)? */
function tieneTexto(buf, plano) {
  const t = textoPdf(buf);
  const reemplazos = { 'ó': ['\xf3', '\\363'], 'ñ': ['\xf1', '\\361'], '°': ['\xb0', '\\260'], 'á': ['\xe1', '\\341'], 'í': ['\xed', '\\355'], 'é': ['\xe9', '\\351'] };
  let variantes = [plano];
  for (const [c, alts] of Object.entries(reemplazos)) {
    if (!plano.includes(c)) continue;
    variantes = variantes.flatMap((v) => [v, ...alts.map((a) => v.split(c).join(a))]);
  }
  return variantes.some((v) => t.includes(v));
}

async function pdfAImagen(browser, rutaPdf, rutaPng) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 900, height: 1250, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(rutaPdf).href, { waitUntil: 'load' });
  await dormir(2500);
  await page.screenshot({ path: rutaPng });
  await ctx.close();
}

// ---------------------------------------------------------------- Fase A: pantallas sin escritura
async function faseA(browser, vista) {
  {
    const { ctx, page } = await nuevaPagina(browser, vista);
    await ir(page, '/');
    await foto(page, '01_inicio', vista);

    await ir(page, '/registrar');
    await foto(page, '02_registro_vacio', vista);
    await page.click('form button[type="submit"]');
    await dormir(700);
    await foto(page, '03_registro_errores_validacion', vista);

    // Validación del medio de respuesta: carta sin domicilio, correo sin correo
    await ir(page, '/registrar');
    await page.evaluate(() => document.querySelector('input[name="medio_respuesta"][value="carta"]')?.click());
    await page.click('form button[type="submit"]');
    await dormir(500);
    const textoCarta = await page.evaluate(() => document.body.innerText);
    anotar(`carta exige domicilio (${vista})`, /escriba su domicilio/.test(textoCarta));
    await page.evaluate(() => document.querySelector('input[name="medio_respuesta"][value="correo"]')?.click());
    await page.click('form button[type="submit"]');
    await dormir(500);
    const textoCorreo = await page.evaluate(() => document.body.innerText);
    anotar(`correo exige correo electrónico (${vista})`, /escriba su correo electrónico/.test(textoCorreo));
    await foto(page, '03b_registro_medio_correo_sin_correo', vista);

    await ir(page, '/seguimiento');
    await page.type('#codigo', '00000000000000000000000000000000');
    await page.click('form button[type="submit"]');
    await page.waitForSelector('[role="alert"]');
    await listo(page);
    await foto(page, '08_seguimiento_codigo_inexistente', vista);

    await ir(page, '/acceso');
    await foto(page, '09_acceso_vacio', vista);
    await page.type('#correo', `nadie${vista}${Date.now() % 100000}@example.com`);
    await page.type('#clave', 'clave-incorrecta-123');
    const tipoAntes = await page.$eval('#clave', (e) => e.type);
    await page.click('button[aria-label="Mostrar contraseña"]');
    const tipoVisible = await page.$eval('#clave', (e) => e.type);
    await foto(page, '09b_acceso_clave_visible', vista, { completa: false });
    await page.click('button[aria-label="Ocultar contraseña"]');
    const tipoOculta = await page.$eval('#clave', (e) => e.type);
    anotar(`acceso: el botón mostrar/ocultar alterna la contraseña (${vista})`, tipoAntes === 'password' && tipoVisible === 'text' && tipoOculta === 'password', `${tipoAntes} → ${tipoVisible} → ${tipoOculta}`);
    await page.click('button[type="submit"]');
    await page.waitForSelector('.aviso-error');
    await listo(page);
    await foto(page, '10_acceso_error_credenciales', vista);

    await ir(page, '/ruta-que-no-existe');
    await foto(page, '40_pagina_no_encontrada', vista);
    await ctx.close();
  }

  for (const [rol, cuenta, pref] of [['admin', ADMIN, 2], ['encargado', ENCARGADO, 3]]) {
    const { ctx, page } = await nuevaPagina(browser, vista);
    await iniciarSesion(page, cuenta);
    const p = (n) => `${pref}${n}_${rol}`;
    await foto(page, `${p(0)}_indicadores`, vista);

    await ir(page, '/panel/reclamos');
    await foto(page, `${p(1)}_bandeja_con_acciones`, vista);
    const acciones = await page.evaluate(() => ({
      columna: [...document.querySelectorAll('th')].some((t) => t.textContent.trim() === 'Acciones'),
      atender: [...document.querySelectorAll('a')].filter((a) => /Atender caso/.test(a.textContent)).length,
      detalle: [...document.querySelectorAll('a')].filter((a) => /Ver detalle/.test(a.textContent)).length,
    }));
    anotar(`bandeja con Ver detalle y Atender caso (${rol}, ${vista})`, acciones.detalle > 0 && acciones.atender > 0 && (vista === 'movil' || acciones.columna), JSON.stringify(acciones));

    await ir(page, rol === 'admin' ? '/panel/reclamos?establecimiento=TAR-01&estado=en_atencion' : '/panel/reclamos?estado=respondido&tipo=queja&pagina=9');
    await foto(page, `${p(1)}b_bandeja_filtrada_sin_resultados`, vista, { completa: false });

    const todos = await todosLosCasos(page);
    const caso = (nombre, archivo, desc) =>
      paso(`captura ${archivo}`, async () => {
        const c = porNombre(todos, nombre);
        if (!c) return anotar(`caso ${nombre} visible para ${rol}`, rol === 'admin' ? false : true, 'no está en el alcance de este rol');
        await ir(page, `/panel/reclamos/${c.id}`);
        await foto(page, `50_${rol}_${archivo}`, vista);
        void desc;
      });
    if (rol === 'encargado') {
      await caso('María Quispe', 'detalle_sin_respuesta_medio_correo');
      await caso('Rubén Maldonado', 'detalle_hoja_antigua_sin_medio');
      await caso('Julio Mendoza', 'detalle_comunicacion_constancia_fallida');
      await caso('Ricardo Poma', 'detalle_respuesta_correo_fallida_reintentar');
      await caso('Nelly Paz', 'detalle_respondido_correo_enviado');
      await caso('Teresa Salazar', 'detalle_carta_pendiente_entrega');
      await caso('Óscar Bravo', 'detalle_carta_entrega_registrada');
      await caso('Rosa Chávez', 'detalle_sin_respuesta_medio_carta');
    } else {
      await caso('Patricia Rivera', 'detalle_constancia_pendiente');
      await caso('Diana Castro', 'detalle_carta_pendiente_entrega');
    }

    if (rol === 'admin') {
      await ir(page, '/panel/usuarios');
      await foto(page, '25_admin_usuarios', vista);
      await clicTexto(page, 'button', /Crear usuario/);
      await page.waitForSelector('#u-nombre');
      await dormir(200);
      await foto(page, '26_admin_usuarios_formulario', vista);

      await ir(page, '/panel/establecimientos');
      await foto(page, '27_admin_tiendas', vista);
      await clicTexto(page, 'button', /Crear tienda/);
      await page.waitForSelector('#t-codigo');
      await dormir(200);
      await foto(page, '28_admin_tiendas_formulario', vista);

      await ir(page, '/panel/historial');
      await foto(page, '29_admin_historial', vista);

      await ir(page, '/panel/correo');
      await page.waitForSelector('#t-estado-correo');
      await foto(page, '60_admin_correo_estado', vista);
    } else {
      await ir(page, '/panel/usuarios');
      await dormir(400);
      await foto(page, '35_encargado_ruta_de_administracion_bloqueada', vista);
      anotar(`encargado en /panel/usuarios redirige (${vista})`, new URL(page.url()).pathname === '/panel', new URL(page.url()).pathname);
    }

    // Reportes con datos y vacío
    await ir(page, '/panel/reportes');
    await page.waitForSelector('[data-testid="periodo-reporte"]');
    await foto(page, `${pref}0r_${rol}_reportes_con_datos`, vista);
    if (rol === 'admin' && vista === 'escritorio') {
      const medidas = await page.evaluate(() => {
        const tabla = document.querySelector('[data-testid="tabla-comparacion"] table');
        const caja = tabla?.parentElement;
        const columnas = tabla ? [...tabla.querySelectorAll('thead th')].map((th) => th.textContent.trim()) : [];
        const ultima = tabla?.querySelector('thead th:last-child')?.getBoundingClientRect();
        return { existe: !!tabla, tabla: tabla?.scrollWidth, caja: caja?.clientWidth, derechaUltima: ultima ? Math.round(ultima.right) : null, ventana: window.innerWidth, columnas: columnas.length, desbordePagina: document.documentElement.scrollWidth - window.innerWidth };
      });
      anotar('reportes (1366 px): la tabla de comparación cabe sin recortes ni scroll horizontal', medidas.existe && medidas.tabla <= medidas.caja && medidas.derechaUltima <= medidas.ventana && medidas.desbordePagina <= 0, JSON.stringify(medidas));
    }
    const etiquetaMenu = await page.evaluate(() => [...document.querySelectorAll('nav[aria-label="Panel"] a')].map((a) => a.textContent.trim()));
    anotar(`menú de reportes (${rol}, ${vista})`, etiquetaMenu.includes(rol === 'admin' ? 'Reportes' : 'Reportes de mi tienda'), etiquetaMenu.join(' | '));
    if (rol === 'admin') {
      await clicTexto(page, 'button', /Mes anterior/);
      await page.waitForFunction(() => /Periodo:/.test(document.body.innerText));
      await listo(page);
      await foto(page, '20r_admin_reportes_mes_anterior', vista);
    }
    await ponerValor(page, '#r-desde', '2025-01-01');
    await ponerValor(page, '#r-hasta', '2025-01-31');
    await clicTexto(page, 'button', /Aplicar filtros/);
    await page.waitForFunction(() => /No hay casos en este periodo/.test(document.body.innerText), { timeout: 8000 });
    await listo(page);
    await foto(page, `${pref}0s_${rol}_reportes_vacio`, vista);
    await ctx.close();
  }
}

// ---------------------------------------------------------------- Fase B: registro, constancia, impresión, seguimiento
async function registrar(page, { medio, correo, domicilio, nombre, documento }) {
  await ir(page, '/registrar');
  await page.select('#establecimiento_codigo', 'TAM-01');
  await page.evaluate(() => [...document.querySelectorAll('label')].find((l) => /^\s*Reclamo/.test(l.textContent) && l.querySelector('input[type=radio]'))?.click());
  await page.type('#consumidor_nombres', nombre);
  await page.type('#consumidor_numero_documento', documento);
  await page.evaluate((m) => document.querySelector(`input[name="medio_respuesta"][value="${m}"]`)?.click(), medio);
  if (correo) await page.type('#consumidor_correo', correo);
  if (domicilio) await page.type('#consumidor_domicilio', domicilio);
  await page.type('#consumidor_telefono', '900000099');
  await page.select('#bien_tipo', 'producto');
  await page.type('#bien_descripcion', 'Cafetera eléctrica marca Ficticia, modelo CF-12');
  await page.type('#bien_monto', '159.90');
  await page.type('#detalle', 'La cafetera dejó de calentar al tercer uso. En tienda me indicaron que debía esperar una revisión técnica sin darme una fecha.');
  await page.type('#pedido', 'Solicito el cambio de la cafetera por una nueva o la devolución del dinero.');
  await page.evaluate(() => document.getElementById('acepta_tratamiento_datos')?.click());
  await dormir(200);
}

async function enviarRegistro(page) {
  await Promise.all([page.waitForFunction(() => location.pathname === '/constancia', { timeout: 15000 }), page.evaluate(() => document.querySelector('form button[type="submit"]').click())]);
  await listo(page);
  return page.$eval('[data-testid="codigo-seguimiento"]', (e) => e.textContent.trim());
}

async function faseB(browser, vista) {
  const { ctx, page } = await nuevaPagina(browser, vista);
  // Escritorio: correo de prueba (example.com) → «omitido». Celular: correo de dominio ficticio válido → «desactivado» (envío apagado).
  const variante = vista === 'movil'
    ? { medio: 'correo', correo: 'andrea.lozano@correo-ficticio.pe', domicilio: '', esperado: 'desactivado' }
    : { medio: 'correo', correo: 'andrea.lozano@example.com', domicilio: '', esperado: 'omitido' };
  await registrar(page, { ...variante, nombre: 'Andrea Lozano (ficticia)', documento: '00000099' });
  await foto(page, '04_registro_completo_medio_correo', vista);
  const codigo = await enviarRegistro(page);
  anotar(`registro y constancia (${vista})`, /^[0-9a-f]{32}$/.test(codigo), 'código de 32 hex recibido');
  const estadoCorreo = await page.$eval('[data-testid="estado-correo-constancia"]', (e) => e.textContent).catch(() => '');
  const esperadoTxt = variante.esperado === 'desactivado' ? /desactivado en este prototipo/ : /No se envió copia por correo/;
  anotar(`constancia muestra estado del correo (${vista}, ${variante.esperado})`, esperadoTxt.test(estadoCorreo), estadoCorreo.trim().slice(0, 120));
  anotar(`constancia muestra el medio elegido (${vista})`, /correo electrónico/.test(await page.evaluate(() => document.body.innerText)));
  await foto(page, `05_constancia_correo_${variante.esperado}`, vista);

  // Impresión: A4 a 96 ppp con medios de impresión + PDF real. Se prueba con el tema OSCURO activo: debe salir en claro.
  await fijarTema(page, 'oscuro');
  await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1.5 });
  await page.emulateMediaType('print');
  await dormir(250);
  const colores = await page.evaluate(() => ({
    fondo: getComputedStyle(document.body).backgroundColor,
    html: getComputedStyle(document.documentElement).backgroundColor,
    tarjeta: getComputedStyle(document.querySelector('.constancia')).backgroundColor,
    texto: getComputedStyle(document.querySelector('.constancia')).color,
    tema: document.documentElement.dataset.tema,
  }));
  anotar(`impresión en claro aunque el tema sea oscuro (${vista})`, colores.tema === 'oscuro' && colores.fondo === 'rgb(255, 255, 255)' && colores.tarjeta === 'rgb(255, 255, 255)' && colores.texto === 'rgb(0, 0, 0)', JSON.stringify(colores));
  await page.screenshot({ path: join(salida, `06_constancia_impresion_${vista}_claro.png`), fullPage: true });
  const pdf = await page.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: true });
  writeFileSync(join(muestras, `06_constancia_impresion_${vista}.pdf`), pdf);
  await page.setViewport({ width: 703, height: 1032, deviceScaleFactor: 1 });
  const alto = await page.evaluate(() => Math.ceil(document.querySelector('.constancia').getBoundingClientRect().bottom + window.scrollY));
  anotar(`constancia impresa cabe en una página A4 (${vista})`, alto <= 1032, `alto del contenido ${alto}px de 1032px útiles; PDF guardado`);
  await page.emulateMediaType('screen');
  await page.setViewport(VISTAS[vista]);
  await fijarTema(page, 'claro');

  await Promise.all([page.waitForFunction(() => location.pathname.startsWith('/seguimiento/')), page.evaluate(() => [...document.querySelectorAll('a')].find((a) => /Ver el estado/.test(a.textContent))?.click())]);
  await page.waitForSelector('#t-resultado');
  await listo(page);
  const etapas = await page.$$eval('[data-testid="linea-tiempo"] li', (li) => li.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  anotar(`línea de tiempo con 3 etapas, Registrado actual (${vista})`, etapas.length === 3 && /Registrado.*Etapa actual/.test(etapas[0]) && /En atención.*Pendiente/.test(etapas[1]) && /Respondido.*Pendiente/.test(etapas[2]), etapas.join(' || ').slice(0, 220));
  await foto(page, '07_seguimiento_etapa_registrado', vista);
  await ctx.close();

  if (vista === 'escritorio') {
    // Registro con medio carta (sin correo)
    const { ctx: c2, page: p2 } = await nuevaPagina(browser, vista);
    await registrar(p2, { medio: 'carta', correo: '', domicilio: 'Jr. Ficticio 456, Huancayo (ficticio)', nombre: 'Bruno Ñahui (ficticio)', documento: '00000098' });
    await foto(p2, '04b_registro_completo_medio_carta', vista);
    await enviarRegistro(p2);
    const t = await p2.evaluate(() => document.body.innerText);
    anotar('constancia de carta: medio y sin copia por correo', /carta al domicilio/.test(t) && /No se envió copia por correo/.test(t));
    await foto(p2, '05b_constancia_medio_carta', vista);
    await c2.close();
  }
  return codigo;
}

// ---------------------------------------------------------------- Fase D: seguimiento integral y consulta segura (consumidor)
async function faseD(browser, vista, descargas) {
  const { ctx, page } = await nuevaPagina(browser, vista);
  if (vista === 'escritorio') await activarDescargas(browser, ctx, descargas);

  // En atención
  await ir(page, `/seguimiento/${codigosDemo[DOC.julio]}`);
  await page.waitForSelector('[data-testid="linea-tiempo"]');
  const e1 = await page.$$eval('[data-testid="linea-tiempo"] li', (li) => li.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  anotar(`línea de tiempo en atención (${vista})`, /Registrado.*Completada/.test(e1[0] ?? '') && /En atención.*Etapa actual/.test(e1[1] ?? '') && /Respondido.*Pendiente/.test(e1[2] ?? ''), e1.join(' || ').slice(0, 240));
  await foto(page, '11_seguimiento_etapa_en_atencion', vista);

  // Respondido con consulta segura
  await ir(page, `/seguimiento/${codigosDemo[DOC.ricardo]}`);
  await page.waitForSelector('#t-consulta');
  const e2 = await page.$$eval('[data-testid="linea-tiempo"] li', (li) => li.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  anotar(`línea de tiempo respondido (${vista})`, e2.length === 3 && e2.every((t) => /Completada/.test(t)), e2.join(' || ').slice(0, 240));
  await foto(page, '12_seguimiento_respondido_consulta_segura_formulario', vista);

  // Respondido directo: la etapa «En atención» no tiene fecha y NO debe mostrarse como completada
  await ir(page, `/seguimiento/${codigosDemo[DOC.nelly]}`);
  await page.waitForSelector('[data-testid="linea-tiempo"]');
  const e3 = await page.$$eval('[data-testid="linea-tiempo"] li', (li) => li.map((x) => ({ texto: x.textContent.replace(/\s+/g, ' ').trim(), marca: !!x.querySelector('.linea-marca svg') })));
  anotar(`seguimiento respondido directo: «En atención» figura «No registrada», no «Completada», sin check (${vista})`,
    e3.length === 3 && /Registrado.*Completada/.test(e3[0].texto) && /En atención.*No registrada/.test(e3[1].texto) && !/Completada/.test(e3[1].texto) && !e3[1].marca && /sin registrar una etapa de atención/.test(e3[1].texto) && /Respondido.*Completada/.test(e3[2].texto),
    e3.map((x) => x.texto).join(' || ').slice(0, 300));
  await foto(page, '11b_seguimiento_respondido_directo_sin_etapa_atencion', vista);

  await ir(page, `/seguimiento/${codigosDemo[DOC.ricardo]}`);
  await page.waitForSelector('#t-consulta');

  // Documento incorrecto
  await page.type('#numero_documento_consulta', '11111111');
  await page.click(SEC + ' form button[type="submit"]');
  await page.waitForSelector(SEC + ' [role="alert"]', { timeout: 8000 });
  await listo(page);
  const msg403 = await page.$eval(SEC + ' [role="alert"]', (e) => e.textContent);
  anotar(`documento incorrecto muestra mensaje genérico (${vista})`, /No pudimos verificar/.test(msg403) && !/00000006/.test(msg403), msg403.slice(0, 110));
  await foto(page, '13_consulta_segura_documento_incorrecto', vista);

  // Documento correcto
  await page.$eval('#numero_documento_consulta', (e) => (e.value = ''));
  await ponerValor(page, '#numero_documento_consulta', DOC.ricardo);
  await page.click(SEC + ' form button[type="submit"]');
  await page.waitForSelector('[data-testid="respuesta-segura"]', { timeout: 10000 });
  await listo(page);
  const txt = await page.$eval('[data-testid="respuesta-segura"]', (e) => e.innerText);
  anotar(`consulta segura muestra la respuesta (${vista})`, /Lamentamos lo ocurrido/.test(txt) && /Descargar carta/.test(txt) && /Imprimir/.test(txt), txt.slice(0, 80).replace(/\s+/g, ' '));
  await foto(page, '14_consulta_segura_respuesta_mostrada', vista);
  const almacen = await page.evaluate(() => ({ l: Object.keys(localStorage), s: Object.keys(sessionStorage), c: document.cookie }));
  anotar(`solo se guarda la preferencia de tema; ni documento ni respuesta (${vista})`, almacen.l.every((k) => k === 'jn-tema') && almacen.s.length === 0, JSON.stringify(almacen));

  if (vista === 'escritorio') {
    await fijarTema(page, 'oscuro');
    const d = await descargar(page, descargas, () => clicTexto(page, 'button', /Descargar carta \(PDF\)/));
    await fijarTema(page, 'claro');
    const paginas = paginasPdf(d.bytes);
    const numero = (txt.match(/N\.° ([A-Z]{3}-\d{2}-\d{4}-\d{6})/) ?? [])[1] ?? '';
    anotar('descarga de la carta con el nombre carta-<numero>.pdf', /^carta-[A-Z]{3}-\d{2}-\d{4}-\d{6}\.pdf$/.test(d.nombre), d.nombre);
    anotar('carta PDF: 1 página, tildes, ñ y N.° correctos', paginas === 1 && tieneTexto(d.bytes, 'Reclamación') && tieneTexto(d.bytes, 'N.°') && tieneTexto(d.bytes, 'Señor'), `páginas=${paginas}; ${numero}`);
    await pdfAImagen(browser, d.ruta, join(muestras, '15_carta_pdf_pagina1_vista.png'));
  }
  await ctx.close();

  if (vista === 'escritorio') {
    // Bloqueo por intentos fallidos (5 en 15 min) sobre un código distinto
    const { ctx: c2, page: p2 } = await nuevaPagina(browser, vista);
    await ir(p2, `/seguimiento/${codigosDemo[DOC.diana]}`);
    await p2.waitForSelector('#t-consulta');
    let ultimo = '';
    for (let i = 0; i < 6; i++) {
      await ponerValor(p2, '#numero_documento_consulta', `2222222${i}`);
      await p2.click(SEC + ' form button[type="submit"]');
      await p2.waitForFunction((sel) => { const b = document.querySelector(sel + ' form button[type="submit"]'); return b && !b.disabled; }, { timeout: 8000 }, SEC);
      await dormir(250);
      ultimo = await p2.$eval(SEC + ' [role="alert"]', (e) => e.textContent).catch(() => '');
    }
    anotar('6.º intento fallido: mensaje de espera por demasiados intentos (429)', /demasiados intentos/.test(ultimo) && /Espere/.test(ultimo), ultimo.slice(0, 140));
    await foto(p2, '16_consulta_segura_demasiados_intentos', vista);
    await c2.close();
  }
}

// ---------------------------------------------------------------- Fase C: flujos del personal con escritura
const TEXTO_LARGO = Array.from({ length: 9 }, (_, i) =>
  `Párrafo ${i + 1}. Estimado cliente: hemos revisado con detalle su caso, la documentación presentada y lo ocurrido en tienda. Verificamos el historial de compra, la garantía vigente del producto y el proceso de atención técnica aplicado, y concluimos que corresponde atender su pedido en los términos que se detallan a continuación, con el fin de resolver su reclamo de manera satisfactoria y dentro de los plazos establecidos.`,
).join('\n\n');

async function faseC(browser, descargas) {
  const vista = 'escritorio';
  // --- Encargado
  {
    const { ctx, page } = await nuevaPagina(browser, vista);
    await activarDescargas(browser, ctx, descargas);
    await iniciarSesion(page, ENCARGADO);
    const todos = await todosLosCasos(page);
    anotar('encargado ve solo su tienda', todos.length > 0 && todos.every((c) => c.establecimiento.codigo === ENCARGADO.establecimiento), `${todos.length} hojas`);

    // Volver conserva filtros y Atender caso lleva al formulario
    await paso('volver a la bandeja conserva filtros', async () => {
      await ir(page, '/panel/reclamos?tipo=reclamo&estado=registrado');
      await Promise.all([page.waitForFunction(() => /\/panel\/reclamos\/\d+/.test(location.pathname)), clicTexto(page, 'a', /Atender caso/)]);
      await listo(page);
      const enfocado = await page.evaluate(() => document.activeElement?.id);
      const url = page.url();
      anotar('«Atender caso» abre el detalle con el formulario de respuesta enfocado', /atender=1/.test(url) && enfocado === 'texto', `${new URL(url).search}; foco=${enfocado}`);
      await foto(page, '34a_encargado_atender_caso_formulario', vista, { completa: false });
      await Promise.all([page.waitForFunction(() => location.pathname === '/panel/reclamos'), clicTexto(page, 'a', /Volver a la bandeja/)]);
      await listo(page);
      const q = new URL(page.url()).searchParams;
      anotar('el enlace de vuelta conserva los filtros de la bandeja', q.get('tipo') === 'reclamo' && q.get('estado') === 'registrado', page.url().replace(base, ''));
    });

    // Anterior / siguiente
    await paso('navegación anterior / siguiente', async () => {
      const c = porNombre(todos, 'Julio Mendoza');
      await ir(page, `/panel/reclamos/${c.id}?volver=${encodeURIComponent('tipo=reclamo')}`);
      const info = await page.evaluate(() => ({
        sig: [...document.querySelectorAll('a')].some((a) => /Caso siguiente/.test(a.textContent)),
        ant: [...document.querySelectorAll('a')].some((a) => /Caso anterior/.test(a.textContent)),
      }));
      const antes = new URL(page.url()).pathname;
      if (info.sig) {
        await Promise.all([page.waitForFunction((p) => location.pathname !== p, {}, antes), clicTexto(page, 'a', /Caso siguiente/)]);
        await listo(page);
        anotar('Caso siguiente cambia de caso y conserva el origen', new URL(page.url()).searchParams.get('volver') === 'tipo=reclamo', new URL(page.url()).pathname);
      } else anotar('Caso siguiente disponible', false, JSON.stringify(info));
      anotar('hay enlace a Caso anterior o siguiente', info.sig || info.ant, JSON.stringify(info));
    });

    // Responder caso con medio correo, texto largo → carta de varias páginas
    await paso('respuesta larga por correo', async () => {
      const c = porNombre(todos, 'María Quispe');
      await ir(page, `/panel/reclamos/${c.id}?atender=1`);
      const aviso = await page.$eval('[data-testid="medio-pedido"]', (e) => e.textContent);
      anotar('el formulario muestra el medio pedido y no lo solicita', /pidió la respuesta por correo electrónico/.test(aviso) && !(await page.$('#medio_comunicacion')), aviso.slice(0, 90));
      await ponerValor(page, '#texto', TEXTO_LARGO.slice(0, 3000));
      await foto(page, '34_encargado_formulario_respuesta_completo', vista);
      await page.click('form button[type="submit"]');
      let ok = true;
      try {
        await page.waitForFunction(() => /Respuesta registrada/.test(document.body.innerText), { timeout: 8000 });
      } catch {
        ok = false;
      }
      await listo(page);
      anotar('encargado registra una respuesta (correo)', ok, c.numero);
      await foto(page, '34b_encargado_respuesta_registrada_comunicaciones', vista);
      const r = await json(page, `/api/reclamos/${c.id}`);
      anotar('el caso queda respondido con comunicación de correo', r.datos?.estado === 'respondido' && r.datos?.comunicaciones?.some((x) => x.tipo === 'respuesta_correo'), (r.datos?.comunicaciones ?? []).map((x) => `${x.tipo}:${x.estado}`).join(', '));
      const d = await descargar(page, descargas, () => clicTexto(page, 'button', /Descargar carta \(PDF\)/), 'carta_larga_multipagina.pdf');
      const paginas = paginasPdf(d.bytes);
      anotar('carta larga: varias páginas con paginación y firma en la última', paginas >= 2 && tieneTexto(d.bytes, `Página ${paginas} de ${paginas}`) && tieneTexto(d.bytes, 'No constituye firma digital certificada'), `páginas=${paginas}`);
      await pdfAImagen(browser, d.ruta, join(muestras, '36_carta_larga_pdf_pagina1_vista.png'));
      await foto(page, '34c_encargado_caso_respondido_con_carta', vista);
    });

    // Responder caso con medio carta → pendiente de entrega
    await paso('respuesta por carta', async () => {
      const c = porNombre(todos, 'Rosa Chávez');
      await ir(page, `/panel/reclamos/${c.id}`);
      await ponerValor(page, '#texto', 'Estimada señora: se aprobó la reparación de su licuadora en el servicio técnico autorizado. Puede recogerla en tienda en un plazo de cinco días hábiles.');
      await page.click('form button[type="submit"]');
      await page.waitForFunction(() => /Respuesta registrada/.test(document.body.innerText), { timeout: 8000 });
      await listo(page);
      const t = await page.evaluate(() => document.body.innerText);
      anotar('respuesta por carta deja la carta pendiente de entrega', /Carta generada · pendiente de entrega/.test(t));
      await foto(page, '34d_encargado_carta_generada_pendiente_entrega', vista);
    });

    // Registrar entrega
    await paso('registrar entrega de carta', async () => {
      const c = porNombre(todos, 'Teresa Salazar');
      await ir(page, `/panel/reclamos/${c.id}`);
      await clicTexto(page, 'button', /Registrar entrega/);
      await page.waitForSelector('[id$="-fecha"]');
      await ponerValor(page, '[id$="-obs"]', 'Recibida por un familiar mayor de edad');
      await foto(page, '37_encargado_registrar_entrega_formulario', vista);
      await clicTexto(page, 'button', /Guardar entrega/);
      await page.waitForFunction(() => /Entrega registrada el/.test(document.body.innerText), { timeout: 8000 });
      await listo(page);
      const t = await page.evaluate(() => document.body.innerText);
      anotar('entrega registrada con observación y mensaje de confirmación', /Entrega de la carta registrada/.test(t) && /Recibida por un familiar/.test(t));
      await foto(page, '38_encargado_entrega_registrada', vista);
    });

    // Reintentar correo fallido
    await paso('reintentar correo fallido', async () => {
      const c = porNombre(todos, 'Ricardo Poma');
      await ir(page, `/panel/reclamos/${c.id}`);
      const antes = await json(page, `/api/reclamos/${c.id}`);
      const com = antes.datos.comunicaciones.find((x) => x.estado === 'fallido');
      await clicTexto(page, 'button', /Reintentar/);
      await page.waitForFunction(() => /Reintento solicitado/.test(document.body.innerText), { timeout: 8000 });
      await foto(page, '39_encargado_reintento_solicitado', vista);
      await page.waitForFunction(() => !/Reintento solicitado\. Actualizando/.test(document.body.innerText), { timeout: 9000 });
      await listo(page);
      const despues = await json(page, `/api/reclamos/${c.id}`);
      const nueva = despues.datos.comunicaciones.find((x) => x.id === com.id);
      anotar('reintento: la comunicación cambia de estado o suma intentos', nueva.estado !== 'fallido' || nueva.intentos > com.intentos, `antes ${com.estado}/${com.intentos} → después ${nueva.estado}/${nueva.intentos}${nueva.detalle ? ' (' + nueva.detalle + ')' : ''}`);
      await foto(page, '39b_encargado_reintento_resultado', vista);
    });

    // Permisos del encargado
    const ajeno = await json(page, '/api/reportes?establecimiento=TAM-01');
    anotar('encargado: reportes de otra tienda responde 403', ajeno.estado === 403, String(ajeno.estado));
    const admCorreo = await json(page, '/api/admin/correo');
    anotar('encargado: API de correo responde 403', admCorreo.estado === 403, String(admCorreo.estado));
    const prohibido = await json(page, '/api/admin/usuarios');
    anotar('API de administración responde 403 al encargado', prohibido.estado === 403, String(prohibido.estado));
    const propio = await json(page, '/api/reportes');
    anotar('encargado: reporte de su tienda con datos', propio.estado === 200 && propio.datos?.por_establecimiento?.length === 1, `${propio.datos?.resumen?.total} hojas`);
    await ctx.close();
  }

  // --- Reportes y exportaciones (admin y encargado)
  for (const [rol, cuenta] of [['admin', ADMIN], ['encargado', ENCARGADO]]) {
    const { ctx, page } = await nuevaPagina(browser, vista);
    await activarDescargas(browser, ctx, descargas);
    await iniciarSesion(page, cuenta);
    await paso(`reportes y exportación (${rol})`, async () => {
      await ir(page, '/panel/reportes');
      await page.waitForSelector('[data-testid="periodo-reporte"]');
      const api = await json(page, `/api/reportes?desde=${await page.$eval('#r-desde', (e) => e.value)}&hasta=${await page.$eval('#r-hasta', (e) => e.value)}`);
      const ui = await page.evaluate(() => document.body.innerText);
      const comparacion = /Comparación entre establecimientos/.test(ui);
      anotar(`reportes ${rol}: comparación ${rol === 'admin' ? 'visible' : 'oculta (una sola tienda)'}`, rol === 'admin' ? comparacion : !comparacion);
      anotar(`reportes ${rol}: total de la pantalla coincide con la API`, api.estado === 200 && new RegExp(`total de hojas\\s*\\n?\\s*${api.datos.resumen.total}\\b`, 'i').test(ui), `API total ${api.datos?.resumen?.total}`);
      if (rol === 'admin') {
        await page.select('#r-tienda', 'HYO-01');
        await clicTexto(page, 'button', /Aplicar filtros/);
        await dormir(900);
        await listo(page);
        await foto(page, '21r_admin_reportes_filtrado_por_tienda', vista);
        await page.select('#r-tienda', '');
        await clicTexto(page, 'button', /Aplicar filtros/);
        await dormir(900);
        await listo(page);
      }
      const dCsv = await descargar(page, descargas, () => clicTexto(page, 'button', /Exportar CSV \(compatible con Excel\)/), `reporte_${rol}.csv`);
      const csv = dCsv.bytes;
      const textoCsv = csv.toString('utf8');
      anotar(`CSV ${rol}: UTF-8 con BOM, separador ';' y sin datos personales`, csv[0] === 0xef && csv[1] === 0xbb && csv[2] === 0xbf && /Número de hoja;Tipo;Estado/.test(textoCsv) && !/@|ficticio|ficticia/.test(textoCsv), `${csv.length} bytes, ${textoCsv.split('\n').length} líneas`);
      const dPdf = await descargar(page, descargas, () => clicTexto(page, 'button', /Exportar a PDF/), `reporte_${rol}.pdf`);
      const pg = paginasPdf(dPdf.bytes);
      anotar(`PDF ${rol}: generado con encabezado, filtros e indicadores`, pg >= 1 && tieneTexto(dPdf.bytes, 'Reporte de reclamaciones') && tieneTexto(dPdf.bytes, 'Filtros aplicados') && tieneTexto(dPdf.bytes, 'Comparación entre establecimientos'), `páginas=${pg}`);
      await pdfAImagen(browser, dPdf.ruta, join(muestras, `41_reporte_${rol}_pdf_pagina1_vista.png`));
      await foto(page, `42_reportes_${rol}_tras_exportar`, vista);
    });
    if (rol === 'admin') await ctx.close();
    else await ctx.close();
  }

  // --- Admin: correo
  {
    const { ctx, page } = await nuevaPagina(browser, vista);
    await iniciarSesion(page, ADMIN);
    await paso('administración del correo', async () => {
      await ir(page, '/panel/correo');
      await page.waitForSelector('#t-estado-correo');
      const antes = await json(page, '/api/admin/correo');
      anotar('estado del correo visible (configurado / activo / enviados hoy / fallidos)', antes.estado === 200 && /Configuración del relevo/.test(await page.evaluate(() => document.body.innerText)), JSON.stringify(antes.datos));
      await clicTexto(page, 'button', /Encender el envío/);
      await page.waitForSelector('[role="alertdialog"]');
      await foto(page, '61_admin_correo_confirmacion_encender', vista);
      await clicTexto(page, 'button', /Sí, encender/);
      await page.waitForFunction(() => /quedó encendido/.test(document.body.innerText), { timeout: 8000 });
      await listo(page);
      const medio = await json(page, '/api/admin/correo');
      anotar('el interruptor enciende el envío', medio.datos?.activo === true, JSON.stringify(medio.datos));
      await foto(page, '62_admin_correo_activo', vista);
      await clicTexto(page, 'button', /Apagar el envío/);
      await page.waitForSelector('[role="alertdialog"]');
      await clicTexto(page, 'button', /Sí, apagar/);
      await page.waitForFunction(() => /quedó apagado/.test(document.body.innerText), { timeout: 8000 });
      const fin = await json(page, '/api/admin/correo');
      anotar('el interruptor vuelve a apagar el envío (estado final: apagado)', fin.datos?.activo === false, JSON.stringify(fin.datos));
    });

    // Admin crea usuario y tienda
    await ir(page, '/panel/usuarios');
    await clicTexto(page, 'button', /Crear usuario/);
    await page.waitForSelector('#u-nombre');
    await page.type('#u-nombre', 'Mónica Prueba (ficticia)');
    await page.type('#u-correo', 'monica.flujo@example.com');
    await page.type('#u-clave', randomBytes(9).toString('hex'));
    await page.select('#u-tienda', 'JAU-01');
    await page.click('form[aria-labelledby="t-form-usuario"] button[type="submit"]');
    let ok = true;
    try {
      await page.waitForFunction(() => /Usuario creado/.test(document.body.innerText) && /monica\.flujo@example\.com/.test(document.body.innerText), { timeout: 8000 });
    } catch {
      ok = false;
    }
    await listo(page);
    anotar('admin crea un usuario', ok);
    await foto(page, '27b_admin_usuario_creado', vista);

    await ir(page, '/panel/establecimientos');
    await clicTexto(page, 'button', /Crear tienda/);
    await page.waitForSelector('#t-codigo');
    await page.type('#t-codigo', 'DEM-01');
    await page.type('#t-nombre', 'Tienda Demo (ficticia)');
    await page.type('#t-direccion', 'Av. Demostración 123 (ficticia)');
    await page.type('#t-ciudad', 'Chilca');
    await page.click('form[aria-labelledby="t-form-tienda"] button[type="submit"]');
    ok = true;
    try {
      await page.waitForFunction(() => /Tienda creada/.test(document.body.innerText) && /DEM-01/.test(document.body.innerText), { timeout: 8000 });
    } catch {
      ok = false;
    }
    await listo(page);
    anotar('admin crea una tienda', ok);
    await foto(page, '28b_admin_tienda_creada', vista);

    const r = await json(page, '/api/reclamos?pagina=1');
    const items = Array.isArray(r.datos) ? r.datos : (r.datos?.reclamos ?? r.datos?.items ?? []);
    anotar('la hoja nueva aparece en la bandeja del admin', items.some((c) => c.consumidor_nombres.startsWith('Andrea Lozano')));
    await ir(page, '/panel');
    await clicTexto(page, 'button', /Cerrar sesión/);
    await page.waitForFunction(() => location.pathname === '/acceso', { timeout: 8000 }).then(
      () => anotar('cerrar sesión lleva al acceso', true),
      () => anotar('cerrar sesión lleva al acceso', false),
    );
    await ctx.close();
  }
}

// ---------------------------------------------------------------- Prueba unitaria de la neutralización de fórmulas del CSV
async function pruebaCsv() {
  const dir = mkdtempSync(join(tmpdir(), 'rc-csv-'));
  try {
    const bin = join(raiz, 'node_modules', 'esbuild', 'bin', 'esbuild');
    const out = join(dir, 'exportar.mjs');
    execFileSync(process.execPath, [bin, join(raiz, 'src', 'web', 'reportes', 'exportar.ts'), '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`, '--log-level=error']);
    const m = await import(pathToFileURL(out).href);
    const casos = [['=1+1', "'=1+1"], ['+SUMA(A1)', "'+SUMA(A1)"], ['-2+3', "'-2+3"], ['@cmd', "'@cmd"], ['normal', 'normal'], ['con;punto y coma', '"con;punto y coma"'], ['HYO-01-2026-000001', 'HYO-01-2026-000001']];
    const mal = casos.filter(([e, s]) => m.celdaCsv(e) !== s);
    anotar('CSV: neutraliza celdas que empiezan por = + - @ y entrecomilla ;', mal.length === 0, mal.map(([e]) => `${e} → ${m.celdaCsv(e)}`).join(' | ') || `${casos.length} casos`);
  } catch (e) {
    anotar('CSV: prueba de neutralización de fórmulas', false, String(e.message ?? e).slice(0, 200));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}


// ---------------------------------------------------------------- Tema: primera visita, selector y persistencia
async function pruebaTema(browser) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(VISTAS.escritorio);
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  // El tema debe estar aplicado antes del primer pintado (script de index.html): se mide en el primer DOMContentLoaded.
  await page.evaluateOnNewDocument(() => {
    document.addEventListener('DOMContentLoaded', () => { window.__temaAlCargar = document.documentElement.dataset.tema; });
  });
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#raiz *');
  const inicial = await page.evaluate(() => ({ alCargar: window.__temaAlCargar, ahora: document.documentElement.dataset.tema, guardado: localStorage.getItem('jn-tema'), claves: Object.keys(localStorage) }));
  anotar('primera visita con el sistema en oscuro: tema oscuro desde el primer pintado y nada guardado', inicial.alCargar === 'oscuro' && inicial.ahora === 'oscuro' && inicial.claves.length === 0, JSON.stringify(inicial));
  await page.select('select[aria-label="Apariencia"]', 'claro');
  await dormir(150);
  const claro = await page.evaluate(() => ({ t: document.documentElement.dataset.tema, g: localStorage.getItem('jn-tema'), k: Object.keys(localStorage) }));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#raiz *');
  const trasRecarga = await page.evaluate(() => document.documentElement.dataset.tema);
  anotar('elegir «Claro» lo guarda (única clave jn-tema) y se mantiene tras recargar aunque el sistema sea oscuro', claro.t === 'claro' && claro.g === 'claro' && claro.k.length === 1 && trasRecarga === 'claro', JSON.stringify({ claro, trasRecarga }));
  await page.select('select[aria-label="Apariencia"]', 'sistema');
  await dormir(150);
  const sistema = await page.evaluate(() => document.documentElement.dataset.tema);
  anotar('elegir «Sistema» vuelve a seguir al sistema (oscuro)', sistema === 'oscuro', sistema);
  const opciones = await page.$$eval('select[aria-label="Apariencia"] option', (o) => o.map((x) => x.textContent));
  anotar('el selector de apariencia ofrece Claro / Oscuro / Sistema con aria-label', opciones.join('|') === 'Claro|Oscuro|Sistema', opciones.join('|'));
  await ctx.close();
}

// ---------------------------------------------------------------- 1920x1080: panel y reportes
async function faseGrande(browser) {
  const vista = 'grande';
  for (const [rol, cuenta] of [['admin', ADMIN], ['encargado', ENCARGADO]]) {
    const { ctx, page } = await nuevaPagina(browser, vista);
    await iniciarSesion(page, cuenta);
    await foto(page, rol === 'admin' ? '22_admin_indicadores_1920' : '32_encargado_indicadores_1920', vista);
    await ir(page, '/panel/reportes');
    await page.waitForSelector('[data-testid="periodo-reporte"]');
    await foto(page, rol === 'admin' ? '23r_admin_reportes_1920' : '33r_encargado_reportes_1920', vista);
    await ctx.close();
  }
}

// ---------------------------------------------------------------- Correos: las plantillas reales, a PNG (escritorio y 390 px)
async function correos(browser) {
  const dir = mkdtempSync(join(tmpdir(), 'rc-correo-'));
  try {
    const bin = join(raiz, 'node_modules', 'esbuild', 'bin', 'esbuild');
    const out = join(dir, 'plantillas.mjs');
    execFileSync(process.execPath, [bin, join(raiz, 'src', 'worker', 'correo', 'plantillas.ts'), '--bundle', '--format=esm', '--platform=node', '--outfile=' + out, '--log-level=error']);
    const m = await import(pathToFileURL(out).href);
    const constancia = m.plantillaConstancia({
      numero: 'HYO-01-2026-000031', creadoEn: new Date().toISOString(), establecimiento: 'Tienda Huancayo Centro (HYO-01)', tipo: 'reclamo',
      fechaLimite: new Date(Date.now() + 21 * 86400000).toISOString(), codigoSeguimiento: 'a8211322df33fdbd1fb9ed8c8bf9366a', urlSeguimiento: 'http://localhost:8788/seguimiento/a8211322df33fdbd1fb9ed8c8bf9366a',
    });
    const respuesta = m.plantillaRespuesta({
      numero: 'HYO-01-2026-000006', texto: 'Lamentamos lo ocurrido. Se conversó con el personal de seguridad y se reforzó la norma de ingreso familiar.\n\nQuedamos atentos a cualquier otra observación.',
      responsable: 'Luis Paredes (ficticio)', cargo: 'Encargado de tienda', urlSeguimiento: 'http://localhost:8788/seguimiento/4a4312eeafd294a0052ebd793a1873c4',
    });
    anotar('correo: el HTML no usa imágenes, SVG ni fuentes web, y mide 600 px como máximo', [constancia, respuesta].every((c) => !/<img|<svg|@font-face|https?:\/\/fonts\./i.test(c.html) && /max-width:600px/.test(c.html)));
    anotar('correo: constancia y respuesta incluyen el pie de la plataforma y el aviso de mensaje automático', [constancia, respuesta].every((c) => c.html.includes('Mensaje enviado mediante JN Reclamaciones') && c.texto.includes('Mensaje enviado mediante JN Reclamaciones') && c.html.includes('es automático')));
    anotar('correo: la constancia conserva las dos leyendas legales íntegras', constancia.html.includes('La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante el INDECOPI.') && constancia.html.includes('El proveedor debe dar respuesta al reclamo o queja en un plazo no mayor a quince (15) días hábiles, el cual es improrrogable.'));
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    for (const [nombre, c] of [['constancia', constancia], ['respuesta', respuesta]]) {
      writeFileSync(join(carpetaCorreos, 'correo_' + nombre + '.txt'), c.asunto + '\n\n' + c.texto, 'utf8');
      for (const [vista, ancho] of [['escritorio', 1000], ['390', 390]]) {
        await page.setViewport({ width: ancho, height: 800, deviceScaleFactor: vista === '390' ? 2 : 1 });
        await page.setContent(c.html, { waitUntil: 'load' });
        await page.screenshot({ path: join(carpetaCorreos, 'correo_' + nombre + '_' + vista + '.png'), fullPage: true });
      }
    }
    await ctx.close();
    anotar('correo: vistas de la constancia y de la respuesta generadas (escritorio y 390 px)', true, carpetaCorreos);
  } catch (e) {
    anotar('correo: vistas de las plantillas', false, String(e.message ?? e).slice(0, 220));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const descargas = mkdtempSync(join(tmpdir(), 'rc-desc-'));
const navegador = await puppeteer.launch({ executablePath: ejecutable, headless: true, args: ['--no-first-run', '--no-default-browser-check', '--disable-extensions'] });
try {
  await pruebaCsv();
  await pruebaTema(navegador);
  for (const v of ['movil', 'tablet', 'escritorio']) await faseA(navegador, v);
  for (const v of ['movil', 'tablet', 'escritorio']) await faseB(navegador, v);
  for (const v of ['movil', 'tablet', 'escritorio']) await faseD(navegador, v, descargas);
  await faseGrande(navegador);
  await faseC(navegador, descargas);
  await correos(navegador);
} catch (e) {
  anotar('ejecución del script', false, String(e.stack ?? e).slice(0, 400));
} finally {
  await navegador.close();
  rmSync(descargas, { recursive: true, force: true });
}
writeFileSync(join(salida, '_resultado_flujos.json'), JSON.stringify(resultados, null, 2));
writeFileSync(join(salida, '_auditoria_contraste_y_desborde.json'), JSON.stringify(auditoria, null, 2));
{
  const c = auditoria.filter((a) => a.contrasteTotal > 0);
  const d = auditoria.filter((a) => a.desborde > 0);
  const w = auditoria.filter((a) => a.fondosClaros?.length);
  console.log(`Auditoría: ${auditoria.length} capturas; con contraste < AA: ${c.length}; con desborde horizontal: ${d.length}; con fondos claros en oscuro: ${w.length}.`);
}
const fallos = resultados.filter((r) => !r.ok);
console.log(`\nCapturas en ${salida}. Comprobaciones: ${resultados.length - fallos.length} correctas, ${fallos.length} con fallo.`);
process.exit(fallos.length ? 2 : 0);
