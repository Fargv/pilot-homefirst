# STAB-001: validación local

Desde `backend/`, ejecutar `npm test`. Estas pruebas son reproducibles y no
requieren MongoDB, Brevo, Stripe, Netlify ni Render. La prueba de rutas levanta
Express en un puerto efímero y comprueba que `POST /api/email/test` y
`POST /api/test-email` devuelven 404.

Ejecutar `npm run build` desde `frontend/` para validar el frontend.

Las tareas `npm run migrate:db-structure -- --dry-run` y
`npm run cleanup:onboarding-challenges -- --dry-run` requieren una MongoDB
aislada local. La migración estructural solo modifica índices y limpia emails
vacíos con `--apply`; no se ejecuta al arrancar la aplicación. Para aplicar en
una MongoDB local aislada: `npm run migrate:db-structure -- --apply`.
Si el preflight muestra un índice incompatible con las mismas claves, la
aplicación exige `--maintenance-window`; MongoDB no permite crear ambas
definiciones simultáneamente y existe una ventana inevitable entre
`dropIndex` y `createIndex`.
El cleanup requiere exactamente uno de `--dry-run` o `--apply`; el segundo
exige además `--confirm`: `npm run cleanup:onboarding-challenges -- --apply
--confirm`.
Ambos comandos bloquean destinos no locales por defecto; `--allow-nonlocal`
queda reservado para una autorización operativa explícita.

Antes de desplegar, ejecutar el preflight de la migración y conservar su
diagnóstico. Detecta índices legacy, opciones incompatibles, duplicados de
`householdId/weekStart`, emails normalizados duplicados y grupos nulos/vacíos.
Si encuentra conflictos no ejecuta ninguna escritura ni `dropIndex`. Las
operaciones de índices no son transaccionales: si falla un `createIndex`
después de un `dropIndex`, conservar el diagnóstico, inspeccionar índices
actuales y repetir el preflight/apply; el comando es idempotente y no se deben
reintroducir migraciones automáticas en `connectDb()`.

La migración real requiere ventana de mantenimiento, backup previo y ensayo
en una MongoDB aislada. Esta tarea no ejecuta migraciones reales.

Los seeds de onboarding/weekly/receta y el cron horario de expiración de
suscripciones siguen en el arranque. La limpieza de retos legacy es ahora el
comando explícito `cleanup:onboarding-challenges`.
