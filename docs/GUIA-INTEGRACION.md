# Guía de integración — SDK de Firma Autógrafa de Digid

`@digid/firma-autografa-react` · v0.8.1

Esta guía está dirigida a equipos de desarrollo que quieren integrar el proceso de
**firma autógrafa de Digid** dentro de su propia aplicación web, sin redirigir a sus
usuarios al sitio de Digid. El SDK entrega un componente React que ejecuta el flujo
completo de firma de principio a fin contra la plataforma Digid.

---

## 1. ¿Qué hace el SDK?

Al montar el componente `<FirmaAutografa>`, el firmante recorre dentro de tu aplicación
el mismo proceso certificado que ofrece Digid:

| Paso | Pantalla | Descripción |
|---|---|---|
| 1 | **Revisión del documento** | El firmante ve el PDF a firmar, puede descargarlo y acepta términos y condiciones. Si el documento requiere verificación de identidad, se muestra el aviso de consentimiento KYC. El visor incluye controles de zoom (50%–300%) y navegación rápida entre páginas. |
| 2 | **Identificación (frente)** | El firmante ve primero una pantalla de instrucción con recomendaciones de captura y, al continuar, la cámara se abre con un marco guía ID-1 superpuesto: en cuanto el SDK detecta —en el propio dispositivo, vía OpenCV— la credencial bien alineada dentro del marco y nítida, **recorta automáticamente el documento** (contorno + corrección de perspectiva) y muestra un preview con el recorte antes de continuar. También se puede capturar manualmente en cualquier momento con el botón de la cámara (recorta el marco tal cual, sin gate de calidad) o subir un archivo/foto de galería. |
| 3 | **Identificación (reverso)** | Mismo flujo de instrucción + marco guiado + recorte automático que el paso anterior. |
| 4 | **Selfie** | El firmante ve primero una pantalla de instrucción (mismo estilo que los pasos 2 y 3) y, al continuar, la cámara frontal se abre con un óvalo guía: el SDK detecta el rostro del firmante centrado y a buen tamaño dentro del óvalo para capturar automáticamente, con las mismas alternativas de captura manual o carga de archivo. |
| 5 | **Creación de la firma** | El firmante dibuja su firma autógrafa en un lienzo táctil (funciona con dedo, stylus o mouse). |
| 6 | **Colocación de firmas** | El firmante confirma una por una las posiciones de su firma sobre el documento, viéndolas superpuestas en el PDF real. La previsualización muestra la posición y el tamaño exactos con los que quedará estampada en el documento final (37×24mm físicos). |
| 7 | **Confirmación** | Pantalla de éxito. El documento queda firmado en Digid y tu aplicación recibe el callback `onComplete`. |

> **Pasos condicionales.** Los pasos 2, 3 y 4 (INE frente, INE reverso, selfie) no
> siempre aparecen: se muestran u omiten según las preferencias que se hayan
> configurado para ese documento al crearlo en Digid. Un documento configurado sin
> requerir identificación, por ejemplo, salta directo del paso 1 al paso 5. Esto
> requiere un backend que exponga esas preferencias en `Data.preferences` de
> `start_autografa` (rama `feat/sdk-preferences-flags` del backend de Digid); si tu
> backend todavía no las envía, el SDK muestra las tres pantallas por default (opción
> más segura).

> **Firmantes Representante Legal.** Si el firmante está registrado en Digid como
> Representante Legal con firma y contraseña ya guardadas, el paso 1 muestra en el
> panel lateral su firma autógrafa y un campo de contraseña en vez del flujo normal:
> tras aceptar términos y capturar la contraseña, un único botón "Continuar" valida
> las credenciales contra Digid y, si son correctas, completa la firma de inmediato
> — sin pasar por identificación, selfie ni colocación manual de firmas. Este caso no
> requiere ninguna configuración adicional de tu parte: el SDK lo detecta a partir de
> `Data.repre` en la respuesta de `start_autografa`.

