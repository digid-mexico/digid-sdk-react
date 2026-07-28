// Geometria del marco fijo guiado (spec 2026-07-17): el usuario alinea la
// credencial a un marco ID-1 dibujado en pantalla y la deteccion corre SOLO
// dentro del ROI de ese marco. Funciones puras, sin DOM: todo es testeable
// y reutilizable desde los scripts de replay en Node.
//
// Port del prototipo KYC (Task 22): sin cambios de algoritmo/umbrales.
import { quadArea } from './docscan';
import type { Corners, GuidanceMessage, MarcoValidation, Rect } from './types';

const CORNER_KEYS = ['topLeftCorner', 'topRightCorner', 'bottomLeftCorner', 'bottomRightCorner'] as const;

// Aspecto ID-1 (INE): 85.6mm / 53.98mm.
export const MARCO_ASPECT = 1.586;
// Fraccion del ancho del elemento mostrado que ocupa el marco. En MOVIL el
// usuario sostiene el telefono cerca y llena un marco grande.
export const MARCO_WIDTH_FRAC = 0.8;
// En WEBCAM DE ESCRITORIO la credencial se sostiene a distancia de brazo y
// queda chica en el encuadre (gran angular): con el marco a 0.8 la tarjeta
// nunca llenaba el ROI y el detector la descartaba por debajo de minAreaRatio
// (el reverso, casi todo QR/bajo contraste, era el mas afectado). Calibrado
// 2026-07-17 con 6 videos de webcam (barrido de escaneo): a ~0.42 la tarjeta
// llena el ROI y la deteccion dispara. Camera.jsx elige cual usar por
// isMobileDevice(). Ver HANDOFF "WATCH — reverso en webcam".
export const MARCO_WIDTH_FRAC_DESKTOP = 0.42;
// Tope del alto del marco (viewports anchos y bajos: webcam en ventana corta).
export const MARCO_MAX_HEIGHT_FRAC = 0.8;
// Margen del ROI alrededor del marco (por lado, fraccion del marco). Tambien
// define la banda de tolerancia de validateQuadInMarco: un lado del quad
// puede quedar hasta este porcentaje ADENTRO del marco sin rechazarse.
export const ROI_MARGIN_FRAC = 0.15;
// Cobertura minima del quad sobre el area del marco. Por debajo es un
// candidato interior (la clase del recorte mutilado de IMG_0352).
export const MARCO_MIN_COVERAGE = 0.70;
// Modo CONTENIDO (2026-07-22, pedido de Mario): una credencial bien
// detectada DENTRO del marco captura aunque no lo llene — este es el piso
// de cobertura para ese camino. Es el piso de legibilidad (con el stage
// ancho de escritorio, 0.5 del marco ~ recorte de >=350px) y el nuevo
// guardian practico contra el recorte mutilado en vivo (el 0.70 alineado
// ya no es la unica via de captura). WATCH: validar con el corpus grabado
// de la calibracion (Task 8); es palanca sweepeable (containedCoverage).
// 0.5 -> 0.42 (calibracion 2026-07-23, corpus 70 sesiones): el sweep gano
// una captura extra (45db, manual en vivo -> recorte completo y legible) y
// los 10 recortes del combo ganador salieron sin mutilacion.
// 0.42 -> 0.55 (2a vuelta reverso 2026-07-24, corpus 56 reverso + 22 frente):
// con el rescate por soporte del worker y estabilidad 2, la banda 0.42-0.55
// resulto ~50% recortes malos (9654 mutilado, 9085 lavado) — el piso 0.55
// los mata conservando 18/19 capturas buenas de reverso y ganando +1 neta en
// frente; bajo el piso, la guia pide acercarla (mejor recorte que capturar
// chiquito).
export const MARCO_CONTAINED_COVERAGE = 0.55;
// Ticks seguidos sin quad antes de sugerir fondo con contraste (calibracion
// reverso 2026-07-23): la familia dominante de fallos del corpus es la
// credencial blanca sobre fondo CLARO — indetectable a nivel bordes (se
// probo hasta umbral adaptativo sin exito). A ~3 ticks/s, 20 ~ 6-7s de
// busqueda antes del consejo.
export const MARCO_NOQUAD_TIP_TICKS = 20;

