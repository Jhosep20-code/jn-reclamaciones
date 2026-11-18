// Prepara una base D1 LOCAL y AISLADA con datos ficticios para tomar capturas de pantalla.
// Uso: node scripts/sembrar_demo_local.mjs [carpeta_estado]   (por defecto .wrangler/estado-capturas)
// - Borra y recrea ese estado, aplica las migraciones (incluida 0004: medio_respuesta y comunicaciones) y siembra
//   usuarios y hojas ficticias de varios meses, con comunicaciones en todos sus estados.
// - Las cuentas de acceso salen de pruebas/usuarios_de_prueba.local.json (nunca se imprimen las claves).
// - Nunca usa --remote.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashearClave } from '../src/worker/seguridad/claves.ts';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const estado = resolve(raiz, process.argv[2] ?? '.wrangler/estado-capturas');
const wrangler = join(raiz, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const comilla = (t) => (t == null ? 'NULL' : `'${String(t).replaceAll("'", "''")}'`);

function wr(args) {
  const r = spawnSync(process.execPath, [wrangler, ...args], { cwd: raiz, encoding: 'utf8', env: { ...process.env, CI: 'true' } });
  if (r.status !== 0) throw new Error(`wrangler falló: ${(r.stderr || r.stdout).slice(0, 800)}`);
  return r.stdout;
}

// --- Calendario: días hábiles hacia atrás (sábados y domingos excluidos; no hay feriados en la ventana) ---
const ZONA = 'America/Lima';
const fLima = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' });
function fechaHabilAtras(habiles, hora = 15) {
  const d = new Date();
  let n = 0;
  while (n < habiles) {
    d.setUTCDate(d.getUTCDate() - 1);
    const dia = new Date(fLima.format(d) + 'T12:00:00Z').getUTCDay();
    if (dia !== 0 && dia !== 6) n++;
  }
  // Si hoy es fin de semana y habiles = 0, retrocede al viernes.
  for (;;) {
    const dia = new Date(fLima.format(d) + 'T12:00:00Z').getUTCDay();
    if (dia !== 0 && dia !== 6) break;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  const ymd = fLima.format(d);
  const min = String((habiles * 7) % 50).padStart(2, '0');
  return { iso: `${ymd}T${String(hora + 5).padStart(2, '0')}:${min}:00.000Z`, anio: Number(ymd.slice(0, 4)), ymd };
}
const masHoras = (iso, h) => new Date(new Date(iso).getTime() + h * 3600e3).toISOString();

// --- Estado limpio y migraciones ---
rmSync(estado, { recursive: true, force: true });
wr(['d1', 'migrations', 'apply', 'reclamoclaro-db', '--local', '--persist-to', estado]);

// --- Usuarios ---
const cuentas = JSON.parse(readFileSync(join(raiz, 'pruebas', 'usuarios_de_prueba.local.json'), 'utf8'));
const nombresCuenta = {
  admin: 'Rosa Medina (ficticia)',
  encargado_hyo: 'Luis Paredes (ficticio)',
  encargado_tam: 'Carla Rojas (ficticia)',
};
const usuarios = [];
for (const [k, c] of Object.entries(cuentas)) {
  usuarios.push({ correo: c.correo, nombre: nombresCuenta[k] ?? `Usuario ${k} (ficticio)`, clave: c.clave, rol: c.rol, tienda: c.establecimiento, activo: 1 });
}
const extra = [
  { correo: 'jau.demo@example.com', nombre: 'Pedro Ñahui (ficticio)', rol: 'encargado', tienda: 'JAU-01', activo: 1 },
  { correo: 'con.demo@example.com', nombre: 'Ana Huamán (ficticia)', rol: 'encargado', tienda: 'CON-01', activo: 1 },
  { correo: 'tar.demo@example.com', nombre: 'Jorge Salas (ficticio)', rol: 'encargado', tienda: 'TAR-01', activo: 0 },
];
for (const e of extra) usuarios.push({ ...e, clave: randomBytes(12).toString('hex') });

const sql = [];
sql.push(`UPDATE configuracion SET valor = '100000' WHERE clave = 'limite_registros_por_origen_hora';`);
for (const u of usuarios) {
  const hash = await hashearClave(u.clave);
  const est = u.tienda ? `(SELECT id FROM establecimientos WHERE codigo = ${comilla(u.tienda)})` : 'NULL';
  sql.push(
    `INSERT INTO usuarios (correo, nombre, hash_clave, rol, establecimiento_id, activo) VALUES (${comilla(u.correo)}, ${comilla(u.nombre)}, ${comilla(hash)}, ${comilla(u.rol)}, ${est}, ${u.activo});`,
  );
}
const idUsuario = (correo) => `(SELECT id FROM usuarios WHERE correo = ${comilla(correo)})`;
const encargadoDe = { 'HYO-01': 'hyo.prueba@example.com', 'TAM-01': 'tam.prueba@example.com', 'JAU-01': 'jau.demo@example.com', 'CON-01': 'con.demo@example.com', 'TAR-01': 'admin.prueba@example.com' };

// --- Hojas ---
// hab: días hábiles desde el registro hasta hoy (define el semáforo). m: medio de respuesta pedido por el consumidor.
// sinAtencion: true => respondido directo, sin el evento de atención (la etapa «En atención» queda sin fecha).
// resp: null | { despues: días hábiles tras el registro, texto }. cs / rs: [estado, intentos, detalle] de la constancia por correo
// y de la comunicación de la respuesta (correo o carta). Sin cs/rs se usan valores por defecto coherentes.
const T_OK = 'Se revisó su caso y se atendió lo solicitado. Puede acercarse a la tienda con su comprobante de compra para concretar la solución acordada.';
const hojas = [
  { t: 'HYO-01', tipo: 'reclamo', hab: 1, m: 'correo', n: 'María Quispe (ficticio)', d: '00000001', bien: ['producto', 'Refrigeradora marca Ficticia, modelo RF-200', 1899.9], det: 'La refrigeradora llegó con la puerta abollada y no enfría correctamente desde el primer día de uso.', ped: 'Cambio del equipo por uno nuevo o devolución del dinero.', est: 'registrado', cs: ['enviado', 1, null] },
  { t: 'HYO-01', tipo: 'queja', hab: 3, m: 'correo', n: 'Carlos Huamán (ficticio)', d: '00000002', bien: ['servicio', 'Atención en caja', null], det: 'Esperé más de cuarenta minutos en caja y la trabajadora me respondió de mala manera cuando reclamé.', ped: 'Que se capacite al personal y se me presenten disculpas.', est: 'en_atencion', cs: ['pendiente', 0, 'Envío desactivado'] },
  { t: 'HYO-01', tipo: 'reclamo', hab: 15, m: 'carta', n: 'Rosa Chávez (ficticia)', d: '00000003', bien: ['producto', 'Licuadora Ficticia 600 W', 129.0], det: 'La licuadora dejó de funcionar a la semana de comprada; la garantía no fue reconocida en tienda.', ped: 'Reparación o cambio del producto.', est: 'registrado' },
  { t: 'HYO-01', tipo: 'reclamo', hab: 11, m: 'correo', n: 'Julio Mendoza (ficticio)', d: '00000004', bien: ['servicio', 'Instalación de cocina a gas', 80.0], det: 'El técnico no se presentó en la fecha acordada y tampoco avisó; ya fue reprogramado dos veces.', ped: 'Instalación inmediata o devolución del cobro.', est: 'en_atencion', cs: ['fallido', 1, 'No se pudo conectar con el relevo de correo'] },
  { t: 'HYO-01', tipo: 'reclamo', hab: 18, m: 'carta', n: 'Elena Vargas (ficticia)', d: '00000005', bien: ['producto', 'Colchón de dos plazas', 649.0], det: 'Me cobraron un precio mayor al publicado en la tienda y no aceptaron el precio de la etiqueta.', ped: 'Devolución de la diferencia cobrada.', est: 'registrado' },
  { t: 'HYO-01', tipo: 'queja', hab: 9, m: 'correo', n: 'Ricardo Poma (ficticio)', d: '00000006', bien: ['servicio', 'Atención en tienda', null], det: 'El vigilante me impidió el ingreso con mi hijo pequeño sin dar ninguna explicación razonable.', ped: 'Que se aclare la norma y se me atienda con respeto.', est: 'respondido', resp: { despues: 5, texto: 'Lamentamos lo ocurrido. Se conversó con el personal de seguridad y se reforzó la norma de ingreso familiar. Quedamos atentos a cualquier otra observación.' }, cs: ['enviado', 1, null], rs: ['fallido', 2, 'El relevo rechazó la dirección del destinatario'] },
  { t: 'HYO-01', tipo: 'reclamo', hab: 12, m: 'carta', n: 'Teresa Salazar (ficticia)', d: '00000016', bien: ['producto', 'Lavadora automática 10 kg', 1599.0], det: 'La lavadora no centrifuga y emite un ruido fuerte; el servicio técnico no ha respondido mis llamadas.', ped: 'Reparación inmediata o cambio del equipo.', est: 'respondido', resp: { despues: 8, texto: 'Se coordinó con el servicio técnico autorizado y se aprobó el cambio de la lavadora por una unidad nueva, que podrá recoger en tienda presentando su documento de identidad. Lamentamos las molestias ocasionadas.' }, rs: ['pendiente_entrega', 0, null] },
  // Hoja anterior a 1.0.0: sin medio de respuesta elegido y sin comunicaciones.
  { t: 'HYO-01', tipo: 'reclamo', hab: 21, m: null, sinCom: true, n: 'Rubén Maldonado (ficticio)', d: '00000028', bien: ['producto', 'Reproductor de audio portátil', 149.0], det: 'El reproductor no carga y la tienda indicó que la garantía no cubre el cargador incluido en la caja.', ped: 'Cambio del cargador o del equipo.', est: 'registrado' },
  { t: 'HYO-01', tipo: 'reclamo', hab: 26, m: 'correo', sinAtencion: true, n: 'Nelly Paz (ficticia)', d: '00000017', bien: ['producto', 'Laptop 14 pulgadas modelo LT-14', 2399.0], det: 'La laptop se apaga sola después de una hora de uso y la batería dura menos de veinte minutos.', ped: 'Cambio por otro equipo.', est: 'respondido', resp: { despues: 9, texto: T_OK } },
  { t: 'HYO-01', tipo: 'reclamo', hab: 33, m: 'carta', n: 'Óscar Bravo (ficticio)', d: '00000018', bien: ['servicio', 'Servicio de instalación de aire acondicionado', 350.0], det: 'La instalación quedó con fuga de agua en la pared y nadie regresó a corregirla.', ped: 'Corregir la instalación y reparar la pared.', est: 'respondido', resp: { despues: 16, texto: 'Se envió un técnico que corrigió la fuga y se reparó la pared afectada. Pedimos disculpas por la demora en la atención de su caso.' } },
  { t: 'HYO-01', tipo: 'queja', hab: 41, m: 'correo', n: 'Marcela Inga (ficticia)', d: '00000019', bien: ['servicio', 'Atención en el área de reclamos', null], det: 'Me hicieron esperar una hora sin informarme cuánto demoraría la atención.', ped: 'Que se informe el tiempo estimado de espera.', est: 'respondido', resp: { despues: 6, texto: 'Se implementó un aviso de tiempo estimado de espera en el área de reclamos. Agradecemos su observación.' } },
  { t: 'HYO-01', tipo: 'reclamo', hab: 55, m: 'carta', n: 'Félix Llanos (ficticio)', d: '00000020', bien: ['producto', 'Bicicleta aro 26', 489.0], det: 'La bicicleta llegó con el marco rayado y sin el manual ni las herramientas de armado.', ped: 'Cambio por una bicicleta nueva.', est: 'respondido', resp: { despues: 12, texto: T_OK } },
  { t: 'TAM-01', tipo: 'reclamo', hab: 0, m: 'correo', n: 'Patricia Rivera (ficticia)', d: '00000007', bien: ['producto', 'Televisor LED 43 pulgadas', 1299.0], det: 'El televisor presenta líneas verticales en la pantalla desde que lo encendí por primera vez.', ped: 'Cambio por un equipo nuevo.', est: 'registrado', cs: ['pendiente', 0, 'Envío desactivado'] },
  { t: 'TAM-01', tipo: 'reclamo', hab: 12, m: 'correo', n: 'Hugo Ccopa (ficticio)', d: '00000008', bien: ['producto', 'Zapatillas deportivas talla 42', 189.9], det: 'Las zapatillas se despegaron de la suela a los quince días de uso normal.', ped: 'Devolución del dinero pagado.', est: 'en_atencion' },
  { t: 'TAM-01', tipo: 'queja', hab: 15, m: 'carta', n: 'Lucía Ramos (ficticia)', d: '00000009', bien: ['servicio', 'Atención del área de postventa', null], det: 'Llamé cinco veces al número de postventa y nadie contestó; en tienda me dijeron que no era su área.', ped: 'Que se habilite un canal de atención efectivo.', est: 'registrado' },
  { t: 'TAM-01', tipo: 'reclamo', hab: 22, m: 'correo', n: 'Víctor Soto (ficticio)', d: '00000010', bien: ['producto', 'Microondas 20 L', 259.0], det: 'El microondas llegó sin plato giratorio y en tienda no tenían repuesto disponible.', ped: 'Entrega del accesorio faltante o cambio.', est: 'registrado' },
  { t: 'TAM-01', tipo: 'reclamo', hab: 8, m: 'carta', n: 'Diana Castro (ficticia)', d: '00000011', bien: ['producto', 'Plancha a vapor', 99.9], det: 'La plancha gotea agua caliente y ya me quemé una mano en el segundo uso.', ped: 'Cambio del producto y revisión del lote.', est: 'respondido', resp: { despues: 7, texto: 'Se aprobó el cambio del producto por uno nuevo y se retiró el lote observado de la venta. Puede recogerlo en tienda con su comprobante.' }, rs: ['pendiente_entrega', 0, null] },
  { t: 'TAM-01', tipo: 'reclamo', hab: 30, m: 'correo', n: 'Alberto Cueva (ficticio)', d: '00000021', bien: ['producto', 'Parlante inalámbrico', 179.0], det: 'El parlante no se conecta por bluetooth con ningún dispositivo desde el primer día.', ped: 'Cambio del producto.', est: 'respondido', resp: { despues: 10, texto: T_OK } },
  { t: 'TAM-01', tipo: 'reclamo', hab: 38, m: 'carta', n: 'Karina Tapia (ficticia)', d: '00000022', bien: ['producto', 'Silla de oficina ergonómica', 329.0], det: 'La silla llegó con una rueda rota y el respaldo no se puede reclinar.', ped: 'Cambio por una silla en buen estado.', est: 'respondido', resp: { despues: 15, texto: T_OK } },
  { t: 'TAM-01', tipo: 'queja', hab: 47, m: 'correo', n: 'Fernando Ríos (ficticio)', d: '00000023', bien: ['servicio', 'Atención en tienda', null], det: 'Un trabajador me habló en tono despectivo al pedir información sobre una garantía.', ped: 'Que se capacite al personal.', est: 'respondido', resp: { despues: 8, texto: 'Se realizó una capacitación de trato al cliente con todo el personal de piso. Agradecemos que nos haya hecho llegar su queja.' }, rs: ['omitido', 0, 'Dirección de correo de prueba'] },
  { t: 'JAU-01', tipo: 'reclamo', hab: 2, m: 'correo', n: 'Marco Yupanqui (ficticio)', d: '00000012', bien: ['servicio', 'Entrega a domicilio', 25.0], det: 'La entrega prometida para el sábado no llegó y nadie me avisó del retraso.', ped: 'Entrega inmediata y reembolso del flete.', est: 'registrado' },
  { t: 'JAU-01', tipo: 'queja', hab: 19, m: 'correo', n: 'Sandra Ortiz (ficticia)', d: '00000013', bien: ['servicio', 'Atención al público', null], det: 'Me negaron la devolución de un producto sellado con boleta alegando que no era política de la tienda.', ped: 'Que se respete mi derecho a la devolución.', est: 'respondido', resp: { despues: 17, texto: 'Se revisó el caso y se aceptó la devolución del producto. Pedimos disculpas por la demora en la respuesta, que excedió el plazo previsto.' } },
  { t: 'JAU-01', tipo: 'reclamo', hab: 28, m: 'correo', n: 'Pablo Medrano (ficticio)', d: '00000024', bien: ['producto', 'Taladro percutor 650 W', 219.0], det: 'El taladro se recalienta a los dos minutos de uso y huele a quemado.', ped: 'Cambio del producto.', est: 'respondido', resp: { despues: 11, texto: T_OK } },
  { t: 'JAU-01', tipo: 'reclamo', hab: 52, m: 'carta', n: 'Rocío Lazo (ficticia)', d: '00000025', bien: ['servicio', 'Servicio de lavandería', 45.0], det: 'Me devolvieron un abrigo manchado y con un botón menos.', ped: 'Compensación por el daño.', est: 'respondido', resp: { despues: 18, texto: T_OK } },
  { t: 'CON-01', tipo: 'reclamo', hab: 5, m: 'carta', n: 'Walter Aliaga (ficticio)', d: '00000014', bien: ['producto', 'Juego de ollas de acero', 219.0], det: 'Dos ollas del juego llegaron abolladas y la caja ya estaba abierta al momento de la compra.', ped: 'Cambio por un juego completo y en buen estado.', est: 'en_atencion' },
  { t: 'CON-01', tipo: 'queja', hab: 35, m: 'carta', n: 'Gabriela Ñaupa (ficticia)', d: '00000026', bien: ['servicio', 'Atención en caja', null], det: 'La caja preferencial estuvo cerrada y no me permitieron pasar a otra con mi bebé.', ped: 'Que se respete la atención preferencial.', est: 'respondido', resp: { despues: 7, texto: 'Se reforzó la atención preferencial en caja y se capacitó al personal. Lamentamos el inconveniente.' } },
  { t: 'TAR-01', tipo: 'queja', hab: 4, m: 'correo', n: 'Gladys Torres (ficticia)', d: '00000015', bien: ['servicio', 'Atención en tienda', null], det: 'Me atendieron solo después de otros clientes que llegaron más tarde, a pesar de tener cita previa.', ped: 'Que se respete el orden de atención.', est: 'registrado' },
  { t: 'TAR-01', tipo: 'reclamo', hab: 44, m: 'correo', n: 'Ismael Cárdenas (ficticio)', d: '00000027', bien: ['producto', 'Impresora multifuncional', 389.0], det: 'La impresora no reconoce los cartuchos nuevos y muestra un error permanente.', ped: 'Cambio de la impresora.', est: 'respondido', resp: { despues: 13, texto: T_OK } },
];

hojas.sort((a, b) => b.hab - a.hab); // correlativos cronológicos
const contadores = new Map();
const codigos = {}; // número de documento ficticio -> código de seguimiento (solo para el script de capturas)
for (const h of hojas) {
  const f = fechaHabilAtras(h.hab);
  const clave = `${h.t}|${f.anio}`;
  const correlativo = (contadores.get(clave) ?? 0) + 1;
  contadores.set(clave, correlativo);
  const est = `(SELECT id FROM establecimientos WHERE codigo = ${comilla(h.t)})`;
  const cod = randomBytes(16).toString('hex');
  const monto = h.bien[2] == null ? 'NULL' : Math.round(h.bien[2] * 100);
  const r = h.resp ? fechaHabilAtras(Math.max(0, h.hab - h.resp.despues), 11) : null;
  // Si la respuesta fue "después de" más días de los transcurridos, se usa el momento actual.
  const respondidoEn = r ? (h.hab - h.resp.despues >= 0 ? r.iso : new Date().toISOString()) : null;
  const correo = h.m === 'correo' || h.m == null ? `consumidor${h.d.slice(-2)}@example.com` : null;
  sql.push(
    `INSERT INTO reclamos (establecimiento_id, anio, correlativo, codigo_seguimiento, tipo, nombres, tipo_documento, numero_documento, domicilio, telefono, correo, es_menor, tipo_bien, descripcion_bien, monto_reclamado_centimos, detalle, pedido, acepta_tratamiento_datos, estado, creado_en, respondido_en, medio_respuesta)
     VALUES (${est}, ${f.anio}, ${correlativo}, ${comilla(cod)}, ${comilla(h.tipo)}, ${comilla(h.n)}, 'DNI', ${comilla(h.d)}, ${comilla('Jr. Ficticio ' + (100 + correlativo) + ', Junín')}, ${comilla('900000' + h.d.slice(-3))}, ${comilla(correo)}, 0, ${comilla(h.bien[0])}, ${comilla(h.bien[1])}, ${monto}, ${comilla(h.det)}, ${comilla(h.ped)}, 1, ${comilla(h.est)}, ${comilla(f.iso)}, ${comilla(respondidoEn)}, ${comilla(h.m)});`,
  );
  const idRec = `(SELECT id FROM reclamos WHERE codigo_seguimiento = ${comilla(cod)})`;
  const encargado = encargadoDe[h.t];
  sql.push(`INSERT INTO eventos (reclamo_id, usuario_id, accion, detalle, creado_en) VALUES (${idRec}, NULL, 'reclamo_registrado', ${comilla(`Registrada como ${h.tipo}`)}, ${comilla(f.iso)});`);
  if ((h.est === 'en_atencion' || h.est === 'respondido') && !h.sinAtencion) {
    sql.push(`INSERT INTO eventos (reclamo_id, usuario_id, accion, detalle, creado_en) VALUES (${idRec}, ${idUsuario(encargado)}, 'reclamo_en_atencion', NULL, ${comilla(masHoras(f.iso, 20))});`);
  }
  const comunicacion = (tipo, estado, intentos, detalle, creado, entrega = null) =>
    sql.push(
      `INSERT INTO comunicaciones (reclamo_id, tipo, estado, intentos, detalle, usuario_id, fecha_entrega, creado_en, actualizado_en) VALUES (${idRec}, ${comilla(tipo)}, ${comilla(estado)}, ${intentos}, ${comilla(detalle)}, ${tipo === 'constancia_correo' ? 'NULL' : idUsuario(encargado)}, ${comilla(entrega)}, ${comilla(creado)}, ${comilla(entrega ? `${entrega}T15:00:00.000Z` : masHoras(creado, 0.1))});`,
    );
  // Constancia por correo: enviada si dio correo (salvo que se indique otro estado), omitida si no.
  codigos[h.d] = cod;
  if (h.sinCom) continue;
  if (h.cs) comunicacion('constancia_correo', h.cs[0], h.cs[1], h.cs[2], f.iso);
  else if (correo) comunicacion('constancia_correo', 'enviado', 1, null, f.iso);
  else comunicacion('constancia_correo', 'omitido', 0, 'El consumidor no indicó correo electrónico', f.iso);
  if (h.resp) {
    sql.push(
      `INSERT INTO respuestas (reclamo_id, texto, medio_comunicacion, fecha_comunicacion, usuario_id, creado_en) VALUES (${idRec}, ${comilla(h.resp.texto)}, ${comilla(h.m)}, ${comilla(respondidoEn.slice(0, 10))}, ${idUsuario(encargado)}, ${comilla(respondidoEn)});`,
      `INSERT INTO eventos (reclamo_id, usuario_id, accion, detalle, creado_en) VALUES (${idRec}, ${idUsuario(encargado)}, 'respuesta_registrada', ${comilla('Respuesta comunicada por ' + h.m)}, ${comilla(respondidoEn)});`,
    );
    if (h.m === 'correo') {
      const [e, n, d] = h.rs ?? ['enviado', 1, null];
      comunicacion('respuesta_correo', e, n, d, respondidoEn);
    } else {
      const [e, n, d] = h.rs ?? ['entrega_registrada', 0, h.hab % 2 ? 'Recibida por un familiar' : null];
      comunicacion('respuesta_carta', e, n, d, respondidoEn, e === 'entrega_registrada' ? respondidoEn.slice(0, 10) : null);
    }
  }
}
for (const [clave, ultimo] of contadores) {
  const [t, anio] = clave.split('|');
  sql.push(`INSERT INTO contadores (establecimiento_id, anio, ultimo) VALUES ((SELECT id FROM establecimientos WHERE codigo = ${comilla(t)}), ${anio}, ${ultimo});`);
}
// Eventos de administración
sql.push(
  `INSERT INTO eventos (reclamo_id, usuario_id, accion, detalle) VALUES (NULL, ${idUsuario('admin.prueba@example.com')}, 'usuario_creado', 'Usuario creado: jau.demo@example.com');`,
  `INSERT INTO eventos (reclamo_id, usuario_id, accion, detalle) VALUES (NULL, ${idUsuario('admin.prueba@example.com')}, 'usuario_modificado', 'Usuario desactivado: tar.demo@example.com');`,
);
sql.push(`UPDATE usuarios SET activo = 0 WHERE correo = 'tar.demo@example.com';`);

const carpeta = mkdtempSync(join(tmpdir(), 'rc-demo-'));
const archivo = join(carpeta, 'siembra.sql');
writeFileSync(archivo, sql.join('\n'), 'utf8');
try {
  wr(['d1', 'execute', 'reclamoclaro-db', '--local', '--persist-to', estado, '--file', archivo]);
} finally {
  rmSync(carpeta, { recursive: true, force: true });
}
writeFileSync(join(estado, 'codigos_demo.json'), JSON.stringify(codigos));
console.log(`Base local aislada lista en ${estado}: ${usuarios.length} usuarios, ${hojas.length} hojas.`);
