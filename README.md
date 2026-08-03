# @digid-sdk/firma-autografa-react

SDK React para integrar el flujo de firma autógrafa de Digid en aplicaciones de terceros.

> 📘 **¿Vas a integrar el SDK en tu proyecto?** Lee la
> [Guía de integración para clientes](docs/GUIA-INTEGRACION.md) — requisitos, ejemplos
> (Vite/Next.js), referencia de props, theming, permisos, CSP y solución de problemas.

- **Repositorio:** https://github.com/digid-mexico/digid-sdk-react
- **Reportar un problema:** https://github.com/digid-mexico/digid-sdk-react/issues

## Instalación

```bash
npm install @digid-sdk/firma-autografa-react
```

React >= 18 y React DOM >= 18 son peer dependencies: deben existir en tu proyecto,
el SDK no los instala ni los empaqueta.

Además de instalar el paquete hay **dos pasos más**, y conviene no saltárselos:

**1. Importar la hoja de estilos.** Sin ella el SDK se renderiza sin ningún formato.

```ts
import '@digid-sdk/firma-autografa-react/styles.css';
```

**2. Copiar `scan-assets/` a tu directorio de estáticos.**

```bash
cp -R node_modules/@digid-sdk/firma-autografa-react/scan-assets public/digid-scan
```

Es el escáner de INE (OpenCV en un Web Worker). Hay que copiarlo porque
`new Worker()` exige **mismo origen** y el navegador no permite construirlo desde un
CDN — a diferencia de los modelos de la selfie, que sí se sirven remotos.

Como `node_modules` no se versiona, engancha la copia a tu `postinstall` para que se
repita en cada instalación:

```json
"postinstall": "cp -R node_modules/@digid-sdk/firma-autografa-react/scan-assets public/digid-scan"
```

