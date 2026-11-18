/**
 * Relevo de correo de JN Reclamaciones (Google Apps Script).
 *
 * Recibe solicitudes firmadas del Worker de Cloudflare y envía el correo con MailApp.
 * No guarda nada: ni destinatarios ni contenido.
 *
 * Seguridad:
 *  - Firma HMAC-SHA256 con un secreto compartido (propiedad de script SECRETO_CORREO).
 *  - Caducidad: rechaza solicitudes con más de 300 segundos de diferencia.
 *  - Anti-repetición: cada «nonce» solo se acepta una vez. Se anota en las propiedades de script
 *    (registro duradero) y además en la caché (atajo rápido). No depende solo de la caché.
 *
 * Configuración: Configuración del proyecto → Propiedades de script → SECRETO_CORREO.
 * Implementación: Aplicación web · Ejecutar como: yo · Acceso: cualquier usuario.
 */

var VENTANA_SEGUNDOS = 300;
// Cada nonce se recuerda el triple de la ventana de caducidad, como margen.
var RETENCION_SEGUNDOS = 900;
var PREFIJO_NONCE = 'n_';
var REMITENTE = 'JN Reclamaciones';

function doPost(e) {
  try {
    var secreto = PropertiesService.getScriptProperties().getProperty('SECRETO_CORREO');
    if (!secreto) return responder({ ok: false, error: 'sin_configurar' });

    var sobre = JSON.parse(e.postData.contents);
    if (typeof sobre.carga !== 'string' || typeof sobre.firma !== 'string') {
      return responder({ ok: false, error: 'formato' });
    }

    var esperada = aHex(Utilities.computeHmacSha256Signature(sobre.carga, secreto, Utilities.Charset.UTF_8));
    if (!igualesTiempoConstante(esperada, String(sobre.firma).toLowerCase())) {
      return responder({ ok: false, error: 'firma' });
    }

    var d = JSON.parse(sobre.carga);
    var ahora = Math.floor(Date.now() / 1000);
    if (d.v !== 1 || typeof d.ts !== 'number' || Math.abs(ahora - d.ts) > VENTANA_SEGUNDOS) {
      return responder({ ok: false, error: 'caducada' });
    }
    if (typeof d.nonce !== 'string' || !/^[0-9a-f]{32}$/.test(d.nonce)) {
      return responder({ ok: false, error: 'nonce' });
    }

    // Anti-repetición con registro DURADERO (propiedades de script), no solo con la caché:
    // Google puede vaciar la caché antes de tiempo. Como toda solicitud con más de 300 s se rechaza
    // por caducidad, basta recordar cada nonce durante RETENCION_SEGUNDOS para que no pueda repetirse.
    // El bloqueo evita que dos solicitudes idénticas simultáneas pasen ambas.
    var cerrojo = LockService.getScriptLock();
    cerrojo.waitLock(10000);
    try {
      var cache = CacheService.getScriptCache();
      var propiedades = PropertiesService.getScriptProperties();
      var clave = PREFIJO_NONCE + d.nonce;
      if (cache.get(clave) || propiedades.getProperty(clave)) {
        return responder({ ok: false, error: 'repetida' });
      }
      propiedades.setProperty(clave, String(ahora));
      cache.put(clave, '1', RETENCION_SEGUNDOS);
      limpiarNoncesVencidos(propiedades, ahora);
    } finally {
      cerrojo.releaseLock();
    }

    if (typeof d.para !== 'string' || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/.test(d.para) || d.para.length > 254) {
      return responder({ ok: false, error: 'destinatario' });
    }
    if (typeof d.asunto !== 'string' || d.asunto.length < 3 || d.asunto.length > 200) {
      return responder({ ok: false, error: 'asunto' });
    }
    if (typeof d.html !== 'string' || d.html.length > 60000 || typeof d.texto !== 'string') {
      return responder({ ok: false, error: 'contenido' });
    }
    if (MailApp.getRemainingDailyQuota() < 1) {
      return responder({ ok: false, error: 'cuota' });
    }

    MailApp.sendEmail({
      to: d.para,
      subject: d.asunto,
      body: d.texto,
      htmlBody: d.html,
      name: REMITENTE
      // Sin «noReply»: esa opción solo existe en cuentas de Google Workspace, no en Gmail gratuito.
    });
    return responder({ ok: true, restante: MailApp.getRemainingDailyQuota() });
  } catch (err) {
    // No se devuelve el detalle del error para no filtrar datos.
    return responder({ ok: false, error: 'interno' });
  }
}

// Permite comprobar desde el navegador que la aplicación web está publicada. No envía nada.
function doGet() {
  return responder({ ok: true, servicio: 'relevo-correo-jn-reclamaciones' });
}

// Borra del registro duradero los nonces que ya no pueden reutilizarse (su solicitud caducó hace rato).
// Mantiene el almacén pequeño: como mucho, los envíos de los últimos 15 minutos.
function limpiarNoncesVencidos(propiedades, ahora) {
  var todas = propiedades.getProperties();
  for (var clave in todas) {
    if (clave.indexOf(PREFIJO_NONCE) !== 0) continue;
    var marca = Number(todas[clave]);
    if (!marca || ahora - marca > RETENCION_SEGUNDOS) propiedades.deleteProperty(clave);
  }
}

function responder(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(ContentService.MimeType.JSON);
}

function aHex(bytes) {
  var s = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
    s += (b < 16 ? '0' : '') + b.toString(16);
  }
  return s;
}

function igualesTiempoConstante(a, b) {
  if (a.length !== b.length) return false;
  var diferencia = 0;
  for (var i = 0; i < a.length; i++) diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferencia === 0;
}
