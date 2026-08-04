/* Generador de docs/GUIA-INTEGRACION-CLIENTES.docx.
 *
 * Uso (docx no es dependencia del SDK; instálala sin guardar):
 *   npm install --no-save docx
 *   node docs/tools/gen-guia-clientes.cjs
 *
 * Actualizar en cada release: versión/fecha de la portada y del pie,
 * y el contenido que haya cambiado en docs/GUIA-INTEGRACION.md.
 */
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, HeadingLevel, LevelFormat,
  ShadingType, TableOfContents, PageBreak, PageNumber, Footer,
  ExternalHyperlink, VerticalAlign,
} = require('docx');
const fs = require('fs');

// ---------- paleta ----------
const AQUA = '6AC1B4';
const AQUA_DARK = '2E8C7D';
const DARK = '111928';
const GRAY = '6B7280';
const BORDER = 'D9DEE4';
const CODE_BG = 'F4F6F8';
const CALLOUT_BG = 'EAF6F3';
const HEADER_BG = 'E7F5F2';

const PAGE_W = 12240, PAGE_H = 15840, MARGIN = 1440;
const CONTENT_W = PAGE_W - 2 * MARGIN; // 9360 DXA

// ---------- helpers de texto ----------
// parsea **negritas** y `código` en TextRuns
function md(text, extra = {}) {
  const runs = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) runs.push(new TextRun({ text: text.slice(last, m.index), ...extra }));
    const tok = m[0];
    if (tok.startsWith('**')) {
      runs.push(...md(tok.slice(2, -2), { ...extra, bold: true }));
    } else {
      runs.push(new TextRun({
        text: tok.slice(1, -1), font: 'Consolas', size: extra.size ? extra.size - 2 : 20,
        shading: { type: ShadingType.CLEAR, fill: CODE_BG }, color: extra.color || DARK,
      }));
    }
    last = m.index + tok.length;
  }
  if (last < text.length) runs.push(new TextRun({ text: text.slice(last), ...extra }));
  return runs;
}

const p = (text, opts = {}) => new Paragraph({
  children: md(text), spacing: { after: 160, line: 276 }, ...opts,
});

const h1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
const h2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const h3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(t)] });

const bullet = (text) => new Paragraph({
  children: md(text), numbering: { reference: 'bullets', level: 0 },
  spacing: { after: 100, line: 276 },
});
const num = (ref) => (text) => new Paragraph({
  children: md(text), numbering: { reference: ref, level: 0 },
  spacing: { after: 100, line: 276 },
});
const check = (text) => new Paragraph({
  children: md(text), numbering: { reference: 'checks', level: 0 },
  spacing: { after: 120, line: 276 },
});

function code(lines) {
  return lines.map((line, i) => new Paragraph({
    children: [new TextRun({ text: line === '' ? ' ' : line, font: 'Consolas', size: 18, color: DARK })],
    shading: { type: ShadingType.CLEAR, fill: CODE_BG },
    border: { left: { style: BorderStyle.SINGLE, size: 12, color: AQUA } },
    spacing: { before: 0, after: i === lines.length - 1 ? 200 : 0, line: 240 },
    indent: { left: 240, right: 240 },
  }));
}

function callout(label, text) {
  return new Paragraph({
    children: [new TextRun({ text: `${label}: `, bold: true, color: AQUA_DARK }), ...md(text)],
    shading: { type: ShadingType.CLEAR, fill: CALLOUT_BG },
    border: { left: { style: BorderStyle.SINGLE, size: 18, color: AQUA } },
    spacing: { before: 120, after: 200, line: 276 },
    indent: { left: 240, right: 240 },
  });
}

// ---------- tablas ----------
const cellBorders = {
  top: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
  left: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
  right: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
};

function mkTable(widths, headerCells, rows) {
  const mkCell = (content, w, isHeader) => new TableCell({
    width: { size: w, type: WidthType.DXA },
    borders: cellBorders,
    verticalAlign: VerticalAlign.CENTER,
    shading: isHeader ? { type: ShadingType.CLEAR, fill: HEADER_BG } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({
      children: md(content, isHeader ? { bold: true, size: 20 } : { size: 20 }),
      spacing: { after: 0, line: 260 },
    })],
  });
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, children: headerCells.map((c, i) => mkCell(c, widths[i], true)) }),
      ...rows.map((r) => new TableRow({ children: r.map((c, i) => mkCell(c, widths[i], false)) })),
    ],
  });
}
const spacer = () => new Paragraph({ children: [], spacing: { after: 160 } });

// ---------- documento ----------
const children = [];

// PORTADA
children.push(
  new Paragraph({ spacing: { before: 2400, after: 0 }, children: [] }),
  new Paragraph({
    shading: { type: ShadingType.CLEAR, fill: DARK },
    spacing: { before: 0, after: 0 },
    children: [new TextRun({ text: '  digid', bold: true, color: 'FFFFFF', size: 72, font: 'Calibri' })],
  }),
  new Paragraph({
    shading: { type: ShadingType.CLEAR, fill: AQUA },
    spacing: { before: 0, after: 600 },
    children: [new TextRun({ text: ' ', size: 8 })],
  }),
  new Paragraph({
    spacing: { after: 200 },
    children: [new TextRun({ text: 'SDK de Firma Autógrafa', bold: true, size: 56, color: DARK })],
  }),
  new Paragraph({
    spacing: { after: 1200 },
    children: [new TextRun({ text: 'Guía de integración para clientes', size: 36, color: GRAY })],
  }),
  new Paragraph({ spacing: { after: 80 }, children: [
    new TextRun({ text: 'Paquete: ', bold: true, size: 22, color: DARK }),
    new TextRun({ text: '@digid-sdk/firma-autografa-react', font: 'Consolas', size: 20, color: DARK }),
  ] }),
  new Paragraph({ spacing: { after: 80 }, children: [
    new TextRun({ text: 'Versión: ', bold: true, size: 22, color: DARK }),
    new TextRun({ text: '1.3.0', size: 22, color: DARK }),
  ] }),
  new Paragraph({ spacing: { after: 80 }, children: [
    new TextRun({ text: 'Fecha: ', bold: true, size: 22, color: DARK }),
    new TextRun({ text: 'agosto de 2026', size: 22, color: DARK }),
  ] }),
  new Paragraph({ spacing: { after: 0 }, children: [
    new TextRun({ text: 'CONSTANCIAS DIGITALES · Licencia Apache-2.0', size: 20, color: GRAY }),
  ] }),
  new Paragraph({ children: [new PageBreak()] }),
);

