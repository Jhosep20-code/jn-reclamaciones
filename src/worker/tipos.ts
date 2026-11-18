// Tipos compartidos del Worker.

export type Entorno = {
  DB: D1Database;
  ASSETS: Fetcher;
  // Secreto del Worker para calcular la huella del origen. Sin valor por defecto.
  SECRETO_HUELLAS?: string;
  // Relevo de correo (Google Apps Script). Opcionales: si faltan, no se envía ningún correo.
  URL_RELEVO_CORREO?: string;
  SECRETO_CORREO?: string;
};

export type Rol = 'admin' | 'encargado';
export type Tipo = 'reclamo' | 'queja';
export type Estado = 'registrado' | 'en_atencion' | 'respondido';
export type MedioRespuesta = 'correo' | 'carta';
export type Semaforo = 'verde' | 'ambar' | 'rojo' | 'vencido' | 'cerrado';

export interface Plazo {
  fecha_limite: string;
  dias_habiles_transcurridos: number;
  dias_habiles_restantes: number;
  semaforo: Semaforo;
}

export interface SesionActiva {
  idHash: string;
  tokenCsrf: string;
  usuarioId: number;
  nombre: string;
  correo: string;
  rol: Rol;
  establecimientoId: number | null;
  establecimientoCodigo: string | null;
  establecimientoNombre: string | null;
}

export type Variables = { sesion: SesionActiva };
export type AppEnv = { Bindings: Entorno; Variables: Variables };
