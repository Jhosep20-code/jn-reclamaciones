// Cálculo de plazos de atención. Función pura: sin acceso a la base ni al reloj.
// Regla: 15 días hábiles desde el día hábil siguiente al registro, en hora de Lima (UTC-5, sin horario de verano),
// sin sábados, domingos ni feriados.

export const DIAS_PLAZO = 15;
const MS_HORA = 3_600_000;
const MS_DIA = 86_400_000;
const DESFASE_LIMA_HORAS = 5;

export type EstadoPlazo = 'registrado' | 'en_atencion' | 'respondido';
export type SemaforoPlazo = 'verde' | 'ambar' | 'rojo' | 'vencido' | 'cerrado';

export interface ResultadoPlazo {
  fecha_limite: string;
  dias_habiles_transcurridos: number;
  dias_habiles_restantes: number;
  semaforo: SemaforoPlazo;
}

// Fecha civil (AAAA-MM-DD) en Lima de un instante.
export function fechaLima(instante: Date | string): string {
  const fecha = typeof instante === 'string' ? new Date(instante) : instante;
  return new Date(fecha.getTime() - DESFASE_LIMA_HORAS * MS_HORA).toISOString().slice(0, 10);
}

function partes(fecha: string): [number, number, number] {
  const p = fecha.split('-');
  return [Number(p[0]), Number(p[1]), Number(p[2])];
}

export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = partes(fecha);
  return new Date(Date.UTC(a, m - 1, d) + dias * MS_DIA).toISOString().slice(0, 10);
}

export function esDiaHabil(fecha: string, feriados: ReadonlySet<string>): boolean {
  const [a, m, d] = partes(fecha);
  const dia = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return dia !== 0 && dia !== 6 && !feriados.has(fecha);
}

// Día hábil número `dias` después de `diaRegistro` (el día de registro no cuenta).
export function diaLimite(diaRegistro: string, feriados: ReadonlySet<string>, dias = DIAS_PLAZO): string {
  let fecha = diaRegistro;
  let contados = 0;
  while (contados < dias) {
    fecha = sumarDias(fecha, 1);
    if (esDiaHabil(fecha, feriados)) contados++;
  }
  return fecha;
}

// Días hábiles en el intervalo (desde, hasta]: excluye `desde`, incluye `hasta`.
export function diasHabilesEntre(desde: string, hasta: string, feriados: ReadonlySet<string>): number {
  let total = 0;
  let fecha = desde;
  while (fecha < hasta) {
    fecha = sumarDias(fecha, 1);
    if (esDiaHabil(fecha, feriados)) total++;
  }
  return total;
}

// Fin del día civil de Lima, expresado en ISO UTC.
export function finDeDiaLimaISO(fecha: string): string {
  const [a, m, d] = partes(fecha);
  return new Date(Date.UTC(a, m - 1, d, 23, 59, 59, 999) + DESFASE_LIMA_HORAS * MS_HORA).toISOString();
}

export function semaforoPara(transcurridos: number, estado: EstadoPlazo): SemaforoPlazo {
  if (estado === 'respondido') return 'cerrado';
  if (transcurridos <= 9) return 'verde';
  if (transcurridos <= 13) return 'ambar';
  if (transcurridos <= DIAS_PLAZO) return 'rojo';
  return 'vencido';
}

// Variante por fechas civiles de Lima (la usa el panel, que agrupa en SQL por día).
// `diaReferencia` es hoy, o el día de la respuesta si el caso está respondido.
export function calcularPlazoPorDias(
  diaRegistro: string,
  diaReferencia: string,
  estado: EstadoPlazo,
  feriados: ReadonlySet<string>,
): ResultadoPlazo {
  const transcurridos = diasHabilesEntre(diaRegistro, diaReferencia, feriados);
  return {
    fecha_limite: finDeDiaLimaISO(diaLimite(diaRegistro, feriados)),
    dias_habiles_transcurridos: transcurridos,
    dias_habiles_restantes: DIAS_PLAZO - transcurridos,
    semaforo: semaforoPara(transcurridos, estado),
  };
}

export function calcularPlazo(entrada: {
  creadoEn: string;
  ahora: Date;
  feriados: ReadonlySet<string>;
  estado: EstadoPlazo;
  respondidoEn?: string | null;
}): ResultadoPlazo {
  const referencia =
    entrada.estado === 'respondido' && entrada.respondidoEn ? fechaLima(entrada.respondidoEn) : fechaLima(entrada.ahora);
  return calcularPlazoPorDias(fechaLima(entrada.creadoEn), referencia, entrada.estado, entrada.feriados);
}

// Calendario hábil precalculado para un rango de fechas: permite calcular días hábiles y fechas límite de
// muchos casos en O(1) cada uno (los reportes lo usan para no repetir el recorrido día por día en cada caso).
export interface CalendarioHabil {
  diasHabilesEntre(desde: string, hasta: string): number;
  diaLimite(diaRegistro: string, dias?: number): string;
}

// `desde` y `hasta` delimitan las fechas que se consultarán; se extiende lo necesario para ubicar el día límite.
export function crearCalendarioHabil(desde: string, hasta: string, feriados: ReadonlySet<string>): CalendarioHabil {
  const fin = sumarDias(hasta, DIAS_PLAZO * 3 + 20); // 15 días hábiles caben en menos de 45 corridos con feriados
  const indice = new Map<string, number>(); // fecha -> cantidad de días hábiles hasta esa fecha (incluida), desde `desde`
  const habiles: string[] = []; // habiles[k] = k-ésimo día hábil posterior a `desde`
  let acumulado = 0;
  for (let f = desde; f <= fin; f = sumarDias(f, 1)) {
    if (f !== desde && esDiaHabil(f, feriados)) {
      acumulado++;
      habiles[acumulado] = f;
    }
    indice.set(f, acumulado);
  }
  const posicion = (f: string): number => {
    const v = indice.get(f);
    if (v === undefined) throw new RangeError(`Fecha fuera del calendario: ${f}`);
    return v;
  };
  return {
    diasHabilesEntre: (a, b) => Math.max(0, posicion(b) - posicion(a)),
    diaLimite: (diaRegistro, dias = DIAS_PLAZO) => {
      const destino = habiles[posicion(diaRegistro) + dias];
      if (destino === undefined) throw new RangeError('Día límite fuera del calendario');
      return destino;
    },
  };
}