// ÍNDICE
children.push(
  new Paragraph({
    spacing: { after: 240 },
    children: [new TextRun({ text: 'Contenido', bold: true, size: 32, color: DARK })],
  }),
  new TableOfContents('Contenido', { hyperlink: true, headingStyleRange: '1-2' }),
  new Paragraph({
    spacing: { before: 240, after: 0 },
    children: [new TextRun({
      text: 'Si el índice aparece vacío al abrir el documento, haz clic derecho sobre él y elige "Actualizar campos".',
      italics: true, size: 18, color: GRAY,
    })],
  }),
  new Paragraph({ children: [new PageBreak()] }),
);

// 1. QUÉ HACE EL SDK
children.push(
  h1('1. ¿Qué hace el SDK?'),
  p('El SDK entrega un componente React, `<FirmaAutografa>`, que ejecuta dentro de tu aplicación el proceso completo de firma autógrafa de Digid, de principio a fin, sin redirigir a tus usuarios al sitio de Digid. Al montarlo, el firmante recorre estas pantallas:'),
  mkTable([700, 2400, 6260],
    ['Paso', 'Pantalla', 'Descripción'],
    [
      ['1', '**Revisión del documento**', 'El firmante ve el PDF a firmar, puede descargarlo y acepta términos y condiciones (si el documento requiere verificación de identidad, se muestra también el aviso de consentimiento KYC). El visor incluye zoom (50%–300%) y navegación de páginas.'],
      ['2', '**Identificación (frente)**', 'Pantalla de instrucción y cámara con marco guía: el SDK detecta la credencial, la recorta automáticamente con corrección de perspectiva y muestra un preview. También hay captura manual y carga de archivo.'],
      ['3', '**Identificación (reverso)**', 'Mismo flujo de instrucción, marco guiado y recorte automático que el paso anterior.'],
      ['4', '**Selfie**', 'La cámara frontal se abre de inmediato, sin pantalla de instrucción previa, con un óvalo guía: el SDK detecta el rostro centrado y nítido y captura automáticamente (o con el botón de captura manual). **Es obligatoria por cámara**: a diferencia de los pasos 2 y 3, no hay alternativa de subir un archivo (sección 9).'],
      ['5', '**Creación de la firma**', 'El firmante dibuja su firma en un lienzo táctil (dedo, stylus o mouse).'],
      ['6', '**Colocación de firmas**', 'El firmante confirma las posiciones de su firma sobre el PDF real, viendo el tamaño exacto con el que quedará estampada (35×22 mm).'],
      ['7', '**Confirmación**', 'Pantalla de éxito. El documento queda firmado y tu aplicación recibe el callback `onComplete`.'],
    ],
  ),
  spacer(),
  callout('Pasos condicionales', 'Los pasos 2, 3 y 4 se muestran u omiten según las preferencias configuradas para el documento al crearlo en Digid. Un documento sin verificación de identidad salta directo del paso 1 al 5. Si la plataforma no envía preferencias, el SDK muestra las tres pantallas por defecto (la opción más segura).'),
  callout('Firmantes Representante Legal', 'Si el firmante está registrado como Representante Legal con firma y contraseña guardadas, el paso 1 muestra su firma y un campo de contraseña: tras aceptar términos y validar credenciales, la firma se completa de inmediato, sin identificación ni selfie. El SDK lo detecta solo; no requiere configuración.'),
  callout('Imagen ya guardada', 'Si al llegar a los pasos 2, 3 o 4 ya existe la foto correspondiente (proceso retomado), el SDK la muestra con el mismo diseño del preview de captura: el firmante puede continuar con ella o repetir la captura.'),
  p('Todo el estado vive en memoria del navegador: el SDK no usa `localStorage` ni `sessionStorage`, y apaga la cámara en cuanto termina de usarla. No carga scripts de analítica ni publicidad; los únicos recursos externos en tiempo de ejecución son los modelos de detección de la captura automática (secciones 1.2 y 1.3).'),

  h2('1.1 Limitaciones'),
  p('Los documentos configurados con verificación de identidad mediante el proveedor de KYC alojado (prueba de vida / liveness) **no están soportados todavía**; ese flujo sigue disponible en la aplicación web de Digid. La selfie de este SDK es una fotografía con detección de encuadre en el dispositivo, no un veredicto de vida.'),

  h2('1.2 Captura automática de la selfie'),
  p('El SDK detecta cuándo el rostro está bien encuadrado y nítido dentro del óvalo y dispara la captura tras una breve cuenta regresiva. La detección corre **enteramente en el dispositivo del firmante**: los frames de video nunca salen del navegador; solo la imagen final capturada se sube a Digid.'),
  p('Para lograrlo carga de forma perezosa (solo al llegar al paso de selfie) un modelo de detección de rostro de código abierto, MediaPipe Tasks Vision (~3 MB), servido por defecto desde CDNs públicos (`cdn.jsdelivr.net` y `storage.googleapis.com`).'),
  p('Si tu política de seguridad no permite CDNs de terceros, puedes autoalojar esos archivos y apuntar el SDK a tus URLs con la prop `detectionAssets`:'),
  ...code([
    '<FirmaAutografa',
    '  token={token}',
    '  baseUrl="https://digidmexico.com.mx"',
    '  detectionAssets={{',
    "    mediapipeWasmUrl: 'https://tu-cdn.ejemplo.com/mediapipe/wasm',",
    "    faceModelUrl: 'https://tu-cdn.ejemplo.com/mediapipe/blaze_face_short_range.tflite',",
    '  }}',
    '/>',
  ]),
  p('**La captura automática nunca es obligatoria.** Si el dispositivo no la soporta o el modelo no puede descargarse, el SDK lo detecta y el firmante captura manualmente con el botón — el flujo de firma nunca se bloquea por esto.'),

  h2('1.3 Escaneo de documentos (INE)'),
  p('Los pasos de identificación usan un escáner con OpenCV: el firmante alinea la credencial al marco guía y, al detectarla bien encuadrada y nítida, el SDK recorta el documento con corrección de perspectiva — todo **en el propio dispositivo**, sin enviar video a ningún servidor. La captura manual y la carga de archivo siempre están disponibles.'),
  p('El paquete incluye, en la carpeta `scan-assets/`, un Web Worker (`scan-worker.js`) y el build WebAssembly de OpenCV (`opencv.js`, ~9 MB) que ese worker descarga de forma perezosa solo cuando el firmante llega al paso de identificación.'),
  callout('Novedad', '`scan-assets/` también incluye `pdf.worker.min.mjs`, el worker del visor de PDF (sección 10.2), pineado a la versión de `pdfjs-dist` del SDK. Si ya sirves `scan-assets/` para la INE, el visor de PDF queda cubierto sin pasos extra.'),
  callout('Por qué hay que copiar la carpeta', 'Un Web Worker exige **mismo origen**: el navegador rechaza construirlo desde otro dominio. Es una regla del navegador, no una elección del SDK. Por eso `scan-assets/` debe servirse desde tu propio dominio, a diferencia de los modelos de la selfie, que sí pueden venir de un CDN.'),
  p('Copia la carpeta completa a tu directorio de estáticos (el detalle está en la sección 4, Instalación):'),
  ...code(['cp -R node_modules/@digid-sdk/firma-autografa-react/scan-assets public/digid-scan']),
  p('Por defecto el SDK busca el worker en `/digid-scan/scan-worker.js`. Si sirves estáticos en otra ruta, indícala con la prop `scanAssets`:'),
  ...code(["<FirmaAutografa token={token} scanAssets={{ workerUrl: '/assets/digid-scan/scan-worker.js' }} />"]),
  h3('Cómo verificar que quedó bien'),
  p('Abre la consola del navegador y entra al paso de INE. Si aparece alguno de estos avisos, el worker **no** está cargando:'),
  ...code(['Worker de escaneo no disponible.', 'OpenCV no inicializo en el worker.', 'Worker de escaneo fallo.']),
  p('Sin avisos, el escáner está activo: el marco resalta el contorno del documento en vivo y la captura se dispara sola. Comprobación directa de que los archivos se sirven:'),
  ...code([
    'curl -I https://tu-dominio.com/digid-scan/scan-worker.js   # debe responder 200',
    'curl -I https://tu-dominio.com/digid-scan/opencv.js        # debe responder 200',
  ]),
  h3('Qué pasa exactamente si no la sirves'),
  p('El SDK lo detecta y se degrada solo. **El flujo de firma nunca se bloquea**, pero conviene conocer el alcance:'),
  mkTable([2000, 3680, 3680],
    ['', 'Con scan-assets/', 'Sin scan-assets/'],
    [
      ['**INE frente / reverso**', 'Detección en vivo, captura automática y recorte con corrección de perspectiva', 'Solo captura manual; se recorta el rectángulo del marco tal cual: si la credencial estaba inclinada, la imagen queda inclinada'],
      ['**Selfie**', 'Sin cambio', 'Sin cambio — usa MediaPipe (sección 1.2), no depende de esta carpeta'],
      ['**Subir archivo**', 'Detecta y recorta el documento dentro de la foto', 'Se sube la foto tal cual'],
      ['**Completar la firma**', 'Sí', 'Sí'],
    ],
  ),
  spacer(),
  p('En resumen: lo que se pierde es **calidad de la imagen de la identificación**, no funcionalidad. Para verificación de identidad eso importa — una credencial torcida o con fondo es más difícil de validar — así que vale la pena hacer el paso aunque no sea bloqueante.'),
);

