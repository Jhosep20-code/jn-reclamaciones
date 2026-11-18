# P4 — Despliegue, versiones y reversión (procedimiento manual)

Objetivo: demostrar que se puede publicar una versión nueva, volver a la anterior y recuperar la nueva sin perder datos ni la URL.
Lo ejecuta el director, con sesión de Wrangler iniciada (`npx wrangler whoami`). Carpeta de trabajo: la del proyecto (`06_DESARROLLO/reclamoclaro`).

URL de producción: `https://reclamaciones.jnsoluciones.workers.dev` (Worker `reclamaciones`; hasta el 14 de noviembre usaba otro nombre y otro subdominio de la cuenta)

Anote en la evidencia (captura o texto) la salida de cada paso con su fecha y hora.

## 0. Antes de empezar

1. `npx tsc --noEmit` debe terminar sin errores.
2. `node --test pruebas/plazos.test.mjs` debe pasar.
3. Estado actual en la nube:
   - `curl -s https://reclamaciones.jnsoluciones.workers.dev/api/salud` y anote el campo `version` (VERSION_A).
   - Abra la URL en el navegador y anote la etiqueta de versión visible en la interfaz.
4. `npx wrangler versions list --name reclamaciones` y anote el identificador de la versión activa (ID_A) y su porcentaje (100 %).

## 1. Publicar la versión nueva

1. Compile la interfaz: `npm run build`.
2. Publique: `npx wrangler deploy`. Anote la línea `Current Version ID: ...` (ID_B).
3. `npx wrangler versions list`: debe aparecer ID_B como activa al 100 %.
4. Compruebe:
   - `curl -s https://reclamaciones.jnsoluciones.workers.dev/api/salud` -> `version` es la nueva (por ejemplo `0.3.0`).
   - Recargue la interfaz con Ctrl+F5: la etiqueta de versión coincide con la nueva.
   - El sitio sigue respondiendo en la misma URL.

## 2. Volver a la versión anterior (reversión)

1. `npx wrangler rollback ID_A` (si lo pide, escriba un motivo corto, por ejemplo "P4 prueba de reversión"). Confirme con `y`.
2. `npx wrangler versions list`: ID_A vuelve a ser la activa al 100 %.
3. Compruebe:
   - `/api/salud` devuelve VERSION_A.
   - La interfaz (Ctrl+F5) muestra la etiqueta de VERSION_A.
   - Los datos siguen allí: inicie sesión con una cuenta de demostración y abra la bandeja (la base D1 no se revierte: la reversión solo cambia el código).

## 3. Volver a la última versión

1. `npx wrangler rollback ID_B` (o `npx wrangler deploy` otra vez si prefiere un identificador nuevo).
2. `npx wrangler versions list`: ID_B (o la nueva) es la activa al 100 %.
3. Compruebe de nuevo `/api/salud` (versión nueva) y la etiqueta de la interfaz.

## 4. Criterios de aprobación

- Cada cambio de versión se refleja en `/api/salud` y en la etiqueta de la interfaz en menos de un minuto.
- La URL no cambia en ningún momento.
- Los datos (hojas, usuarios, historial) siguen intactos tras las dos reversiones.
- No hay errores 5xx en las comprobaciones.

## 4.1 Ejecución real con la versión definitiva (15 de noviembre de 2026)

Se ejecutó con ID_A = `cf3b2c66-8518-4a43-a409-bb16fce5dd7f` (API 1.0.0, interfaz 2.0.0) e ID_B = `dff810cf-1400-4694-90ae-f7592eac141d` (API 1.0.0, interfaz 3.0.0): retroceso a ID_A visible en 34 s (incluye el tiempo del comando) con 0 errores en 10 consultas a `/api/salud`; regreso a ID_B visible en 9 s; humo 14/14 después. Fuente: `08_PRUEBAS_Y_EVIDENCIAS/2026-11-15_VERSION_DEFINITIVA_JN_RESULTADOS.md`.

## 5. Notas

- `wrangler rollback` solo revierte el código y la configuración del Worker; no revierte la base de datos. Por eso las migraciones deben ser siempre compatibles hacia atrás con la versión anterior.
- Si una migración debe aplicarse antes del despliegue: `npm run db:remota`. Esta versión (0.3.0) no trae migraciones nuevas.
- No ejecute los scripts de prueba P1/P2/P3 durante P4: modifican temporalmente `limite_registros_por_origen_hora`.
- Guarde la evidencia en `08_PRUEBAS_Y_EVIDENCIAS/` con el nombre `AAAA-MM-DD_P4_nube.txt`.
