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

## Regresión de plataforma

- [ ] La aplicación inicia sin conexión.
- [ ] Las cinco pestañas y todos los enlaces profundos abren la pantalla correcta.
- [ ] Los controles principales miden al menos 48 × 48 y funcionan con tamaño de texto aumentado.
- [ ] El teclado no oculta acciones de guardado.
- [ ] Cerrar y volver a abrir conserva el estado persistido.