// 2. AMBIENTES
children.push(
  h1('2. Ambientes'),
  mkTable([2600, 6760],
    ['Ambiente', 'baseUrl'],
    [
      ['**Producción**', '`https://digidmexico.com.mx`'],
      ['**Pruebas**', '`https://pruebas.digidmexico.com.mx`'],
    ],
  ),
  spacer(),
  p('Usa el ambiente de **pruebas** durante el desarrollo (los tokens de un ambiente no funcionan en el otro) y cambia a producción al salir en vivo.'),
);

// 3. REQUISITOS PREVIOS
const numReq = num('numsReq');
children.push(
  h1('3. Requisitos previos'),
  p('Antes de integrar necesitas:'),
  numReq('**Una cuenta de cliente en Digid** con acceso a la API de integración (contacto: soporte de Digid).'),
  numReq('**El token del firmante** para cada proceso de firma (ver sección 5).'),
  numReq('**React 18 o superior** en tu proyecto — el SDK lo declara como peer dependency, no lo instala.'),
  numReq('**HTTPS en producción.** La cámara usa `getUserMedia`, que los navegadores solo permiten en contextos seguros (`https://` o `localhost`).'),
  numReq('**CORS: hoy no necesitas registrar tu dominio.** Los endpoints que consume el SDK (`/api/*`) están autorizados por token, no por origen. Esto puede cambiar si Digid endurece el allowlist más adelante; mientras tanto, el proxy opcional de la sección 6.3 sigue siendo la salida si algo cambia.'),
);

