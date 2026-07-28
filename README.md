# @digid/firma-autografa-react

SDK React para integrar el flujo de firma autógrafa de Digid en aplicaciones de terceros.

> 📘 **¿Vas a integrar el SDK en tu proyecto?** Lee la
> [Guía de integración para clientes](docs/GUIA-INTEGRACION.md) — requisitos, ejemplos
> (Vite/Next.js), referencia de props, theming, permisos, CSP y solución de problemas.

## Instalación

    npm install @digid/firma-autografa-react

Requiere React >= 18 como peer dependency.

## Uso

    import { FirmaAutografa } from '@digid/firma-autografa-react';
    import '@digid/firma-autografa-react/styles.css';

    <FirmaAutografa
      token={tokenDelFirmante}
      baseUrl="https://digidmexico.com.mx"   // pruebas: https://pruebas.digidmexico.com.mx
      onComplete={() => router.push('/gracias')}
      onExit={(reason) => console.log(reason)}   // 'user_exit' | 'already_signed' | 'document_cancelled'
      onError={(err) => console.error(err)}
    />

El flujo cubre: revisión del documento y aceptación de términos → captura de INE frontal
→ INE reverso → selfie (opcional) → creación de firma autógrafa → colocación de firmas
sobre el PDF → confirmación. Las pantallas de INE frontal/reverso y selfie son
condicionales: se muestran u omiten según las preferencias del documento configuradas en
Digid (`Data.preferences` de `start_autografa`); si el backend no envía esas preferencias
(o las envía incompletas), el SDK muestra las tres pantallas por default. Los firmantes
Representante Legal (con firma y contraseña ya registradas en Digid) firman directo desde
la pantalla de revisión, sin las pantallas de identificación/selfie. El contenedor raíz
(`.digid-root`) trae `max-width: 900px` y se centra solo dentro de tu página. En la vista de
revisión, el visor de PDF incluye controles de zoom (50%–300%) y navegación rápida entre
páginas.

En los pasos de INE y selfie, la cámara muestra un marco guía y captura automáticamente en
cuanto detecta —en el propio dispositivo, sin enviar nada a ningún servidor— el documento o
rostro bien encuadrado y nítido; la captura manual con archivo o botón siempre está
disponible como alternativa. Ver la [guía de integración](docs/GUIA-INTEGRACION.md#12-captura-automática)
para el detalle de assets, `detectionAssets` y CSP.

### Props

| Prop | Tipo | Descripción |
|---|---|---|
| token | string | Token del firmante (obligatorio) |
| baseUrl | string | Origen del backend Digid (default: mismo origen) |
| theme | DigidTheme | Colores opcionales; los estilos del cliente configurados en Digid tienen prioridad |
| termsUrl | string | URL de términos y condiciones |
| detectionAssets | DetectionAssets | URLs propias para autoalojar los modelos de detección de la captura automática (default: CDNs públicos) |
| onComplete | () => void | Proceso terminado con éxito |
| onExit | (reason: string) => void | El firmante salió sin completar |
| onError | (error: Error) => void | Error irrecuperable (token inválido, red) |

### Visor PDF en consumidores CommonJS

El worker de pdf.js se resuelve automáticamente en bundlers ESM (Vite, Next.js, webpack 5).
Si tu proyecto consume el build CommonJS, pasa la URL del worker manualmente al componente
`PdfViewer` exportado, o configura `pdfjs-dist/build/pdf.worker.min.mjs` como asset accesible.

## Requisitos del backend

- CORS: agregar el dominio del integrador al allowlist de `config/cors.php`
  (no usar `*` junto con `supports_credentials: true`).
- Endpoints consumidos: `GET /api/archivofirma/start_autografa`, `GET /api/asignado/autografa`,
  `POST /api/asignado/autografa/save_file`, `POST /api/archivofirma/finish_autografa`,
  `POST /api/archivofirma/valid_repre` y `POST /api/firmante/forgot_pwd_rl` (estos dos
  últimos solo aplican a firmantes Representante Legal), y los recursos estáticos de
  `/storage/files`.

## Seguridad

- Todo el estado vive en memoria (sin localStorage/sessionStorage).
- Las imágenes se validan por magic bytes, se limitan a 10 MB y se re-encodean
  a JPEG (se eliminan metadatos EXIF, incluido GPS).
- La cámara se apaga en cuanto se captura o se desmonta el componente.
- Sin scripts de terceros en runtime (pdf.js va empaquetado como dependencia); la captura
  automática carga de forma perezosa (solo al abrir la cámara) modelos de detección on-device
  para rostro/código de barras — el análisis corre enteramente en el navegador, nunca se
  envían frames de video a Digid ni a terceros (ver la guía de integración para detalle y CSP).
- Los colores de marca del backend se validan (solo hex) antes de inyectarse como CSS variables.

## Desarrollo

    npm install
    npm test            # vitest (183 tests)
    npm run typecheck
    npm run build       # tsup → dist/
    npm run dev         # playground en http://localhost:5199/?token=<token>

El playground hace proxy de /api, /storage y /docments a http://127.0.0.1:8000
(backend Laravel local).

Para probar la cámara desde un celular (getUserMedia exige HTTPS):

    npm run dev:movil   # HTTPS autofirmado + expuesto en la red local

Abre en el celular la URL "Network" que imprime Vite (p. ej.
https://192.168.0.33:5199/?token=...), acepta la advertencia del certificado
autofirmado y la cámara funcionará. Mac y celular deben estar en la misma red.

### Pendiente de verificar contra el backend real

- `save_file` para `step=firma` envía el dataURL de la firma como string en el campo
  `file` (no `webCamera`), confirmado contra `AsignadoController::saveSignatoryFile`
  (~línea 666), que en esa rama solo lee `file`. Los pasos de INE siguen mandando el
  dataURL en `webCamera`, como el flujo legacy.
- El tamaño del overlay de previsualización de firma se calcula matemáticamente a
  partir del rectángulo de 37×24mm físicos que el backend estampa sobre el PDF
  final (`SignatureNotificationService`, FPDI/FPDF), usando las dimensiones
  físicas reales de cada página (`PageInfo.widthPt`/`heightPt`): coincide con lo
  estampado a cualquier zoom o tamaño de contenedor, sin depender de verificación
  visual contra el legacy.
- Confirmar que `/docments/verarchivo/{id}` funciona para firmantes externos en un
  origen cross-origin (dominio del integrador distinto al del backend Digid).
- Confirmar con un token real cuál id se usa para las rutas de storage del cliente
  (`client.id` vs `document.client`).
