# Medusa Store

MVP móvil para gestionar inventario de una tienda de ropa de segunda mano / americana.

## Qué incluye

- `backend/`: API con Django + Django REST Framework usando SQLite por defecto.
- `mobile/`: app Expo / React Native en español con tablero, inventario filtrable, alta de artículos, contenedores con QR, vendidos y escaneo/búsqueda.
- `docker-compose.yml`: servicio PostgreSQL opcional para uso local posterior.

## Configuración del backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

La API se sirve en `http://127.0.0.1:8000/api/`.

### Entorno local

`backend/.env.example` es solo para desarrollo y usa placeholders obvios. Copialo a `backend/.env`, reemplazá los valores y mantené `backend/.env` fuera del control de versiones.

Para ejecuciones similares a producción, configurá `DJANGO_DEBUG=False`, definí `DJANGO_SECRET_KEY`, usá `DJANGO_ALLOWED_HOSTS` concretos y dejá solo los orígenes CORS que deberían llamar a la API. El backend no arranca sin `DJANGO_SECRET_KEY` cuando debug está desactivado.

### Datos de demo

Para cargar datos de ejemplo y ver la app con contenido:

```bash
python manage.py seed_demo_data
```

Esto crea 15 containers de demo y 50 prendas de demo con fotos.

### Autenticación de la API

Los endpoints de inventario requieren autenticación. El health check sigue público en `GET /api/health/`.

Creá un usuario administrador local:

```bash
python manage.py createsuperuser
```

La app móvil inicia sesión con ese usuario y contraseña mediante `POST /api/auth/token/` y guarda el token en almacenamiento seguro del dispositivo cuando está disponible. Para scripts locales, enviá el token así:

```http
Authorization: Token <token-value>
```

También podés crear o inspeccionar un token manualmente:

```bash
python manage.py drf_create_token <admin-username>
```

### PostgreSQL opcional

Desde la raíz del repositorio:

```bash
set POSTGRES_PASSWORD=replace-with-local-postgres-password
docker compose up -d db
```

Luego configurá `backend/.env`:

```env
DB_ENGINE=postgres
POSTGRES_DB=medusa_store
POSTGRES_USER=medusa
POSTGRES_PASSWORD=replace-with-local-postgres-password
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
```

## Configuración móvil

```bash
cd mobile
npm install
npm start
```

La app móvil toma la URL del backend desde `EXPO_PUBLIC_API_BASE_URL`. Para pruebas locales, podés dejar el valor por defecto apuntando a `http://127.0.0.1:8000/api`. Para Vercel, configurá esa variable con la URL pública de Render, por ejemplo `https://medusa-store-backend.onrender.com/api`.

Para web en Vercel, exportá la app con:

```bash
cd mobile
npm run build:web
```

Eso genera `mobile/dist`, que es lo que Vercel sirve.

## Pantallas principales

- **Inicio**: métricas generales de artículos activos, vendidos, valor disponible, valor vendido y contenedores.
- **Inventario**: tarjetas tipo e-commerce con foto, precio, contenedor, filtros y paginación anterior/siguiente.
- **Agregar**: formulario de alta con código `ITEM-` automático, opción de código personalizado, selector buscable de contenedor y fotos.
- **Contenedores**: creación de contenedores, tipos caja/bolsa/otro, detalle con productos del contenedor y sección QR imprimible.
- **Vendidos**: listado paginado de artículos vendidos y edición de precio, descripción y etiquetas.
- **Escanear**: búsqueda por QR/código de artículos o contenedores.

## Endpoints principales

- `GET /api/items/summary/` — métricas del tablero.
- `GET /api/containers/` — listar contenedores.
- `POST /api/containers/` — crear un contenedor de tipo caja, bolsa u otro.
- `GET /api/containers/scan/{code}/` — buscar un contenedor y sus artículos activos por `code` o `qr_value`.
- `GET /api/items/` — listar artículos activos por defecto; acepta filtros como `status=sold`, `search` y `container_code`.
- `POST /api/items/` — crear un artículo.
- `PATCH /api/items/{id}/` — editar campos del artículo como precio, descripción y etiquetas.
- `GET /api/items/scan/{code}/` — buscar un artículo por `code` o `qr_value`.
- `POST /api/items/{id}/mark_sold/` — marcar un artículo como vendido.
- `POST /api/items/{id}/move/` — mover un artículo activo a otro contenedor.
- `POST /api/auth/token/` — intercambiar usuario/contraseña por un token DRF.
- `POST /api/photos/` — subir una foto de artículo como multipart form data.
- `GET /api/movements/` — inspeccionar historial de movimientos.

## Notas de desarrollo

- Los códigos y valores QR se guardan como strings simples para imprimir etiquetas o codificarlos en QR.
- Los artículos vendidos permanecen en la base de datos y en el historial de movimientos, se ocultan del inventario activo por defecto y siguen siendo escaneables por código.
- Los uploads de media se sirven desde Django cuando `DEBUG=True`.
