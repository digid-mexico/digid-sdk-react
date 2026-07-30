# @digid/firma-autografa-react

SDK React para integrar el flujo de firma autógrafa de Digid en aplicaciones de terceros.

> 📘 **¿Vas a integrar el SDK en tu proyecto?** Lee la
> [Guía de integración para clientes](docs/GUIA-INTEGRACION.md) — requisitos, ejemplos
> (Vite/Next.js), referencia de props, theming, permisos, CSP y solución de problemas.

- **Repositorio:** https://github.com/digid-mexico/digid-sdk-react
- **Reportar un problema:** https://github.com/digid-mexico/digid-sdk-react/issues

## Instalación

```bash
npm install @digid/firma-autografa-react
```

React >= 18 y React DOM >= 18 son peer dependencies: deben existir en tu proyecto,
el SDK no los instala ni los empaqueta.

Además de importar el componente, hay **dos pasos de instalación que no son
opcionales** si quieres el flujo completo:

1. Importar la hoja de estilos (`@digid/firma-autografa-react/styles.css`); sin ella
   el SDK se renderiza sin ningún estilo.
2. Copiar la carpeta `scan-assets/` del paquete a tu directorio de estáticos, porque
   el Web Worker de escaneo de INE exige mismo origen y no puede servirse desde un
   CDN. Si no lo haces el flujo no se rompe, pero los pasos de INE se degradan a
   captura manual (ver [sección 1.3](docs/GUIA-INTEGRACION.md#13-escaneo-de-documentos-ine)).

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

En los pasos de INE frente/reverso, el firmante ve primero una pantalla de instrucción y
luego la cámara con un marco guía ID-1: el SDK detecta y **recorta automáticamente** el
documento (contorno + corrección de perspectiva vía OpenCV, en el propio dispositivo, sin
enviar nada a ningún servidor) en cuanto queda bien alineado dentro del marco y nítido, y
muestra un preview con el recorte antes de continuar. En el paso de selfie, el firmante
también ve primero una instrucción y luego la cámara frontal, que detecta el rostro
(MediaPipe) para su propia captura automática dentro de un óvalo guía. La captura manual
con el botón o la carga de una foto desde archivo/galería siempre están disponibles como
alternativa en los tres pasos. Ver la
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
- Todas las rutas de subida de imagen (INE, selfie y el botón de galería del
  escáner) validan por magic bytes, limitan el archivo a 10 MB y rechazan
  imágenes que decodifiquen a más de 50 MP (bombas de descompresión).
- Las imágenes se re-encodean a JPEG, lo que elimina los metadatos EXIF
  (incluido GPS). Excepción conocida: si el re-encode falla, los pasos de INE y
  selfie suben el archivo original **con EXIF intacto** — ver `normalizeToJpeg`
  en `src/utils/image.ts`.
- El token puede mandarse en un header en vez de la query string
  (`tokenTransport`), para que no quede escrito en los logs de acceso.
- La cámara se apaga en cuanto se captura o se desmonta el componente.
- Sin scripts de terceros en runtime (pdf.js va empaquetado como dependencia); la captura
  automática carga de forma perezosa (solo al abrir la cámara) modelos de detección on-device
  para rostro/código de barras — el análisis corre enteramente en el navegador, nunca se
  envían frames de video a Digid ni a terceros (ver la guía de integración para detalle y CSP).
- Los colores de marca del backend se validan (solo hex) antes de inyectarse como CSS variables.

## Versionado y publicación

El paquete sigue [SemVer](https://semver.org). Mientras la versión sea `0.x`, una
subida de **minor** (`0.8` → `0.9`) puede traer cambios incompatibles; fija el rango
en tu `package.json` si necesitas estabilidad estricta.

El proceso de publicación y el flujo de release están en
[docs/PUBLICACION.md](docs/PUBLICACION.md).

## Desarrollo

    npm install
    npm test            # vitest
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

Las notas de contrato con el backend y los puntos pendientes de verificar contra un
entorno real están en [docs/PENDIENTES-BACKEND.md](docs/PENDIENTES-BACKEND.md).

## Licencia

[Apache-2.0](LICENSE) — Copyright 2026 CONSTANCIAS DIGITALES.

El SDK es software libre bajo esa licencia, pero **no reemplaza al contrato de
servicio**: el flujo de firma solo funciona contra la plataforma de Digid con un
token de firmante válido, que se obtiene con una cuenta activa.

Las atribuciones de terceros redistribuidos dentro del paquete (OpenCV, jscanify)
están en [NOTICE](NOTICE).
