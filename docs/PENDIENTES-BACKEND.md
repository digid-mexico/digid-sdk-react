# Contrato con el backend — notas y pendientes

Notas internas de desarrollo sobre cómo se acopla el SDK al backend de Digid.
No forman parte de la documentación para clientes integradores (esa es
[GUIA-INTEGRACION.md](GUIA-INTEGRACION.md)).

## Decisiones ya confirmadas contra el código del backend

- **`save_file` con `step=firma`** envía el dataURL de la firma como string en el
  campo `file`, no en `webCamera`. Confirmado contra
  `AsignadoController::saveSignatoryFile` (~línea 666), que en esa rama solo lee
  `file`. Los pasos de INE siguen mandando el dataURL en `webCamera`, igual que el
  flujo legacy.

- **Tamaño del overlay de previsualización de firma.** Se calcula
  matemáticamente a partir del rectángulo de 37×24 mm físicos que el backend
  estampa sobre el PDF final (`SignatureNotificationService`, FPDI/FPDF), usando
  las dimensiones físicas reales de cada página (`PageInfo.widthPt` /
  `heightPt`). Coincide con lo estampado a cualquier zoom o tamaño de contenedor,
  sin depender de verificación visual contra el legacy.

- **Transporte del token** (`tokenTransport`). Los dos GET del SDK
  (`start_autografa` y `asignado/autografa`) aceptan el token en el header
  `X-Digid-Token`, con fallback a `?token=` para los consumidores legacy. Ver
  [sección 5.1 de la guía](GUIA-INTEGRACION.md#51-cómo-viaja-el-token-tokentransport).

  Del lado del backend el cambio vive en
  `ArchivoFirmaController::StartAutografa` y `AsignadoController::getDataAutografa`.
  Consumidores legacy que **siguen usando `?token=`** y hay que migrar antes de
  poder borrar el fallback:

  | Endpoint | Consumidor legacy |
  |---|---|
  | `start_autografa` | `public/js/signatory/electronica/start.js` |
  | `start_autografa` | `public/js/signatory/autografa/firmar.js` |
  | `asignado/autografa` | `public/js/signatory/autografa/ine_front.js` |
  | `asignado/autografa` | `public/js/signatory/autografa/ine_back.js` |
  | `asignado/autografa` | `public/js/signatory/autografa/create_sign.js` |

  (`public/js/signatory/autografa/start.js` ya está migrado al header.)

## Pendiente de verificar contra un entorno real

- Confirmar que `/docments/verarchivo/{id}` funciona para firmantes externos en un
  origen cross-origin (dominio del integrador distinto al del backend Digid).

- Confirmar con un token real cuál id se usa para las rutas de storage del cliente
  (`client.id` vs `document.client`).

- Confirmar que el CORS de producción admite `X-Digid-Token` en
  `Access-Control-Allow-Headers` antes de que algún integrador use
  `tokenTransport="header"`. En la configuración revisada
  (`config/cors.php`) `allowed_headers` es `['*']`, que ya lo cubre.

## Riesgos de seguridad conocidos y abiertos

Levantados en la revisión de seguridad del SDK; los dos primeros ya se corrigieron.

| # | Hallazgo | Estado |
|---|---|---|
| 1 | Token del firmante en la query string | Corregido (`tokenTransport`); falta que los integradores pasen a `'header'` |
| 2 | Ruta de subida del escáner sin validar (magic bytes, 10 MB, megapíxeles) | Corregido |
| 3 | Si falla el re-encode a JPEG se sube el original **con EXIF/GPS** | Abierto |
| 4 | WASM de detección biométrica desde CDN de terceros por default | Abierto (documentado; `detectionAssets` permite autoalojar) |
| 5 | `MEDIAPIPE_VERSION` fijo `1.0.0` vs `^1.0.0` en package.json | Abierto |
| 6 | `termsUrl` llega a `href` sin validar el esquema | Abierto |
| 7 | Valor del backend a `<img src>` sin validar (`fileUrl`) | Abierto |
| 8 | Vulnerabilidades de dependencias solo de desarrollo | Abierto (sin impacto para consumidores: `npm audit --omit=dev` da 0) |
