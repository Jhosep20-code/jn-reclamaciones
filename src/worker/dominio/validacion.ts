// Validación de entrada con zod: esquemas estrictos (rechazan campos desconocidos).
import { z } from 'zod';
import { ErrorHttp } from '../errores';

const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

const texto = (min: number, max: number) => z.string().trim().min(min).max(max);
const correo = z.string().trim().max(254).regex(RE_CORREO, 'Correo no válido');

function tieneMaxDosDecimales(n: number): boolean {
  const centimos = n * 100;
  return Math.abs(centimos - Math.round(centimos)) < 1e-6;
}

export function fechaCalendarioValida(f: string): boolean {
  if (!RE_FECHA.test(f)) return false;
  const [a, m, d] = f.split('-').map(Number) as [number, number, number];
  const fecha = new Date(Date.UTC(a, m - 1, d));
  return fecha.getUTCFullYear() === a && fecha.getUTCMonth() === m - 1 && fecha.getUTCDate() === d;
}

const consumidor = z
  .strictObject({
    nombres: texto(3, 120),
    tipo_documento: z.enum(['DNI', 'CE', 'PASAPORTE']),
    numero_documento: texto(8, 12),
    domicilio: texto(3, 200).optional(),
    telefono: texto(6, 20).optional(),
    correo: correo.optional(),
    es_menor: z.boolean(),
    apoderado_nombres: texto(3, 120).optional(),
    apoderado_contacto: texto(3, 120).optional(),
  })
  .superRefine((c, ctx) => {
    if (c.tipo_documento === 'DNI' && !/^\d{8}$/.test(c.numero_documento)) {
      ctx.addIssue({ code: 'custom', path: ['numero_documento'], message: 'El DNI debe tener exactamente 8 dígitos' });
    } else if (c.tipo_documento !== 'DNI' && !/^[A-Za-z0-9]{8,12}$/.test(c.numero_documento)) {
      ctx.addIssue({ code: 'custom', path: ['numero_documento'], message: 'Use solo letras y números (8 a 12)' });
    }
    if (!c.domicilio && !c.correo) {
      ctx.addIssue({ code: 'custom', path: ['domicilio'], message: 'Indique domicilio o correo' });
    }
    if (c.es_menor && !c.apoderado_nombres) {
      ctx.addIssue({ code: 'custom', path: ['apoderado_nombres'], message: 'Obligatorio si el consumidor es menor de edad' });
    }
  });

const esquemaRegistroBase = z.strictObject({
  establecimiento_codigo: z.string().trim().regex(/^[A-Z]{3}-\d{2}$/, 'Código de establecimiento no válido'),
  tipo: z.enum(['reclamo', 'queja']),
  medio_respuesta: z.enum(['correo', 'carta']),
  consumidor,
  bien: z.strictObject({
    tipo: z.enum(['producto', 'servicio']),
    descripcion: texto(3, 300),
    monto: z
      .number()
      .min(0)
      .max(100_000_000)
      .refine(tieneMaxDosDecimales, 'Máximo 2 decimales')
      .optional(),
  }),
  detalle: texto(10, 3000),
  pedido: texto(5, 1500),
  acepta_tratamiento_datos: z.literal(true, 'Debe aceptar el tratamiento de datos personales'),
});

// El medio elegido para recibir la respuesta exige el dato de contacto correspondiente.
export const esquemaRegistro = esquemaRegistroBase.superRefine((d, ctx) => {
  if (d.medio_respuesta === 'correo' && !d.consumidor.correo) {
    ctx.addIssue({ code: 'custom', path: ['consumidor', 'correo'], message: 'Obligatorio si desea recibir la respuesta por correo' });
  }
  if (d.medio_respuesta === 'carta' && !d.consumidor.domicilio) {
    ctx.addIssue({ code: 'custom', path: ['consumidor', 'domicilio'], message: 'Obligatorio si desea recibir la respuesta por carta' });
  }
});
export type DatosRegistro = z.infer<typeof esquemaRegistro>;

export const esquemaLogin = z.strictObject({
  correo: z.string().trim().min(1).max(254),
  clave: z.string().min(1).max(200),
});

export const esquemaCambioReclamo = z
  .strictObject({
    estado: z.literal('en_atencion').optional(),
    tipo: z.enum(['reclamo', 'queja']).optional(),
  })
  .refine((d) => d.estado !== undefined || d.tipo !== undefined, 'Indique estado o tipo');

