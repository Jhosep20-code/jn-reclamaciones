// Utilidades compartidas por las pruebas P1, P2 y P3.
// Dos modos:
//   local   (por defecto): servidor `wrangler dev` y base D1 local.
//   --remoto: Worker desplegado en la nube y base D1 remota (solo consultas de conteo; ver GUARDA_SQL_REMOTO).
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ejecutarSql, ejecutarSqlTodo } from '../scripts/d1.mjs';

export const URL_NUBE = 'https://reclamaciones.jnsoluciones.workers.dev';
export const VERSION_ESPERADA = '1.0.0';
const CLAVE_LIMITE = 'limite_registros_por_origen_hora';
const CLAVE_CORREO = 'correo_activo';

const DIR = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(DIR, '..');
const CARPETA_EVIDENCIAS = resolve(RAIZ, '..', '..', '08_PRUEBAS_Y_EVIDENCIAS');

// ---------------------------------------------------------------------------------------------
// Privacidad: en la nube solo se admiten SELECT (sin columnas personales), el ajuste del límite y el interruptor del correo.
// ---------------------------------------------------------------------------------------------
const COLUMNAS_PERSONALES = /\b(nombres|numero_documento|tipo_documento|domicilio|telefono|correo|apoderado_\w*|detalle|pedido|descripcion_bien|hash_clave|token_csrf)\b/i;
const ACTUALIZAR_LIMITE = /^UPDATE configuracion SET valor = '\d{1,9}' WHERE clave = 'limite_registros_por_origen_hora'$/;
// El correo solo se puede APAGAR o restaurar a su valor original; los scripts nunca lo encienden por su cuenta.
const ACTUALIZAR_CORREO = /^UPDATE configuracion SET valor = '[01]' WHERE clave = 'correo_activo'$/;

export function validarSqlRemoto(sql) {
  if (/--|\/\*/.test(sql)) throw new Error('SQL remoto rechazado: comentarios no permitidos');
  if (COLUMNAS_PERSONALES.test(sql)) throw new Error('SQL remoto rechazado: menciona columnas con datos personales');
  const sentencias = sql.split(';').map((s) => s.trim()).filter(Boolean);
  if (!sentencias.length) throw new Error('SQL remoto rechazado: vacío');
  for (const s of sentencias) {
    if (/^SELECT\b/i.test(s)) {
      if (/\bselect\s+(distinct\s+)?([\w]+\.)?\*/i.test(s) || /,\s*([\w]+\.)?\*/.test(s)) {
        throw new Error('SQL remoto rechazado: SELECT * no permitido');
      }
      continue;
    }
    if (ACTUALIZAR_LIMITE.test(s) || ACTUALIZAR_CORREO.test(s)) continue;
    throw new Error(`SQL remoto rechazado: solo SELECT, el ajuste del límite o el interruptor del correo (${s.slice(0, 30)}...)`);
  }
}

// ---------------------------------------------------------------------------------------------
// Métricas de latencia de extremo a extremo.
// ---------------------------------------------------------------------------------------------
function percentil(ordenados, p) {
  if (!ordenados.length) return 0;
  const i = Math.min(ordenados.length - 1, Math.max(0, Math.ceil((p / 100) * ordenados.length) - 1));
  return ordenados[i];
}

function estadistica(valores) {
  const o = [...valores].sort((a, b) => a - b);
  const suma = o.reduce((a, b) => a + b, 0);
  const r1 = (x) => Math.round(x * 10) / 10;
  return {
    n: o.length,
    min: r1(o[0] ?? 0),
    mediana: r1(percentil(o, 50)),
    p95: r1(percentil(o, 95)),
    max: r1(o[o.length - 1] ?? 0),
    media: r1(o.length ? suma / o.length : 0),
  };
}

function plantillaRuta(ruta) {
  return ruta
    .split('?')[0]
    .replace(/^\/api\/seguimiento\/.*$/, '/api/seguimiento/:codigo')
    .replace(/\/[0-9a-fA-F]{32}(?=\/|$)/g, '/:codigo')
    .replace(/\/[A-Z]{3}-\d{2}(?=\/|$)/g, '/:codigo')
    .replace(/\/\d+(?=\/|$)/g, '/:id');
}

