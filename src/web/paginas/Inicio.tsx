import { Link } from 'react-router-dom';
import { IcoBuscar, IcoDocumento } from '../componentes/Iconos';
import { nombreEmpresa } from '../componentes/Comunes';
import { LEYENDA_PLAZO } from '../componentes/VistaConstancia';
import { useEmpresa } from '../empresa';
import { useTitulo } from '../hooks';

export function Inicio() {
  useTitulo('Libro de Reclamaciones Virtual');
  const empresa = useEmpresa();

  return (
    <div className="contenedor">
      <div className="portada">
        <div>
          <p className="eyebrow">Atención al consumidor</p>
          <h1 className="portada-titulo">Libro de Reclamaciones Virtual</h1>
          {empresa && <p className="portada-subtitulo">{nombreEmpresa(empresa.razon_social)}</p>}
          <p className="portada-texto">
            Registre un reclamo o queja y consulte el estado de su solicitud de manera sencilla y segura.
          </p>
          <div className="portada-acciones">
            <Link to="/registrar" className="btn btn-primario btn-grande">
              <IcoDocumento tam={18} />
              Registrar un reclamo o queja
            </Link>
            <Link to="/seguimiento" className="btn btn-secundario btn-grande">
              <IcoBuscar tam={18} />
              Consultar mi reclamación
            </Link>
          </div>
        </div>

        <aside className="tarjeta" aria-labelledby="t-pasos">
          <h2 id="t-pasos" className="titulo-bloque">Cómo funciona</h2>
          <ol className="pasos">
            <li>
              <strong>Complete la hoja de reclamación</strong>
              <span>Sus datos, el producto o servicio y lo ocurrido. Sin costo y sin crear una cuenta.</span>
            </li>
            <li>
              <strong>Reciba su constancia</strong>
              <span>Con el número de la hoja y un código para seguir su caso.</span>
            </li>
            <li>
              <strong>Consulte el estado</strong>
              <span>Con su código, cuando lo necesite.</span>
            </li>
          </ol>
          <p className="mt-6 mb-0 border-t border-borde pt-4 text-[0.8125rem] leading-relaxed text-suave">{LEYENDA_PLAZO}</p>
        </aside>
      </div>
    </div>
  );
}