// Rect del marco en pixeles del ELEMENTO mostrado (para pintar el SVG).
export function marcoDisplayRect(dispW: number, dispH: number, {
  widthFrac = MARCO_WIDTH_FRAC,
  aspect = MARCO_ASPECT,
  maxHeightFrac = MARCO_MAX_HEIGHT_FRAC
}: { widthFrac?: number; aspect?: number; maxHeightFrac?: number } = {}): Rect {
  let width = dispW * widthFrac;
  let height = width / aspect;
  if (height > dispH * maxHeightFrac) {
    height = dispH * maxHeightFrac;
    width = height * aspect;
  }
  return { x: (dispW - width) / 2, y: (dispH - height) / 2, width, height };
}

// Inversa del mapeo object-fit: cover de mapCornersToDisplay (docscan.ts):
// convierte un rect en pixeles del elemento mostrado a coords del frame.
export function displayRectToFrame(rect: Rect, srcW: number, srcH: number, dispW: number, dispH: number): Rect {
  const scale = Math.max(dispW / srcW, dispH / srcH);
  const offsetX = (dispW - srcW * scale) / 2;
  const offsetY = (dispH - srcH * scale) / 2;
  return {
    x: (rect.x - offsetX) / scale,
    y: (rect.y - offsetY) / scale,
    width: rect.width / scale,
    height: rect.height / scale
  };
}

// Marco en coords del FRAME (2026-07-23): la fraccion aplica al ancho del
// video, no al del elemento mostrado — asi el ROI efectivo de deteccion es
// CONSTANTE sin importar la forma de la ventana (en ventanas angostas el
// marco por-display quedaba diminuto: 0.42 de una rebanada recortada).
// maxW/maxH acotan al area VISIBLE del cover (el marco nunca se sale de la
// pantalla); centrado en el frame = centrado en pantalla (cover alinea
// centros).
export function marcoFrameRect(srcW: number, srcH: number, {
  widthFrac = MARCO_WIDTH_FRAC,
  aspect = MARCO_ASPECT,
  maxW = Infinity,
  maxH = Infinity
}: { widthFrac?: number; aspect?: number; maxW?: number; maxH?: number } = {}): Rect {
  let width = Math.min(srcW * widthFrac, maxW);
  let height = width / aspect;
  if (height > maxH) {
    height = maxH;
    width = height * aspect;
  }
  return { x: (srcW - width) / 2, y: (srcH - height) / 2, width, height };
}

// Inversa de displayRectToFrame: rect en coords del frame -> coords del
// elemento mostrado (object-fit: cover), para pintar el SVG del marco.
export function frameRectToDisplay(rect: Rect, srcW: number, srcH: number, dispW: number, dispH: number): Rect {
  const scale = Math.max(dispW / srcW, dispH / srcH);
  const offsetX = (dispW - srcW * scale) / 2;
  const offsetY = (dispH - srcH * scale) / 2;
  return {
    x: rect.x * scale + offsetX,
    y: rect.y * scale + offsetY,
    width: rect.width * scale,
    height: rect.height * scale
  };
}

// ROI de analisis: marco + margen por lado, acotado a los limites del frame.
export function roiFromMarco(marco: Rect, srcW: number, srcH: number, marginFrac: number = ROI_MARGIN_FRAC): Rect {
  const mx = marco.width * marginFrac;
  const my = marco.height * marginFrac;
  const x = Math.max(0, marco.x - mx);
  const y = Math.max(0, marco.y - my);
  return {
    x,
    y,
    width: Math.min(srcW - x, marco.width + 2 * mx),
    height: Math.min(srcH - y, marco.height + 2 * my)
  };
}

// Reexpresa un rect en coords de frame como coords del canvas del ROI (el
// ROI se dibuja escalado a canvasW pixeles de ancho).
export function rectToRoiCanvas(rect: Rect, roi: Rect, canvasW: number): Rect {
  const f = canvasW / roi.width;
  return {
    x: (rect.x - roi.x) * f,
    y: (rect.y - roi.y) * f,
    width: rect.width * f,
    height: rect.height * f
  };
}

// Esquinas detectadas en el canvas del ROI -> coords del frame completo
// (para extraer el documento desde la resolucion nativa).
export function roiCornersToFrame(corners: Corners, roi: Rect, canvasW: number): Corners {
  const f = roi.width / canvasW;
  const out = {} as Corners;
  for (const key of CORNER_KEYS) {
    out[key] = { x: corners[key].x * f + roi.x, y: corners[key].y * f + roi.y };
  }
  return out;
}

