-- ReclamoClaro · ampliación 1.0.0 (solo aditiva).
-- Se puede aplicar sobre la base de producción con datos, y el código 0.3.1 sigue funcionando después:
-- no se quita, renombra ni vuelve obligatoria ninguna columna existente.

-- Medio por el que el consumidor pidió recibir la respuesta. NULL en hojas anteriores a 1.0.0.
ALTER TABLE reclamos ADD COLUMN medio_respuesta TEXT
  CHECK (medio_respuesta IS NULL OR medio_respuesta IN ('correo', 'carta'));

-- La preferencia del consumidor es un dato suyo: una vez registrada no se cambia.
CREATE TRIGGER reclamos_medio_respuesta_inmutable
BEFORE UPDATE OF medio_respuesta ON reclamos
WHEN OLD.medio_respuesta IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'El medio de respuesta elegido por el consumidor no se puede modificar');
END;

-- Navegación anterior/siguiente de la bandeja y reportes por rango de fechas.
CREATE INDEX idx_reclamos_creado ON reclamos (creado_en, id);
CREATE INDEX idx_reclamos_est_creado ON reclamos (establecimiento_id, creado_en, id);

-- Comunicaciones con el consumidor: correo de constancia, correo de respuesta o carta física.
CREATE TABLE comunicaciones (
  id             INTEGER PRIMARY KEY,
  reclamo_id     INTEGER NOT NULL REFERENCES reclamos (id),
  tipo           TEXT NOT NULL CHECK (tipo IN ('constancia_correo', 'respuesta_correo', 'respuesta_carta')),
  estado         TEXT NOT NULL CHECK (estado IN ('pendiente', 'enviado', 'fallido', 'omitido', 'pendiente_entrega', 'entrega_registrada')),
  intentos       INTEGER NOT NULL DEFAULT 0 CHECK (intentos >= 0),
  -- Motivo del fallo u observación de entrega. Nunca datos personales.
  detalle        TEXT,
  usuario_id     INTEGER REFERENCES usuarios (id),
  fecha_entrega  TEXT,
  creado_en      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  actualizado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- Una sola comunicación de cada tipo por hoja: evita envíos duplicados.
  UNIQUE (reclamo_id, tipo)
) STRICT;

CREATE INDEX idx_comunicaciones_estado ON comunicaciones (estado, actualizado_en);
CREATE INDEX idx_comunicaciones_reclamo ON comunicaciones (reclamo_id);

CREATE TRIGGER comunicaciones_no_borrar
BEFORE DELETE ON comunicaciones
BEGIN
  SELECT RAISE(ABORT, 'Las comunicaciones no se pueden borrar');
END;

-- Intentos de consulta segura de la respuesta. Se guarda el SHA-256 del código de seguimiento, nunca el código.
CREATE TABLE intentos_consulta (
  id          INTEGER PRIMARY KEY,
  codigo_hash TEXT NOT NULL,
  exito       INTEGER NOT NULL CHECK (exito IN (0, 1)),
  creado_en   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX idx_intentos_consulta ON intentos_consulta (codigo_hash, creado_en);

INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('correo_activo', '0');
INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('correo_limite_diario', '80');