// 4. INSTALACIÓN
children.push(
  h1('4. Instalación'),
  p('El paquete se distribuye en el registro público de npm; no requiere credenciales para instalarse.'),
  h2('4.1 Instalar el paquete'),
  ...code(['npm install @digid-sdk/firma-autografa-react']),
  p('Incluye sus tipos de TypeScript. `pdfjs-dist` se instala como dependencia transitiva; React y ReactDOM deben existir ya en tu proyecto.'),
  h2('4.2 Importar la hoja de estilos'),
  p('Sin ella, el SDK se renderiza sin ningún formato. Impórtala una vez, en el punto de entrada de tu aplicación:'),
  ...code(["import '@digid-sdk/firma-autografa-react/styles.css';"]),
  h2('4.3 Copiar los assets del escáner'),
  p('Necesario para el recorte automático de la INE, y desde esta versión también incluye el worker del visor de PDF (`pdf.worker.min.mjs`, sección 10.2) — el porqué de ambos está en la sección 1.3:'),
  ...code(['cp -R node_modules/@digid-sdk/firma-autografa-react/scan-assets public/digid-scan']),
  p('Como `node_modules` no se versiona, engancha la copia al `postinstall` de tu `package.json` para que se repita en cada instalación — sin esto, un despliegue limpio con `npm ci` la pierde:'),
  ...code(['"postinstall": "cp -R node_modules/@digid-sdk/firma-autografa-react/scan-assets public/digid-scan"']),
  callout('Si omites este paso', 'El flujo de firma sigue funcionando: los pasos de INE se degradan a captura manual, sin detección en vivo ni corrección de perspectiva, y el visor de PDF pierde su fallback local (sección 10.2). La selfie no se ve afectada. Ver la tabla de la sección 1.3.'),
);

// 5. TOKEN
children.push(
  h1('5. Obtención del token del firmante'),
  p('Cada proceso de firma está ligado a un **token único por firmante y documento**. Es el mismo token que aparece al final de los enlaces de firma que Digid envía por correo:'),
  ...code(['https://digidmexico.com.mx/firma_autografa/{token}']),
  p('Formas de obtenerlo:'),
  bullet('**Vía la API de integración de Digid**: al crear un documento y asignar firmantes desde tu backend, la respuesta incluye los datos de asignación de cada firmante.'),
  bullet('**Desde el enlace de invitación**: si Digid notifica a tus firmantes por correo, puedes construir tu propia página de firma tomando el último segmento de la URL.'),
  callout('Importante', 'El token es un secreto de un solo proceso. Trátalo como credencial: no lo registres en logs, no lo compartas entre usuarios y entrégalo al navegador solo en la página donde se va a firmar.'),
  h2('5.1 Cómo viaja el token (tokenTransport)'),
  p('Un token en la query string de una URL termina escrito en logs de acceso, proxies y CDNs. La prop `tokenTransport` controla cómo se envía a Digid:'),
  mkTable([1800, 2800, 4760],
    ['Valor', 'Qué envía', 'Cuándo usarlo'],
    [
      ["`'both'` (default)", 'Header **y** query string', 'Modo de transición: funciona en todos los ambientes. Aún no reduce la exposición en logs.'],
      ["`'header'`", 'Solo el header `X-Digid-Token`', 'Estado objetivo: el token deja de aparecer en logs. Actívalo cuando Digid confirme que tu ambiente lo soporta.'],
      ["`'query'`", 'Solo query string', 'Comportamiento histórico exacto; solo si Digid te lo indica.'],
    ],
  ),
  spacer(),
  ...code(['<FirmaAutografa token={token} baseUrl="https://digidmexico.com.mx" tokenTransport="header" />']),
  callout('Orden de despliegue', 'Mandar un header propio agrega preflight a cada llamada cross-origin. Si tu `baseUrl` apunta a otro origen, el backend debe aceptar el header y permitirlo en CORS **antes** de usar `\'both\'` o `\'header\'` — si no, fallarán todas las llamadas. Con `baseUrl: \'\'` (mismo origen) no aplica. Recomendado: integra con el default `\'both\'`, verifica el flujo completo y cambia después a `\'header\'`.'),
);

