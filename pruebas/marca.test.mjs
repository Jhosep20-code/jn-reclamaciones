// Pruebas de marca: la paleta de marca.ts (usada en PDF y correo) coincide con los tokens de estilos.css,
// y los textos de marca no se mezclan. node --test pruebas/marca.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MARCA, PALETA } from '../src/compartido/marca.ts';

const css = readFileSync(new URL('../src/web/estilos.css', import.meta.url), 'utf8');

test('la paleta de marca.ts coincide con los tokens CSS', () => {
  const tokens = { navy: '--jn-navy', azulProfundo: '--jn-azul', oro: '--jn-oro', marfil: '--jn-marfil', plata: '--jn-plata', exito: '--jn-exito', advertencia: '--jn-advertencia', error: '--jn-error', informacion: '--jn-info' };
  for (const [clave, variable] of Object.entries(tokens)) {
    const m = css.match(new RegExp(`${variable}: *(#[0-9a-fA-F]{6})`));
    assert.ok(m, `${variable} definido en estilos.css`);
    assert.equal(m[1].toLowerCase(), PALETA[clave].toLowerCase(), clave);
  }
});

test('textos de marca: JN Reclamaciones es el software, JN Soluciones Digitales la desarrolladora', () => {
  assert.equal(MARCA.nombre, 'JN Reclamaciones');
  assert.equal(MARCA.desarrolladora, 'JN Soluciones Digitales');
  assert.equal(MARCA.plataforma, 'JN Reclamaciones · JN Soluciones Digitales');
  assert.equal(MARCA.pieDocumento, 'Generado con JN Reclamaciones · Entorno de demostración');
  assert.equal(MARCA.pieCorreo, 'Mensaje enviado mediante JN Reclamaciones · Entorno de demostración');
  assert.ok(!Object.values(MARCA).some((v) => /ReclamoClaro/.test(v)));
});
