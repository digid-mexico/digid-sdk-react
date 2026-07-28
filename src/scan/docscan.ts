// Deteccion y recorte de documentos via Web Worker (scan-assets/scan-worker.js):
// OpenCV corre fuera del hilo principal porque su build wasm congela la UI
// al compilar. El algoritmo (contorno + esquinas + warp de perspectiva) es el
// de jscanify (MIT), portado al worker. Mientras el worker no este listo,
// el pipeline heuristico de scan.ts sirve de respaldo.
//
// Port del prototipo KYC (Task 22): el worker se localiza vía ScanAssets en
// vez del path hardcodeado '/scan-worker.js?v=14' del prototipo original —
// el consumidor del SDK sirve scan-assets/ en la URL que decida (default
// '/digid-scan/'). Toda la lógica (constantes, umbrales, algoritmos,
// comentarios en español) se preserva sin cambios.

import type {
  Corners,
  DetectDocumentResult,
  GuidanceMessage,
  Point,
  QualityAssessment,
  QualityMetrics,
  QualityVerdict,
  ScanAssets,
  StillDetectAttempt,
  StillDetectDocumentResult,
} from './types';

const CORNER_KEYS = ['topLeftCorner', 'topRightCorner', 'bottomLeftCorner', 'bottomRightCorner'] as const;

// Aspecto de una credencial ID-1 (INE): 85.6mm / 53.98mm
const ID1_ASPECT = 1.586;

const DEFAULT_WORKER_URL = '/digid-scan/scan-worker.js';

let worker: Worker | null = null;
let ready = false;
let failed = false;
let nextId = 1;
const pending = new Map<number, (value: any) => void>();

export function initDocScan(assets?: ScanAssets): void {
  if (worker || failed || typeof window === 'undefined') return;
  try {
    worker = new Worker(assets?.workerUrl ?? DEFAULT_WORKER_URL);
  } catch (error) {
    console.warn('Worker de escaneo no disponible.', error);
    failed = true;
    return;
  }
  worker.onmessage = event => {
    const message = event.data;
    if (message.type === 'ready') {
      ready = true;
      return;
    }
    if (message.type === 'init-error') {
      console.warn('OpenCV no inicializo en el worker.', message.error);
      failed = true;
      ready = false;
      return;
    }
    const resolve = pending.get(message.id);
    if (resolve) {
      pending.delete(message.id);
      resolve(message);
    }
  };
  worker.onerror = event => {
    console.warn('Worker de escaneo fallo.', event.message);
    failed = true;
    ready = false;
    for (const resolve of pending.values()) resolve(null);
    pending.clear();
  };
}

export function docScanReady(): boolean {
  return ready && !failed;
}

function call(message: Record<string, unknown>, transfer?: Transferable[]): Promise<any> {
  return new Promise(resolve => {
    const id = nextId++;
    pending.set(id, resolve);
    worker!.postMessage({ ...message, id }, transfer || []);
  });
}

function canvasImageData(canvas: HTMLCanvasElement): ImageData {
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export function quadArea(corners: Corners): number {
  const points = [
    corners.topLeftCorner,
    corners.topRightCorner,
    corners.bottomRightCorner,
    corners.bottomLeftCorner
  ];
  let doubled = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    doubled += a.x * b.y - b.x * a.y;
  }
  return Math.abs(doubled) / 2;
}

export function quadSize(corners: Corners): { width: number; height: number } {
  const top = Math.hypot(corners.topRightCorner.x - corners.topLeftCorner.x, corners.topRightCorner.y - corners.topLeftCorner.y);
  const bottom = Math.hypot(corners.bottomRightCorner.x - corners.bottomLeftCorner.x, corners.bottomRightCorner.y - corners.bottomLeftCorner.y);
  const left = Math.hypot(corners.bottomLeftCorner.x - corners.topLeftCorner.x, corners.bottomLeftCorner.y - corners.topLeftCorner.y);
  const right = Math.hypot(corners.bottomRightCorner.x - corners.topRightCorner.x, corners.bottomRightCorner.y - corners.topRightCorner.y);
  return { width: (top + bottom) / 2, height: (left + right) / 2 };
}

