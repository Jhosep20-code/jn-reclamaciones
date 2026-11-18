-- Validación local del patrón de numeración correlativa (datos ficticios).
-- Cada hoja se registra con dos sentencias dentro de una misma transacción:
--   1) se incrementa el contador de la tienda y el año;
--   2) se inserta la hoja tomando el número del contador.

INSERT OR IGNORE INTO establecimientos (id, codigo, nombre, direccion, ciudad)
VALUES (901, 'PRU-01', 'Tienda de prueba', 'Av. Ficticia 123', 'Huancayo');

-- Hoja 1
INSERT INTO contadores (establecimiento_id, anio, ultimo) VALUES (901, 2026, 1)
  ON CONFLICT (establecimiento_id, anio) DO UPDATE SET ultimo = ultimo + 1;
INSERT INTO reclamos (establecimiento_id, anio, correlativo, codigo_seguimiento, tipo, nombres,
                      tipo_documento, numero_documento, correo, tipo_bien, descripcion_bien,
                      detalle, pedido, acepta_tratamiento_datos)
SELECT 901, 2026, ultimo, lower(hex(randomblob(16))), 'reclamo', 'Persona Ficticia Uno',
       'DNI', '00000001', 'uno@example.com', 'producto', 'Licuadora de prueba',
       'Detalle de prueba numero uno', 'Cambio del producto', 1
FROM contadores WHERE establecimiento_id = 901 AND anio = 2026;

-- Hoja 2
INSERT INTO contadores (establecimiento_id, anio, ultimo) VALUES (901, 2026, 1)
  ON CONFLICT (establecimiento_id, anio) DO UPDATE SET ultimo = ultimo + 1;
INSERT INTO reclamos (establecimiento_id, anio, correlativo, codigo_seguimiento, tipo, nombres,
                      tipo_documento, numero_documento, correo, tipo_bien, descripcion_bien,
                      detalle, pedido, acepta_tratamiento_datos)
SELECT 901, 2026, ultimo, lower(hex(randomblob(16))), 'queja', 'Persona Ficticia Dos',
       'DNI', '00000002', 'dos@example.com', 'servicio', 'Atencion en caja',
       'Detalle de prueba numero dos', 'Mejorar la atencion', 1
FROM contadores WHERE establecimiento_id = 901 AND anio = 2026;

SELECT correlativo, tipo, length(codigo_seguimiento) AS largo_codigo, estado, creado_en
FROM reclamos WHERE establecimiento_id = 901 ORDER BY correlativo;
