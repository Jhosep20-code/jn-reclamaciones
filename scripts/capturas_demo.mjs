// Capturas de la base de demostración (datos simulados). Uso:
//   node scripts/capturas_demo.mjs            local (http://localhost:8787)
//   node scripts/capturas_demo.mjs --remoto   nube
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const remoto = process.argv.includes('--remoto');
const base = remoto ? 'https://reclamaciones.jnsoluciones.workers.dev' : 'http://localhost:8787';
const salida = join(raiz, '..', '..', '05_DISENO_Y_PROTOTIPO', 'capturas', remoto ? 'demo_nube' : 'demo_local');
mkdirSync(salida, { recursive: true });
const { usuarios } = JSON.parse(readFileSync(join(raiz, 'pruebas', remoto ? 'usuarios_nube.local.json' : 'usuarios_demo_local.local.json'), 'utf8'));
const { casos } = JSON.parse(readFileSync(join(raiz, 'pruebas', remoto ? 'casos_demo_nube.local.json' : 'casos_demo_local.local.json'), 'utf8'));
const ejecutable = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((r) => existsSync(r));
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const navegador = await puppeteer.launch({ executablePath: ejecutable, headless: true, args: ['--no-first-run', '--disable-extensions'] });
async function sesion(tema, cuenta) {
  const ctx = await navegador.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((t) => localStorage.setItem('jn-tema', t), tema);
  const ir = async (ruta) => {
    await page.goto(base + ruta, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts?.ready);
    await dormir(250);
  };
  const foto = async (nombre) => {
    await page.screenshot({ path: join(salida, nombre), fullPage: true });
    console.log('OK', nombre);
  };
  if (cuenta) {
    await ir('/acceso');
    await page.type('#correo', cuenta.correo);
    await page.type('#clave', cuenta.clave);
    await Promise.all([page.waitForFunction(() => location.pathname.startsWith('/panel'), { timeout: 15000 }), page.click('button[type="submit"]')]);
    await dormir(600);
  }
  return { ctx, page, ir, foto };
}
try {
  const admin = usuarios.find((u) => u.rol === 'admin');
  const encargado = usuarios.find((u) => u.establecimiento === 'HYO-01');
  let s = await sesion('claro');
  await s.ir('/');
  await s.foto('01_portal.png');
  await s.ir(`/seguimiento/${casos.find((c) => c.estado === 'respondido').codigo}`);
  await s.foto('02_seguimiento_respondido.png');
  await s.ctx.close();

  s = await sesion('claro', admin);
  await s.ir('/panel');
  await s.foto('03_admin_panel.png');
  await s.ir('/panel/reclamos');
  await s.foto('04_admin_bandeja.png');
  const ids = await s.page.evaluate(async () => (await (await fetch('/api/reclamos?por_pagina=50', { credentials: 'same-origin' })).json()).reclamos.map((r) => ({ id: r.id, estado: r.estado, medio: r.medio_respuesta })));
  await s.ir(`/panel/reclamos/${ids.find((r) => r.estado === 'respondido' && r.medio === 'carta').id}`);
  await s.foto('05_detalle_respondido_carta.png');
  await s.ir('/panel/reportes');
  await s.foto('06_reportes.png');
  await s.ir('/panel/usuarios');
  await s.foto('07_usuarios.png');
  await s.ir('/panel/establecimientos');
  await s.foto('08_tiendas.png');
  await s.ir('/panel/historial');
  await s.foto('09_historial.png');
  await s.ctx.close();

  s = await sesion('oscuro', encargado);
  await s.ir('/panel');
  await s.foto('10_encargado_panel_oscuro.png');
  await s.ctx.close();
} finally {
  await navegador.close();
}