export function quadAspect(corners: Corners): number {
  const size = quadSize(corners);
  return size.height > 0 ? size.width / size.height : 0;
}

// Desplazamiento maximo de esquina entre dos frames, normalizado a la
// diagonal del canvas. < 0.03 se considera estable.
export function cornerMovement(previous: Corners | null, next: Corners | null, width: number, height: number): number {
  if (!previous || !next) return 1;
  const diagonal = Math.hypot(width, height) || 1;
  let max = 0;
  for (const key of CORNER_KEYS) {
    const moved = Math.hypot(previous[key].x - next[key].x, previous[key].y - next[key].y);
    if (moved > max) max = moved;
  }
  return max / diagonal;
}

// Confirmacion temporal de la deteccion EN VIVO: el overlay (y la guia
// direccional basada en esquinas) solo se muestran cuando CONFIRM_FRAMES
// frames consecutivos coinciden (movimiento < CONFIRM_MOVEMENT, normalizado
// a la diagonal). Un falso positivo de un solo tick (cabeza, reflejo) no
// llega a pintarse. Mas laxo que la compuerta de captura (0.045 y 3 frames
// en Camera.jsx): confirmar rapido, capturar exigente.
export const CONFIRM_FRAMES = 2;
export const CONFIRM_MOVEMENT = 0.05;

export interface DetectionConfirmer {
  // corners debe venir en un espacio de coordenadas ESTABLE entre ticks
  // (Camera las normaliza a 960px: la escalera cambia la resolucion).
  push(corners: Corners | null, width: number, height: number): boolean;
  reset(): void;
}

export function createDetectionConfirmer({ frames = CONFIRM_FRAMES, movement = CONFIRM_MOVEMENT } = {}): DetectionConfirmer {
  let previous: Corners | null = null;
  let streak = 0;
  return {
    push(corners, width, height) {
      if (!corners) {
        previous = null;
        streak = 0;
        return false;
      }
      streak = previous && cornerMovement(previous, corners, width, height) < movement
        ? streak + 1
        : 1;
      previous = corners;
      return streak >= frames;
    },
    reset() {
      previous = null;
      streak = 0;
    }
  };
}

// Escala las 4 esquinas por un factor (coords del canvas de deteccion ->
// coords del frame a resolucion completa).
export function scaleCorners(corners: Corners, factor: number): Corners {
  const out = {} as Corners;
  for (const key of CORNER_KEYS) {
    out[key] = { x: corners[key].x * factor, y: corners[key].y * factor };
  }
  return out;
}

// Mapea esquinas del frame de video (srcW x srcH) a pixeles del elemento
// mostrado (dispW x dispH) bajo object-fit: cover. Devuelve [TL, TR, BR, BL]
// listo para el <polygon> del overlay.
export function mapCornersToDisplay(corners: Corners, srcW: number, srcH: number, dispW: number, dispH: number): Point[] {
  const scale = Math.max(dispW / srcW, dispH / srcH);
  const offsetX = (dispW - srcW * scale) / 2;
  const offsetY = (dispH - srcH * scale) / 2;
  const pt = (c: Point) => ({ x: c.x * scale + offsetX, y: c.y * scale + offsetY });
  return [
    pt(corners.topLeftCorner),
    pt(corners.topRightCorner),
    pt(corners.bottomRightCorner),
    pt(corners.bottomLeftCorner)
  ];
}

