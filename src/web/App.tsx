import { Navigate, Route, Routes } from 'react-router-dom';
import { Marco } from './componentes/Marco';
import { MarcoPanel, RutaPrivada } from './componentes/Panel';
import { Inicio } from './paginas/Inicio';
import { Registro } from './paginas/Registro';
import { PaginaConstancia } from './paginas/PaginaConstancia';
import { PaginaSeguimiento } from './paginas/PaginaSeguimiento';
import { Acceso } from './paginas/Acceso';
import { Bandeja } from './paginas/Bandeja';
import { DetalleCaso } from './paginas/DetalleCaso';
import { Indicadores } from './paginas/Indicadores';
import { Usuarios } from './paginas/Usuarios';
import { Establecimientos } from './paginas/Establecimientos';
import { Historial } from './paginas/Historial';
import { Reportes } from './paginas/Reportes';
import { Correo } from './paginas/Correo';
import { NoEncontrada } from './paginas/NoEncontrada';

export function App() {
  return (
    <Routes>
      <Route element={<Marco />}>
        <Route index element={<Inicio />} />
        <Route path="registrar" element={<Registro />} />
        <Route path="registrar/:codigoEstablecimiento" element={<Registro />} />
        <Route path="constancia" element={<PaginaConstancia />} />
        <Route path="seguimiento" element={<PaginaSeguimiento />} />
        <Route path="seguimiento/:codigo" element={<PaginaSeguimiento />} />
        <Route path="acceso" element={<Acceso />} />

        <Route element={<RutaPrivada />}>
          <Route element={<MarcoPanel />}>
            <Route path="panel" element={<Indicadores />} />
            <Route path="panel/reclamos" element={<Bandeja />} />
            <Route path="panel/reclamos/:id" element={<DetalleCaso />} />
            <Route path="panel/reportes" element={<Reportes />} />
            <Route element={<RutaPrivada soloAdmin />}>
              <Route path="panel/correo" element={<Correo />} />
              <Route path="panel/usuarios" element={<Usuarios />} />
              <Route path="panel/establecimientos" element={<Establecimientos />} />
              <Route path="panel/historial" element={<Historial />} />
            </Route>
          </Route>
        </Route>

        <Route path="inicio" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NoEncontrada />} />
      </Route>
    </Routes>
  );
}
