import { Link } from 'react-router-dom';
import { useTitulo } from '../hooks';

export function NoEncontrada() {
  useTitulo('Página no encontrada');
  return (
    <div className="contenedor-angosto py-6">
      <div className="tarjeta text-center">
        <p className="eyebrow">Error 404</p>
        <h1 className="mt-2">No encontramos esta página</h1>
        <p className="mx-auto my-3 max-w-md text-suave">La dirección no existe o fue cambiada. Puede volver al inicio y continuar desde allí.</p>
        <Link to="/" className="btn btn-primario">Ir al inicio</Link>
      </div>
    </div>
  );
}
