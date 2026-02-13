# Pilot Lunchfy

## Módulo Kitchen

Kitchen es el módulo familiar para planificar comidas (lunes a viernes), generar lista de compra semanal y gestionar cambios de cocina entre usuarios.

### Rutas principales (frontend)

- `/kitchen/login`
- `/kitchen/semana`
- `/kitchen/platos`
- `/kitchen/compra`
- `/kitchen/cambios`

### Endpoints principales (backend)

Prefijo: `/api/kitchen`

- Auth
  - `POST /auth/login`
  - `POST /auth/logout`
  - `GET /auth/me`
- Platos
  - `GET /dishes`
  - `POST /dishes`
  - `PUT /dishes/:id`
  - `DELETE /dishes/:id`
- Semana
  - `GET /weeks/:weekStart`
  - `PUT /weeks/:weekStart/day/:date`
  - `POST /weeks/:weekStart/copy-from/:otherWeekStart`
- Compra
  - `GET /shopping/:weekStart`
  - `POST /shopping/:weekStart/rebuild`
  - `PUT /shopping/:weekStart/item`
- Cambios
  - `POST /swaps`
  - `GET /swaps`
  - `POST /swaps/:id/accept`
  - `POST /swaps/:id/reject`

### Variables de entorno

Backend (`backend/.env`):

- `MONGODB_URI`: conexión a MongoDB.
- `JWT_SECRET`: secreto para firmar sesiones Kitchen.
- `CORS_ORIGIN`: origen permitido para el frontend (por defecto `http://localhost:5173`).

Frontend (`frontend/.env`):

- `VITE_API_URL`: URL base del backend (ej. `http://localhost:3000`).

### Usuarios

- Solo admin puede crear usuarios vía API (`POST /api/kitchen/users`).
- Para listar miembros en UI se usa `GET /api/kitchen/users/members`.

### Nota PWA

El módulo está preparado para futuras mejoras PWA (instalación en dispositivos), pero no se ha activado push ni cambios de manifiesto en esta iteración.
