// JN Reclamaciones: API sobre Cloudflare Workers + D1.
import { Hono } from 'hono';
import { registrar } from './datos/comunes';
import { ErrorConfiguracion, ErrorHttp } from './errores';
import administracion from './rutas/administracion';
import bandeja from './rutas/bandeja';
import publicas from './rutas/publicas';
import sesion from './rutas/sesion';
import type { AppEnv } from './tipos';

const app = new Hono<AppEnv>();

// Cabeceras de seguridad y registro estructurado en todas las respuestas de la API.
app.use('/api/*', async (c, next) => {
  const inicio = Date.now();
  await next();
  c.res.headers.set('X-Content-Type-Options', 'nosniff');
  c.res.headers.set('Referrer-Policy', 'no-referrer');
  c.res.headers.set('Cache-Control', 'no-store');
  // Se registra la plantilla de la ruta (no la URL real: el código de seguimiento no debe quedar en los registros).
  registrar('solicitud', c.req.routePath, { metodo: c.req.method, estado: c.res.status, ms: Date.now() - inicio });
});

app.route('/api', publicas);
app.route('/api', sesion);
app.route('/api', bandeja);
app.route('/api', administracion);

app.notFound((c) => c.json({ error: 'Ruta no encontrada' }, 404));

app.onError((e, c) => {
  if (e instanceof ErrorHttp) {
    const cuerpo: { error: string; campos?: Record<string, string> } = { error: e.message };
    if (e.campos) cuerpo.campos = e.campos;
    return c.json(cuerpo, e.estado, e.cabeceras);
  }
  if (e instanceof ErrorConfiguracion) {
    registrar('error_configuracion', c.req.routePath, { detalle: e.message });
    return c.json({ error: 'Configuración incompleta del servidor' }, 500);
  }
  // Sin trazas ni datos del usuario hacia el cliente.
  registrar('error_interno', c.req.routePath, { tipo: e.name, mensaje: String(e.message).slice(0, 200) });
  return c.json({ error: 'Error interno del servidor' }, 500);
});

export default app;
