# Medusa Store

Aplicación móvil local-first para administrar ropa completamente nueva proveniente de lotes de liquidación de Amazon y tiendas departamentales de Estados Unidos. No gestiona ropa usada ni ropa de paca. La operación diaria funciona sin cuenta, servidor ni conexión: prendas, fotos, ubicaciones, ventas e historial permanecen en el dispositivo.

## Inicio rápido

```bash
cd mobile
npm install
npm start
```

Desde Expo se puede abrir Android, iOS o web. Para validar el proyecto:

```bash
npm test
npm run typecheck
npm run build:web
```

## Funciones principales

- **Inicio**: resumen de prendas, valor disponible, ventas, ubicaciones y pendientes.
- **Catálogo**: búsqueda, filtros, orden, vistas cuadrícula/lista/rápida y acciones por selección.
- **Escáner universal**: resuelve códigos de prendas y ubicaciones con bloqueo de lecturas duplicadas.
- **Ubicaciones**: cajas, bolsas, racks, estantes, exhibición, transición y otras ubicaciones.
- **Prendas**: alta guiada, edición, fotos ordenables, venta, restauración e historial.
- **Traslados**: movimiento atómico de varias prendas y deshacer durante una ventana limitada.
- **Etiquetas**: códigos QR y Code 128 listos para imprimir o compartir como PDF.
- **Respaldo**: exportación y restauración validada de datos y fotos.

## Datos locales

SQLite es la fuente de verdad. Las fotos se copian al almacenamiento persistente de la aplicación; no dependen de las rutas temporales del selector de imágenes.

La inicialización aplica migraciones incrementales y no destructivas. Si existe una instalación anterior, conserva sus tablas e identificadores enteros, valida colisiones de códigos y agrega las estructuras normalizadas de la versión actual. Antes de una migración sensible se intenta crear una copia de seguridad de la base.

Los artículos vendidos no se eliminan. Permanecen disponibles para consulta, escaneo, restauración e historial.

## Respaldo y restauración

El archivo `.medusa-backup` contiene:

- versión del formato y fecha de creación;
- filas lógicas de SQLite;
- fotos codificadas en base64;
- checksum SHA-256 para detectar archivos dañados o alterados.

La restauración requiere confirmación explícita. Primero valida el manifiesto, los checksums, las referencias y la unicidad global de códigos; después prepara datos y fotos en un directorio aislado. Antes de modificar SQLite crea un respaldo completo de seguridad. Si falla la promoción de fotos o cualquier paso posterior, restaura las filas y los bytes anteriores en sus rutas originales.

Para mover el inventario a otro dispositivo, exporte el respaldo desde **Más > Respaldo**, comparta el archivo y restáurelo en la nueva instalación.

## Arquitectura móvil

```text
app/                         Expo Router: rutas y cinco pestañas
src/ui/                      pantallas, componentes y hooks
src/application/             InventoryService, fachada de casos de uso
src/domain/                  modelos, validaciones y errores
src/data/repositories/       consultas y transacciones por capacidad
src/data/sqlite/             cliente y migraciones
src/core/files/              almacenamiento persistente de fotos
src/core/scanner/            control de lecturas duplicadas
src/core/labels/             QR, Code 128, impresión y PDF
src/core/backup/             exportación, validación y restauración
```

Las pantallas llaman a `InventoryService`; no ejecutan SQL. Los repositorios son los únicos responsables de consultar o modificar SQLite. Los adaptadores de archivos, escáner, etiquetas y respaldos aíslan APIs nativas y efectos externos.

## Backend

`backend/` conserva la API Django/DRF histórica como proyecto independiente. La aplicación móvil actual no consume esa API ni requiere `EXPO_PUBLIC_API_BASE_URL`.

Para ejecutar el backend por separado:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python manage.py migrate
python manage.py runserver
```

La API se publica localmente en `http://127.0.0.1:8000/api/`. En entornos sin `DEBUG`, configure `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, CORS y una base de datos adecuada antes de desplegar.

## Desarrollo

- Mantenga el SQL dentro de `src/data/repositories` o `src/data/sqlite`.
- Exponga operaciones nuevas mediante `InventoryService`.
- Conserve las pruebas de comportamiento junto a la capa que validan; use la base SQLite WASM inyectable para migraciones y repositorios.
- No edite datos persistidos con migraciones destructivas; toda evolución debe conservar instalaciones existentes.
- Incluya las pruebas y la documentación de cada comportamiento en la misma unidad de cambio.

## Web y rutas directas

Vercel usa `mobile/vercel.json` para reescribir cualquier ruta de Expo Router hacia `index.html`. Después de `npm run build:web`, la vista previa equivalente se inicia desde `mobile/` con `npm run preview:web`; la opción `serve -s` activa el fallback SPA.

Un servidor estático sin reglas de reescritura puede abrir `/` y navegar del lado cliente, pero devolverá 404 al solicitar directamente rutas como `/backup` o `/items/1`. Configure un fallback equivalente en cualquier hosting alternativo; no basta con copiar `dist/`.
