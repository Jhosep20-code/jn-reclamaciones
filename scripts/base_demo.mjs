// Base limpia para la demostración: vacía los datos operativos y siembra el caso empresarial simulado
// (Comercial del Centro S.A.C., 5 establecimientos, 6 cuentas del personal y 12 hojas de reclamación).
//
// LOS DATOS SEMBRADOS SON SIMULADOS: no corresponden a operaciones comerciales reales ni a personas reales.
//
// Qué conserva: tablas, índices, restricciones, disparadores, migraciones aplicadas, feriados y configuración.
// Qué borra: hojas, respuestas, historial, comunicaciones, contadores, sesiones, intentos y cuentas del personal.
// Los cuatro disparadores que impiden borrar se retiran y se vuelven a crear con el texto exacto de las migraciones;
// al terminar se compara la estructura completa (sqlite_master) antes y después: debe ser idéntica.
// El envío real de correo queda APAGADO.
//
// Uso:
//   node scripts/base_demo.mjs --local [carpeta_estado]      aplica en la base local (por defecto .wrangler/state)
//   node scripts/base_demo.mjs --generar archivo.sql         solo escribe el SQL para revisarlo (sin hashes reales)
//   node scripts/base_demo.mjs --remoto --confirmo-vaciado   aplica en la nube. DESTRUCTIVO. Solo con autorización del titular.
//
// Las claves nuevas se guardan únicamente en archivos *.local.json (ignorados por Git) y nunca se imprimen.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashearClave } from '../src/worker/seguridad/claves.ts';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const wrangler = join(raiz, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const args = process.argv.slice(2);
const modo = args.includes('--remoto') ? 'remoto' : args.includes('--generar') ? 'generar' : args.includes('--local') ? 'local' : null;
if (!modo) {
  console.error('Indique --local, --generar <archivo> o --remoto --confirmo-vaciado.');
  process.exit(2);
}
if (modo === 'remoto' && !args.includes('--confirmo-vaciado')) {
  console.error('El modo remoto vacía la base de producción. Requiere --confirmo-vaciado y la autorización expresa del titular.');
  process.exit(2);
}
const posicional = args.filter((a) => !a.startsWith('--'))[0];
const estadoLocal = modo === 'local' && posicional ? resolve(raiz, posicional) : null;
const destino = modo === 'remoto' ? ['--remote'] : ['--local', ...(estadoLocal ? ['--persist-to', estadoLocal] : [])];

