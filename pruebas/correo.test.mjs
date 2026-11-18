// Pruebas unitarias del correo y del calendario hábil: node --test pruebas/correo.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { esDominioDePrueba } from '../src/worker/correo/dominios.ts';
import { escaparHtml, plantillaConstancia, plantillaRespuesta } from '../src/worker/correo/plantillas.ts';
import { construirSobre, firmarCarga, urlRelevoValida } from '../src/worker/correo/relevo.ts';
import { crearCalendarioHabil, diaLimite, diasHabilesEntre, sumarDias } from '../src/worker/dominio/plazos.ts';
import { firmaEsperada } from './relevo_simulado.mjs';

const ATAQUE = `<script>alert("x")</script><img src=x onerror='robar()'> & "comillas" 'simples'`;

test('escaparHtml neutraliza los cinco caracteres peligrosos', () => {
  assert.equal(escaparHtml('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  assert.equal(escaparHtml(null), '');
  assert.equal(escaparHtml(42), '42');
});

test('la plantilla de constancia escapa todo valor del usuario', () => {
  const { html, texto, asunto } = plantillaConstancia({
    numero: `HYO-01-2026-000001${ATAQUE}`,
    creadoEn: '2026-11-14T20:30:00.000Z',
    establecimiento: ATAQUE,
    tipo: 'reclamo',
    fechaLimite: '2026-12-07T04:59:59.999Z',
    codigoSeguimiento: ATAQUE,
    urlSeguimiento: `http://localhost:8787/seguimiento/${ATAQUE}`,
  });
  assert.ok(!html.includes('<script>alert'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!/onerror='robar/.test(html));
  assert.ok(html.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'));
  assert.ok(!/href="[^"]*"[^>]*"[^>]*onerror/.test(html));
  // El texto plano no se escapa (no es HTML) y conserva el valor tal cual.
  assert.ok(texto.includes('<script>alert("x")</script>'));
  assert.ok(asunto.startsWith('Constancia de su reclamo'));
  assert.ok(html.includes('14/11/2026 15:30'), 'fecha y hora de Lima (UTC-5)');
  assert.ok(html.includes('06/12/2026'), 'fecha límite en hora de Lima');
  assert.ok(html.includes('#0B1220') && html.includes('max-width:600px'));
  assert.ok(html.includes('Mensaje enviado mediante JN Reclamaciones') && html.includes('Este mensaje es automático; no responda a este correo.'));
  assert.ok(html.includes('Comercial del Centro S.A.C.'), 'emisor: la empresa cliente');
  assert.ok(html.includes('INDECOPI') && html.includes('quince (15) días hábiles'));
});

test('la plantilla de respuesta escapa el texto, conserva los saltos de línea y escapa responsable y cargo', () => {
  const { html, texto } = plantillaRespuesta({
    numero: 'HYO-01-2026-000002',
    texto: `Línea uno ${ATAQUE}\nLínea dos`,
    responsable: ATAQUE,
    cargo: '<b>Administrador</b>',
    urlSeguimiento: 'http://localhost:8787/seguimiento/abc',
  });
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('<b>Administrador</b>'));
  assert.ok(html.includes('&lt;b&gt;Administrador&lt;/b&gt;'));
  assert.ok(html.includes('Línea uno') && html.includes('<br>Línea dos'));
  assert.ok(texto.includes('Línea uno') && texto.includes('\nLínea dos'));
});

test('la firma HMAC-SHA256 coincide con la de node:crypto y con la del relevo simulado', async () => {
  const secreto = 'secreto-de-prueba-0123456789abcdef';
  const carga = JSON.stringify({ v: 1, ts: 1_700_000_000, nonce: 'a'.repeat(32), para: 'x@pruebas-rc.dev', asunto: 'Ñandú áéíóú', html: '<p>ü</p>', texto: 'ü' });
  const esperada = createHmac('sha256', secreto).update(carga, 'utf8').digest('hex');
  assert.equal(await firmarCarga(secreto, carga), esperada);
  assert.equal(firmaEsperada(secreto, carga), esperada);
  assert.match(esperada, /^[0-9a-f]{64}$/);
  assert.notEqual(await firmarCarga('otro-secreto', carga), esperada);
});

test('el sobre lleva v, ts, nonce de 32 hex y firma sobre la cadena exacta', async () => {
  const secreto = 'otro-secreto-de-prueba';
  const sobre = await construirSobre(secreto, { para: 'a@pruebas-rc.dev', asunto: 'Asunto', html: '<p>h</p>', texto: 't' }, 1_700_000_123);
  const d = JSON.parse(sobre.carga);
  assert.equal(d.v, 1);
  assert.equal(d.ts, 1_700_000_123);
  assert.match(d.nonce, /^[0-9a-f]{32}$/);
  assert.equal(d.para, 'a@pruebas-rc.dev');
  assert.equal(sobre.firma, createHmac('sha256', secreto).update(sobre.carga, 'utf8').digest('hex'));
  const otro = await construirSobre(secreto, { para: 'a@pruebas-rc.dev', asunto: 'Asunto', html: '<p>h</p>', texto: 't' }, 1_700_000_123);
  assert.notEqual(JSON.parse(otro.carga).nonce, d.nonce, 'cada sobre usa un nonce nuevo');
});

test('solo se admite HTTPS, o HTTP hacia la propia máquina', () => {
  assert.ok(urlRelevoValida('https://script.google.com/macros/s/ABC/exec'));
  assert.ok(urlRelevoValida('http://localhost:8799'));
  assert.ok(urlRelevoValida('http://127.0.0.1:8799'));
  assert.ok(!urlRelevoValida('http://script.google.com/macros/s/ABC/exec'));
  assert.ok(!urlRelevoValida('http://localhost.evil.com'));
  assert.ok(!urlRelevoValida('ftp://localhost'));
  assert.ok(!urlRelevoValida('no es una url'));
});

test('dominios de prueba', () => {
  for (const c of ['a@example.com', 'a@EXAMPLE.ORG', 'a@example.net', 'a@algo.test', 'a@x.y.invalid', 'a@mi.example', 'a@example.com.']) {
    assert.ok(esDominioDePrueba(c), c);
  }
  for (const c of ['a@pruebas-rc.dev', 'a@gmail.com', 'a@example.com.pe', 'a@miexample.com', 'a@test.com', 'sin-arroba']) {
    assert.ok(!esDominioDePrueba(c), c);
  }
});

test('el calendario hábil precalculado coincide con diasHabilesEntre y diaLimite', () => {
  const feriados = new Set(['2026-12-08', '2026-12-09', '2026-12-25', '2027-01-01']);
  const desde = '2026-11-01';
  const hasta = '2027-01-31';
  const cal = crearCalendarioHabil(desde, hasta, feriados);
  let comprobadas = 0;
  for (let a = desde; a <= hasta; a = sumarDias(a, 1)) {
    assert.equal(cal.diaLimite(a), diaLimite(a, feriados), `diaLimite(${a})`);
    for (let b = a; b <= hasta; b = sumarDias(b, 3)) {
      assert.equal(cal.diasHabilesEntre(a, b), diasHabilesEntre(a, b, feriados), `diasHabilesEntre(${a}, ${b})`);
      comprobadas++;
    }
  }
  assert.ok(comprobadas > 1000);
  assert.equal(cal.diasHabilesEntre('2026-12-10', '2026-12-01'), 0);
  assert.throws(() => cal.diasHabilesEntre('2020-01-01', '2026-11-05'), RangeError);
});
