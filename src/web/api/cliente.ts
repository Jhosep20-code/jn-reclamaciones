import type { ErrorApiCuerpo } from '../tipos';

/** Error uniforme devuelto por la API (o por la red). */
export class ErrorApi extends Error {
  estado: number;
  campos?: Record<string, string>;
  /** Segundos de espera indicados por Retry-After (429). */
  reintentarEn?: number;

  constructor(estado: number, mensaje: string, campos?: Record<string, string>, reintentarEn?: number) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.estado = estado;
    this.campos = campos;
    this.reintentarEn = reintentarEn;
  }
}

// El token CSRF vive solo en memoria; la sesión de React lo fija al iniciar o recuperar sesión.
let tokenCsrf: string | null = null;
let alExpirarSesion: (() => void) | null = null;

export function fijarTokenCsrf(token: string | null): void {
  tokenCsrf = token;
}

export function registrarAlExpirarSesion(fn: (() => void) | null): void {
  alExpirarSesion = fn;
}

type Metodo = 'GET' | 'POST' | 'PATCH' | 'DELETE';

async function pedir<T>(metodo: Metodo, ruta: string, cuerpo?: unknown): Promise<T> {
  const cabeceras: Record<string, string> = { Accept: 'application/json' };
  if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';
  if (metodo !== 'GET' && tokenCsrf) cabeceras['X-CSRF-Token'] = tokenCsrf;

  let respuesta: Response;
  try {
    respuesta = await fetch(ruta, {
      method: metodo,
      credentials: 'same-origin',
      headers: cabeceras,
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    });
  } catch {
    throw new ErrorApi(0, 'No se pudo conectar con el servicio. Revise su conexión e inténtelo de nuevo.');
  }

  if (respuesta.status === 204) return undefined as T;

  let datos: unknown = null;
  try {
    datos = await respuesta.json();
  } catch {
    datos = null;
  }

  if (!respuesta.ok) {
    const cuerpoError = (datos ?? {}) as Partial<ErrorApiCuerpo>;
    const espera = Number(respuesta.headers.get('Retry-After'));
    const mensaje =
      typeof cuerpoError.error === 'string' && cuerpoError.error
        ? cuerpoError.error
        : 'Ocurrió un error inesperado. Inténtelo de nuevo.';
    // Una sesión vencida (401) en rutas privadas lleva de vuelta al acceso.
    if (respuesta.status === 401 && ruta !== '/api/sesion') alExpirarSesion?.();
    throw new ErrorApi(
      respuesta.status,
      mensaje,
      cuerpoError.campos,
      Number.isFinite(espera) && espera > 0 ? espera : undefined,
    );
  }
  return datos as T;
}

export const api = {
  obtener: <T>(ruta: string) => pedir<T>('GET', ruta),
  crear: <T>(ruta: string, cuerpo?: unknown) => pedir<T>('POST', ruta, cuerpo ?? {}),
  modificar: <T>(ruta: string, cuerpo: unknown) => pedir<T>('PATCH', ruta, cuerpo),
  eliminar: <T = void>(ruta: string) => pedir<T>('DELETE', ruta),
};

/** Acepta un arreglo directo o un objeto con la lista en una propiedad conocida. */
export function normalizarLista<T>(r: unknown): { items: T[]; total: number | null } {
  if (Array.isArray(r)) return { items: r as T[], total: null };
  if (r && typeof r === 'object') {
    const o = r as Record<string, unknown>;
    const total = typeof o.total === 'number' ? o.total : null;
    for (const clave of ['reclamos', 'items', 'datos', 'eventos', 'resultados', 'lista']) {
      if (Array.isArray(o[clave])) return { items: o[clave] as T[], total };
    }
  }
  return { items: [], total: null };
}