export const esquemaRespuesta = z.strictObject({
  texto: texto(10, 4000),
  // Solo se usa si la hoja no tiene preferencia del consumidor (hojas anteriores a 1.0.0).
  medio_comunicacion: z.enum(['correo', 'carta']).optional(),
  fecha_comunicacion: z.string().refine(fechaCalendarioValida, 'Fecha no válida (AAAA-MM-DD)').optional(),
});

export const esquemaConsultaRespuesta = z.strictObject({
  numero_documento: z.string().trim().min(1).max(30),
});

export const esquemaEntregaCarta = z.strictObject({
  fecha_entrega: z.string().refine(fechaCalendarioValida, 'Fecha no válida (AAAA-MM-DD)'),
  observacion: texto(1, 300).optional(),
});

export const esquemaCorreoAdmin = z.strictObject({
  activo: z.boolean(),
});

const clave = z.string().min(10, 'Mínimo 10 caracteres').max(200);

export const esquemaUsuarioNuevo = z.strictObject({
  nombre: texto(3, 120),
  correo,
  clave,
  rol: z.enum(['admin', 'encargado']),
  establecimiento_codigo: z.string().trim().regex(/^[A-Z]{3}-\d{2}$/).optional(),
});

export const esquemaUsuarioCambio = z
  .strictObject({
    nombre: texto(3, 120).optional(),
    rol: z.enum(['admin', 'encargado']).optional(),
    establecimiento_codigo: z.string().trim().regex(/^[A-Z]{3}-\d{2}$/).optional(),
    activo: z.boolean().optional(),
    clave: clave.optional(),
  })
  .refine((d) => Object.keys(d).length > 0, 'Indique al menos un campo');

export const esquemaEstablecimientoNuevo = z.strictObject({
  codigo: z.string().trim().regex(/^[A-Z]{3}-\d{2}$/, 'Formato AAA-00'),
  nombre: texto(3, 120),
  direccion: texto(3, 200),
  ciudad: texto(2, 80),
});

export const esquemaEstablecimientoCambio = z
  .strictObject({
    nombre: texto(3, 120).optional(),
    direccion: texto(3, 200).optional(),
    ciudad: texto(2, 80).optional(),
    activo: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, 'Indique al menos un campo');

function motivo(i: z.core.$ZodIssue): string {
  switch (i.code) {
    case 'invalid_type':
      return i.input === undefined ? 'Campo obligatorio' : 'Tipo de dato no válido';
    case 'too_small':
      return i.origin === 'string' ? `Mínimo ${String(i.minimum)} caracteres` : `Debe ser al menos ${String(i.minimum)}`;
    case 'too_big':
      return i.origin === 'string' ? `Máximo ${String(i.maximum)} caracteres` : `Debe ser como máximo ${String(i.maximum)}`;
    case 'invalid_value':
      return 'Valor no permitido';
    case 'invalid_format':
      return i.message || 'Formato no válido';
    case 'unrecognized_keys':
      return 'Campo no reconocido';
    default:
      return i.message || 'Valor no válido';
  }
}

export function validar<T extends z.ZodType>(esquema: T, datos: unknown): z.infer<T> {
  const r = esquema.safeParse(datos);
  if (r.success) return r.data;
  const campos: Record<string, string> = {};
  for (const i of r.error.issues) {
    const base = i.path.map(String);
    if (i.code === 'unrecognized_keys') {
      for (const k of i.keys) campos[[...base, k].join('.')] = 'Campo no reconocido';
    } else {
      const ruta = base.join('.') || '(cuerpo)';
      if (!(ruta in campos)) campos[ruta] = motivo(i);
    }
  }
  throw new ErrorHttp(400, 'Datos no válidos', campos);
}

// Cuerpos de campos opcionales vacíos ("") se tratan como ausentes.
export function limpiarVacios(cuerpo: unknown): unknown {
  if (typeof cuerpo !== 'object' || cuerpo === null) return cuerpo;
  const c = cuerpo as Record<string, unknown>;
  const cons = c.consumidor;
  if (typeof cons === 'object' && cons !== null) {
    const o = { ...(cons as Record<string, unknown>) };
    for (const k of ['domicilio', 'telefono', 'correo', 'apoderado_nombres', 'apoderado_contacto']) {
      if (typeof o[k] === 'string' && (o[k] as string).trim() === '') delete o[k];
    }
    return { ...c, consumidor: o };
  }
  return cuerpo;
}