// 6. INICIO RÁPIDO
children.push(
  h1('6. Inicio rápido'),
  h2('6.1 Aplicación Vite / CRA / SPA'),
  ...code([
    "import { FirmaAutografa } from '@digid-sdk/firma-autografa-react';",
    "import '@digid-sdk/firma-autografa-react/styles.css';",
    '',
    'export function PaginaDeFirma({ token }: { token: string }) {',
    '  return (',
    '    <FirmaAutografa',
    '      token={token}',
    '      baseUrl="https://digidmexico.com.mx"',
    '      onComplete={() => {',
    '        // El documento quedó firmado en Digid',
    "        window.location.href = '/gracias';",
    '      }}',
    '      onExit={(reason) => {',
    "        // 'user_exit' | 'already_signed' | 'document_cancelled'",
    '        window.location.href = `/firma-cancelada?motivo=${reason}`;',
    '      }}',
    '      onError={(err) => {',
    "        console.error('Error del proceso de firma', err);",
    "        window.location.href = '/error-de-firma';",
    '      }}',
    '    />',
    '  );',
    '}',
  ]),
  h2('6.2 Next.js (App Router)'),
  p('El SDK usa APIs del navegador (cámara, canvas, PDF), por lo que debe renderizarse solo en el cliente:'),
  ...code([
    '// app/firmar/[token]/page.tsx',
    "import { Firmador } from './firmador';",
    '',
    'export default async function Page({ params }: { params: Promise<{ token: string }> }) {',
    '  const { token } = await params;',
    '  return <Firmador token={token} />;',
    '}',
  ]),
  ...code([
    '// app/firmar/[token]/firmador.tsx',
    "'use client';",
    '',
    "import dynamic from 'next/dynamic';",
    "import '@digid-sdk/firma-autografa-react/styles.css';",
    '',
    'const FirmaAutografa = dynamic(',
    "  () => import('@digid-sdk/firma-autografa-react').then((m) => m.FirmaAutografa),",
    '  { ssr: false },',
    ');',
    '',
    'export function Firmador({ token }: { token: string }) {',
    '  return (',
    '    <FirmaAutografa',
    '      token={token}',
    '      baseUrl="https://digidmexico.com.mx"',
    "      onComplete={() => (window.location.href = '/gracias')}",
    '    />',
    '  );',
    '}',
  ]),
  h2('6.3 Proxy local (opcional)'),
  p('El PDF y la imagen de firma se sirven vía `/api/archivofirma/document_pdf` y `/api/archivofirma/signature_image`, autorizados por token y cubiertos por la misma política CORS que el resto de `/api`. Llamar a Digid directo con `baseUrl` funciona out of the box; el proxy de esta sección **no es necesario**, pero sigue siendo válido si prefieres que tu app y Digid compartan el mismo origen (evita CORS por completo, útil con CSP muy estricta).'),
  p('**Vite** (`vite.config.ts`):'),
  ...code([
    'export default defineConfig({',
    '  server: {',
    '    proxy: {',
    "      '/api': { target: 'https://pruebas.digidmexico.com.mx', changeOrigin: true },",
    '    },',
    '  },',
    '});',
  ]),
  p('**Next.js** (`next.config.js`):'),
  ...code([
    'module.exports = {',
    '  async rewrites() {',
    "    return [{ source: '/api/:path*', destination: 'https://pruebas.digidmexico.com.mx/api/:path*' }];",
    '  },',
    '};',
  ]),
  p('En ambos casos monta el SDK con `baseUrl=""`.'),
);

// 7. REFERENCIA DE API
children.push(
  h1('7. Referencia de API'),
  h2('7.1 <FirmaAutografa> — props'),
  mkTable([1900, 2100, 1500, 3860],
    ['Prop', 'Tipo', 'Default', 'Descripción'],
    [
      ['`token`', '`string`', '— (obligatoria)', 'Token del firmante para este proceso de firma.'],
      ['`baseUrl`', '`string`', "`''` (mismo origen)", 'Origen del backend de Digid (sección 2). Si tu app corre en otro dominio es obligatorio, y tu dominio debe estar en el CORS de Digid.'],
      ['`tokenTransport`', "`'both' | 'header' | 'query'`", "`'both'`", 'Cómo viaja el token (sección 5.1).'],
      ['`theme`', '`DigidTheme`', '—', 'Colores de tu marca (sección 8). Los estilos configurados en tu cuenta de Digid tienen prioridad.'],
      ['`termsUrl`', '`string`', 'T&C de Digid', 'URL de los términos y condiciones enlazados en el paso 1.'],
      ['`pdfWorkerUrl`', '`string`', 'resolución automática, con reintento a `/digid-scan/pdf.worker.min.mjs`', 'URL del worker de `pdfjs-dist` para el visor de PDF (sección 10.2).'],
      ['`detectionAssets`', '`DetectionAssets`', 'CDNs públicos', 'URLs propias para autoalojar el modelo de detección de rostro de la selfie (sección 1.2). `zxingWasmUrl` ya no se usa (reservado por compatibilidad).'],
      ['`scanAssets`', '`ScanAssets`', '`/digid-scan/scan-worker.js`', 'URL propia del worker de escaneo de INE (sección 1.3).'],
      ['`onComplete`', '`() => void`', '—', 'El firmante completó todo el proceso; el documento quedó firmado.'],
      ['`onExit`', '`(reason) => void`', '—', 'El proceso terminó sin firmar. Razones abajo.'],
      ['`onError`', '`(error) => void`', '—', 'Error irrecuperable (token inválido, fallo de red, respuesta inesperada).'],
    ],
  ),
  spacer(),
  p('**Razones de `onExit`** (tipo exportado `ExitReason`):'),
  mkTable([2700, 3100, 3560],
    ['Valor', 'Significado', 'Qué mostrar al usuario'],
    [
      ["`'user_exit'`", 'El firmante eligió "Salir sin firmar".', 'Confirmación de cancelación / opción de reintentar.'],
      ["`'already_signed'`", 'El documento ya fue firmado por este firmante.', 'Aviso informativo.'],
      ["`'document_cancelled'`", 'El documento fue cancelado por el emisor.', 'Aviso de que el proceso ya no está disponible.'],
    ],
  ),
  spacer(),
  callout('Nota', 'El componente no renderiza nada tras `onExit` — tu aplicación navega o muestra la pantalla siguiente. Tras `onComplete` sí se muestra la pantalla de éxito del SDK, además de dispararse el callback.'),
  h2('7.2 Manejo de errores — DigidError'),
  p('`onError` recibe instancias de `DigidError` (exportado) con un campo `code`:'),
  mkTable([2300, 7060],
    ['Código', 'Cuándo ocurre'],
    [
      ['`NETWORK`', 'No fue posible conectar con el servidor de Digid.'],
      ['`INVALID_TOKEN`', 'El servidor rechazó la solicitud (4xx): token inválido, expirado o proceso no disponible.'],
      ['`UNEXPECTED`', 'Error del servidor (5xx) o respuesta con formato inesperado.'],
    ],
  ),
  spacer(),
  ...code([
    "import { DigidError } from '@digid-sdk/firma-autografa-react';",
    '',
    'onError={(err) => {',
    "  if (err instanceof DigidError && err.code === 'INVALID_TOKEN') {",
    '    // enlace vencido o ya utilizado',
    '  }',
    '}}',
  ]),
  p('El detalle crudo de la respuesta del servidor está en `err.detail` (solo para diagnóstico; no lo muestres al usuario final).'),
  h2('7.3 Exports adicionales'),
  p('Para integraciones avanzadas, el paquete también exporta:'),
  bullet('`useAutografaFlow`, `flowReducer`, `initialFlowState` y los tipos `FlowState` / `FlowStep` / `FlowAction` — la máquina de estados del flujo, para construir una UI propia (headless).'),
  bullet('`ApiClient` — cliente tipado de los endpoints de Digid.'),
  bullet('Componentes de cada paso (`StartStep`, `IdCaptureStep`, `CreateSignStep`, `PlaceSignaturesStep`, `CompletedStep`) y piezas reutilizables (`PdfViewer`, `SignaturePad`).'),
  bullet('`es` / `Strings` / `I18nProvider` / `useStrings` — el diccionario de textos (español).'),
  p('Para la mayoría de las integraciones basta con `<FirmaAutografa>`; el resto de la superficie existe para casos a la medida y puede evolucionar entre versiones menores.'),
);

