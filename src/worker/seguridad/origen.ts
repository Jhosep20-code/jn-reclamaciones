// Origen del cliente: nunca se guarda la IP, solo una huella con secreto.
import type { Context } from 'hono';
import { ErrorConfiguracion } from '../errores';
import type { AppEnv } from '../tipos';
import { sha256Hex } from './claves';

export async function huellaOrigen(c: Context<AppEnv>): Promise<string> {
  const secreto = c.env.SECRETO_HUELLAS;
  if (!secreto) throw new ErrorConfiguracion('Falta el secreto SECRETO_HUELLAS');
  const ip = c.req.header('CF-Connecting-IP') ?? 'local';
  return sha256Hex(secreto + ip);
}
