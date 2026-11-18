// Lámina de revisión del logotipo: todas las variantes sobre fondo claro y oscuro. Uso: node scripts/lamina_marca.mjs
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
const marca = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '05_DISENO_Y_PROTOTIPO', 'marca');
const svg = (n) => readFileSync(join(marca, n), 'utf8');
const ejecutable = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((r) => existsSync(r));
const celda = (titulo, archivo, fondo, alto) => `<figure style="background:${fondo}"><div class="logo" style="height:${alto}px">${svg(archivo)}</div><figcaption style="color:${['#0B1220', '#183153'].includes(fondo) ? '#D1D5DB' : '#4B5563'}">${titulo}<br><small>${archivo}</small></figcaption></figure>`;
const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:32px;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#0B1220;width:1136px}
h1{font-size:22px;margin:0 0 4px} p{margin:0 0 20px;color:#4B5563;font-size:14px}
.rejilla{display:grid;grid-template-columns:1fr 1fr;gap:16px}
figure{margin:0;padding:36px 24px 16px;border:1px solid #D1D5DB;border-radius:10px;text-align:center}
.logo{display:flex;align-items:center;justify-content:center;margin-bottom:22px}.logo svg{height:100%;width:auto}
figcaption{font-size:13px} small{opacity:.75}
.paleta{display:flex;gap:10px;margin-top:20px}.paleta div{flex:1;height:64px;border-radius:8px;border:1px solid #D1D5DB;font-size:11px;display:flex;align-items:flex-end;padding:6px}
</style><h1>JN Reclamaciones — logotipo definitivo</h1><p>Diseño aprobado por el titular: monograma JN serif itálico, contorno parcial de hoja con doblez y check en dorado champán. Todo en trazados vectoriales (no depende de fuentes instaladas).</p>
<div class="rejilla">
${celda('Isotipo principal (fondo oscuro)', 'isotipo.svg', '#0B1220', 190)}
${celda('Isotipo para fondos claros', 'isotipo-claro.svg', '#F8F7F4', 190)}
${celda('Logotipo horizontal (fondo oscuro)', 'logo-horizontal-oscuro.svg', '#0B1220', 72)}
${celda('Logotipo horizontal (fondo claro)', 'logo-horizontal-claro.svg', '#F8F7F4', 72)}
${celda('Monocromo', 'isotipo-monocromo.svg', '#FFFFFF', 110)}
${celda('Monocromo invertido', 'isotipo-monocromo-blanco.svg', '#183153', 110)}
${celda('Icono de pestaña (ampliado)', 'favicon.svg', '#F8F7F4', 96)}
${celda('Tamaño real en la cabecera (32 px)', 'logo-horizontal-oscuro.svg', '#0B1220', 32)}
</div>
<div class="paleta"><div style="background:#0B1220;color:#fff">Midnight Navy #0B1220</div><div style="background:#183153;color:#fff">Deep Blue #183153</div><div style="background:#C5A059">Champagne Gold #C5A059</div><div style="background:#F8F7F4">Warm Ivory #F8F7F4</div><div style="background:#D1D5DB">Silver Gray #D1D5DB</div></div>`;
const nav = await puppeteer.launch({ executablePath: ejecutable, headless: true });
try { const p = await nav.newPage(); await p.setViewport({ width: 1200, height: 800, deviceScaleFactor: 1 }); await p.setContent(html); await p.screenshot({ path: join(marca, 'lamina_logotipo.png'), fullPage: true }); } finally { await nav.close(); }
console.log('ok');