// 8. PERSONALIZACIÓN VISUAL
children.push(
  h1('8. Personalización visual'),
  h2('8.1 Prop theme'),
  ...code([
    '<FirmaAutografa',
    '  token={token}',
    '  baseUrl="https://digidmexico.com.mx"',
    '  theme={{',
    "    primaryColor: '#0F62FE',    // botones y acentos",
    "    buttonTextColor: '#FFFFFF', // texto de los botones primarios",
    '  }}',
    '/>',
  ]),
  bullet('Solo se aceptan colores hexadecimales (`#rgb` o `#rrggbb`); cualquier otro valor se ignora por seguridad.'),
  bullet('Si tu cuenta de Digid tiene **estilos de marca configurados en la plataforma**, esos estilos tienen prioridad sobre la prop `theme`.'),
  bullet('`logoUrl` existe en el tipo `DigidTheme` pero está **reservado para una versión futura**; hoy no se renderiza.'),
  h2('8.2 Variables CSS'),
  p('La hoja de estilos define variables con prefijo `--digid-*` sobre el contenedor `.digid-root`. Puedes sobreescribirlas desde tu propio CSS:'),
  ...code([
    '.digid-root {',
    '  --digid-primary: #0f62fe;   /* color primario */',
    '  --digid-btn-text: #ffffff;  /* texto de botones primarios */',
    '  --digid-dark: #111928;      /* texto principal */',
    '  --digid-gray: #6b7280;      /* texto secundario */',
    '  --digid-border: #e4e4e7;    /* bordes */',
    '  --digid-danger: #dc2626;    /* errores */',
    '  --digid-radius: 8px;        /* radio de esquinas */',
    '}',
  ]),
  p('Todas las clases usan el prefijo `digid-`, así que no colisionan con las de tu aplicación. El contenedor `.digid-root` trae `max-width: 900px` y se centra solo; si tu diseño necesita otro ancho, sobreescribe `max-width` desde tu CSS.'),
);

// 9. PERMISOS Y COMPATIBILIDAD
children.push(
  h1('9. Permisos del navegador y compatibilidad'),
  mkTable([2400, 3300, 3660],
    ['Permiso', 'Cuándo se solicita', 'Si el usuario lo niega'],
    [
      ['**Cámara (INE frente/reverso)**', 'Al abrir la cámara desde la pantalla de instrucción.', 'El firmante puede subir un archivo JPEG/PNG en su lugar.'],
      ['**Cámara (selfie)**', 'Se abre de inmediato al llegar al paso, sin pantalla de instrucción previa.', '**Sin alternativa de archivo: la selfie exige cámara.** La pantalla de error ofrece Reintentar y Regresar; debe conceder el permiso para continuar.'],
      ['**Geolocalización**', 'Solo si el emisor configuró la firma con evidencia de ubicación.', 'El proceso continúa sin coordenadas.'],
    ],
  ),
  spacer(),
  p('**Navegadores soportados:** versiones recientes (últimos 2 años) de Chrome, Edge, Firefox y Safari, en escritorio y móvil.'),
  p('**Recomendación para móvil:** el flujo está pensado mobile-first (INE con cámara trasera, firma con el dedo). Sirve tu página con:'),
  ...code(['<meta name="viewport" content="width=device-width, initial-scale=1" />']),
);

