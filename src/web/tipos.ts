// Tipos compartidos con la API (ver docs/CONTRATO_API.md y docs/CONTRATO_API_v1.md).

export type Rol = 'admin' | 'encargado';
export type Tipo = 'reclamo' | 'queja';
export type Estado = 'registrado' | 'en_atencion' | 'respondido';
export type Semaforo = 'verde' | 'ambar' | 'rojo' | 'vencido' | 'cerrado';
export type TipoDocumento = 'DNI' | 'CE' | 'PASAPORTE';
export type TipoBien = 'producto' | 'servicio';
export type MedioComunicacion = 'correo' | 'carta';

export interface Plazo {
  fecha_limite: string;
  dias_habiles_transcurridos: number;
  dias_habiles_restantes: number;
  semaforo: Semaforo;
}

export interface Empresa {
  razon_social: string;
  ruc: string;
  direccion_fiscal: string;
}

export interface Establecimiento {
  codigo: string;
  nombre: string;
  direccion: string;
  ciudad: string;
}

export interface EstablecimientoAdmin extends Establecimiento {
  activo: boolean;
}

export interface Consumidor {
  nombres: string;
  tipo_documento: TipoDocumento;
  numero_documento: string;
  domicilio?: string | null;
  telefono?: string | null;
  correo?: string | null;
  es_menor: boolean;
  apoderado_nombres?: string | null;
  apoderado_contacto?: string | null;
}

export interface Bien {
  tipo: TipoBien;
  descripcion: string;
  monto?: number | null;
}

export interface SolicitudReclamo {
  establecimiento_codigo: string;
  tipo: Tipo;
  medio_respuesta?: MedioComunicacion;
  consumidor: Consumidor;
  bien: Bien;
  detalle: string;
  pedido: string;
  acepta_tratamiento_datos: true;
}

export type EstadoCorreoConstancia = 'pendiente' | 'omitido' | 'desactivado';

export interface Constancia {
  medio_respuesta?: MedioComunicacion;
  correo_constancia?: EstadoCorreoConstancia;
  numero: string;
  codigo_seguimiento: string;
  tipo: Tipo;
  creado_en: string;
  plazo: Plazo;
  empresa: Empresa;
  establecimiento: Establecimiento;
  hoja: SolicitudReclamo;
}

export interface Seguimiento {
  numero: string;
  tipo: Tipo;
  estado: Estado;
  establecimiento: { codigo: string; nombre: string } | string;
  creado_en: string;
  respondido_en: string | null;
  plazo: Plazo;
  etapas?: EtapaSeguimiento[];
  tiene_respuesta?: boolean;
  medio_respuesta?: MedioComunicacion | null;
}

export interface EtapaSeguimiento {
  etapa: Estado;
  fecha: string | null;
}

export interface Usuario {
  id: number;
  nombre: string;
  correo: string;
  rol: Rol;
  establecimiento: { codigo: string; nombre: string } | null;
}

export interface UsuarioAdmin extends Usuario {
  activo: boolean;
}

export interface SesionRespuesta {
  usuario: Usuario;
  token_csrf: string;
}

export interface ResumenReclamo {
  id: number;
  numero: string;
  tipo: Tipo;
  estado: Estado;
  establecimiento: { codigo: string; nombre: string };
  consumidor_nombres: string;
  creado_en: string;
  plazo: Plazo;
  medio_respuesta?: MedioComunicacion | null;
}

export interface Respuesta {
  texto: string;
  medio_comunicacion: MedioComunicacion;
  fecha_comunicacion: string;
  autor: string;
  creado_en: string;
}

export interface EventoCaso {
  accion: string;
  detalle: string | null;
  autor: string | null;
  creado_en: string;
}

export interface DetalleReclamo extends ResumenReclamo {
  consumidor: Consumidor;
  bien: Bien;
  detalle: string;
  pedido: string;
  respondido_en: string | null;
  respuesta: Respuesta | null;
  eventos: EventoCaso[];
  medio_respuesta?: MedioComunicacion | null;
  comunicaciones?: Comunicacion[];
  carta?: DatosCarta | null;
  anterior_id?: number | null;
  siguiente_id?: number | null;
}

export interface Panel {
  total: number;
  por_estado: Record<Estado, number>;
  por_tipo: Record<Tipo, number>;
  por_semaforo: Record<Semaforo, number>;
  por_establecimiento: { codigo: string; nombre: string; total: number; pendientes: number }[];
  respondidos_en_plazo: number;
  respondidos_fuera_de_plazo: number;
}

export interface EventoGeneral {
  accion: string;
  detalle: string | null;
  autor: string | null;
  numero: string | null;
  creado_en: string;
}

export interface ErrorApiCuerpo {
  error: string;
  campos?: Record<string, string>;
}

// ---------------------------------------------------------------- Ampliación 2.0.0

export type EstadoComunicacion = 'pendiente' | 'enviado' | 'fallido' | 'omitido' | 'pendiente_entrega' | 'entrega_registrada';
export type TipoComunicacion = 'constancia_correo' | 'respuesta_correo' | 'respuesta_carta';

export interface Comunicacion {
  id: number;
  tipo: TipoComunicacion;
  estado: EstadoComunicacion;
  intentos: number;
  detalle: string | null;
  creado_en: string;
  actualizado_en: string;
  fecha_entrega?: string | null;   // fecha de entrega de la carta (AAAA-MM-DD), si se registró
}

export interface DatosCarta {
  numero: string;
  tipo: Tipo;
  fecha_emision: string;
  empresa: Empresa;
  establecimiento: Establecimiento;
  destinatario: { nombres: string; domicilio: string | null };
  texto: string;
  responsable: { nombre: string; cargo: string };
}

export interface RespuestaSegura {
  numero: string;
  respuesta: { texto: string; fecha_emision: string; medio: MedioComunicacion };
  carta: DatosCarta;
}

export interface Indicadores {
  total: number;
  respondidos: number;
  pendientes: number;
  vencidos: number;
  respondidos_en_plazo: number;
  respondidos_fuera_de_plazo: number;
  cumplimiento_pct: number | null;
  promedio_dias_habiles_respuesta: number | null;
}

export interface CasoReporte {
  numero: string;
  tipo: Tipo;
  estado: Estado;
  establecimiento_codigo: string;
  creado_en: string;
  respondido_en: string | null;
  dias_habiles: number;
  semaforo: Semaforo;
}

export interface Reporte {
  filtros: { desde: string; hasta: string; establecimiento: string | null; estado: Estado | null; tipo: Tipo | null };
  resumen: Indicadores;
  por_establecimiento: ({ codigo: string; nombre: string } & Indicadores)[];
  casos: CasoReporte[];
  truncado: boolean;
  generado_en: string;
}

export interface EstadoCorreo {
  activo: boolean;
  configurado: boolean;
  enviados_hoy: number;
  limite_diario: number;
  fallidos_pendientes: number;
}