// Devuelve { corners, areaRatio, aspect, score, frame } — corners es null si
// no hubo deteccion, pero frame (brillo/contraste/glare del encuadre entero)
// llega siempre que el worker respondio: alimenta la guia de mensajes.
// Devuelve null solo si el worker no esta disponible o fallo.
export async function detectDocument(
  canvas: HTMLCanvasElement,
  { minAreaRatio = 0.04, maxAreaRatio = 0.70, allowPortrait = false } = {}
): Promise<DetectDocumentResult | null> {
  if (!docScanReady()) return null;
  const imageData = canvasImageData(canvas);
  // La validacion geometrica (cuadrilatero convexo, aspecto ID-1, esquinas
  // dentro de imagen, angulos ~90) vive en el worker; aqui solo se pasa el
  // rango de area permitido.
  const result = await call(
    { type: 'detect', imageData, minAreaRatio, maxAreaRatio, allowPortrait },
    [imageData.data.buffer]
  );
  if (!result) return null;
  const frame = result.frame || null;
  if (!result.corners || CORNER_KEYS.some(key => !result.corners[key])) {
    return { corners: null, frame };
  }
  return { corners: result.corners, areaRatio: result.areaRatio, aspect: result.aspect, score: result.score, frame };
}

// Escalera de intentos para imagenes ESTATICAS (captura manual con el boton
// o archivo de galeria). El pipeline del worker esta calibrado a ~480-960px:
// a resolucion nativa (>1000px) Canny/dilate/refinado pierden calibre (medido
// con fotos reales: a nativo detecta 3/6 y regresa el recorte interior; a
// 720px detecta 4/6 con aspecto ID-1). Orden: 720 conservador (documento
// llenando el encuadre tipico de galeria), 960 (tarjeta chica o detalle fino:
// con el corpus de webcam 2026-07-14 el quad de 960 es mas fiel que el de
// 480, que llego a recortar el encabezado), 480 como ultimo recurso.
const STILL_DETECT_ATTEMPTS: StillDetectAttempt[] = [
  { width: 720, minAreaRatio: 0.10, maxAreaRatio: 0.95 },
  { width: 960, minAreaRatio: 0.05, maxAreaRatio: 0.95 },
  { width: 480, minAreaRatio: 0.05, maxAreaRatio: 0.90 }
];

// Acota cada escalon al ancho real de la fuente (nunca se escala hacia
// arriba) y elimina intentos que quedarian identicos. Pura y testeable.
export function planStillDetectAttempts(sourceWidth: number, attempts: StillDetectAttempt[] = STILL_DETECT_ATTEMPTS): StillDetectAttempt[] {
  const plan: StillDetectAttempt[] = [];
  const seen = new Set<string>();
  for (const attempt of attempts) {
    const width = Math.min(attempt.width, sourceWidth);
    const key = `${width}/${attempt.minAreaRatio}/${attempt.maxAreaRatio}`;
    if (seen.has(key)) continue;
    seen.add(key);
    plan.push({ ...attempt, width });
  }
  return plan;
}

// Reetiqueta las esquinas de un quad VERTICAL (tarjeta rotada 90 grados en la
// foto) para que el warp de extraccion la regrese acostada. Hipotesis: el tope
// fisico de la tarjeta apunta a la IZQUIERDA de la imagen (rotacion 90 CCW,
// la forma natural de acostar una credencial); si quedo de cabeza, el chequeo
// de bandas de orientDocumentForStep la voltea despues.
export function portraitToLandscape(corners: Corners): Corners {
  return {
    topLeftCorner: corners.bottomLeftCorner,
    topRightCorner: corners.topLeftCorner,
    bottomLeftCorner: corners.bottomRightCorner,
    bottomRightCorner: corners.topRightCorner
  };
}

