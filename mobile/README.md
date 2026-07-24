# Arquitectura móvil

La aplicación móvil es local-first: `InventoryService` coordina los casos de uso, los repositorios controlan SQLite y los adaptadores encapsulan archivos y APIs nativas. Ninguna pantalla debe importar SQL ni el backend Django.

## Flujo de una operación

```text
Ruta Expo Router
  -> pantalla en src/ui
  -> InventoryService
  -> repositorio o adaptador
  -> SQLite / sistema de archivos / API nativa
```

## Responsabilidades

| Capa | Responsabilidad |
| --- | --- |
| `app/` | Declarar rutas, pestañas y títulos. |
| `src/ui/` | Renderizar estado y capturar intención del usuario. |
| `src/application/` | Coordinar operaciones y ofrecer una API estable a la UI. |
| `src/domain/` | Definir modelos, validaciones y errores independientes de Expo. |
| `src/data/repositories/` | Ejecutar consultas y transacciones por capacidad. |
| `src/data/sqlite/` | Abrir SQLite y aplicar migraciones no destructivas. |
| `src/core/` | Encapsular fotos, escaneo, etiquetas y respaldos. |

## Reglas de persistencia

- SQLite es la fuente de verdad.
- Los identificadores enteros existentes se conservan durante migraciones.
- Los códigos de prendas y ubicaciones comparten un registro global para evitar ambigüedades al escanear.
- Las fotos se copian a almacenamiento persistente y cualquier fallo compensa archivos parciales.
- Los eventos son inmutables; deshacer crea el evento inverso correspondiente.
- Una restauración valida manifiesto, checksum global, checksum por foto, referencias y colisiones antes de crear un directorio de staging.
- El commit de restauración crea un respaldo completo, reemplaza SQLite, promueve fotos preservando bytes sobrescritos y compensa base y archivos ante cualquier fallo.

## Comandos

```bash
npm start
npm test
npm run typecheck
npm run build:web
npm run preview:web
```

Las pruebas ejecutables usan `node:test` mediante `tsx`. `sql.js` proporciona SQLite WASM para validar migraciones, transacciones, repositorios, ventas, traslados, conteos y rollback de respaldos sin reemplazar las verificaciones nativas.

`npm run preview:web` sirve `dist/` con fallback SPA para comprobar rutas directas. Vercel declara la misma estrategia en `vercel.json`; otros servidores estáticos necesitan una regla equivalente hacia `index.html`.

Antes de publicar una versión móvil, complete `MANUAL_TESTS.md` en un dispositivo Android y uno iOS.
