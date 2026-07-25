# @digid/firma-autografa-react

SDK React para integrar el flujo de firma autógrafa de Digid en aplicaciones de terceros.

## Instalación

    npm install @digid/firma-autografa-react

Requiere React >= 18 como peer dependency.

## Uso

    import { FirmaAutografa } from '@digid/firma-autografa-react';
    import '@digid/firma-autografa-react/styles.css';

    <FirmaAutografa
      token={tokenDelFirmante}
      baseUrl="https://app.digid.com.mx"
      onComplete={() => router.push('/gracias')}
      onExit={(reason) => console.log(reason)}   // 'user_exit' | 'already_signed' | 'document_cancelled'
      onError={(err) => console.error(err)}
    />

El flujo cubre: revisión del documento y aceptación de términos → captura de INE frontal
→ INE reverso → creación de firma autógrafa → colocación de firmas sobre el PDF → confirmación.

### Props

| Prop | Tipo | Descripción |
|---|---|---|
| token | string | Token del firmante (obligatorio) |
| baseUrl | string | Origen del backend Digid (default: mismo origen) |
| theme | DigidTheme | Colores opcionales; los estilos del cliente configurados en Digid tienen prioridad |
| termsUrl | string | URL de términos y condiciones |
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
  `POST /api/asignado/autografa/save_file`, `POST /api/archivofirma/finish_autografa`
  y los recursos estáticos de `/storage/files`.

## Seguridad

- Todo el estado vive en memoria (sin localStorage/sessionStorage).
- Las imágenes se validan por magic bytes, se limitan a 10 MB y se re-encodean
  a JPEG (se eliminan metadatos EXIF, incluido GPS).
- La cámara se apaga en cuanto se captura o se desmonta el componente.
- Sin scripts de terceros en runtime (pdf.js va empaquetado como dependencia).
- Los colores de marca del backend se validan (solo hex) antes de inyectarse como CSS variables.

## Desarrollo

    npm install
    npm test            # vitest (75 tests)
    npm run typecheck
    npm run build       # tsup → dist/
    npm run dev         # playground en http://localhost:5199/?token=<token>

El playground hace proxy de /api, /storage y /docments a http://127.0.0.1:8000
(backend Laravel local).

### Pendiente de verificar contra el backend real

- `save_file` con el dataURL de la firma en el campo `webCamera` para `step=firma`
  (el flujo legacy lo manda en `file`; el backend procesa dataURL en ambos según el análisis,
  confirmar en el playground y ajustar `ApiClient.saveFile` si es necesario).
- Paridad visual del tamaño de overlay de firmas (fijo 100×50 vs legacy responsivo).