// Deteccion para imagen estatica: baja la fuente a cada escala del plan,
// detecta ahi y regresa las esquinas YA reescaladas a coordenadas de la
// fuente (listas para extractDocument sobre la resolucion nativa). Acepta
// la tarjeta vertical (foto de galeria con la credencial parada): las
// esquinas regresan reetiquetadas para que el recorte salga acostado y
// rotated:true avisa que hay que verificar la orientacion final.
// OJO contrato distinto a detectDocument: aqui un fallo colapsa a null (no
// se exponen las stats de frame de los escalones intermedios).
export async function detectDocumentStill(canvas: HTMLCanvasElement): Promise<StillDetectDocumentResult | null> {
  if (!docScanReady()) return null;
  for (const attempt of planStillDetectAttempts(canvas.width)) {
    let target: HTMLCanvasElement = canvas;
    let factor = 1;
    if (attempt.width < canvas.width) {
      target = document.createElement('canvas');
      target.width = attempt.width;
      target.height = Math.max(1, Math.round(canvas.height * attempt.width / canvas.width));
      target.getContext('2d')!.drawImage(canvas, 0, 0, target.width, target.height);
      factor = canvas.width / target.width;
    }
    const detection = await detectDocument(target, {
      minAreaRatio: attempt.minAreaRatio,
      maxAreaRatio: attempt.maxAreaRatio,
      allowPortrait: true
    });
    if (detection && detection.corners) {
      const rotated = (detection.aspect ?? 0) < 1;
      const corners = rotated ? portraitToLandscape(detection.corners) : detection.corners;
      return {
        ...detection,
        corners: scaleCorners(corners, factor),
        aspect: rotated ? 1 / (detection.aspect ?? 1) : (detection.aspect ?? 0),
        rotated
      };
    }
  }
  return null;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

// Veredicto de calidad SIN OCR a partir de las metricas del worker.
// Funcion pura (testeable): decide si la captura es utilizable y, si no,
// que corregir. Umbrales calibrados para el recorte del documento
// normalizado a 600px de ancho:
// - sharpness: varianza del Laplaciano. Documento con texto enfocado suele
//   dar > 100; borroso por movimiento < 40.
// - brightness 60-215 (fuera de eso se pierden datos).
// - glareRatio: > 8% de pixeles quemados = reflejo que tapa datos.
// - contrast: un documento real (texto + foto) da > 25; una superficie
//   plana mal recortada da menos.
// Tope de washedRatio: por encima se rechaza siempre en qualityVerdict.
// Corpus telefono 2026-07-15 (capturas reales de iPhone): el umbral viejo
// (0.05) rechazaba en bucle tomas nitidas y legibles cuyo laminado
// reflejaba luz de techo (wash 0.056, 0.079, 0.107, 0.111 medidos, todo lo
// demas OK). El umbral subio a 0.10: pasa las dos primeras observaciones
// (0.056/0.079); la franja 0.10-0.15 la rescata la valvula de escape de
// Camera.jsx (isWashOnlyReject) tras varios intentos fallidos seguidos. Un
// wash extremo como una INE mostrada en la pantalla de una laptop (0.226
// medido, fraude/presentacion) queda bloqueado siempre: no entra en la
// franja de la valvula ni aunque se reintente.
const WASHED_RATIO_THRESHOLD = 0.10;

// Tope de la valvula de escape (isWashOnlyReject / Camera.jsx): un rechazo
// wash-only por debajo de este valor es rescatable tras varios intentos;
// en o por encima nunca se rescata (evita capturar un documento-en-pantalla
// como el caso de 0.226 arriba).
export const WASH_VALVE_CAP = 0.15;

export function qualityVerdict(metrics: QualityMetrics | null | undefined): QualityVerdict {
  if (!metrics) return { ok: false, score: 0, hint: 'No se pudo evaluar la imagen', codes: [] };
  const problems: string[] = [];
  const codes: string[] = [];
  // lowLightRatio: si mas de un cuarto del recorte es oscuro (< 100 luma),
  // el quad detectado se llevo fondo (escritorio/sombra) en vez de la
  // tarjeta: corpus real dio 34% en el recorte falso vs <= 21% en recortes
  // legitimos de la credencial.
  if (metrics.lowLightRatio !== undefined && metrics.lowLightRatio > 0.28) {
    problems.push('No se aprecia bien el documento - Intenta con más luz o reencuadra');
    codes.push('low-light');
  }
  // washedRatio: bloques de la zona central lavados por el reflejo difuso de
  // un foco (media alta, varianza casi nula). En el corpus de fotos reales
  // con lampara encima separa limpio: >= 10% en las que el reflejo tapa
  // datos de forma consistente contra <= 0.111 en capturas de telefono
  // legibles con laminado brilloso (ver WASHED_RATIO_THRESHOLD arriba).
  if (metrics.washedRatio !== undefined && metrics.washedRatio > WASHED_RATIO_THRESHOLD) {
    problems.push('Un reflejo tapa parte del documento - Inclínalo o mueve la luz');
    codes.push('washed');
  }
  // sharpRatio: varianza del Laplaciano vs la misma imagen desenfocada.
  // Atrapa borrosidad en contenido de textura densa (QR/codigos) donde la
  // varianza absoluta sigue alta aunque la foto este movida. A la inversa,
  // un ratio fuerte (>= 2.6) avala capturas de webcam suaves pero legibles
  // y baja el piso de varianza exigido de 45 a 25; ratio < 1.9 es borroso
  // siempre.
  const blurryByRatio = metrics.sharpRatio !== undefined && metrics.sharpRatio < 1.9;
  const weakRatio = metrics.sharpRatio === undefined || metrics.sharpRatio < 2.6;
  if (blurryByRatio || metrics.sharpness < (weakRatio ? 45 : 25)) {
    problems.push('Imagen borrosa - Mantén firme la cámara');
    codes.push('blurry');
  }
  if (metrics.brightness < 60) {
    problems.push('Falta luz - Busca un lugar más iluminado');
    codes.push('dark');
  }
  if (metrics.brightness > 215) {
    problems.push('Demasiada luz - Aleja el documento de la luz directa');
    codes.push('bright');
  }
  // glareRatio del RECORTE (pixeles quemados sobre el documento). Misma
  // formula que frame.glareRatio en frameGuidance pero sobre contenido
  // distinto: no cruzar estos umbrales (0.08 aqui vs 0.002 alla).
  if (metrics.glareRatio > 0.08) {
    problems.push('Reduce los reflejos del documento');
    codes.push('glare');
  }
  if (metrics.contrast < 25) {
    problems.push('Enfoca el documento');
    codes.push('contrast');
  }

  const ratioScore = metrics.sharpRatio === undefined ? 1 : clamp01((metrics.sharpRatio - 1.2) / 1.8);
  const sharpScore = clamp01((metrics.sharpness - 20) / 160) * ratioScore;
  const brightScore = metrics.brightness < 60
    ? clamp01(metrics.brightness / 60)
    : metrics.brightness > 215 ? clamp01((255 - metrics.brightness) / 40) : 1;
  const contrastScore = clamp01(metrics.contrast / 55);
  const glareScore = clamp01(1 - metrics.glareRatio / 0.16);
  const score = Math.round(100 * (
    sharpScore * 0.45 + brightScore * 0.20 + contrastScore * 0.20 + glareScore * 0.15
  ));

  return { ok: problems.length === 0, score, hint: problems[0] || '', codes };
}

// Valvula de escape para el wash-only: true solo si el rechazo se debio
// EXCLUSIVAMENTE a washedRatio y el valor sigue por debajo del tope
// (WASH_VALVE_CAP). Consume el objeto de assessDocQuality
// ({ ...qualityVerdict(metrics), metrics }), no el metrics crudo.
export function isWashOnlyReject(verdict: (QualityVerdict & { metrics?: QualityMetrics | null }) | null | undefined): boolean {
  if (!verdict || verdict.ok) return false;
  if (!verdict.metrics) return false;
  if (!Array.isArray(verdict.codes) || verdict.codes.length !== 1 || verdict.codes[0] !== 'washed') return false;
  return (verdict.metrics.washedRatio ?? 0) < WASH_VALVE_CAP;
}

// Freno MINIMO anti-borrosidad extrema (spec 2026-07-17): la compuerta de
// calidad ya no bloquea capturas — qualityVerdict queda como score/aviso
// consultivo. Lo unico que retrasa la AUTO-captura es este chequeo, pensado
// solo para no disparar con la tarjeta en pleno movimiento. Umbrales muy por
// debajo de cualquier foto legible del corpus (la mas floja aceptada:
// sharp ~25 / ratio ~1.9; ver calibracion en el plan 2026-07-17). El
// obturador manual NUNCA pasa por aqui.
export const EXTREME_BLUR_SHARPNESS = 15;
export const EXTREME_BLUR_RATIO = 1.35;

export function extremeBlur(
  metrics: Pick<QualityMetrics, 'sharpness' | 'sharpRatio'> | null | undefined,
  {
    sharpness = EXTREME_BLUR_SHARPNESS,
    ratio = EXTREME_BLUR_RATIO
  } = {}
): boolean {
  if (!metrics) return false;
  if (metrics.sharpRatio !== undefined && metrics.sharpRatio < ratio) return true;
  return metrics.sharpness < sharpness;
}

// Guia de encuadre en vivo. Funcion pura (testeable): a partir del resultado
// de deteccion (corners puede ser null), las stats del frame completo y el
// tamano del canvas de deteccion, decide QUE decirle al usuario para corregir.
// Devuelve { message, tone } o null cuando no hay nada que corregir (la UI
// entonces muestra los mensajes de estabilidad/captura).
// Umbrales calibrados con el corpus 2026-07-14 (webcam 1440x960 con foco):
// - glareRatio de frame >= 0.2% solo aparecio con la lampara DENTRO del
//   encuadre (0.44% vs <= 0.03% en el resto) — en ese caso no hay deteccion
//   posible a ninguna escala.
// - los centros de tarjeta bien sostenida cayeron en x 47-62%, y 39-51%:
//   las bandas de 30/32% no reganan sobre encuadres normales.
// mirrored: la vista previa se muestra en espejo (CSS scaleX(-1)); las
// esquinas siguen en coords del frame crudo, asi que izquierda/derecha se
// invierten para coincidir con lo que el usuario VE en pantalla.
export function frameGuidance({
  corners, areaRatio, frame, width, height, mirrored = false
}: {
  corners: Corners | null;
  areaRatio?: number;
  frame?: { glareRatio?: number; brightness?: number } | null;
  width: number;
  height: number;
  mirrored?: boolean;
}): GuidanceMessage | null {
  if (!corners) {
    // frame.glareRatio = quemados sobre el ENCUADRE COMPLETO (misma formula
    // que metrics.glareRatio de qualityVerdict, contenido distinto): un foco
    // en cuadro apenas ocupa ~0.4% del frame, por eso el umbral es 0.2% y no
    // el 8% del recorte.
    if (frame && (frame.glareRatio ?? 0) > 0.002) {
      return { message: 'Una luz deslumbra la cámara - Mueve o apaga el foco frente a ella', tone: 'warn' };
    }
    if (frame && (frame.brightness ?? Infinity) < 55) {
      return { message: 'Se ve muy oscuro - Enciende una luz', tone: 'warn' };
    }
    return { message: 'Coloca el documento dentro del marco', tone: 'idle' };
  }
  if ((areaRatio ?? 0) < 0.10) return { message: 'Acerca el documento a la cámara', tone: 'warn' };
  if ((areaRatio ?? 0) > 0.62) return { message: 'Aleja un poco el documento', tone: 'warn' };
  const cx = (corners.topLeftCorner.x + corners.topRightCorner.x + corners.bottomLeftCorner.x + corners.bottomRightCorner.x) / (4 * width);
  const cy = (corners.topLeftCorner.y + corners.topRightCorner.y + corners.bottomLeftCorner.y + corners.bottomRightCorner.y) / (4 * height);
  const left: GuidanceMessage = { message: 'Está muy a la izquierda - Muévelo al centro', tone: 'warn' };
  const right: GuidanceMessage = { message: 'Está muy a la derecha - Muévelo al centro', tone: 'warn' };
  if (cx < 0.32) return mirrored ? right : left;
  if (cx > 0.68) return mirrored ? left : right;
  if (cy < 0.30) return { message: 'Está muy arriba - Muévelo al centro', tone: 'warn' };
  if (cy > 0.70) return { message: 'Está muy abajo - Muévelo al centro', tone: 'warn' };
  const tilt = Math.abs(Math.atan2(
    corners.topRightCorner.y - corners.topLeftCorner.y,
    corners.topRightCorner.x - corners.topLeftCorner.x
  )) * 180 / Math.PI;
  if (tilt > 12 && tilt < 168) return { message: 'Endereza el documento', tone: 'warn' };
  return null;
}

// Decide si un recorte enderezado desde tarjeta VERTICAL quedo de cabeza,
// comparando la banda superior e inferior del recorte. INE frente: la franja
// gris del encabezado (mas oscura) va ARRIBA. INE reverso: la zona de
// lectura mecanica (texto denso) va ABAJO. delta minimo de 4 niveles para no
// voltear por gradientes de iluminacion.
export function orientationFlipNeeded(topMean: number, bottomMean: number, step: string): boolean {
  const delta = step === 'back' ? bottomMean - topMean : topMean - bottomMean;
  return delta > 4;
}

// Aplica orientationFlipNeeded a un canvas recortado: mide la luma media de
// las bandas top/bottom (20% de la altura) y, si el lado oscuro esperado
// quedo al reves, regresa el canvas rotado 180 grados.
export function orientDocumentForStep(canvas: HTMLCanvasElement, step: string): HTMLCanvasElement {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const { width, height } = canvas;
  const band = Math.max(2, Math.round(height * 0.2));
  const bandMean = (y0: number) => {
    const data = ctx.getImageData(0, y0, width, band).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += 0.299 * (data[i] ?? 0) + 0.587 * (data[i + 1] ?? 0) + 0.114 * (data[i + 2] ?? 0);
    }
    return sum / (data.length / 4);
  };
  if (!orientationFlipNeeded(bandMean(0), bandMean(height - band), step)) return canvas;
  const flipped = document.createElement('canvas');
  flipped.width = width;
  flipped.height = height;
  const fctx = flipped.getContext('2d')!;
  fctx.translate(width, height);
  fctx.rotate(Math.PI);
  fctx.drawImage(canvas, 0, 0);
  return flipped;
}