// 10. NOTAS POR TIPO DE PROYECTO
children.push(
  h1('10. Notas por tipo de proyecto'),
  h2('10.1 Bundlers ESM (Vite, Next.js, webpack 5, Rollup)'),
  p('El SDK intenta resolver el worker de pdf.js vía `import.meta.url`, pero Vite y otros bundlers basados en esbuild pre-empaquetan las dependencias y no reescriben esa URL: la construcción **no lanza ningún error**, produce una URL que apunta a un 404 en runtime. Cuando eso pasa, el visor lo detecta y **reintenta automáticamente una vez** sirviendo el worker desde `/digid-scan/pdf.worker.min.mjs`, sin que el integrador haga nada — con la condición de que esa ruta esté servida (sección 10.2). Si no la sirves, o prefieres configurar el worker desde el arranque sin depender del reintento, usa una de las opciones de la sección siguiente.'),
  h2('10.2 Worker del visor PDF (todos los proyectos)'),
  p('Dos formas de configurarlo explícitamente — basta con una, y si ya sirves `scan-assets/` (sección 1.3) no necesitas hacer nada más, porque esa carpeta incluye el worker desde esta versión:'),
  bullet('**Prop `pdfWorkerUrl` en `<FirmaAutografa>`** — la forma recomendada.'),
  ...code(['<FirmaAutografa token={token} pdfWorkerUrl="/digid-scan/pdf.worker.min.mjs" />']),
  bullet('**Prop `workerSrc` en `PdfViewer`** — si usas ese componente por separado, fuera de `<FirmaAutografa>`.'),
  ...code(['<PdfViewer url={pdfUrl} workerSrc="/digid-scan/pdf.worker.min.mjs" />']),
  p('**Consumidores CommonJS** (Jest con transform CJS, SSR Node, bundlers legados): en el build `.cjs` `import.meta` no existe, así que la resolución automática siempre falla ahí — una de las dos props de arriba es obligatoria, o configura `GlobalWorkerOptions.workerSrc` de `pdfjs-dist` globalmente antes de montar el SDK.'),
  p('Sin ninguna de estas opciones y sin `scan-assets/` servido, el visor igual intenta el reintento a `/digid-scan/pdf.worker.min.mjs`; como esa ruta tampoco existe en tu servidor, también falla y el visor muestra su estado de error.'),
  h2('10.3 Content Security Policy (CSP)'),
  p('El SDK no carga scripts de terceros propios, así que funciona con CSP estricta. Directivas necesarias (ajusta el dominio al ambiente):'),
  ...code([
    'connect-src https://digidmexico.com.mx;',
    "img-src     'self' data: blob: https://digidmexico.com.mx;",
    "worker-src  'self' blob:;    /* pdf.js y escáner de INE */",
    "media-src   'self' blob:;    /* previsualización de cámara */",
    "script-src  'wasm-unsafe-eval' 'self';   /* WebAssembly de OpenCV */",
  ]),
  p('**Si usas la captura automática de selfie con los CDNs por defecto** (sección 1.2), agrega también:'),
  ...code([
    "script-src  'wasm-unsafe-eval' https://cdn.jsdelivr.net;",
    'connect-src https://cdn.jsdelivr.net https://storage.googleapis.com;',
  ]),
  p('Si autoalojas el modelo vía `detectionAssets`, sustituye esos orígenes por los tuyos. Y si tu CSP no puede permitir ninguno, la selfie cae a captura manual sin romper el flujo — igual que el escáner de INE sin `scan-assets/`.'),
);

// 11. SOLUCIÓN DE PROBLEMAS
children.push(
  h1('11. Solución de problemas'),
  mkTable([3120, 3120, 3120],
    ['Síntoma', 'Causa probable', 'Solución'],
    [
      ['`onError` inmediato con código `NETWORK` y errores CORS en consola', 'Tu dominio no está en la lista de orígenes permitidos de Digid', 'Solicita a Digid el alta de tu dominio exacto. Alternativa: el proxy opcional de la sección 6.3 con `baseUrl=""`.'],
      ['El visor del PDF se queda en **"Página de 0"** sin mensaje de error, con dos peticiones 404 a `pdf.worker.min.mjs` en la pestaña Red', 'El worker de pdf.js no se resolvió (Vite/esbuild) y tampoco sirves `scan-assets/`, así que el reintento automático también 404ea', 'Sirve `scan-assets/` (ya incluye el worker) o pasa `pdfWorkerUrl` — sección 10.2.'],
      ['El PDF no carga y la petición a `document_pdf` aparece **sin código de estado** en la pestaña Red, pero la URL sí funciona pegada directo en el navegador', 'Bloqueo CORS: el navegador descarta la respuesta — **un 200 tampoco lo descarta**, revisa la consola por avisos de CORS', 'Con backend y SDK actualizados, `document_pdf`/`signature_image` viven bajo `/api/*` y no dependen de CORS. Contra un backend viejo, usa el proxy opcional de la sección 6.3.'],
      ['El PDF no carga (token válido), sin los síntomas anteriores', 'El backend de Digid aún no incluye los endpoints `document_pdf`/`signature_image`', 'Confirma con Digid la versión del backend, o usa el proxy opcional de la sección 6.3 mientras se actualiza.'],
      ['`onError` con `INVALID_TOKEN`', 'Token mal copiado, vencido, o proceso ya cerrado', 'Verifica que pasas el token completo y que el documento sigue vigente.'],
      ['La cámara no abre (INE)', 'Página sin HTTPS, o permiso denegado', 'Sirve por HTTPS; el firmante siempre puede subir archivo.'],
      ['La cámara no abre (selfie)', 'Página sin HTTPS, o permiso denegado', 'Sirve por HTTPS. **Sin alternativa de archivo** (sección 9): la pantalla de error ofrece Reintentar y Regresar.'],
      ['En INE no hay detección en vivo y en consola aparece "Worker de escaneo no disponible"', '`scan-assets/` no se está sirviendo en la URL esperada', 'Copia la carpeta (sección 4.3) y comprueba que `/digid-scan/scan-worker.js` responde 200. Si usas otra ruta, indícala en `scanAssets.workerUrl`.'],
      ['Funcionaba en local y tras desplegar dejó de funcionar el escáner', '`npm ci` borró `node_modules` y con él la copia manual de `scan-assets/`', 'Engancha la copia al `postinstall` (sección 4.3).'],
      ['La selfie sí captura sola pero la INE no', 'Son dos mecanismos distintos: selfie usa MediaPipe (CDN); INE, el worker local de OpenCV', 'El síntoma apunta a `scan-assets/`, no a `detectionAssets`.'],
      ['El SDK muestra directamente la pantalla de éxito', 'El firmante ya había completado el proceso', 'Comportamiento esperado.'],
      ['Los colores de mi `theme` no se aplican', 'Tu cuenta tiene estilos de marca configurados en Digid', 'Los estilos de la plataforma tienen prioridad; ajústalos en Digid o solicita su retiro.'],
    ],
  ),
);

