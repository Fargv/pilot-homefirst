# Estado del onboarding visual v1

Este contrato guarda únicamente el borrador reanudable del futuro onboarding visual. Está separado de `HouseholdOnboarding` (retos/tutoriales) y de las preferencias permanentes del hogar. No genera ni modifica semanas.

## Acceso y aislamiento

Todos los endpoints requieren autenticación. El hogar se obtiene de la sesión del usuario; no se acepta `householdId` en query ni en el cuerpo. Solo puede leer o cambiar el estado el usuario cuyo rol sea `owner` y cuyo id coincida con `Household.ownerUserId`. Los miembros y usuarios de otro hogar reciben `403`.

## Estado

La colección `VisualOnboardingProgress` guarda un registro por hogar y versión de flujo (`householdId + flowVersion`, índice único):

```json
{
  "householdId": "...",
  "flowVersion": 1,
  "status": "not_started | in_progress | completed | skipped",
  "currentStep": 0,
  "responses": {},
  "revision": 0,
  "createdAt": "...",
  "updatedAt": "..."
}
```

Si aún no existe un borrador, la lectura devuelve el estado inicial sintético (`not_started`, paso 0, revisión 0 y fechas nulas) sin crear datos. La primera escritura debe usar `expectedRevision: 0`. Cada guardado válido aumenta `revision`; un guardado con revisión antigua devuelve `409 ONBOARDING_REVISION_CONFLICT`. La omisión también requiere la revisión actual y conserva el borrador. `completed` forma parte del modelo para el ciclo futuro; esta entrega aún no tiene endpoint de finalización.

## Endpoints

Base: `/api/kitchen/onboarding/visual`

- `GET /state`: devuelve `{ ok, onboarding }`.
- `PUT /draft`: guarda el paso y/o respuestas parciales. Campos admitidos: `expectedRevision` (entero no negativo, obligatorio), `currentStep` (entero 0–100) y `responses`. Por ahora, la única respuesta admitida es `responses.weekSelection`, con valor `current_week`, `next_week` o `null` para borrar el borrador de esa respuesta. Campos desconocidos producen `400`.
- `POST /skip`: cuerpo `{ "expectedRevision": 0 }`; marca el onboarding como `skipped` y aumenta la revisión. Los campos desconocidos producen `400`.

La ausencia de `responses.weekSelection` significa que la futura UI debe preseleccionar la semana actual. `weekSelection` sigue siendo una respuesta temporal del borrador: no se copia a preferencias ni activa generación. Elegir la siguiente semana no permite reemplazar ni escribir semanas existentes; la planificación queda fuera de este contrato.

Ejemplo de guardado:

```json
{
  "expectedRevision": 0,
  "currentStep": 0,
  "responses": { "weekSelection": "next_week" }
}
```
