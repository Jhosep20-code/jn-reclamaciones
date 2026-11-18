// Direcciones de prueba: nunca se envía correo real a dominios reservados para documentación o pruebas.
const DOMINIOS_EXACTOS = new Set(['example.com', 'example.org', 'example.net']);
const SUFIJOS = ['.test', '.invalid', '.example'];

export function esDominioDePrueba(correo: string): boolean {
  const arroba = correo.lastIndexOf('@');
  if (arroba < 0) return false;
  const dominio = correo.slice(arroba + 1).trim().toLowerCase().replace(/\.$/, '');
  return DOMINIOS_EXACTOS.has(dominio) || SUFIJOS.some((s) => dominio.endsWith(s));
}