export function crearMetricas() {
  const lista = [];
  return {
    registrar(metodo, ruta, estado, ms) {
      lista.push({ clave: `${metodo} ${plantillaRuta(ruta)}`, estado, ms });
    },
    resumen() {
      const codigos = {};
      for (const m of lista) codigos[m.estado] = (codigos[m.estado] ?? 0) + 1;
      const porRuta = new Map();
      for (const m of lista) {
        if (!porRuta.has(m.clave)) porRuta.set(m.clave, []);
        porRuta.get(m.clave).push(m.ms);
      }
      return {
        solicitudes: lista.length,
        codigos,
        latencia_ms: estadistica(lista.map((m) => m.ms)),
        por_ruta: [...porRuta.entries()].map(([ruta, v]) => ({ ruta, ...estadistica(v) })).sort((a, b) => b.n - a.n),
      };
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Cliente HTTP con cookie propia y token CSRF.
// ---------------------------------------------------------------------------------------------
export function crearCliente(base, metricas) {
  let cookie = null;
  let csrf = null;
  const cliente = {
    get csrf() { return csrf; },
    set csrf(v) { csrf = v; },
    async pedir(metodo, ruta, cuerpo, opciones = {}) {
      const cabeceras = { Origin: opciones.origen ?? base };
      if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';
      if (cookie && opciones.cookie !== false) cabeceras.Cookie = cookie;
      if (csrf && opciones.csrf !== false) cabeceras['X-CSRF-Token'] = csrf;
      const inicio = performance.now();
      let r;
      let texto = '';
      try {
        r = await fetch(base + ruta, {
          method: metodo,
          headers: cabeceras,
          body: cuerpo === undefined ? undefined : typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
        });
        texto = await r.text();
      } catch (e) {
        metricas?.registrar(metodo, ruta, 0, performance.now() - inicio);
        return { estado: 0, datos: { error: `fallo de red: ${e.cause?.code ?? e.message}` }, cabeceras: new Headers(), setCookie: null };
      }
      metricas?.registrar(metodo, ruta, r.status, performance.now() - inicio);
      let datos = null;
      try { datos = texto ? JSON.parse(texto) : null; } catch { datos = texto; }
      const nueva = r.headers.get('set-cookie');
      if (nueva && ruta === '/api/sesion' && metodo === 'POST') cookie = nueva.split(';')[0];
      return { estado: r.status, datos, cabeceras: r.headers, setCookie: nueva };
    },
    async iniciarSesion(correo, clave) {
      const r = await cliente.pedir('POST', '/api/sesion', { correo, clave });
      if (r.estado === 200) csrf = r.datos.token_csrf;
      return r;
    },
  };
  return cliente;
}

// Registro público válido de ejemplo. Todo es ficticio y está rotulado como PRUEBA.
export function solicitudValida(codigo, extra = {}) {
  return {
    establecimiento_codigo: codigo,
    tipo: 'reclamo',
    medio_respuesta: 'correo',
    consumidor: {
      nombres: 'Persona Ficticia PRUEBA',
      tipo_documento: 'DNI',
      numero_documento: '12345678',
      correo: 'ficticio.prueba@example.com',
      es_menor: false,
    },
    bien: { tipo: 'producto', descripcion: 'Licuadora PRUEBA', monto: 199.9 },
    detalle: 'PRUEBA automatizada: el producto ficticio dejó de funcionar a los dos días de uso.',
    pedido: 'PRUEBA: solicito el cambio del producto ficticio.',
    acepta_tratamiento_datos: true,
    ...extra,
  };
}

export const fechaHoyLima = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
export const sufijoAleatorio = (n = 5) => randomBytes(n).toString('hex');

// ---------------------------------------------------------------------------------------------
// Informe de verificaciones.
// ---------------------------------------------------------------------------------------------
export function crearInforme() {
  const filas = [];
  return {
    filas,
    verificar(nombre, ok, detalle = '') {
      filas.push({ nombre, ok: Boolean(ok), omitida: false, detalle: String(detalle) });
    },
    omitir(nombre, motivo) {
      filas.push({ nombre, ok: true, omitida: true, detalle: `OMITIDA: ${motivo}` });
    },
  };
}

// Quita de cualquier texto lo que parezca token, código de seguimiento, cookie o clave.
export function redactar(texto) {
  return String(texto)
    .replace(/\b[0-9a-f]{32,64}\b/gi, '[oculto]')
    .replace(/(rc_sesion=)[^;\s]+/g, '$1[oculto]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [oculto]');
}

function fechaLocalISO(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ---------------------------------------------------------------------------------------------
// Contexto de ejecución de una prueba.
// ---------------------------------------------------------------------------------------------
export async function iniciarPrueba({ id, titulo, gestionarCorreo = true }) {
  const args = process.argv.slice(2);
  const nube = args.includes('--remoto');
  const sinArchivo = args.includes('--sin-archivo');
  const posicional = args.filter((a) => !a.startsWith('--'))[0];
  let base;
  if (nube) {
    base = URL_NUBE;
  } else {
    base = (posicional ?? 'http://localhost:8787').replace(/\/$/, '');
    if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) {
      console.error(`Sin --remoto, las pruebas solo se ejecutan contra un servidor local, no contra ${base}`);
      process.exit(2);
    }
  }
  const modoSql = nube ? 'remoto' : 'local';
  const entorno = nube ? 'nube' : 'local';
  const metricas = crearMetricas();
  const inf = crearInforme();
  const inicioMs = Date.now();
  const inicioISO = new Date().toISOString();
  const extra = {};
  const desechables = []; // { id, rotulo }
  let limiteOriginal = null;
  let limiteAjustado = false;
  let correoOriginal = null;
  let correoApagado = false;

  const ctx = {
    id, titulo, nube, entorno, base, inf, metricas, extra,
    verificar: inf.verificar,
    omitir: inf.omitir,
    cliente: () => crearCliente(base, metricas),

    // SQL: en la nube solo pasa lo que valida validarSqlRemoto.
    sql(sentencia) {
      validarSqlRemoto(sentencia); // la misma guarda en ambos modos: lo que pasa en local pasará en la nube
      return ejecutarSql(sentencia, modoSql);
    },
    sqlTodo(sentencias) {
      validarSqlRemoto(sentencias);
      return ejecutarSqlTodo(sentencias, modoSql);
    },

    cuentas() {
      if (!nube) {
        const ruta = join(DIR, 'usuarios_de_prueba.local.json');
        if (!existsSync(ruta)) {
          console.error('Falta pruebas/usuarios_de_prueba.local.json. Ejecute: node scripts/crear_usuarios_de_prueba.mjs');
          process.exit(2);
        }
        return JSON.parse(readFileSync(ruta, 'utf8'));
      }
      const ruta = join(DIR, 'usuarios_nube.local.json');
      if (!existsSync(ruta)) {
        console.error('Falta pruebas/usuarios_nube.local.json (cuentas de demostración de la nube).');
        process.exit(2);
      }
      const lista = JSON.parse(readFileSync(ruta, 'utf8')).usuarios ?? [];
      const buscar = (f) => lista.find(f);
      const a = buscar((x) => x.rol === 'admin');
      const h = buscar((x) => x.rol === 'encargado' && x.establecimiento === 'HYO-01');
      const t = buscar((x) => x.rol === 'encargado' && x.establecimiento === 'TAM-01');
      if (!a || !h || !t) {
        console.error('usuarios_nube.local.json debe incluir un admin y encargados de HYO-01 y TAM-01.');
        process.exit(2);
      }
      const forma = (x) => ({ correo: x.correo, clave: x.clave, rol: x.rol, establecimiento: x.establecimiento });
      return { admin: forma(a), encargado_hyo: forma(h), encargado_tam: forma(t) };
    },

    // Límite de registros por origen.
    leerLimite() {
      limiteOriginal = ctx.sql(`SELECT valor FROM configuracion WHERE clave = '${CLAVE_LIMITE}';`)[0]?.valor ?? '10';
      extra.limite_registros_por_origen_hora_original = limiteOriginal;
      console.log(`Límite de registros por origen (${entorno}) al empezar: ${limiteOriginal}. Se restaura al terminar.`);
      return limiteOriginal;
    },
    fijarLimite(valor) {
      if (limiteOriginal === null) ctx.leerLimite();
      limiteAjustado = true;
      ctx.sql(`UPDATE configuracion SET valor = '${Number(valor)}' WHERE clave = '${CLAVE_LIMITE}';`);
    },
    limpiarIntentos() {
      if (!nube) ejecutarSql('DELETE FROM intentos_acceso;', 'local');
    },

    // Usuarios desechables: correo único, clave aleatoria, desactivados al final.
    async crearDesechable(admin, { rol, establecimiento_codigo, rotulo }) {
      const correo = `prueba.${sufijoAleatorio(6)}@example.com`;
      const clave = randomBytes(18).toString('base64url');
      const cuerpo = { nombre: `Usuario PRUEBA desechable ${rotulo ?? rol}`, correo, clave, rol };
      if (establecimiento_codigo) cuerpo.establecimiento_codigo = establecimiento_codigo;
      const r = await admin.pedir('POST', '/api/admin/usuarios', cuerpo);
      if (r.estado === 201) desechables.push({ id: r.datos.id, rotulo: rotulo ?? rol });
      return { respuesta: r, id: r.datos?.id, correo, clave };
    },
    registrarDesechable(id, rotulo) { desechables.push({ id, rotulo }); },

    // Cierre: desactiva usuarios, restaura el límite, escribe archivos y devuelve el código de salida.
    async finalizar() {
      if (desechables.length) {
        try {
          const cuentas = ctx.cuentas();
          const adm = crearCliente(base, metricas);
          const login = await adm.iniciarSesion(cuentas.admin.correo, cuentas.admin.clave);
          let fallidos = 0;
          if (login.estado !== 200) fallidos = desechables.length;
          else {
            for (const d of desechables) {
              const r = await adm.pedir('PATCH', `/api/admin/usuarios/${d.id}`, { activo: false });
              if (r.estado !== 200 || r.datos?.activo !== false) fallidos++;
            }
            await adm.pedir('DELETE', '/api/sesion');
          }
          const ids = desechables.map((d) => Number(d.id)).join(',');
          let activos = 'sin verificar';
          try { activos = ctx.sql(`SELECT COUNT(*) AS n FROM usuarios WHERE id IN (${ids}) AND activo = 1;`)[0]?.n; } catch { /* se informa abajo */ }
          inf.verificar('usuarios desechables desactivados al final', fallidos === 0 && activos === 0, `${desechables.length} creados, ${fallidos} fallos al desactivar, activos restantes: ${activos}`);
          extra.usuarios_desechables_creados = desechables.length;
          if (fallidos || activos !== 0) console.error(`ATENCIÓN: desactive manualmente los usuarios con id ${ids} (PATCH /api/admin/usuarios/:id {"activo": false}).`);
        } catch (e) {
          inf.verificar('usuarios desechables desactivados al final', false, e.message);
        }
      }
      if (correoApagado) {
        try {
          ctx.sql(`UPDATE configuracion SET valor = '${correoOriginal}' WHERE clave = '${CLAVE_CORREO}';`);
          const actual = ctx.sql(`SELECT valor FROM configuracion WHERE clave = '${CLAVE_CORREO}';`)[0]?.valor;
          inf.verificar('correo_activo restaurado a su valor original', String(actual) === String(correoOriginal), `valor original ${correoOriginal}, valor actual ${actual}`);
          correoApagado = false;
        } catch (e) {
          inf.verificar('correo_activo restaurado a su valor original', false, e.message);
          console.error(`ATENCIÓN: restaure el interruptor a mano: UPDATE configuracion SET valor = '${correoOriginal}' WHERE clave = '${CLAVE_CORREO}';`);
        }
      }
      if (limiteAjustado) {
        try {
          ctx.sql(`UPDATE configuracion SET valor = '${Number(limiteOriginal)}' WHERE clave = '${CLAVE_LIMITE}';`);
          const actual = ctx.sql(`SELECT valor FROM configuracion WHERE clave = '${CLAVE_LIMITE}';`)[0]?.valor;
          inf.verificar('límite de registros restaurado', String(actual) === String(limiteOriginal), `valor original ${limiteOriginal}, valor actual ${actual}`);
          extra.limite_registros_por_origen_hora_restaurado = actual;
          limiteAjustado = false;
        } catch (e) {
          inf.verificar('límite de registros restaurado', false, e.message);
          console.error(`ATENCIÓN: restaure el límite a mano: UPDATE configuracion SET valor = '${limiteOriginal}' WHERE clave = '${CLAVE_LIMITE}';`);
        }
      }
      return emitirInforme();
    },
  };

  // Si se interrumpe con Ctrl+C se restaura el límite antes de salir.
  process.on('SIGINT', () => {
    if (correoApagado) {
      try { ctx.sql(`UPDATE configuracion SET valor = '${correoOriginal}' WHERE clave = '${CLAVE_CORREO}';`); console.error(`
Interrumpido: correo_activo restaurado a ${correoOriginal}.`); }
      catch { console.error(`
Interrumpido. Restaure correo_activo a mano a ${correoOriginal}.`); }
    }
    if (limiteAjustado) {
      try { ctx.sql(`UPDATE configuracion SET valor = '${Number(limiteOriginal)}' WHERE clave = '${CLAVE_LIMITE}';`); console.error(`\nInterrumpido: límite restaurado a ${limiteOriginal}.`); }
      catch { console.error(`\nInterrumpido. Restaure el límite a mano a ${limiteOriginal}.`); }
    }
    if (desechables.length) console.error(`Quedaron usuarios desechables sin desactivar (ids ${desechables.map((d) => d.id).join(',')}).`);
    process.exit(130);
  });

  // Versión reportada por /api/salud.
  const salud = await crearCliente(base, null).pedir('GET', '/api/salud');
  const version = salud.datos?.version ?? 'desconocida';
  ctx.version = version;
  console.log(`\n${titulo}\nentorno: ${entorno} | url: ${base} | versión API: ${version}`);
  if (salud.estado !== 200) {
    console.error(`El servicio no responde correctamente (estado ${salud.estado}).`);
    process.exit(2);
  }

  // Nunca se envían correos reales desde las pruebas: si el envío está encendido, se apaga durante la ejecución
  // y se restaura al final (igual que el límite por origen). Estos scripts jamás lo encienden.
  if (gestionarCorreo) {
    correoOriginal = String(ctx.sql(`SELECT valor FROM configuracion WHERE clave = '${CLAVE_CORREO}';`)[0]?.valor ?? '0');
    extra.correo_activo_original = correoOriginal;
    if (correoOriginal === '1') {
      ctx.sql(`UPDATE configuracion SET valor = '0' WHERE clave = '${CLAVE_CORREO}';`);
      correoApagado = true;
      console.log(`correo_activo estaba en 1 (${entorno}): se apaga durante la prueba y se restaura al terminar.`);
    }
  }

  function emitirInforme() {
    const filas = inf.filas;
    const fallas = filas.filter((f) => !f.ok);
    const omitidas = filas.filter((f) => f.omitida).length;
    const resumen = metricas.resumen();
    const duracionS = Math.round((Date.now() - inicioMs)) / 1000;
    const ancho = Math.min(70, Math.max(...filas.map((f) => f.nombre.length), 10));
    const lineas = [];
    lineas.push(`${titulo}`);
    lineas.push(`entorno: ${entorno}`);
    lineas.push(`url: ${base}`);
    lineas.push(`fecha_hora_utc: ${inicioISO}`);
    lineas.push(`version_api (/api/salud): ${version}`);
    lineas.push(`duracion_s: ${duracionS}`);
    lineas.push('');
    lineas.push('VERIFICACIONES');
    for (const f of filas) lineas.push(`${f.omitida ? 'OMITE ' : f.ok ? 'OK    ' : 'FALLA '} ${f.nombre.padEnd(ancho)}  ${f.detalle}`);
    lineas.push(`--- ${filas.length - fallas.length - omitidas}/${filas.length - omitidas} verificaciones correctas${omitidas ? `, ${omitidas} omitidas` : ''} ---`);
    lineas.push('');
    lineas.push('SOLICITUDES HTTP');
    lineas.push(`total: ${resumen.solicitudes}`);
    lineas.push(`códigos de respuesta: ${Object.entries(resumen.codigos).map(([k, v]) => `${k}=${v}`).join('  ')}`);
    const l = resumen.latencia_ms;
    lineas.push(`latencia de extremo a extremo (ms): mín ${l.min} | mediana ${l.mediana} | p95 ${l.p95} | máx ${l.max} | media ${l.media}`);
    lineas.push('');
    lineas.push('ruta'.padEnd(46) + 'n'.padStart(5) + 'mín'.padStart(8) + 'mediana'.padStart(9) + 'p95'.padStart(8) + 'máx'.padStart(8));
    for (const r of resumen.por_ruta) {
      lineas.push(r.ruta.slice(0, 45).padEnd(46) + String(r.n).padStart(5) + String(r.min).padStart(8) + String(r.mediana).padStart(9) + String(r.p95).padStart(8) + String(r.max).padStart(8));
    }
    if (Object.keys(extra).length) {
      lineas.push('');
      lineas.push('DATOS ADICIONALES');
      for (const [k, v] of Object.entries(extra)) lineas.push(`${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
    }
    lineas.push('');
    lineas.push(`RESULTADO: ${fallas.length === 0 ? 'APROBADO' : 'FALLIDO'}`);
    const texto = redactar(lineas.join('\n')) + '\n';
    console.log('\n' + texto);

    const objeto = {
      prueba: id,
      titulo,
      entorno,
      url: base,
      fecha_hora_utc: inicioISO,
      version_api: version,
      duracion_s: duracionS,
      resultado: fallas.length === 0 ? 'APROBADO' : 'FALLIDO',
      verificaciones: filas.map((f) => ({ nombre: f.nombre, ok: f.ok, omitida: f.omitida, detalle: redactar(f.detalle) })),
      metricas: resumen,
      adicionales: extra,
    };
    if (!sinArchivo) {
      try {
        mkdirSync(CARPETA_EVIDENCIAS, { recursive: true });
        const fecha = fechaLocalISO(new Date());
        let sufijo = '';
        let n = 1;
        while (existsSync(join(CARPETA_EVIDENCIAS, `${fecha}_${id}_${entorno}${sufijo}.txt`)) || existsSync(join(CARPETA_EVIDENCIAS, `${fecha}_${id}_${entorno}${sufijo}.json`))) {
          n++;
          sufijo = `_${n}`;
        }
        const baseNombre = join(CARPETA_EVIDENCIAS, `${fecha}_${id}_${entorno}${sufijo}`);
        writeFileSync(`${baseNombre}.txt`, texto, 'utf8');
        writeFileSync(`${baseNombre}.json`, JSON.stringify(objeto, null, 2) + '\n', 'utf8');
        console.log(`Evidencia guardada en:\n  ${baseNombre}.txt\n  ${baseNombre}.json`);
      } catch (e) {
        console.error(`No se pudo guardar la evidencia: ${e.message}`);
        return 1;
      }
    }
    return fallas.length === 0 ? 0 : 1;
  }

  return ctx;
}

export { ejecutarSql };
