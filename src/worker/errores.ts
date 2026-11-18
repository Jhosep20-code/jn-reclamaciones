// Errores controlados: se convierten en respuestas JSON con el formato del contrato.

export class ErrorHttp extends Error {
  constructor(
    public estado: 400 | 401 | 403 | 404 | 409 | 429 | 500,
    mensaje: string,
    public campos?: Record<string, string>,
    public cabeceras?: Record<string, string>,
  ) {
    super(mensaje);
  }
}

// Falta un secreto o configuración obligatoria del Worker.
export class ErrorConfiguracion extends Error {}
