import { Link, Navigate, useLocation } from 'react-router-dom';
import { VistaConstancia } from '../componentes/VistaConstancia';
import { useTitulo } from '../hooks';
import type { Constancia } from '../tipos';

/** La constancia llega solo por el estado de navegación (memoria); no se guarda en almacenamiento. */
export function PaginaConstancia() {
  useTitulo('Constancia de reclamación');
  const { state } = useLocation() as { state: { constancia?: Constancia } | null };
  const constancia = state?.constancia;
  if (!constancia) return <Navigate to="/" replace />;
  return (
    <div className="contenedor-angosto">
      <p className="no-imprimir aviso aviso-ok mb-5 font-semibold" role="status">
        Su reclamación fue registrada correctamente.
      </p>
      <VistaConstancia constancia={constancia} />
      <p className="no-imprimir mt-5 text-center text-sm">
        <Link to="/">Volver al inicio</Link>
      </p>
    </div>
  );
}
