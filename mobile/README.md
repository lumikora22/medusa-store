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
| `src/core/` | Encapsular fotos, escaneo, etiquetas, respaldos y el bloqueo de exhibición. |

## Reglas de persistencia

- SQLite es la fuente de verdad.
- Los identificadores enteros existentes se conservan durante migraciones.
- Los códigos de prendas y ubicaciones comparten un registro global para evitar ambigüedades al escanear.
- Las fotos se copian a almacenamiento persistente y cualquier fallo compensa archivos parciales.
- Los eventos son inmutables; deshacer crea el evento inverso correspondiente.
- Una restauración valida manifiesto, checksum global, checksum por foto, referencias y colisiones antes de crear un directorio de staging.
- El commit de restauración crea un respaldo completo, reemplaza SQLite, promueve fotos preservando bytes sobrescritos y compensa base y archivos ante cualquier fallo.

## Piezas por prenda

Una prenda del catálogo es un registro que contiene N piezas idénticas, todas en el mismo contenedor.

- `items.quantity` y `items.sold_quantity` son los contadores; `item_sales` guarda cada venta con su cantidad, precio, fecha y cuántas piezas ya se restauraron.
- El estado es consecuencia, no un dato suelto: la prenda es `active` mientras queden piezas y pasa a `sold` solo al llegar a cero.
- Restaurar recorre el historial de la venta más reciente hacia atrás. Sin cantidad, deshace la última venta completa.
- Una prenda vendida a medias nunca salió de su contenedor, así que restaurarla no la reubica; solo se reubica la que estaba vendida por completo.
- `items.sold_price` y `sold_at` quedaron como copia de presentación de la venta abierta más reciente. La verdad de cada venta vive en `item_sales`.
- Los totales de contenedor y del panel de inicio suman piezas, no filas.
- El conteo físico cuenta piezas: congela las piezas esperadas por registro al iniciar y suma una por lectura. Al superar lo esperado, la lectura se informa como extra en vez de descartarse, porque un conteo que oculta un excedente real es peor que uno que muestra un error visible y corregible.

## Modo exhibición

Deja el teléfono como vitrina: solo el catálogo, en modo lectura.

- El estado vive en `app_settings` (`exhibitionMode`); el PIN se guarda como `salt:sha256(salt:pin)` y nunca en claro.
- La aplicación no impone el bloqueo solo ocultando botones: `ExhibitionGuard` en `app/_layout.tsx` devuelve al catálogo cualquier ruta fuera de `/catalog` y `/quick`, así un enlace profundo o una pila de navegación vieja tampoco alcanzan una pantalla que modifique inventario.
- `src/core/security/exhibition-lock.ts` contiene las reglas del PIN y no depende de Expo; `crypto.ts` aporta el adaptador de `expo-crypto`. Esa separación permite probar el bloqueo en Node.
- Un PIN de cuatro dígitos con hash salado protege frente a un cliente curioso, no frente a alguien con acceso al archivo de base de datos y tiempo para probar diez mil combinaciones.
- Un PIN olvidado se recupera con el bloqueo del teléfono (`src/core/security/device-auth.ts`): quien puede desbloquear el dispositivo ya controla la aplicación. La recuperación borra el PIN y apaga el modo, sin tocar el inventario. Si el teléfono no tiene bloqueo configurado o falta el módulo nativo, la opción no se ofrece en lugar de fallar.

**Salir de la aplicación es responsabilidad del sistema operativo.** Ninguna aplicación de terceros
puede activar Acceso Guiado en iOS por código, y el fijado de pantalla de Android requiere módulo
nativo. En el teléfono de exhibición se activa una vez: Acceso Guiado en iOS, Fijar pantalla en Android.

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
