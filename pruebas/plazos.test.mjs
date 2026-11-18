// Pruebas unitarias de plazos: node --test pruebas/plazos.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularPlazo, fechaLima, diaLimite } from '../src/worker/dominio/plazos.ts';

const feriados = new Set(['2026-12-08', '2026-12-09', '2026-12-25', '2027-01-01']);
// Mediodía de Lima (17:00 UTC) de una fecha.
const mediodia = (f) => new Date(`${f}T17:00:00.000Z`);

test('fechaLima convierte a UTC-5', () => {
  assert.equal(fechaLima('2026-11-14T03:00:00.000Z'), '2026-11-13');
  assert.equal(fechaLima('2027-01-01T04:59:59.000Z'), '2026-12-31');
  assert.equal(fechaLima('2027-01-01T05:00:00.000Z'), '2027-01-01');
});

test('registro un viernes: el día 1 es el lunes', () => {
  const p = calcularPlazo({ creadoEn: '2026-11-13T17:00:00.000Z', ahora: mediodia('2026-11-13'), feriados, estado: 'registrado' });
  assert.equal(p.dias_habiles_transcurridos, 0);
  assert.equal(p.dias_habiles_restantes, 15);
  assert.equal(p.semaforo, 'verde');
  assert.equal(diaLimite('2026-11-13', feriados), '2026-12-04');
  assert.equal(p.fecha_limite, '2026-12-05T04:59:59.999Z');
  const lunes = calcularPlazo({ creadoEn: '2026-11-13T17:00:00.000Z', ahora: mediodia('2026-11-16'), feriados, estado: 'registrado' });
  assert.equal(lunes.dias_habiles_transcurridos, 1);
});

test('registro en sábado cuenta desde el lunes', () => {
  assert.equal(diaLimite('2026-11-14', feriados), '2026-12-04');
  const p = calcularPlazo({ creadoEn: '2026-11-14T17:00:00.000Z', ahora: mediodia('2026-11-15'), feriados, estado: 'registrado' });
  assert.equal(p.dias_habiles_transcurridos, 0);
});

test('registro antes de los feriados del 8 y 9 de diciembre', () => {
  assert.equal(diaLimite('2026-12-07', feriados), '2026-12-31');
  const feriado = calcularPlazo({ creadoEn: '2026-12-07T17:00:00.000Z', ahora: mediodia('2026-12-08'), feriados, estado: 'registrado' });
  assert.equal(feriado.dias_habiles_transcurridos, 0);
  const jueves = calcularPlazo({ creadoEn: '2026-12-07T17:00:00.000Z', ahora: mediodia('2026-12-10'), feriados, estado: 'registrado' });
  assert.equal(jueves.dias_habiles_transcurridos, 1);
});

test('cruce de año con feriado del 1 de enero', () => {
  assert.equal(diaLimite('2026-12-30', feriados), '2027-01-21');
  const p = calcularPlazo({ creadoEn: '2026-12-30T17:00:00.000Z', ahora: mediodia('2027-01-04'), feriados, estado: 'registrado' });
  assert.equal(p.dias_habiles_transcurridos, 2);
});

test('semáforo en los límites', () => {
  const caso = (ahora) => calcularPlazo({ creadoEn: '2026-11-13T17:00:00.000Z', ahora: mediodia(ahora), feriados, estado: 'registrado' });
  assert.equal(caso('2026-11-26').semaforo, 'verde'); // 9 días
  assert.equal(caso('2026-11-27').semaforo, 'ambar'); // 10
  assert.equal(caso('2026-12-02').semaforo, 'ambar'); // 13
  assert.equal(caso('2026-12-03').semaforo, 'rojo'); // 14
  assert.equal(caso('2026-12-04').semaforo, 'rojo'); // 15
  assert.equal(caso('2026-12-04').dias_habiles_restantes, 0);
  const vencido = caso('2026-12-07');
  assert.equal(vencido.semaforo, 'vencido');
  assert.equal(vencido.dias_habiles_restantes, -1);
});

test('respondido queda cerrado y mide hasta la respuesta', () => {
  const p = calcularPlazo({
    creadoEn: '2026-11-13T17:00:00.000Z', ahora: mediodia('2027-03-01'), feriados,
    estado: 'respondido', respondidoEn: '2026-11-18T17:00:00.000Z',
  });
  assert.equal(p.semaforo, 'cerrado');
  assert.equal(p.dias_habiles_transcurridos, 3);
});