const comilla = (t) => (t == null ? 'NULL' : `'${String(t).replaceAll("'", "''")}'`);
function wr(a) {
  const r = spawnSync(process.execPath, [wrangler, ...a], { cwd: raiz, encoding: 'utf8', env: { ...process.env, CI: 'true' }, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`wrangler falló: ${(r.stderr || r.stdout).slice(0, 1200)}`);
  return r.stdout;
}
function consulta(sql) {
  const salida = wr(['d1', 'execute', 'reclamoclaro-db', ...destino, '--json', '--command', sql]);
  return JSON.parse(salida.slice(salida.indexOf('[')))[0]?.results ?? [];
}
const SQL_ESTRUCTURA = "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type, name";
const normal = (filas) => JSON.stringify(filas.map((f) => ({ ...f, sql: (f.sql ?? '').replace(/\s+/g, ' ').trim() })));

// ---------------------------------------------------------------------------------------------------------
// 1. Datos del caso empresarial simulado
// ---------------------------------------------------------------------------------------------------------
const EMPRESA = { razon_social: 'Comercial del Centro S.A.C.', direccion_fiscal: 'Av. Los Mercaderes 120, Huancayo, Junín' };
const TIENDAS = {
  'HYO-01': { direccion: 'Av. Los Mercaderes 120', ciudad: 'Huancayo' },
  'TAM-01': { direccion: 'Jr. Las Retamas 245', ciudad: 'El Tambo' },
  'JAU-01': { direccion: 'Jr. Los Artesanos 318', ciudad: 'Jauja' },
  'CON-01': { direccion: 'Av. El Progreso 410', ciudad: 'Concepción' },
  'TAR-01': { direccion: 'Jr. Las Orquídeas 502', ciudad: 'Tarma' },
};
// Dominio reservado «.example» (RFC 2606): no pertenece a nadie y el sistema nunca le envía correo.
const DOMINIO = 'comercialdelcentro.example';
const CUENTAS = [
  { nombre: 'Rosa Medina Quispe', correo: `rosa.medina@${DOMINIO}`, rol: 'admin', establecimiento: null, cargo: 'Administradora' },
  { nombre: 'Luis Paredes Rojas', correo: `luis.paredes@${DOMINIO}`, rol: 'encargado', establecimiento: 'HYO-01' },
  { nombre: 'Carla Rojas Huamán', correo: `carla.rojas@${DOMINIO}`, rol: 'encargado', establecimiento: 'TAM-01', cargo: 'Encargada de tienda' },
  { nombre: 'Pedro Ñahui Torres', correo: `pedro.nahui@${DOMINIO}`, rol: 'encargado', establecimiento: 'JAU-01' },
  { nombre: 'Ana Huamán Salazar', correo: `ana.huaman@${DOMINIO}`, rol: 'encargado', establecimiento: 'CON-01', cargo: 'Encargada de tienda' },
  { nombre: 'Jorge Salas Mendoza', correo: `jorge.salas@${DOMINIO}`, rol: 'encargado', establecimiento: 'TAR-01' },
];
const encargadoDe = Object.fromEntries(CUENTAS.filter((c) => c.establecimiento).map((c) => [c.establecimiento, c.correo]));

// hab: días hábiles transcurridos desde el registro (define el semáforo que CALCULA el sistema; aquí no se fija ningún estado de plazo).
// est: estado de la hoja. m: medio de respuesta elegido. resp: { despues: días hábiles hasta la respuesta, texto }.
// carta: estado de la carta ('entrega_registrada' | 'pendiente_entrega').
const HOJAS = [
  {
    t: 'HYO-01', tipo: 'reclamo', hab: 2, est: 'registrado', m: 'correo',
    n: 'Marta Quispe Ramos', dom: 'Jr. Los Cedros 214, Huancayo',
    bien: ['producto', 'Refrigeradora no frost de 320 litros', 1899.0],
    det: 'Compré la refrigeradora hace veinte días y desde ayer dejó de enfriar. El congelador mantiene la temperatura, pero el compartimento inferior no, y los alimentos se están malogrando.',
    ped: 'Solicito el cambio del producto por uno nuevo del mismo modelo o la devolución del importe pagado.',
  },
  {
    t: 'HYO-01', tipo: 'reclamo', hab: 11, est: 'en_atencion', m: 'correo',
    n: 'Julio Mendoza Castro', dom: 'Av. Las Lomas 508, Huancayo',
    bien: ['producto', 'Lavadora automática de 13 kg', 1549.0],
    det: 'La lavadora fue entregada en mi domicilio con el panel frontal golpeado y una esquina de la tapa rajada. El personal de reparto se retiró sin dejar constancia del daño.',
    ped: 'Pido que recojan el producto dañado y me entreguen una lavadora nueva sin costo adicional.',
  },
  {
    t: 'HYO-01', tipo: 'queja', hab: 12, est: 'respondido', m: 'correo',
    n: 'Elena Vargas Poma', dom: 'Jr. San Martín 132, Huancayo',
    bien: ['servicio', 'Atención en caja', null],
    det: 'Esperé cerca de cuarenta minutos en la caja porque solo había una ventanilla abierta. Nadie informó el motivo de la demora ni ofreció una alternativa.',
    ped: 'Solicito que se refuerce la atención en caja en las horas de mayor afluencia.',
    resp: { despues: 6, texto: 'Estimada señora Vargas: lamentamos la demora que tuvo en nuestra tienda. Verificamos que ese día dos cajas estuvieron fuera de servicio por una falla del sistema de cobro. Hemos dispuesto una caja adicional de respaldo para las horas de mayor afluencia y capacitado al personal para informar oportunamente cualquier incidencia. Agradecemos su observación.' },
  },
  {
    t: 'HYO-01', tipo: 'reclamo', hab: 14, est: 'registrado', m: 'carta',
    n: 'Ricardo Poma Huaynate', dom: 'Pasaje Los Pinos 76, Huancayo',
    bien: ['producto', 'Televisor LED de 50 pulgadas', 1799.0],
    det: 'A los dos meses de uso el televisor presenta líneas verticales en la mitad derecha de la pantalla. El producto se encuentra dentro del periodo de garantía y no ha sufrido golpes.',
    ped: 'Solicito la reparación por garantía o, de no ser posible, el cambio del televisor.',
  },
  {
    t: 'TAM-01', tipo: 'reclamo', hab: 4, est: 'en_atencion', m: 'correo',
    n: 'Hugo Ccopa Lizárraga', dom: 'Jr. Los Álamos 341, El Tambo',
    bien: ['producto', 'Cocina a gas de cuatro hornillas', 899.0],
    det: 'El horno de la cocina no enciende desde la instalación. Se programó una visita técnica y el técnico no se presentó ni se comunicó para reprogramarla.',
    ped: 'Pido la visita técnica a la brevedad y la reparación o el cambio de la cocina.',
  },
  {
    t: 'TAM-01', tipo: 'reclamo', hab: 16, est: 'respondido', m: 'carta', carta: 'entrega_registrada',
    n: 'Diana Castro Meza', dom: 'Av. Los Girasoles 615, El Tambo',
    bien: ['producto', 'Licuadora de 600 W', 189.0],
    det: 'El motor de la licuadora se quemó en el tercer uso, licuando fruta blanda. En tienda me indicaron que debía esperar una evaluación sin darme un plazo.',
    ped: 'Solicito la devolución del dinero pagado.',
    resp: { despues: 9, texto: 'Estimada señora Castro: el servicio técnico evaluó la licuadora y confirmó una falla de fábrica en el motor. Procede la devolución íntegra del importe pagado, que puede hacer efectiva en caja de nuestra tienda de El Tambo presentando su comprobante de compra y su documento de identidad. Le ofrecemos nuestras disculpas por las molestias ocasionadas.' },
  },
  {
    t: 'TAM-01', tipo: 'queja', hab: 17, est: 'registrado', m: 'correo',
    n: 'Lucía Ramos Inga', dom: 'Jr. Las Magnolias 209, El Tambo',
    bien: ['servicio', 'Servicio de reparto a domicilio', null],
    det: 'El reparto de mi compra estaba pactado para el sábado por la mañana. Llegó tres días después y sin aviso previo, por lo que tuve que pedir permiso en mi trabajo para recibirlo.',
    ped: 'Solicito que se respeten las fechas de entrega y se avise con anticipación cualquier cambio.',
  },
  {
    t: 'JAU-01', tipo: 'reclamo', hab: 24, est: 'respondido', m: 'correo',
    n: 'Sandra Ortiz Baltazar', dom: 'Jr. Los Nogales 158, Jauja',
    bien: ['producto', 'Horno microondas de 20 litros', 329.0],
    det: 'En caja me cobraron S/ 329.00 por el microondas, cuando el precio exhibido en el anaquel era de S/ 289.00. Hice notar la diferencia y no fue corregida.',
    ped: 'Solicito la devolución de la diferencia cobrada en exceso.',
    resp: { despues: 18, texto: 'Estimada señora Ortiz: revisamos su compra y confirmamos que el precio exhibido no había sido actualizado en el sistema de caja. Corresponde devolverle la diferencia de S/ 40.00, que puede cobrar en nuestra tienda de Jauja con su comprobante. Reconocemos que esta respuesta se emite fuera del plazo previsto y le pedimos disculpas por la demora.' },
  },
  {
    t: 'JAU-01', tipo: 'reclamo', hab: 1, est: 'registrado', m: 'correo',
    n: 'Marco Yupanqui Rivas', dom: 'Av. Los Eucaliptos 427, Jauja',
    bien: ['producto', 'Juego de ollas antiadherentes de siete piezas', 259.0],
    det: 'Al abrir la caja en casa comprobé que faltaba la tapa de la olla mediana. La caja no presentaba señales de haber sido abierta.',
    ped: 'Solicito la entrega de la pieza faltante o el cambio del juego completo.',
  },
  {
    t: 'CON-01', tipo: 'reclamo', hab: 12, est: 'en_atencion', m: 'carta',
    n: 'Walter Aliaga Camargo', dom: 'Jr. Las Dalias 93, Concepción',
    bien: ['servicio', 'Instalación de terma eléctrica de 50 litros', 120.0],
    det: 'Compré la terma con el servicio de instalación incluido. Han pasado más de dos semanas y la instalación no se ha realizado, pese a mis llamadas a la tienda.',
    ped: 'Pido que se realice la instalación contratada o se me devuelva el importe de ese servicio.',
  },
  {
    t: 'CON-01', tipo: 'queja', hab: 9, est: 'respondido', m: 'correo',
    n: 'Gabriela Ñaupa Flores', dom: 'Av. Los Sauces 271, Concepción',
    bien: ['servicio', 'Atención al cliente', null],
    det: 'Pedí el Libro de Reclamaciones para dejar constancia de un problema con mi compra y la persona que me atendió se negó a mostrármelo, indicando que no estaba disponible.',
    ped: 'Solicito que se garantice el acceso al Libro de Reclamaciones a todos los clientes.',
    resp: { despues: 4, texto: 'Estimada señora Ñaupa: lamentamos lo ocurrido. El Libro de Reclamaciones debe estar siempre a disposición de nuestros clientes. Hemos reforzado la capacitación del personal de la tienda de Concepción y colocado el aviso con el código de acceso al Libro de Reclamaciones Virtual en un lugar visible. Agradecemos que nos haya informado de este hecho.' },
  },
  {
    t: 'TAR-01', tipo: 'reclamo', hab: 3, est: 'registrado', m: 'correo',
    n: 'Gladys Torres Arroyo', dom: 'Jr. Los Jazmines 364, Tarma',
    bien: ['producto', 'Plancha a vapor', 119.0],
    det: 'La plancha presenta fuga de agua por la base desde el primer uso, lo que mancha la ropa y representa un riesgo de quemadura.',
    ped: 'Solicito el cambio de la plancha por una unidad en buen estado.',
  },
];

// ---------------------------------------------------------------------------------------------------------
// 2. Fechas: días hábiles hacia atrás desde hoy (fines de semana y feriados de las migraciones excluidos)
// ---------------------------------------------------------------------------------------------------------
const FERIADOS = new Set();
for (const f of readdirSync(join(raiz, 'migrations'))) {
  for (const m of readFileSync(join(raiz, 'migrations', f), 'utf8').matchAll(/'(20\d\d-\d\d-\d\d)'/g)) FERIADOS.add(m[1]);
}
const fLima = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' });
const esHabil = (ymd) => {
  const dia = new Date(`${ymd}T12:00:00Z`).getUTCDay();
  return dia !== 0 && dia !== 6 && !FERIADOS.has(ymd);
};
function fechaHabilAtras(habiles, hora, minuto) {
  // Se cuentan los días hábiles del intervalo (registro, hoy], que es como los cuenta el sistema:
  // así «habiles» coincide con los días transcurridos también cuando hoy es sábado, domingo o feriado.
  const d = new Date();
  let n = 0;
  while (n < habiles) {
    if (esHabil(fLima.format(d))) n++;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  while (!esHabil(fLima.format(d))) d.setUTCDate(d.getUTCDate() - 1);
  const ymd = fLima.format(d);
  return { iso: `${ymd}T${String(hora + 5).padStart(2, '0')}:${String(minuto).padStart(2, '0')}:00.000Z`, anio: Number(ymd.slice(0, 4)), ymd };
}
const masHoras = (iso, h) => new Date(new Date(iso).getTime() + h * 3600e3).toISOString();

// ---------------------------------------------------------------------------------------------------------
// 3. Construcción del SQL
// ---------------------------------------------------------------------------------------------------------
// Texto exacto de los disparadores, tomado de las migraciones.
const disparadores = new Map();
for (const f of readdirSync(join(raiz, 'migrations')).sort()) {
  for (const m of readFileSync(join(raiz, 'migrations', f), 'utf8').matchAll(/CREATE TRIGGER (\w+)[\s\S]*?\nEND;/g)) disparadores.set(m[1], m[0]);
}
const QUE_IMPIDEN_BORRAR = ['reclamos_no_borrar', 'respuestas_no_borrar', 'eventos_no_borrar', 'comunicaciones_no_borrar'];
for (const n of QUE_IMPIDEN_BORRAR) if (!disparadores.has(n)) throw new Error(`No se encontró el disparador ${n} en las migraciones`);

const SIMULADA = 'Dato simulado para la demostración: dirección de ejemplo, no se envió ningún correo';
const claves = {};
const sql = [];
sql.push("UPDATE configuracion SET valor = '0' WHERE clave = 'correo_activo';");
for (const n of QUE_IMPIDEN_BORRAR) sql.push(`DROP TRIGGER ${n};`);
for (const t of ['comunicaciones', 'respuestas', 'eventos', 'intentos_consulta', 'intentos_acceso', 'sesiones', 'reclamos', 'contadores', 'usuarios']) sql.push(`DELETE FROM ${t};`);
for (const n of QUE_IMPIDEN_BORRAR) sql.push(disparadores.get(n));

sql.push(`UPDATE empresa SET razon_social = ${comilla(EMPRESA.razon_social)}, direccion_fiscal = ${comilla(EMPRESA.direccion_fiscal)}, actualizado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1;`);
for (const [codigo, t] of Object.entries(TIENDAS)) sql.push(`UPDATE establecimientos SET direccion = ${comilla(t.direccion)}, ciudad = ${comilla(t.ciudad)} WHERE codigo = ${comilla(codigo)};`);

for (const c of CUENTAS) {
  const clave = randomBytes(18).toString('base64url');
  claves[c.correo] = clave;
  const hash = modo === 'generar' ? '<hash PBKDF2 generado al aplicar>' : await hashearClave(clave);
  const est = c.establecimiento ? `(SELECT id FROM establecimientos WHERE codigo = ${comilla(c.establecimiento)})` : 'NULL';
  sql.push(`INSERT INTO usuarios (correo, nombre, hash_clave, rol, establecimiento_id, activo) VALUES (${comilla(c.correo)}, ${comilla(c.nombre)}, ${comilla(hash)}, ${comilla(c.rol)}, ${est}, 1);`);
}
// Cargo propio de cada persona cuando difiere del genérico del rol (clave «cargo:<correo>» de la configuración).
sql.push("DELETE FROM configuracion WHERE clave LIKE 'cargo:%';");
for (const c of CUENTAS) if (c.cargo) sql.push(`INSERT INTO configuracion (clave, valor) VALUES (${comilla('cargo:' + c.correo)}, ${comilla(c.cargo)});`);
const idUsuario = (correo) => `(SELECT id FROM usuarios WHERE correo = ${comilla(correo)})`;

const hojas = HOJAS.map((h, i) => ({ ...h, i })).sort((a, b) => b.hab - a.hab || a.i - b.i); // correlativos en orden cronológico
const contadores = new Map();
const guia = []; // para el script de validación: número, código y documento de cada hoja (datos simulados)
for (const h of hojas) {
  const f = fechaHabilAtras(h.hab, 10 + (h.i % 7), (h.i * 13) % 60);
  const clave = `${h.t}|${f.anio}`;
  const correlativo = (contadores.get(clave) ?? 0) + 1;
  contadores.set(clave, correlativo);
  const est = `(SELECT id FROM establecimientos WHERE codigo = ${comilla(h.t)})`;
  const cod = randomBytes(16).toString('hex');
  const documento = `4000${String(1001 + h.i)}`;
  const telefono = `9000${String(10001 + h.i)}`;
  const correo = `${h.n.split(' ').slice(0, 2).join('.').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}@example.com`;
  const monto = h.bien[2] == null ? 'NULL' : Math.round(h.bien[2] * 100);
  let respondidoEn = null;
  if (h.resp) {
    const r = fechaHabilAtras(h.hab - h.resp.despues, 11, (h.i * 7) % 60);
    respondidoEn = r.iso;
  }
  sql.push(
    `INSERT INTO reclamos (establecimiento_id, anio, correlativo, codigo_seguimiento, tipo, nombres, tipo_documento, numero_documento, domicilio, telefono, correo, es_menor, tipo_bien, descripcion_bien, monto_reclamado_centimos, detalle, pedido, acepta_tratamiento_datos, estado, creado_en, respondido_en, huella_origen, medio_respuesta) VALUES (${est}, ${f.anio}, ${correlativo}, ${comilla(cod)}, ${comilla(h.tipo)}, ${comilla(h.n)}, 'DNI', ${comilla(documento)}, ${comilla(h.dom)}, ${comilla(telefono)}, ${comilla(correo)}, 0, ${comilla(h.bien[0])}, ${comilla(h.bien[1])}, ${monto}, ${comilla(h.det)}, ${comilla(h.ped)}, 1, ${comilla(h.est)}, ${comilla(f.iso)}, ${comilla(respondidoEn)}, NULL, ${comilla(h.m)});`,
  );
  const idRec = `(SELECT id FROM reclamos WHERE codigo_seguimiento = ${comilla(cod)})`;
  const encargado = encargadoDe[h.t];
  sql.push(`INSERT INTO eventos (reclamo_id, usuario_id, accion, detalle, creado_en) VALUES (${idRec}, NULL, 'reclamo_registrado', ${comilla(`Registrada como ${h.tipo}`)}, ${comilla(f.iso)});`);
  if (h.est === 'en_atencion' || h.est === 'respondido') {
    sql.push(`INSERT INTO eventos (reclamo_id, usuario_id, accion, detalle, creado_en) VALUES (${idRec}, ${idUsuario(encargado)}, 'reclamo_en_atencion', NULL, ${comilla(masHoras(f.iso, 22))});`);
  }
  const comunicacion = (tipo, estado, intentos, detalle, creado, entrega = null) =>
    sql.push(
      `INSERT INTO comunicaciones (reclamo_id, tipo, estado, intentos, detalle, usuario_id, fecha_entrega, creado_en, actualizado_en) VALUES (${idRec}, ${comilla(tipo)}, ${comilla(estado)}, ${intentos}, ${comilla(detalle)}, ${tipo === 'constancia_correo' ? 'NULL' : idUsuario(encargado)}, ${comilla(entrega)}, ${comilla(creado)}, ${comilla(creado)});`,
    );
  // Las comunicaciones sembradas NO son envíos reales: quedan como «No se envía», con una nota que lo dice.
  comunicacion('constancia_correo', 'omitido', 0, SIMULADA, f.iso);
  if (h.resp) {
    sql.push(
      `INSERT INTO respuestas (reclamo_id, texto, medio_comunicacion, fecha_comunicacion, usuario_id, creado_en) VALUES (${idRec}, ${comilla(h.resp.texto)}, ${comilla(h.m)}, ${comilla(fLima.format(new Date(respondidoEn)))}, ${idUsuario(encargado)}, ${comilla(respondidoEn)});`,
      `INSERT INTO eventos (reclamo_id, usuario_id, accion, detalle, creado_en) VALUES (${idRec}, ${idUsuario(encargado)}, 'respuesta_registrada', ${comilla('Respuesta comunicada por ' + h.m)}, ${comilla(respondidoEn)});`,
    );
    if (h.m === 'correo') comunicacion('respuesta_correo', 'omitido', 0, SIMULADA, respondidoEn);
    else if (h.carta === 'entrega_registrada') {
      const entrega = fechaHabilAtras(Math.max(0, h.hab - h.resp.despues - 2), 16, 0);
      comunicacion('respuesta_carta', 'entrega_registrada', 0, 'Entrega simulada para la demostración', respondidoEn, entrega.ymd);
      sql.push(`INSERT INTO eventos (reclamo_id, usuario_id, accion, detalle, creado_en) VALUES (${idRec}, ${idUsuario(encargado)}, 'carta_entrega_registrada', ${comilla(entrega.ymd)}, ${comilla(entrega.iso)});`);
    } else comunicacion('respuesta_carta', 'pendiente_entrega', 0, null, respondidoEn);
  }
  guia.push({ numero: `${h.t}-${f.anio}-${String(correlativo).padStart(6, '0')}`, tienda: h.t, tipo: h.tipo, estado: h.est, medio: h.m, registrado: f.ymd, habiles: h.hab, respondidaTrasHabiles: h.resp?.despues ?? null, codigo: cod, documento });
}
for (const [clave, ultimo] of contadores) {
  const [t, anio] = clave.split('|');
  sql.push(`INSERT INTO contadores (establecimiento_id, anio, ultimo) VALUES ((SELECT id FROM establecimientos WHERE codigo = ${comilla(t)}), ${anio}, ${ultimo});`);
}

// ---------------------------------------------------------------------------------------------------------
// 4. Salida o aplicación
// ---------------------------------------------------------------------------------------------------------
if (modo === 'generar') {
  if (!posicional) throw new Error('Indique el archivo de salida.');
  writeFileSync(resolve(posicional), `-- Base limpia para la demostración. DATOS SIMULADOS. Generado el ${new Date().toISOString()}\n-- Los hashes de las claves no se incluyen en esta copia de revisión.\n${sql.join('\n')}\n`, 'utf8');
  console.log(`SQL de revisión escrito (${sql.length} sentencias).`);
  process.exit(0);
}

const antes = { estructura: consulta(SQL_ESTRUCTURA), migraciones: consulta('SELECT name FROM d1_migrations ORDER BY id'), feriados: consulta('SELECT COUNT(*) AS n FROM feriados')[0].n, config: consulta("SELECT clave, valor FROM configuracion WHERE clave <> 'correo_activo' AND clave NOT LIKE 'cargo:%' ORDER BY clave") };
console.log(`Antes: ${antes.estructura.length} objetos de estructura, ${antes.migraciones.length} migraciones, ${antes.feriados} feriados.`);

const carpeta = mkdtempSync(join(tmpdir(), 'jn-demo-'));
const archivo = join(carpeta, 'base_demo.sql');
writeFileSync(archivo, sql.join('\n'), 'utf8');
try {
  wr(['d1', 'execute', 'reclamoclaro-db', ...destino, '--file', archivo, ...(modo === 'remoto' ? ['--yes'] : [])]);
} finally {
  rmSync(carpeta, { recursive: true, force: true });
}

const despues = { estructura: consulta(SQL_ESTRUCTURA), migraciones: consulta('SELECT name FROM d1_migrations ORDER BY id'), feriados: consulta('SELECT COUNT(*) AS n FROM feriados')[0].n, config: consulta("SELECT clave, valor FROM configuracion WHERE clave <> 'correo_activo' AND clave NOT LIKE 'cargo:%' ORDER BY clave") };
const cuentas = consulta("SELECT (SELECT COUNT(*) FROM reclamos) AS hojas, (SELECT COUNT(*) FROM respuestas) AS respuestas, (SELECT COUNT(*) FROM eventos) AS eventos, (SELECT COUNT(*) FROM comunicaciones) AS comunicaciones, (SELECT COUNT(*) FROM usuarios) AS usuarios, (SELECT COUNT(*) FROM sesiones) AS sesiones, (SELECT COUNT(*) FROM establecimientos WHERE activo = 1) AS tiendas, (SELECT valor FROM configuracion WHERE clave = 'correo_activo') AS correo_activo, (SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger') AS disparadores")[0];
const comprobaciones = [
  ['estructura idéntica (tablas, índices, restricciones y disparadores)', normal(antes.estructura) === normal(despues.estructura)],
  ['migraciones aplicadas sin cambios', JSON.stringify(antes.migraciones) === JSON.stringify(despues.migraciones)],
  ['feriados sin cambios', antes.feriados === despues.feriados],
  ['configuración sin cambios (salvo correo apagado y cargos del personal)', JSON.stringify(antes.config) === JSON.stringify(despues.config)],
  ['12 hojas, 4 respuestas, 6 cuentas, 0 sesiones, 5 tiendas', cuentas.hojas === 12 && cuentas.respuestas === 4 && cuentas.usuarios === 6 && cuentas.sesiones === 0 && cuentas.tiendas === 5],
  ['envío real de correo apagado', cuentas.correo_activo === '0'],
];
let fallos = 0;
for (const [nombre, ok] of comprobaciones) {
  if (!ok) fallos++;
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${nombre}`);
}
console.log(`Después: ${JSON.stringify(cuentas)}`);

// Cuentas y guía de casos: solo en archivos locales ignorados por Git.
const archivoCuentas = join(raiz, 'pruebas', modo === 'remoto' ? 'usuarios_nube.local.json' : 'usuarios_demo_local.local.json');
writeFileSync(archivoCuentas, JSON.stringify({ aviso: 'Cuentas simuladas de demostración. No subir al repositorio.', usuarios: CUENTAS.map((c) => ({ ...c, clave: claves[c.correo] })) }, null, 2));
writeFileSync(join(raiz, 'pruebas', modo === 'remoto' ? 'casos_demo_nube.local.json' : 'casos_demo_local.local.json'), JSON.stringify({ aviso: 'Datos simulados sembrados para la demostración.', sembrado: new Date().toISOString(), casos: guia }, null, 2));
console.log(`Cuentas guardadas en pruebas/${modo === 'remoto' ? 'usuarios_nube.local.json' : 'usuarios_demo_local.local.json'} (sin imprimir claves).`);
console.log(fallos === 0 ? 'RESULTADO: APROBADO' : `RESULTADO: FALLIDO (${fallos})`);
process.exit(fallos === 0 ? 0 : 1);
