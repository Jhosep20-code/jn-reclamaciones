-- ReclamoClaro · esquema inicial para Cloudflare D1 (SQLite)
-- Fechas: texto ISO-8601 en UTC, puestas siempre por el servidor.
-- Dinero: enteros en céntimos. Booleanos: 0 o 1.

CREATE TABLE empresa (
  id               INTEGER PRIMARY KEY CHECK (id = 1),
  razon_social     TEXT NOT NULL,
  ruc              TEXT NOT NULL CHECK (length(ruc) = 11),
  direccion_fiscal TEXT NOT NULL,
  actualizado_en   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE establecimientos (
  id        INTEGER PRIMARY KEY,
  codigo    TEXT NOT NULL UNIQUE CHECK (codigo GLOB '[A-Z][A-Z][A-Z]-[0-9][0-9]'),
  nombre    TEXT NOT NULL,
  direccion TEXT NOT NULL,
  ciudad    TEXT NOT NULL,
  activo    INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE usuarios (
  id                 INTEGER PRIMARY KEY,
  correo             TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nombre             TEXT NOT NULL,
  hash_clave         TEXT NOT NULL,
  rol                TEXT NOT NULL CHECK (rol IN ('admin', 'encargado')),
  establecimiento_id INTEGER REFERENCES establecimientos (id),
  activo             INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  creado_en          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- Un administrador no pertenece a una tienda; un encargado siempre pertenece a una.
  CHECK ((rol = 'admin' AND establecimiento_id IS NULL)
      OR (rol = 'encargado' AND establecimiento_id IS NOT NULL))
) STRICT;

-- Un contador por tienda y año. Se incrementa en la misma transacción que inserta la hoja.
CREATE TABLE contadores (
  establecimiento_id INTEGER NOT NULL REFERENCES establecimientos (id),
  anio               INTEGER NOT NULL CHECK (anio BETWEEN 2024 AND 2100),
  ultimo             INTEGER NOT NULL DEFAULT 0 CHECK (ultimo >= 0),
  PRIMARY KEY (establecimiento_id, anio)
) STRICT, WITHOUT ROWID;

-- Hoja de reclamación. Contiene datos personales: nunca se expone por rutas públicas.
CREATE TABLE reclamos (
  id                       INTEGER PRIMARY KEY,
  establecimiento_id       INTEGER NOT NULL REFERENCES establecimientos (id),
  anio                     INTEGER NOT NULL,
  correlativo              INTEGER NOT NULL CHECK (correlativo > 0),
  codigo_seguimiento       TEXT NOT NULL UNIQUE CHECK (length(codigo_seguimiento) = 32),
  tipo                     TEXT NOT NULL CHECK (tipo IN ('reclamo', 'queja')),
  -- Consumidor
  nombres                  TEXT NOT NULL CHECK (length(nombres) BETWEEN 3 AND 120),
  tipo_documento           TEXT NOT NULL CHECK (tipo_documento IN ('DNI', 'CE', 'PASAPORTE')),
  numero_documento         TEXT NOT NULL CHECK (length(numero_documento) BETWEEN 8 AND 12),
  domicilio                TEXT,
  telefono                 TEXT,
  correo                   TEXT,
  es_menor                 INTEGER NOT NULL DEFAULT 0 CHECK (es_menor IN (0, 1)),
  apoderado_nombres        TEXT,
  apoderado_contacto       TEXT,
  -- Bien contratado
  tipo_bien                TEXT NOT NULL CHECK (tipo_bien IN ('producto', 'servicio')),
  descripcion_bien         TEXT NOT NULL CHECK (length(descripcion_bien) BETWEEN 3 AND 300),
  monto_reclamado_centimos INTEGER CHECK (monto_reclamado_centimos IS NULL OR monto_reclamado_centimos >= 0),
  -- Reclamación
  detalle                  TEXT NOT NULL CHECK (length(detalle) BETWEEN 10 AND 3000),
  pedido                   TEXT NOT NULL CHECK (length(pedido) BETWEEN 5 AND 1500),
  acepta_tratamiento_datos INTEGER NOT NULL CHECK (acepta_tratamiento_datos = 1),
  -- Gestión
  estado                   TEXT NOT NULL DEFAULT 'registrado'
                             CHECK (estado IN ('registrado', 'en_atencion', 'respondido')),
  creado_en                TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  respondido_en            TEXT,
  huella_origen            TEXT,
  -- Datos mínimos del reglamento: domicilio o correo.
  CHECK (domicilio IS NOT NULL OR correo IS NOT NULL),
  CHECK (es_menor = 0 OR apoderado_nombres IS NOT NULL),
  -- Garantía final contra numeración duplicada.
  UNIQUE (establecimiento_id, anio, correlativo)
) STRICT;

CREATE INDEX idx_reclamos_bandeja ON reclamos (establecimiento_id, estado, creado_en);
CREATE INDEX idx_reclamos_origen ON reclamos (huella_origen, creado_en);

CREATE TABLE respuestas (
  id                 INTEGER PRIMARY KEY,
  reclamo_id         INTEGER NOT NULL UNIQUE REFERENCES reclamos (id),
  texto              TEXT NOT NULL CHECK (length(texto) BETWEEN 10 AND 4000),
  medio_comunicacion TEXT NOT NULL CHECK (medio_comunicacion IN ('correo', 'carta')),
  fecha_comunicacion TEXT NOT NULL,
  usuario_id         INTEGER NOT NULL REFERENCES usuarios (id),
  creado_en          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

-- Historial de acciones. Solo admite inserciones.
CREATE TABLE eventos (
  id         INTEGER PRIMARY KEY,
  reclamo_id INTEGER REFERENCES reclamos (id),
  usuario_id INTEGER REFERENCES usuarios (id),
  accion     TEXT NOT NULL,
  detalle    TEXT,
  creado_en  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX idx_eventos_reclamo ON eventos (reclamo_id, creado_en);

-- Sesiones del personal. Se guarda la huella del identificador, no el identificador.
CREATE TABLE sesiones (
  id_hash    TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios (id),
  token_csrf TEXT NOT NULL,
  creado_en  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expira_en  TEXT NOT NULL
) STRICT, WITHOUT ROWID;

CREATE INDEX idx_sesiones_expira ON sesiones (expira_en);

CREATE TABLE intentos_acceso (
  id            INTEGER PRIMARY KEY,
  correo        TEXT NOT NULL COLLATE NOCASE,
  huella_origen TEXT NOT NULL,
  exito         INTEGER NOT NULL CHECK (exito IN (0, 1)),
  creado_en     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX idx_intentos_correo ON intentos_acceso (correo, creado_en);
CREATE INDEX idx_intentos_origen ON intentos_acceso (huella_origen, creado_en);

CREATE TABLE feriados (
  fecha       TEXT PRIMARY KEY
                CHECK (fecha GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  descripcion TEXT NOT NULL
) STRICT, WITHOUT ROWID;

CREATE TABLE configuracion (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
) STRICT, WITHOUT ROWID;

-- Restricciones de escritura en la propia base.
-- D1 no tiene usuarios de base con permisos distintos, así que la inmutabilidad se impone con disparadores.

CREATE TRIGGER reclamos_no_borrar
BEFORE DELETE ON reclamos
BEGIN
  SELECT RAISE(ABORT, 'Las hojas de reclamacion no se pueden borrar');
END;

CREATE TRIGGER reclamos_datos_inmutables
BEFORE UPDATE OF establecimiento_id, anio, correlativo, codigo_seguimiento,
                 nombres, tipo_documento, numero_documento, domicilio, telefono, correo,
                 es_menor, apoderado_nombres, apoderado_contacto,
                 tipo_bien, descripcion_bien, monto_reclamado_centimos,
                 detalle, pedido, acepta_tratamiento_datos, creado_en
ON reclamos
BEGIN
  SELECT RAISE(ABORT, 'Los datos registrados por el consumidor no se pueden modificar');
END;

CREATE TRIGGER respuestas_no_modificar
BEFORE UPDATE ON respuestas
BEGIN
  SELECT RAISE(ABORT, 'Una respuesta emitida no se puede modificar');
END;

CREATE TRIGGER respuestas_no_borrar
BEFORE DELETE ON respuestas
BEGIN
  SELECT RAISE(ABORT, 'Una respuesta emitida no se puede borrar');
END;

CREATE TRIGGER eventos_no_modificar
BEFORE UPDATE ON eventos
BEGIN
  SELECT RAISE(ABORT, 'El historial no se puede modificar');
END;

CREATE TRIGGER eventos_no_borrar
BEFORE DELETE ON eventos
BEGIN
  SELECT RAISE(ABORT, 'El historial no se puede borrar');
END;
