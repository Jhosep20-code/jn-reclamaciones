const ZONA = 'America/Lima';

const fFechaHora = new Intl.DateTimeFormat('es-PE', { timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
const fFecha = new Intl.DateTimeFormat('es-PE', { timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric' });
const fFechaLarga = new Intl.DateTimeFormat('es-PE', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fHoy = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' });
const fMoneda = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });

export const formatearFechaHora = (iso: string) => `${fFechaHora.format(new Date(iso))} (hora de Lima)`;
export const formatearFechaHoraCorta = (iso: string) => fFechaHora.format(new Date(iso));
export const formatearFecha = (iso: string) => fFecha.format(new Date(iso));
export const formatearFechaLarga = (iso: string) => fFechaLarga.format(new Date(iso));
export const formatearMonto = (n: number) => fMoneda.format(n);

/** Fecha de hoy en Lima como AAAA-MM-DD. */
export const hoyEnLima = () => fHoy.format(new Date());

/** Muestra AAAA-MM-DD como DD/MM/AAAA sin pasar por zonas horarias. */
export function formatearFechaSimple(aaaammdd: string): string {
  const [a, m, d] = aaaammdd.split('-');
  return a && m && d ? `${d}/${m}/${a}` : aaaammdd;
}

export const ETIQUETA_TIPO = { reclamo: 'Reclamo', queja: 'Queja' } as const;
export const ETIQUETA_ESTADO = { registrado: 'Registrado', en_atencion: 'En atención', respondido: 'Respondido' } as const;
export const ETIQUETA_SEMAFORO = {
  verde: 'En plazo',
  ambar: 'Por vencer',
  rojo: 'Último tramo',
  vencido: 'Vencido',
  cerrado: 'Cerrado',
} as const;

export const ETIQUETA_ACCION: Record<string, string> = {
  reclamo_registrado: 'Reclamación registrada',
  reclamo_en_atencion: 'Marcada en atención',
  reclamo_reclasificado: 'Reclasificada',
  respuesta_registrada: 'Respuesta registrada',
  sesion_iniciada: 'Sesión iniciada',
  sesion_cerrada: 'Sesión cerrada',
  usuario_creado: 'Usuario creado',
  usuario_modificado: 'Usuario modificado',
  establecimiento_creado: 'Tienda creada',
  establecimiento_modificado: 'Tienda modificada',
  correo_enviado: 'Correo enviado',
  correo_fallido: 'Falló el envío de un correo',
  carta_entrega_registrada: 'Entrega de carta registrada',
  respuesta_consultada: 'Respuesta consultada por el consumidor',
  correo_configuracion_cambiada: 'Configuración de correo cambiada',
};

export function textoDias(restantes: number, semaforo: string): string {
  if (semaforo === 'cerrado') return 'Atendido';
  if (restantes < 0) {
    const n = Math.abs(restantes);
    return `Venció hace ${n} ${n === 1 ? 'día hábil' : 'días hábiles'}`;
  }
  if (restantes === 0) return 'Vence hoy';
  return `Quedan ${restantes} ${restantes === 1 ? 'día hábil' : 'días hábiles'}`;
}

const fDiaMesLargo = new Intl.DateTimeFormat('es-PE', { timeZone: ZONA, day: 'numeric', month: 'long', year: 'numeric' });
/** Fecha larga sin día de la semana, p. ej. «15 de noviembre de 2026» (hora de Lima). */
export const formatearFechaCartaLima = (iso: string | Date) => fDiaMesLargo.format(typeof iso === 'string' ? new Date(iso) : iso);

/** Convierte un instante en la fecha AAAA-MM-DD de Lima. */
export const fechaLimaDe = (iso: string) => fHoy.format(new Date(iso));

/** Suma días a una fecha AAAA-MM-DD (sin zonas horarias). */
export function sumarDias(aaaammdd: string, dias: number): string {
  const d = new Date(aaaammdd + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export const ETIQUETA_MEDIO = { correo: 'correo electrónico', carta: 'carta al domicilio' } as const;
