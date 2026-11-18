-- ReclamoClaro · datos iniciales del caso (todos ficticios)

-- Empresa del caso. El nombre es provisional hasta que el equipo lo confirme.
INSERT INTO empresa (id, razon_social, ruc, direccion_fiscal)
VALUES (1, 'Comercial del Centro S.A.C. (empresa ficticia)', '20000000001', 'Av. Ficticia 100, Huancayo, Junín');

INSERT INTO establecimientos (id, codigo, nombre, direccion, ciudad) VALUES
  (1, 'HYO-01', 'Tienda Huancayo Centro', 'Calle Real 100 (ficticia)', 'Huancayo'),
  (2, 'TAM-01', 'Tienda El Tambo', 'Av. Mariscal Castilla 200 (ficticia)', 'El Tambo'),
  (3, 'JAU-01', 'Tienda Jauja', 'Jr. Junín 300 (ficticia)', 'Jauja'),
  (4, 'CON-01', 'Tienda Concepción', 'Av. Mariscal Cáceres 400 (ficticia)', 'Concepción'),
  (5, 'TAR-01', 'Tienda Tarma', 'Jr. Lima 500 (ficticia)', 'Tarma');

-- Feriados nacionales para contar días hábiles.
-- Pendiente: contrastar la lista con la publicación oficial antes del informe.
INSERT INTO feriados (fecha, descripcion) VALUES
  ('2026-12-08', 'Inmaculada Concepción'),
  ('2026-12-09', 'Batalla de Ayacucho'),
  ('2026-12-25', 'Navidad'),
  ('2027-01-01', 'Año Nuevo');

INSERT INTO configuracion (clave, valor) VALUES
  ('plazo_dias_habiles', '15'),
  ('alerta_desde_dia_habil', '10'),
  ('limite_registros_por_origen_hora', '10'),
  ('version_datos', '1');