> **Imagen ya guardada.** Si al llegar a los pasos 2, 3 o 4 el backend ya tiene
> guardada la foto correspondiente (p.ej. el firmante retomó un proceso interrumpido),
> el SDK la muestra de inmediato con el mismo diseño del preview de captura, dejando
> claro que es la imagen guardada previamente: el firmante puede continuar con ella o
> repetir la captura, sin volver a subir nada de por medio.

Todo el estado del proceso vive en memoria del navegador: el SDK no usa
`localStorage` ni `sessionStorage`, y apaga la cámara en cuanto termina de usarla.
La única carga de recursos externos en tiempo de ejecución es la de los modelos/worker
de detección on-device usados para la captura automática (ver
[sección 1.2](#12-captura-automática-selfie) para la selfie y
[sección 1.3](#13-escaneo-de-documentos-ine) para la INE); el SDK en sí no carga
scripts de analítica, publicidad ni de ningún otro tipo.

### 1.1 Limitaciones

Los documentos configurados en Digid con verificación de identidad/rostro a través
del proveedor de KYC alojado (liveness) **no están soportados todavía** por este SDK;
ese flujo sigue disponible únicamente en la aplicación web legacy de Digid. Soporte
para este caso está planeado para una versión futura del SDK.

> **Selfie vs. prueba de vida (liveness).** El backend de Digid ya expone los
> endpoints de prueba de vida con verificación en servidor (AWS Face Liveness) que
> usa la aplicación legacy; este SDK **todavía no los integra**. La captura de selfie
> descrita en la sección 1.2 es, hoy, únicamente una **fotografía**: la detección de
> rostro corre en el dispositivo solo para encuadrarla dentro del óvalo (que quede
> centrada, a buen tamaño y nítida), no para emitir un veredicto de vida. Integrar
> AWS Face Liveness en el SDK es la fase futura mencionada arriba.

### 1.2 Captura automática (selfie)

En el paso de selfie, el SDK intenta **detectar automáticamente** cuándo el rostro del
firmante está bien encuadrado y nítido dentro del óvalo guía, y dispara la captura sin
que el firmante tenga que presionar ningún botón (tras una breve cuenta regresiva, para
darle tiempo de reaccionar). Esta detección corre **enteramente en el dispositivo del
firmante**: los frames de video analizados nunca salen del navegador ni se envían a
Digid ni a ningún tercero; solo la imagen final ya capturada (igual que en el resto del
flujo) se sube al backend.

> **Los pasos de identificación (INE frente/reverso) usan un mecanismo distinto** —el
> escáner de documentos con OpenCV de la [sección 1.3](#13-escaneo-de-documentos-ine)—,
> no lo descrito en esta sección. Antes de esta versión, el reverso de la INE usaba
> lectura de código QR/PDF417 para su captura automática; el campo
> `detectionAssets.zxingWasmUrl` sigue existiendo en el tipo por compatibilidad, pero
> ya no lo consume ningún paso (reservado por si un futuro paso vuelve a necesitarlo).

Para lograr esto, el SDK carga de forma perezosa (solo cuando el firmante llega al paso
de selfie) un modelo de detección de rostro de código abierto:
[MediaPipe Tasks Vision](https://developers.google.com/mediapipe).

Se apoya en WebAssembly y pesa **aproximadamente 3 MB** adicionales que se descargan la
primera vez que el firmante abre la cámara de la selfie (no al cargar el bundle del
SDK). Por default se sirve desde CDNs públicos (`cdn.jsdelivr.net` para el WASM,
`storage.googleapis.com` para el modelo de rostro).

Si tu política de seguridad no permite depender de CDNs de terceros, puedes
autoalojar estos archivos y apuntar el SDK a tus propias URLs con la prop
`detectionAssets`:

```tsx
<FirmaAutografa
  token={token}
  baseUrl="https://digidmexico.com.mx"
  detectionAssets={{
    mediapipeWasmUrl: 'https://tu-cdn.example.com/mediapipe/wasm',
    faceModelUrl: 'https://tu-cdn.example.com/mediapipe/blaze_face_short_range.tflite',
    zxingWasmUrl: 'https://tu-cdn.example.com/zxing',
  }}
/>
```

Los tres campos son opcionales e independientes entre sí (puedes autoalojar solo
uno). Si tu CSP restringe `connect-src`/`script-src`, revisa las directivas
adicionales necesarias en la [sección 10.3](#103-content-security-policy-csp).

**La captura automática nunca es obligatoria.** Si el dispositivo no soporta la
detección (navegador antiguo, WASM deshabilitado, fallo de red al descargar los
modelos, etc.), el SDK lo detecta y muestra un aviso indicándolo, pero el firmante
siempre puede capturar manualmente con el botón de la cámara — el flujo de firma
nunca se bloquea por esto.

### 1.3 Escaneo de documentos (INE)

Los pasos de identificación (INE frente y reverso) usan un escáner de documentos con
OpenCV: el firmante alinea la credencial a un marco guía ID-1 y, en cuanto el SDK
detecta el contorno bien encuadrado y nítido, recorta el documento con corrección de
perspectiva (contorno + esquinas + warp) — todo **en el propio dispositivo**, sin
enviar frames de video a Digid ni a ningún tercero. El firmante ve un preview del
recorte (con un puntaje de calidad orientativo, que nunca bloquea continuar) antes de
confirmar. La captura manual con el botón de la cámara y la carga de archivo/foto de
galería siempre están disponibles como alternativa.

El paquete incluye, bajo `scan-assets/`, un Web Worker (`scan-worker.js`) y el build
WebAssembly de OpenCV que ese worker carga (`opencv.js`, ~9 MB). El worker corre en
un hilo aparte porque compilar/ejecutar ese WASM en el hilo principal congelaría la
UI; `opencv.js` solo se descarga de forma perezosa **dentro del worker**, y solo
cuando el firmante llegue al paso de identificación — nunca al cargar el bundle del
SDK.

**Servir `scan-assets/` es necesario para que el escáner funcione.** Los Web Workers
no pueden cargarse desde un CDN cross-origin (a diferencia de MediaPipe/zxing en la
[sección 1.2](#12-captura-automática-selfie)), así que copia la carpeta completa a tu
directorio de estáticos:

```bash
cp -R node_modules/@digid/firma-autografa-react/scan-assets public/digid-scan
```

Por default el SDK busca el worker en `/digid-scan/scan-worker.js`. Si tu proyecto
sirve estáticos desde otra ruta, pásasela vía la prop `scanAssets`:

```tsx
<FirmaAutografa
  token={token}
  baseUrl="https://digidmexico.com.mx"
  scanAssets={{ workerUrl: '/assets/digid-scan/scan-worker.js' }}
/>
```

`scan-worker.js` carga `opencv.js` con una ruta relativa a su propia URL
(`./opencv.js`), así que basta con que ambos archivos queden en la misma carpeta —
no hace falta configurar la URL de `opencv.js` por separado.

**Si no sirves `scan-assets/`** (lo olvidaste, tu CSP lo bloquea, o el navegador no
soporta el worker/WASM), el SDK lo detecta —espera unos segundos a que el worker
quede listo— y se degrada automáticamente a captura manual: el marco guía sigue
visible y el firmante puede seguir capturando con el botón o subiendo un archivo; solo
se pierden el recorte automático y la detección en vivo. El flujo de firma nunca se
bloquea por esto.

---

## 2. Ambientes

| Ambiente | `baseUrl` |
|---|---|
| **Producción** | `https://digidmexico.com.mx` |
| **Pruebas** | `https://pruebas.digidmexico.com.mx` |

Usa el ambiente de **pruebas** durante el desarrollo de tu integración (los tokens de
un ambiente no funcionan en el otro), y cambia a producción al salir en vivo.

---

## 3. Requisitos previos

Antes de integrar necesitas:

1. **Una cuenta de cliente en Digid** con acceso a la API de integración
   (contacto: soporte de Digid).
2. **El token del firmante** para cada proceso de firma (ver [sección 5](#5-obtención-del-token-del-firmante)).
3. **React 18 o superior** en tu proyecto (el SDK lo declara como *peer dependency*).
4. **HTTPS en producción.** La captura con cámara usa `getUserMedia`, que los
   navegadores solo permiten en contextos seguros (`https://` o `localhost`).
5. **Que Digid habilite tu dominio en su configuración de CORS.** El SDK llama a la
   API de Digid directamente desde el navegador del firmante; si tu aplicación corre
   en un dominio distinto al del backend de Digid, ese dominio debe estar en la lista
   de orígenes permitidos. Solicítalo al equipo de Digid indicando el/los dominios
   exactos (incluyendo subdominio y esquema).

---

## 4. Instalación

```bash
npm install @digid/firma-autografa-react
```

El paquete incluye sus tipos de TypeScript. `pdfjs-dist` se instala como dependencia
transitiva; React y ReactDOM deben existir ya en tu proyecto.

---

## 5. Obtención del token del firmante

Cada proceso de firma en Digid está ligado a un **token único por firmante y
documento**. Es el mismo token que aparece al final de los enlaces de firma que Digid
envía por correo:

```
https://digidmexico.com.mx/firma_autografa/{token}
```

Formas de obtenerlo:

- **Vía la API de integración de Digid**: al crear un documento y asignar firmantes
  desde tu backend, la respuesta incluye los datos de asignación de cada firmante.
- **Desde el enlace de invitación**: si Digid notifica a tus firmantes por correo,
  puedes construir tu propia página de firma tomando el último segmento de la URL.

> **Importante:** el token es un secreto de un solo proceso. Trátalo como credencial:
> no lo registres en logs, no lo compartas entre usuarios y entrégalo al navegador
> solo en la página donde se va a firmar.

---

## 6. Inicio rápido

### 6.1 Aplicación Vite / CRA / SPA

```tsx
import { FirmaAutografa } from '@digid/firma-autografa-react';
import '@digid/firma-autografa-react/styles.css';

export function PaginaDeFirma({ token }: { token: string }) {
  return (
    <FirmaAutografa
      token={token}
      baseUrl="https://digidmexico.com.mx"
      onComplete={() => {
        // El documento quedó firmado en Digid
        window.location.href = '/gracias';
      }}
      onExit={(reason) => {
        // 'user_exit' | 'already_signed' | 'document_cancelled'
        window.location.href = `/firma-cancelada?motivo=${reason}`;
      }}
      onError={(err) => {
        console.error('Error del proceso de firma', err);
        window.location.href = '/error-de-firma';
      }}
    />
  );
}
```

### 6.2 Next.js (App Router)

El SDK usa APIs del navegador (cámara, canvas, PDF), por lo que debe renderizarse
solo en el cliente:

```tsx
// app/firmar/[token]/page.tsx
import { Firmador } from './firmador';

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <Firmador token={token} />;
}
```

```tsx
// app/firmar/[token]/firmador.tsx
'use client';

import dynamic from 'next/dynamic';
import '@digid/firma-autografa-react/styles.css';

const FirmaAutografa = dynamic(
  () => import('@digid/firma-autografa-react').then((m) => m.FirmaAutografa),
  { ssr: false },
);

export function Firmador({ token }: { token: string }) {
  return (
    <FirmaAutografa
      token={token}
      baseUrl="https://digidmexico.com.mx"
      onComplete={() => (window.location.href = '/gracias')}
    />
  );
}
```

---

## 7. Referencia de API

### 7.1 `<FirmaAutografa>` — props

| Prop | Tipo | Obligatoria | Default | Descripción |
|---|---|---|---|---|
| `token` | `string` | ✅ | — | Token del firmante para este proceso de firma. |
| `baseUrl` | `string` | — | `''` (mismo origen) | Origen del backend de Digid, `https://digidmexico.com.mx` (producción) o `https://pruebas.digidmexico.com.mx` (pruebas). Si tu app corre en un dominio distinto, es obligatorio y tu dominio debe estar habilitado en CORS. |
| `theme` | `DigidTheme` | — | — | Colores de tu marca (ver [sección 8](#8-personalización-visual)). Los estilos que tu cuenta tenga configurados en Digid tienen prioridad sobre esta prop. |
| `termsUrl` | `string` | — | T&C de Digid | URL de los términos y condiciones que se enlazan en el paso 1. |
| `detectionAssets` | `DetectionAssets` | — | CDNs públicos | URLs propias para autoalojar el modelo de detección de rostro de la selfie (ver [sección 1.2](#12-captura-automática-selfie)). `zxingWasmUrl` ya no se usa (ver nota en esa sección). |
| `scanAssets` | `ScanAssets` | — | `/digid-scan/scan-worker.js` | URL propia del worker de escaneo OpenCV que usan los pasos de INE frente/reverso (ver [sección 1.3](#13-escaneo-de-documentos-ine)). Requiere servir `scan-assets/` en tu propio origen. |
| `onComplete` | `() => void` | — | — | El firmante completó todo el proceso; el documento quedó firmado. |
| `onExit` | `(reason: string) => void` | — | — | El proceso terminó sin firmar. Ver razones abajo. |
| `onError` | `(error: Error) => void` | — | — | Error irrecuperable (token inválido, fallo de red, respuesta inesperada). |

**Razones de `onExit`** (tipo exportado `ExitReason`):

| Valor | Significado | Qué mostrarle al usuario |
|---|---|---|
| `'user_exit'` | El firmante eligió "Salir sin firmar". | Confirmación de cancelación / opción de reintentar. |
| `'already_signed'` | El documento ya fue firmado previamente por este firmante. | Aviso informativo. |
| `'document_cancelled'` | El documento fue cancelado por el emisor. | Aviso de que el proceso ya no está disponible. |

> El componente no renderiza nada tras `onExit` — tu aplicación es responsable de
> navegar o mostrar la pantalla siguiente. Tras `onComplete` sí se muestra la
> pantalla de éxito del SDK, además de dispararse el callback.

### 7.2 Manejo de errores — `DigidError`

`onError` recibe instancias de `DigidError` (exportado) con un campo `code`:

| Código | Cuándo ocurre |
|---|---|
| `NETWORK` | No fue posible conectar con el servidor de Digid. |
| `INVALID_TOKEN` | El servidor rechazó la solicitud (4xx): token inválido, expirado o proceso no disponible. |
| `UNEXPECTED` | Error del servidor (5xx) o respuesta con formato inesperado. |

```tsx
import { DigidError } from '@digid/firma-autografa-react';

onError={(err) => {
  if (err instanceof DigidError && err.code === 'INVALID_TOKEN') {
    // enlace vencido o ya utilizado
  }
}}
```

El detalle crudo de la respuesta del servidor está disponible en `err.detail`
(solo para diagnóstico; no lo muestres al usuario final).

### 7.3 Exports adicionales

Para integraciones avanzadas el paquete también exporta:

- `useAutografaFlow`, `flowReducer`, `initialFlowState`, tipos `FlowState`/`FlowStep`/`FlowAction` — la máquina de estados del flujo, por si quieres construir tu propia UI (*headless*).
- `ApiClient` — cliente tipado de los endpoints de Digid.
- Componentes individuales de cada paso (`StartStep`, `IdCaptureStep`, `CreateSignStep`, `PlaceSignaturesStep`, `CompletedStep`) y piezas reutilizables (`PdfViewer`, `SignaturePad`).
- `es` / `Strings` / `I18nProvider` / `useStrings` — el diccionario de textos (español).

Para la mayoría de las integraciones basta con `<FirmaAutografa>`; el resto de la
superficie existe para casos a la medida y puede evolucionar entre versiones menores.

---

## 8. Personalización visual

### 8.1 Prop `theme`

```tsx
<FirmaAutografa
  token={token}
  baseUrl="https://digidmexico.com.mx"
  theme={{
    primaryColor: '#0F62FE',    // botones y acentos
    buttonTextColor: '#FFFFFF', // texto de los botones primarios
  }}
/>
```

- Solo se aceptan colores en formato hexadecimal (`#rgb` o `#rrggbb`); cualquier otro
  valor se ignora por seguridad.
- Si tu cuenta de Digid tiene **estilos de marca configurados en la plataforma**
  (colores del proceso de firma), esos estilos tienen prioridad sobre la prop `theme`.
- `logoUrl` existe en el tipo `DigidTheme` pero está **reservado para una versión
  futura**; hoy no se renderiza.

### 8.2 CSS variables

El stylesheet del SDK (`styles.css`) define variables CSS con prefijo `--digid-*`
sobre el contenedor `.digid-root`. Puedes sobreescribirlas desde tu propio CSS para
un ajuste más fino:

```css
.digid-root {
  --digid-primary: #0f62fe;   /* color primario */
  --digid-btn-text: #ffffff;  /* texto de botones primarios */
  --digid-dark: #111928;      /* texto principal */
  --digid-gray: #6b7280;      /* texto secundario */
  --digid-border: #e4e4e7;    /* bordes */
  --digid-danger: #dc2626;    /* errores */
  --digid-radius: 8px;        /* radio de esquinas */
}
```

Todas las clases del SDK usan el prefijo `digid-`, por lo que no colisionan con las
de tu aplicación. El componente (`.digid-root`) trae su propio `max-width: 900px` y
se centra automáticamente (`margin-inline: auto`) dentro de su contenedor — pensado
para verse bien tanto en columnas angostas como en pantallas ultrawide, sin que el
visor de PDF quede desproporcionado. No necesitas limitar el ancho del contenedor que
lo envuelve; si tu diseño requiere un ancho distinto, sobreescribe `max-width` en
`.digid-root` desde tu propio CSS.

---

## 9. Permisos del navegador y compatibilidad

| Permiso | Cuándo se solicita | Si el usuario lo niega |
|---|---|---|
| **Cámara** | En los pasos de captura de identificación (en móvil se abre por defecto; en escritorio, al elegir "abrir la cámara"). | El firmante puede subir un archivo JPEG/PNG en su lugar. |
| **Geolocalización** | Solo si el emisor del documento configuró la firma con evidencia de ubicación. | El proceso continúa sin coordenadas. |

**Navegadores soportados:** versiones recientes (últimos 2 años) de Chrome, Edge,
Firefox y Safari, en escritorio y móvil. El pad de firma usa Pointer Events y el
visor de PDF usa `pdfjs-dist`, ambos con soporte universal en esos navegadores.

**Recomendaciones para móvil:** el flujo está pensado *mobile-first* (captura de INE
con cámara trasera, firma con el dedo). Asegúrate de servir tu página con
`<meta name="viewport" content="width=device-width, initial-scale=1" />`.

---

## 10. Notas por tipo de proyecto

### 10.1 Bundlers ESM (Vite, Next.js, webpack 5, Rollup)

Sin configuración extra: el visor de PDF resuelve automáticamente el *worker* de
`pdfjs-dist` mediante `import.meta.url`.

### 10.2 Consumidores CommonJS (Jest con transform CJS, SSR Node, bundlers legados)

En el build CommonJS `import.meta` no existe, por lo que el worker de pdf.js no puede
resolverse solo. Opciones:

1. Sirve `pdfjs-dist/build/pdf.worker.min.mjs` como asset estático y pásalo al
   componente exportado `PdfViewer` mediante la prop `workerSrc`, o
2. Configura `GlobalWorkerOptions.workerSrc` de `pdfjs-dist` globalmente antes de
   montar el SDK.

Si no lo configuras, el visor mostrará el estado de error y registrará en consola un
mensaje indicando exactamente esto.

### 10.3 Content Security Policy (CSP)

El SDK no carga scripts de terceros propios, así que funciona con CSP estricta.
Asegúrate de permitir:

```
connect-src https://digidmexico.com.mx;   (o pruebas.digidmexico.com.mx según el ambiente)
img-src     'self' data: blob: https://digidmexico.com.mx;
worker-src  'self' blob:;               (worker de pdf.js Y del escáner de INE, sección 1.3)
media-src   'self' blob:;               (previsualización de cámara)
```

**Escáner de INE (sección 1.3, `scan-assets/`):** al servirse desde tu propio origen,
solo necesitas `worker-src 'self'` (ya arriba) y `'wasm-unsafe-eval'` en `script-src`
para tu propio origen (requerido por los navegadores para instanciar el WebAssembly de
OpenCV que el worker carga):

```
script-src  'wasm-unsafe-eval' 'self';
```

**Si además usas la captura automática de la selfie con su proveedor por default**
(ver [sección 1.2](#12-captura-automática-selfie)), agrega también el origen del
modelo de MediaPipe:

```
script-src  'wasm-unsafe-eval' https://cdn.jsdelivr.net;
connect-src https://cdn.jsdelivr.net https://storage.googleapis.com;  (además de lo anterior)
```

Si en cambio autoalojas ese modelo vía `detectionAssets`, sustituye esos dos orígenes
por el(los) tuyo(s) propio(s) — no necesitas permitir jsDelivr/Google Storage en
absoluto. Y si tu CSP no puede modificarse para permitir ninguno de los dos, no pasa
nada: al no poder cargar el modelo, la selfie cae automáticamente a captura manual (ver
sección 1.2) sin romper el resto del flujo — igual que el escáner de INE si
`scan-assets/` no está disponible (ver sección 1.3).

---

## 11. Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| `onError` inmediato con código `NETWORK` y errores CORS en consola | Tu dominio no está en la lista de orígenes permitidos de Digid | Solicita a Digid el alta de tu dominio exacto (esquema + subdominio). |
| `onError` con `INVALID_TOKEN` | Token mal copiado, vencido, o proceso ya cerrado | Verifica que pasas el token completo y que el documento sigue vigente. |
| La cámara no abre | Página servida sin HTTPS, o permiso denegado | Sirve por HTTPS; el firmante siempre puede subir archivo como alternativa. |
| El PDF no se muestra (mensaje de error del visor) | Worker de pdf.js no resuelto (build CJS) o PDF inaccesible | Ver sección 10.2; revisa en la pestaña Red si `/storage/files/...` responde 200. |
| El SDK muestra directamente la pantalla de éxito | El firmante ya había completado el proceso | Comportamiento esperado (estado del proceso en Digid). |
| Los colores de mi `theme` no se aplican | Tu cuenta tiene estilos de marca configurados en Digid | Los estilos de la plataforma tienen prioridad; ajústalos en Digid o pide su retiro. |

---

## 12. Checklist de salida a producción

- [ ] Dominio(s) de producción dados de alta en el CORS de Digid.
- [ ] Página de firma servida por **HTTPS**.
- [ ] `baseUrl` apuntando al ambiente correcto de Digid.
- [ ] Manejo implementado de los tres callbacks (`onComplete`, `onExit`, `onError`) con navegación/pantallas propias.
- [ ] Prueba completa en un móvil real: cámara trasera para INE, firma con el dedo.
- [ ] Prueba del caso "enlace ya utilizado" (volver a abrir un token ya firmado).
- [ ] `scan-assets/` copiada a tu directorio de estáticos y accesible en la URL configurada (ver [sección 1.3](#13-escaneo-de-documentos-ine)); sin esto, la INE funciona pero sin recorte automático.
- [ ] CSP verificada si tu aplicación la define.
- [ ] El token nunca aparece en logs del cliente ni en URLs compartibles innecesariamente.

---

## 13. Soporte

- Dudas de integración y alta de dominios CORS: **contacto@digid.com.mx**
- Reporte de problemas del SDK: repositorio `digid-sdk-react` (issues).

---

*Digid — plataforma de firma digital. Esta guía corresponde a la versión 0.6.0 del SDK.*