Si lo omites **el flujo de firma sigue funcionando**: los pasos de INE se degradan a
captura manual, sin detección en vivo ni corrección de perspectiva, y la imagen de la
identificación se guarda como haya quedado dentro del marco. La selfie no se ve
afectada. El detalle y cómo verificar que quedó bien están en la
[sección 1.3 de la guía](docs/GUIA-INTEGRACION.md#13-escaneo-de-documentos-ine).

## Uso

    import { FirmaAutografa } from '@digid-sdk/firma-autografa-react';
    import '@digid-sdk/firma-autografa-react/styles.css';

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

En los pasos de INE frente/reverso, el firmante ve primero una pantalla de instrucción y
luego la cámara con un marco guía ID-1: el SDK detecta y **recorta automáticamente** el
documento (contorno + corrección de perspectiva vía OpenCV, en el propio dispositivo, sin
enviar nada a ningún servidor) en cuanto queda bien alineado dentro del marco y nítido, y
muestra un preview con el recorte antes de continuar. La captura manual con el botón o la
carga de una foto desde archivo/galería siempre están disponibles como alternativa en
estos dos pasos. En el paso de selfie, la cámara frontal se abre de inmediato —**sin
pantalla de instrucción ni alternativa de archivo: la selfie es obligatoria por
cámara**— y detecta el rostro (MediaPipe) para su propia captura automática dentro de un
óvalo guía. Ver la
[guía de integración](docs/GUIA-INTEGRACION.md#12-captura-automática) para el detalle de
`detectionAssets` (selfie) y la [sección 1.3](docs/GUIA-INTEGRACION.md#13-escaneo-de-documentos-ine)
para `scanAssets` (INE) y CSP.

El paquete incluye, bajo `scan-assets/`, el núcleo de escaneo/recorte de documentos con
OpenCV que usan los pasos de INE (ver la
[guía de integración](docs/GUIA-INTEGRACION.md#13-escaneo-de-documentos-ine)): a diferencia
de los modelos de detección de la sección anterior, el Web Worker que lo usa exige mismo
origen (no puede cargarse desde un CDN), así que **debes copiar esa carpeta a tu directorio
de estáticos** para que el escáner funcione — si no la sirves, el SDK se degrada
automáticamente a captura manual con el marco guía (sin recorte ni detección automática),
sin romper el flujo.

### Props

| Prop | Tipo | Descripción |
|---|---|---|
| token | string | Token del firmante (obligatorio) |
| baseUrl | string | Origen del backend Digid (default: mismo origen) |
| tokenTransport | 'both' \| 'header' \| 'query' | Cómo viaja el token (default: `'both'`). Cambia a `'header'` en cuanto el backend lea `X-Digid-Token` — ver sección 5.1 de la guía |
| theme | DigidTheme | Colores opcionales; los estilos del cliente configurados en Digid tienen prioridad |
| termsUrl | string | URL de términos y condiciones |
| pdfWorkerUrl | string | URL del worker de `pdfjs-dist` para el visor de PDF (default: resolución automática, con fallback a `/digid-scan/pdf.worker.min.mjs`) — ver más abajo |
| detectionAssets | DetectionAssets | URLs propias para autoalojar los modelos de detección de la captura automática (default: CDNs públicos); solo usados por la selfie — ver nota abajo sobre `zxingWasmUrl` |
| scanAssets | ScanAssets | URL propia del worker de escaneo OpenCV (default: `/digid-scan/scan-worker.js`), usado por los pasos de INE frente/reverso para el recorte automático del documento; requiere servir `scan-assets/` en tu propio origen (ver sección 1.3 de la guía) |
| onComplete | () => void | Proceso terminado con éxito |
| onExit | (reason: string) => void | El firmante salió sin completar |
| onError | (error: Error) => void | Error irrecuperable (token inválido, red) |

> **Nota sobre `detectionAssets.zxingWasmUrl`.** Antes de esta versión, el reverso de la
> INE usaba lectura de código QR/PDF417 (zxing-wasm) para la captura automática. Ahora ese
> paso usa el escáner de documentos con OpenCV (marco guiado + recorte de perspectiva, ver
> sección 1.3 de la guía), así que `zxingWasmUrl` queda sin uso — se mantiene en el tipo
> `DetectionAssets` por compatibilidad, reservado por si un futuro paso vuelve a
> necesitarlo.

### Worker del visor PDF

**No asumas que se resuelve solo.** El SDK intenta resolver el worker de pdf.js vía
`import.meta.url`, pero Vite (y otros bundlers basados en esbuild) no reescriben esa URL
al pre-empaquetar dependencias: el worker puede devolver 404 en silencio y el visor se
queda en "Página de 0". Si ya sirves `scan-assets/` (paso 2 de arriba) no necesitas nada
más — esa carpeta incluye `pdf.worker.min.mjs` y el visor cae ahí si la resolución
automática falla. Si no, pasa la URL con la prop `pdfWorkerUrl` de `<FirmaAutografa>` (o
`workerSrc` si usas `PdfViewer` por separado). Detalle completo en la
[sección 10.2 de la guía](docs/GUIA-INTEGRACION.md#102-worker-del-visor-pdf-todos-los-proyectos).

## Requisitos del backend

- CORS: agregar el dominio del integrador al allowlist de `config/cors.php`
  (no usar `*` junto con `supports_credentials: true`).
- Endpoints consumidos: `GET /api/archivofirma/start_autografa`, `GET /api/asignado/autografa`,
  `GET /api/archivofirma/document_pdf`, `GET /api/archivofirma/signature_image`,
  `POST /api/asignado/autografa/save_file`, `POST /api/archivofirma/finish_autografa`,
  `POST /api/archivofirma/valid_repre` y `POST /api/firmante/forgot_pwd_rl` (estos dos
  últimos solo aplican a firmantes Representante Legal).
- Requiere un backend con `document_pdf`/`signature_image` (añadidos 2026-07-29); con
  uno más viejo el PDF no cargará cross-origin — el proxy de la sección 6.3 de la
  guía es el workaround mientras se actualiza.

## Seguridad

- Todo el estado vive en memoria (sin localStorage/sessionStorage).
- Todas las rutas de subida de imagen (INE y el botón de galería del escáner;
  la selfie no tiene subida de archivo, es obligatoria por cámara) validan por
  magic bytes, limitan el archivo a 10 MB y rechazan imágenes que decodifiquen
  a más de 50 MP (bombas de descompresión).
- Las imágenes se re-encodean a JPEG, lo que elimina los metadatos EXIF
  (incluido GPS). Excepción conocida: si el re-encode falla, el paso de INE
  sube el archivo original **con EXIF intacto** — ver `normalizeToJpeg` en
  `src/utils/image.ts`.
- El token puede mandarse en un header en vez de la query string
  (`tokenTransport`), para que no quede escrito en los logs de acceso.
- La cámara se apaga en cuanto se captura o se desmonta el componente.
- Sin scripts de terceros en runtime (pdf.js va empaquetado como dependencia); la captura
  automática carga de forma perezosa (solo al abrir la cámara) modelos de detección on-device
  para rostro/código de barras — el análisis corre enteramente en el navegador, nunca se
  envían frames de video a Digid ni a terceros (ver la guía de integración para detalle y CSP).
- Los colores de marca del backend se validan (solo hex) antes de inyectarse como CSS variables.

## API estable vs. motor interno

El paquete expone dos entradas con garantías distintas:

```ts
// Estable: cubierto por SemVer
import { FirmaAutografa } from '@digid-sdk/firma-autografa-react';

// Inestable: motor de escaneo/detección, para UIs de captura propias
import { initDocScan } from '@digid-sdk/firma-autografa-react/engine';
```

El subpath `/engine` expone el escáner con OpenCV, los detectores on-device y los
umbrales de calibración. **No sigue SemVer**: esos umbrales se reajustan con datos
de campo y pueden cambiar en cualquier versión, incluida una patch. Si lo usas, fija
la versión exacta y revisa el [CHANGELOG](CHANGELOG.md) antes de actualizar.

## Versionado y publicación

El paquete sigue [SemVer](https://semver.org) sobre la entrada principal. Las reglas
completas —qué cuenta como major, la matriz de compatibilidad con el backend y la
política de deprecación— están en [docs/VERSIONADO.md](docs/VERSIONADO.md).

- Cambios por versión: [CHANGELOG.md](CHANGELOG.md)
- Proceso de release: [docs/PUBLICACION.md](docs/PUBLICACION.md)

## Desarrollo

    npm install
    npm test            # vitest
    npm run typecheck
    npm run build       # tsup → dist/
    npm run dev         # playground en http://localhost:5199/?token=<token>

El playground hace proxy de /api y /docments a http://127.0.0.1:8000
(backend Laravel local).

Para probar la cámara desde un celular (getUserMedia exige HTTPS):

    npm run dev:movil   # HTTPS autofirmado + expuesto en la red local

Abre en el celular la URL "Network" que imprime Vite (p. ej.
https://192.168.0.33:5199/?token=...), acepta la advertencia del certificado
autofirmado y la cámara funcionará. Mac y celular deben estar en la misma red.

Las notas de contrato con el backend y los puntos pendientes de verificar contra un
entorno real están en [docs/PENDIENTES-BACKEND.md](docs/PENDIENTES-BACKEND.md).

## Licencia

[Apache-2.0](LICENSE) — Copyright 2026 CONSTANCIAS DIGITALES.

El SDK es software libre bajo esa licencia, pero **no reemplaza al contrato de
servicio**: el flujo de firma solo funciona contra la plataforma de Digid con un
token de firmante válido, que se obtiene con una cuenta activa.

Las atribuciones de terceros redistribuidos dentro del paquete (OpenCV, jscanify)
están en [NOTICE](NOTICE).