// Calcula metricas de calidad del recorte en el worker y regresa el
// veredicto. null si el worker no esta disponible.
export async function assessDocQuality(canvas: HTMLCanvasElement): Promise<QualityAssessment | null> {
  if (!docScanReady()) return null;
  const imageData = canvasImageData(canvas);
  const result = await call({ type: 'quality', imageData }, [imageData.data.buffer]);
  if (!result || !result.metrics) return null;
  return { ...qualityVerdict(result.metrics), metrics: result.metrics };
}

export async function extractDocument(canvas: HTMLCanvasElement, detection: { corners: Corners; aspect?: number }): Promise<HTMLCanvasElement | null> {
  if (!docScanReady()) return null;
  // El aspecto medido absorbe la perspectiva; se acota alrededor de ID-1
  // para que el warp no deforme de mas si las esquinas vienen imprecisas.
  const aspect = Math.min(1.9, Math.max(1.35, detection.aspect || ID1_ASPECT));
  // Ancho adaptativo: no inflar una tarjeta chica a 1200px (el upscale
  // diluye la varianza del Laplaciano y la compuerta la marcaba borrosa
  // aunque fuera legible). Se respeta el tamano fisico en pixeles de la
  // fuente, acotado a 600-1200.
  const size = quadSize(detection.corners);
  const outputWidth = Math.round(Math.min(1200, Math.max(600, size.width)));
  const outputHeight = Math.round(outputWidth / aspect);
  const imageData = canvasImageData(canvas);
  const result = await call(
    { type: 'extract', imageData, corners: detection.corners, outputWidth, outputHeight },
    [imageData.data.buffer]
  );
  if (!result || !result.output) return null;
  const output = document.createElement('canvas');
  output.width = outputWidth;
  output.height = outputHeight;
  output.getContext('2d')!.putImageData(result.output, 0, 0);
  return output;
}
