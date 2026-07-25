# Pruebas manuales de publicación

Complete esta lista en un dispositivo Android y uno iOS antes de distribuir una versión. Use datos desechables y conserve un respaldo externo para probar la restauración.

## Cámara y permisos

- [ ] Rechazar el permiso muestra una explicación y permite solicitarlo nuevamente.
- [ ] Aceptar el permiso abre la cámara sin reiniciar la aplicación.
- [ ] La luz se enciende y apaga desde Escanear y Traslado.
- [ ] QR, Code 128, Code 39 y EAN-13 se resuelven correctamente.
- [ ] Dos lecturas consecutivas del mismo código generan una sola acción.
- [ ] Una lectura válida produce confirmación visual y háptica.

## Fotografías y archivos

- [ ] Tomar una foto y elegir varias desde la galería solicita solo los permisos necesarios.
- [ ] Las fotos continúan visibles después de cerrar y volver a abrir la aplicación.
- [ ] Agregar, reemplazar, eliminar, reordenar y elegir portada conserva el orden esperado.
- [ ] Cancelar el selector no crea registros ni archivos parciales.

## Inventario y movimientos

- [ ] Crear y editar una prenda conserva precio, descripción, etiquetas y ubicación.
- [ ] Crear una ubicación genera un código único y permite imprimirlo nuevamente.
- [ ] Un traslado múltiple aplica todas las prendas o ninguna.
- [ ] Una prenda vendida no puede moverse.
- [ ] Deshacer un traslado dentro del plazo restaura cada ubicación original.
- [ ] Vender y restaurar requieren confirmación y dejan eventos comprensibles.

## Piezas por prenda

- [ ] Crear una prenda con 1 pieza se ve igual que antes, sin pasos extra.
- [ ] Crear una prenda con varias piezas muestra "N de N" en la tarjeta del catálogo.
- [ ] Vender parte de las piezas deja la prenda en el catálogo con el resto disponible.
- [ ] Vender la última pieza mueve la prenda al filtro de Vendidas sin intervención.
- [ ] Restaurar sin elegir cantidad devuelve exactamente la última venta del historial.
- [ ] Restaurar una prenda vendida a medias no cambia su contenedor.
- [ ] Restaurar una prenda vendida por completo la devuelve a su última ubicación.
- [ ] El precio mostrado tras restaurar corresponde a la venta abierta más reciente.
- [ ] Reducir las piezas por debajo de las vendidas se rechaza y no cambia nada.
- [ ] El contenedor y el panel de inicio cuentan piezas, no registros.
- [ ] Vender desde la selección múltiple vende una pieza de cada prenda y deshacer las devuelve.
- [ ] Un conteo físico espera la suma de piezas disponibles del contenedor, no la cantidad de registros.
- [ ] Leer varias veces el mismo código cuenta una pieza por lectura hasta llegar a lo esperado.
- [ ] La lectura que supera lo esperado aparece como pieza extra, no como lectura repetida.
- [ ] Las piezas ya vendidas no se esperan en el conteo.
- [ ] Un conteo abierto antes de actualizar la aplicación sigue funcionando y espera una pieza por registro.

## Etiquetas e impresión

- [ ] La vista previa muestra Code 128 o QR legible según la plantilla elegida.
- [ ] El PDF respeta tamaño, cantidad y selección de registros.
- [ ] Imprimir abre el diálogo del sistema y conserva márgenes completos.
- [ ] Compartir genera un PDF que otra aplicación puede abrir.

## Respaldo y restauración

- [ ] Crear un respaldo incluye datos, historial, ajustes y todas las fotos.
- [ ] Compartir o guardar produce un archivo `.medusa-backup` accesible fuera de la aplicación.
- [ ] Un archivo alterado o incompatible se rechaza sin cambiar datos.
- [ ] Cancelar la confirmación conserva el inventario actual.
- [ ] Restaurar crea primero un respaldo de seguridad y recupera datos y fotos.
- [ ] La fecha del último respaldo se actualiza al finalizar.

## Modo exhibición

- [ ] Activarlo desde Ajustes pide el PIN dos veces y rechaza dos PIN distintos.
- [ ] Al activarlo la aplicación queda en Catálogo, sin barra de pestañas y sin botón de agregar.
- [ ] Búsqueda, filtros, contenedor, orden y cambio de vista siguen funcionando.
- [ ] Mantener presionada una prenda no inicia selección múltiple ni muestra acciones.
- [ ] Tocar una prenda abre la vista rápida sin botones de editar, mover, imprimir ni vender.
- [ ] Un enlace profundo a `/items/new`, `/transfer`, `/settings` o `/backup` regresa al catálogo.
- [ ] Cerrar y volver a abrir la aplicación sigue en modo exhibición.
- [ ] El candado del encabezado solo responde a pulsación larga, no a un toque.
- [ ] Un PIN incorrecto muestra el error y mantiene el modo activo.
- [ ] El PIN correcto restaura las cinco pestañas y todas las acciones.
- [ ] "Olvidé el PIN" abre el bloqueo del teléfono y acepta huella, rostro o PIN del dispositivo.
- [ ] Cancelar ese bloqueo mantiene el modo exhibición activo.
- [ ] Recuperar por bloqueo del teléfono conserva prendas, ubicaciones, fotos e historial.
- [ ] Tras recuperar, activar el modo de nuevo pide elegir un PIN nuevo.
- [ ] En un teléfono sin bloqueo de pantalla configurado, el botón "Olvidé el PIN" no aparece.

## Bloqueo del sistema operativo

El modo exhibición impide modificar el inventario, pero no impide salir de la aplicación:
eso lo controla el sistema operativo y se configura una sola vez en el teléfono de exhibición.

- [ ] iOS: Ajustes → Accesibilidad → Acceso Guiado, activado y con código propio; iniciar con triple clic del botón lateral.
- [ ] Android: Ajustes → Seguridad → Fijar pantalla (o Fijar apps), activado y con solicitud de PIN al desfijar.
- [ ] Con el bloqueo activo, los gestos de inicio y multitarea no salen de la aplicación.

## Regresión de plataforma

- [ ] La aplicación inicia sin conexión.
- [ ] Las cinco pestañas y todos los enlaces profundos abren la pantalla correcta.
- [ ] Los controles principales miden al menos 48 × 48 y funcionan con tamaño de texto aumentado.
- [ ] El teclado no oculta acciones de guardado.
- [ ] En cada pantalla con campos, el último campo queda visible al escribir.
- [ ] En un teléfono con botones de navegación (sin gestos), esa barra no tapa botones ni contenido.
- [ ] La barra de acciones de selección del catálogo queda por encima de la barra de navegación.
- [ ] En Agregar prenda se puede volver a Fotos o Información tocando el paso en el encabezado.
- [ ] Tocar el paso Ubicación sin precio avisa y deja el flujo en Información.
- [ ] Cerrar y volver a abrir conserva el estado persistido.
