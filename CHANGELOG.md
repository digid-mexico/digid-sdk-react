# Changelog

Cambios relevantes de `@digid-sdk/firma-autografa-react`.

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
El proyecto sigue [SemVer](https://semver.org) con las reglas de
[docs/VERSIONADO.md](docs/VERSIONADO.md).

> Las versiones anteriores a la primera publicación en npm (0.1.0 – 0.8.3) se
> reconstruyeron desde los tags del repositorio y se listan como referencia
> histórica; ninguna de ellas llegó al registro.

## [Sin publicar]

### Corregido

- **La captura de INE se quedaba en "Preparando el escáner…" para siempre en
  aplicaciones con `<StrictMode>`.** React monta, desmonta y vuelve a montar en
  desarrollo, produciendo `open() → close() → open()` sobre la cámara en
  milisegundos. Las dos llamadas a `getUserMedia` se solapaban, el navegador
  podía devolver tracks compartidos, y el `stop()` de la primera dejaba muerta a
  la segunda: el `<video>` nunca alcanzaba `readyState 2`. Ahora las aperturas se
  serializan y nunca hay dos peticiones en vuelo.

  Afecta a la mayoría de integraciones: `<StrictMode>` viene por defecto en la
  plantilla de React de Vite.

- **No había salida si la cámara no arrancaba.** El degradado a captura manual
  se evaluaba después de la guarda `video.readyState < 2`, así que solo cubría
  el caso "el worker de escaneo no carga". Con una cámara que no entregaba
  frames —permiso a medias, dispositivo tomado por otra app— el bucle se
  reprogramaba indefinidamente sin mensaje ni alternativa. Ahora el timeout se
  evalúa al inicio de cada tick y siempre hay salida a captura manual.

## [1.0.0] — 2026-07-30

Primera versión publicada en npm. Los cambios marcados con ⚠️ rompen
compatibilidad respecto a 0.8.3, pero como esa versión nunca se publicó, no
afectan a ningún consumidor.

Se numera `1.0.0` y no `0.9.0` porque la superficie pública quedó acotada a ~39
símbolos que sí se pueden sostener bajo SemVer: a partir de aquí, cualquier
ruptura de esa API exige un major. El motor de escaneo queda fuera de esa
promesa, en el subpath `/engine` (ver [docs/VERSIONADO.md](docs/VERSIONADO.md)).

### Añadido

- Prop `tokenTransport` (`'both' | 'header' | 'query'`) para elegir cómo viaja
  el token del firmante. El default `'both'` funciona igual contra el backend
  actual; `'header'` deja de escribirlo en los logs de acceso.
- Subpath `@digid-sdk/firma-autografa-react/engine` con el motor de escaneo y
  detección, declarado como API inestable.
- `LICENSE` (Apache-2.0) y `NOTICE` con las atribuciones de OpenCV y jscanify.
- `docs/PUBLICACION.md`, `docs/VERSIONADO.md` y `docs/PENDIENTES-BACKEND.md`.

### Cambiado

- ⚠️ El paquete pasa de `@digid/firma-autografa-react` a
  `@digid-sdk/firma-autografa-react`: el scope `@digid` ya estaba ocupado.
- ⚠️ El motor de escaneo y detección (~77 símbolos, incluidas las constantes de
  calibración) sale de la entrada principal y se importa desde `/engine`. La
  superficie estable baja de 116 a 39 símbolos.
- La licencia pasa de `UNLICENSED` a `Apache-2.0`, con el copyright a nombre de
  CONSTANCIAS DIGITALES.
- Vista de revisión del documento reorganizada: el PDF ocupa la columna
  izquierda, y saludo, términos y acciones se agrupan en un panel derecho con
  el botón principal a lo ancho.
- El botón "Ajustar al ancho" del visor de PDF pasa a icono; conserva su nombre
  accesible.

### Corregido

- **Seguridad:** la subida de imagen desde el escáner no validaba magic bytes ni
  el tope de 10 MB. Además, ninguna ruta acotaba los píxeles ya decodificados,
  así que una imagen pequeña podía decodificarse a cientos de megapíxeles y
  agotar la memoria del dispositivo. Ahora se rechaza por encima de 50 MP.
- La caja de descarga desbordaba su columna 34 px en móvil y provocaba scroll
  horizontal.
- El toolbar del visor de PDF no cabía en el ancho de la columna en móvil.

## [0.8.3] — 2026-07-28

- Título "Capturar firma", stepper visible solo en escritorio y firma guardada
  contenida dentro del ancho del paso.

## [0.8.2] — 2026-07-28

- Flujo de captura con un solo "Continuar": la cámara autoconfirma en vez de
  pedir un segundo clic. Botón de repetir captura flotando sobre la imagen.

## [0.8.1] — 2026-07-28

- Vista unificada para la imagen ya guardada en el backend y para los archivos
  subidos, con el mismo diseño del preview de captura.

## [0.8.0] — 2026-07-28

- Paso de selfie con instrucción previa y captura con el diseño del prototipo
  KYC.

## [0.7.0] — 2026-07-28

- Núcleo de escaneo de documentos con OpenCV portado del prototipo KYC: worker,
  detección de contorno, corrección de perspectiva y veredicto de calidad.
- `IdCaptureStep` con pantalla de instrucción y escáner de marco guiado.
- `scan-assets/` (opencv.js + scan-worker.js) empaquetados con el SDK.
- Modo `dev:movil` con HTTPS para probar la cámara desde un celular.

## [0.6.0] — 2026-07-28

- Captura guiada con marco, detección automática y respaldo manual.
- Detectores perezosos de rostro (MediaPipe) y de códigos (zxing) con URLs de
  assets configurables.
- Utilidades de nitidez y máquina de estados de auto-captura.

## [0.5.0] — 2026-07-28

- Overlay de firma adaptativo al tamaño real de estampado (37×24 mm), calculado
  desde las dimensiones físicas de cada página del PDF.

## [0.4.0] — 2026-07-27

- Toolbar de zoom (50 %–300 %) y navegación de páginas en `PdfViewer`, con el
  documento cacheado entre cambios de zoom.

## [0.3.0] — 2026-07-27

- Flujo de Representante Legal: firma rápida con contraseña desde la vista de
  revisión, y endpoints correspondientes en `ApiClient`.

## [0.2.0] — 2026-07-27

- Paso de selfie con cámara frontal.
- Orden de pasos dinámico según las preferencias del documento.
- Guía de integración para clientes.

## [0.1.0] — 2026-07-24

- Componente raíz `FirmaAutografa` con el flujo completo integrado.
- Colocación de firmas sobre el PDF con lógica de coordenadas.
- Playground de desarrollo con proxy al backend local.