export function scaleRect(rect: Rect, factor: number): Rect {
  return { x: rect.x * factor, y: rect.y * factor, width: rect.width * factor, height: rect.height * factor };
}

// Validacion del quad ganador contra el marco (ambos en coords del canvas
// del ROI). Camino ALINEADO (spec 2026-07-17): cobertura >= minCoverage y
// ningun lado "muy adentro" de la banda del margen. Camino CONTENIDO
// (2026-07-22): si no alinea pero la cobertura alcanza containedCoverage,
// captura igual — la credencial se detecto bien dentro del marco aunque no
// lo llene (contained: true en el veredicto). containedCoverage: 1 apaga
// el modo contenido (comportamiento estricto original).
export function validateQuadInMarco(corners: Corners, marco: Rect, {
  minCoverage = MARCO_MIN_COVERAGE,
  marginFrac = ROI_MARGIN_FRAC,
  containedCoverage = MARCO_CONTAINED_COVERAGE
}: { minCoverage?: number; marginFrac?: number; containedCoverage?: number } = {}): MarcoValidation {
  const coverage = quadArea(corners) / (marco.width * marco.height);
  if (coverage >= minCoverage) {
    const xs = CORNER_KEYS.map(key => corners[key].x);
    const ys = CORNER_KEYS.map(key => corners[key].y);
    const tolX = marco.width * marginFrac;
    const tolY = marco.height * marginFrac;
    let reason: string | null = null;
    if (Math.min(...xs) > marco.x + tolX) reason = 'inside-left';
    else if (Math.max(...xs) < marco.x + marco.width - tolX) reason = 'inside-right';
    else if (Math.min(...ys) > marco.y + tolY) reason = 'inside-top';
    else if (Math.max(...ys) < marco.y + marco.height - tolY) reason = 'inside-bottom';
    if (!reason) return { ok: true, coverage };
    if (coverage >= containedCoverage) return { ok: true, coverage, contained: true };
    return { ok: false, reason, coverage };
  }
  if (coverage >= containedCoverage) return { ok: true, coverage, contained: true };
  return { ok: false, reason: 'coverage', coverage };
}

// Guia del modo marco. Sustituye a frameGuidance en el camino en vivo (la
// posicion ya la resuelve el marco: no hay mensajes de izquierda/derecha,
// asi que tampoco hace falta el ajuste de espejo). Los umbrales de frame
// (glare 0.2%, brillo 55) son los mismos de frameGuidance — calibrados con
// el corpus 2026-07-14, no cambiarlos aqui sin recalibrar alla.
export function marcoGuidance({
  corners, frame, validation, noQuadStreak = 0
}: {
  corners: Corners | null;
  frame?: { glareRatio?: number; brightness?: number } | null;
  validation?: MarcoValidation;
  noQuadStreak?: number;
}): GuidanceMessage | null {
  if (!corners) {
    if (frame && (frame.glareRatio ?? 0) > 0.002) {
      return { message: 'Una luz deslumbra la cámara - Mueve o apaga el foco frente a ella', tone: 'warn' };
    }
    if (frame && (frame.brightness ?? Infinity) < 55) {
      return { message: 'Se ve muy oscuro - Enciende una luz', tone: 'warn' };
    }
    if (noQuadStreak >= MARCO_NOQUAD_TIP_TICKS) {
      return { message: 'No logro distinguir la credencial - Prueba sobre un fondo oscuro', tone: 'warn' };
    }
    return { message: 'Coloca la credencial dentro del marco', tone: 'idle' };
  }
  if (validation && !validation.ok) {
    if (validation.reason === 'coverage') {
      return { message: 'Acércala hasta llenar el marco', tone: 'warn' };
    }
    return { message: 'Ajústala para cubrir todo el marco', tone: 'warn' };
  }
  const tilt = Math.abs(Math.atan2(
    corners.topRightCorner.y - corners.topLeftCorner.y,
    corners.topRightCorner.x - corners.topLeftCorner.x
  )) * 180 / Math.PI;
  if (tilt > 12 && tilt < 168) return { message: 'Endereza la credencial', tone: 'warn' };
  return null;
}