// 12. CHECKLIST
children.push(
  h1('12. Checklist de salida a producción'),
  check('Dominio(s) de producción dados de alta en el CORS de Digid.'),
  check('Página de firma servida por **HTTPS**.'),
  check('`baseUrl` apuntando al ambiente correcto de Digid.'),
  check('Manejo implementado de los tres callbacks (`onComplete`, `onExit`, `onError`) con navegación propia.'),
  check('Prueba completa en un móvil real: cámara trasera para INE, firma con el dedo.'),
  check('Prueba del caso "enlace ya utilizado" (volver a abrir un token ya firmado).'),
  check('`scan-assets/` copiada y **verificada en el navegador**: la consola no muestra "Worker de escaneo no disponible" en el paso de INE.'),
  check('La copia de `scan-assets/` enganchada al `postinstall`, para que sobreviva a un despliegue limpio.'),
  check('CSP verificada si tu aplicación la define (sección 10.3).'),
  check('El token nunca aparece en logs del cliente ni en URLs compartibles innecesariamente.'),
  check('`tokenTransport="header"` activado una vez que el backend acepta `X-Digid-Token` (sección 5.1); con el default `\'both\'` el token sigue llegando también por query a los logs de acceso.'),
);

// 13. SOPORTE
children.push(
  h1('13. Soporte'),
  new Paragraph({
    spacing: { after: 120, line: 276 },
    children: [
      new TextRun('Dudas de integración y alta de dominios CORS: '),
      new ExternalHyperlink({
        link: 'mailto:contacto@digid.com.mx',
        children: [new TextRun({ text: 'contacto@digid.com.mx', style: 'Hyperlink' })],
      }),
    ],
  }),
  new Paragraph({
    spacing: { after: 240, line: 276 },
    children: [
      new TextRun('Reporte de problemas del SDK: '),
      new ExternalHyperlink({
        link: 'https://github.com/digid-mexico/digid-sdk-react/issues',
        children: [new TextRun({ text: 'github.com/digid-mexico/digid-sdk-react/issues', style: 'Hyperlink' })],
      }),
    ],
  }),
  new Paragraph({
    spacing: { before: 480 },
    border: { top: { style: BorderStyle.SINGLE, size: 4, color: BORDER } },
    children: [new TextRun({
      text: 'Digid — plataforma de firma digital. Esta guía corresponde a la versión 1.3.0 del SDK.',
      italics: true, size: 18, color: GRAY,
    })],
  }),
);

// ---------- ensamblado ----------
const doc = new Document({
  styles: {
    default: {
      document: { run: { font: 'Calibri', size: 22, color: DARK } },
      heading1: {
        run: { font: 'Calibri', size: 34, bold: true, color: DARK },
        paragraph: {
          spacing: { before: 420, after: 200 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: AQUA } },
        },
      },
      heading2: {
        run: { font: 'Calibri', size: 27, bold: true, color: AQUA_DARK },
        paragraph: { spacing: { before: 320, after: 160 } },
      },
      heading3: {
        run: { font: 'Calibri', size: 23, bold: true, color: GRAY },
        paragraph: { spacing: { before: 240, after: 120 } },
      },
    },
    characterStyles: [
      { id: 'Hyperlink', name: 'Hyperlink', run: { color: '0563C1', underline: {} } },
    ],
  },
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 480, hanging: 240 } } },
        }],
      },
      {
        reference: 'numsReq',
        levels: [{
          level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 480, hanging: 300 } } },
        }],
      },
      {
        reference: 'checks',
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: '☐', alignment: AlignmentType.LEFT,
          style: {
            paragraph: { indent: { left: 480, hanging: 300 } },
            run: { font: 'Segoe UI Symbol' },
          },
        }],
      },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: PAGE_W, height: PAGE_H },
        margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      },
      titlePage: true,
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: BORDER } },
          children: [
            new TextRun({ text: 'Digid · SDK de Firma Autógrafa v1.3.0   ', size: 16, color: GRAY }),
            new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GRAY }),
          ],
        })],
      }),
      first: new Footer({ children: [] }),
    },
    children,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  const out = require('path').resolve(__dirname, '..') + '/GUIA-INTEGRACION-CLIENTES.docx';
  fs.writeFileSync(out, buf);
  console.log('OK', out, buf.length, 'bytes');
});
