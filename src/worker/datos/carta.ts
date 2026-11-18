// Datos de la carta de respuesta (DatosCarta del contrato 1.0). Se arma igual para la bandeja y para la consulta segura.
import type { Rol, Tipo } from '../tipos';
import { numeroHoja } from './comunes';

export interface EntradaCarta {
  estCodigo: string;
  anio: number;
  correlativo: number;
  tipo: Tipo;
  fechaEmision: string; // ISO de la respuesta
  empresa: { razon_social: string; ruc: string; direccion_fiscal: string } | undefined;
  estNombre: string;
  estDireccion: string;
  estCiudad: string;
  nombres: string;
  domicilio: string | null;
  texto: string;
  autorNombre: string;
  autorRol: Rol;
  /** Cargo propio de la persona, si está configurado (ver cargoDe). */
  autorCargo?: string | null;
}

/** Subconsulta del cargo propio del autor (alias `u` = usuarios). Es un dato opcional de la tabla de configuración,
 *  con clave «cargo:<correo>»; permite, por ejemplo, «Encargada de tienda» o «Administradora». */
export const SQL_CARGO_AUTOR = "(SELECT valor FROM configuracion WHERE clave = 'cargo:' || u.correo)";

/** Cargo que firma documentos y correos: el propio de la persona si está configurado; si no, el genérico del rol. */
export function cargoDe(rol: Rol | string | null, propio?: string | null): string {
  if (propio && propio.trim()) return propio.trim();
  return rol === 'admin' ? 'Administrador' : 'Encargado de tienda';
}

export function construirCarta(e: EntradaCarta) {
  return {
    numero: numeroHoja(e.estCodigo, e.anio, e.correlativo),
    tipo: e.tipo,
    fecha_emision: e.fechaEmision,
    empresa: e.empresa ?? { razon_social: '', ruc: '', direccion_fiscal: '' },
    establecimiento: { codigo: e.estCodigo, nombre: e.estNombre, direccion: e.estDireccion, ciudad: e.estCiudad },
    destinatario: { nombres: e.nombres, domicilio: e.domicilio },
    texto: e.texto,
    responsable: { nombre: e.autorNombre, cargo: cargoDe(e.autorRol, e.autorCargo) },
  };
}

export const SQL_EMPRESA = 'SELECT razon_social, ruc, direccion_fiscal FROM empresa WHERE id = 1';
