// Pipeline HEURISTICO (sin OpenCV en el worker) de captura/realce/calidad de
// documentos: respaldo mientras el worker de scan-worker.js no esta listo o
// si fallo (ver docscan.ts). Port del prototipo KYC (Task 22), sin cambios
// de algoritmo/umbrales/comentarios.
//
// detectDocumentWithOpenCv() es un camino aparte: usa una instancia de
// OpenCV cargada en el hilo PRINCIPAL (window.cv, no el worker) si el
// integrador la expone; si no esta disponible, se degrada con
// { available: false, likely: true } y el resto del pipeline heuristico
// sigue funcionando solo.

/* eslint-disable @typescript-eslint/no-explicit-any -- interop con la global `cv` (OpenCV.js) que el integrador puede exponer en window; sin tipos oficiales aquí. */

declare global {
  interface Window {
    cv?: any;
    __digidCvReady?: boolean;
  }
}

export interface FrameCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FrameImageResult {
  canvas: HTMLCanvasElement;
  rawDataUrl: string;
  enhancedCanvas: HTMLCanvasElement;
  dataUrl: string;
}

export interface EnhancedImageResult {
  canvas: HTMLCanvasElement;
  dataUrl: string;
}

export interface DocumentQualityResult {
  score: number;
  hint: string;
  documentLikely: boolean;
  signature: number[];
}

export interface OpenCvDocumentResult {
  available: boolean;
  likely: boolean;
  score: number;
}

export interface DocumentStructureResult {
  score: number;
  rectScore: number;
  textScore: number;
  spreadScore: number;
  layoutLikely: boolean;
  documentLikely: boolean;
}

export interface RegionSample {
  avg: number;
  std: number;
}

export function stopStream(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  stream.getTracks().forEach(track => track.stop());
}

export function getFrameImage(source: CanvasImageSource & { videoWidth?: number; naturalWidth?: number; width?: number; getBoundingClientRect?: () => DOMRect }, frameEl: Element | null): FrameImageResult {
  const canvas = document.getElementById('workCanvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const sourceWidth = source.videoWidth || source.naturalWidth || source.width || 0;
  const sourceHeight = (source as any).videoHeight || (source as any).naturalHeight || (source as any).height || 0;
  const crop = getFrameCrop(source, frameEl, sourceWidth, sourceHeight);
  canvas.width = crop.width;
  canvas.height = crop.height;
  ctx.filter = 'contrast(1.04) saturate(1.04) brightness(1.01)';
  ctx.drawImage(source as CanvasImageSource, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
  const enhanced = createEnhancedDocumentImage(canvas);
  return {
    canvas,
    rawDataUrl: canvas.toDataURL('image/jpeg', .94),
    enhancedCanvas: enhanced.canvas,
    dataUrl: enhanced.dataUrl
  };
}

export function getFrameCrop(source: { getBoundingClientRect?: () => DOMRect }, frameEl: Element | null, sourceWidth: number, sourceHeight: number): FrameCrop {
  if (!frameEl || !source.getBoundingClientRect) {
    return {
      x: Math.round(sourceWidth * 0.08),
      y: Math.round(sourceHeight * 0.13),
      width: Math.round(sourceWidth * 0.84),
      height: Math.round(sourceHeight * 0.74)
    };
  }

  const videoRect = source.getBoundingClientRect();
  const frameRect = frameEl.getBoundingClientRect();
  const scale = Math.max(videoRect.width / sourceWidth, videoRect.height / sourceHeight);
  const renderedWidth = sourceWidth * scale;
  const renderedHeight = sourceHeight * scale;
  const offsetX = (videoRect.width - renderedWidth) / 2;
  const offsetY = (videoRect.height - renderedHeight) / 2;
  const padding = Math.min(frameRect.width, frameRect.height) * 0.015;
  const left = frameRect.left - videoRect.left + padding;
  const top = frameRect.top - videoRect.top + padding;
  const right = frameRect.right - videoRect.left - padding;
  const bottom = frameRect.bottom - videoRect.top - padding;
  const x = clamp(Math.round((left - offsetX) / scale), 0, sourceWidth - 1);
  const y = clamp(Math.round((top - offsetY) / scale), 0, sourceHeight - 1);
  const x2 = clamp(Math.round((right - offsetX) / scale), x + 1, sourceWidth);
  const y2 = clamp(Math.round((bottom - offsetY) / scale), y + 1, sourceHeight);
  return { x, y, width: x2 - x, height: y2 - y };
}

export function createEnhancedDocumentImage(inputCanvas: HTMLCanvasElement): EnhancedImageResult {
  const output = document.createElement('canvas');
  const outputCtx = output.getContext('2d', { willReadFrequently: true })!;
  const width = inputCanvas.width;
  const height = inputCanvas.height;
  output.width = width;
  output.height = height;
  outputCtx.drawImage(inputCanvas, 0, 0);
  const image = outputCtx.getImageData(0, 0, width, height);
  const data = image.data;
  const histogram = new Uint32Array(256);
  const pixels = width * height;

  for (let i = 0; i < data.length; i += 4) {
    const lum = Math.round((data[i] ?? 0) * 0.299 + (data[i + 1] ?? 0) * 0.587 + (data[i + 2] ?? 0) * 0.114);
    histogram[lum] = (histogram[lum] ?? 0) + 1;
  }

  const low = percentileFromHistogram(histogram, pixels * 0.02);
  const high = Math.max(low + 55, percentileFromHistogram(histogram, pixels * 0.985));
  const range = high - low;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const lum = r * 0.299 + g * 0.587 + b * 0.114;
    const normalized = clamp((lum - low) / range, 0, 1);
    let adjusted = Math.pow(normalized, 0.96) * 255;
    adjusted = (adjusted - 128) * 1.03 + 128;
    if (lum > high - 6) adjusted = Math.max(adjusted, 224);
    if (lum < low + 12) adjusted *= 0.96;
    data[i] = clamp(Math.round(r * .82 + (adjusted + (r - lum) * .98) * .18), 0, 255);
    data[i + 1] = clamp(Math.round(g * .82 + (adjusted + (g - lum) * .98) * .18), 0, 255);
    data[i + 2] = clamp(Math.round(b * .82 + (adjusted + (b - lum) * .98) * .18), 0, 255);
  }

  outputCtx.putImageData(image, 0, 0);
  return { canvas: output, dataUrl: output.toDataURL('image/jpeg', .96) };
}

export function analyzeDocumentQuality(canvas: HTMLCanvasElement, mode: string): DocumentQualityResult {
  const sampleCanvas = document.createElement('canvas');
  const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true })!;
  const width = 160;
  const height = Math.max(90, Math.round(width * canvas.height / canvas.width));
  sampleCanvas.width = width;
  sampleCanvas.height = height;
  sampleCtx.drawImage(canvas, 0, 0, width, height);
  const image = sampleCtx.getImageData(0, 0, width, height);
  const data = image.data;
  let total = 0;
  let totalSq = 0;
  let brightPixels = 0;
  let darkPixels = 0;
  const gray = new Float32Array(width * height);

  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const value = (data[i] ?? 0) * 0.299 + (data[i + 1] ?? 0) * 0.587 + (data[i + 2] ?? 0) * 0.114;
    gray[p] = value;
    total += value;
    totalSq += value * value;
    if (value > 232) brightPixels += 1;
    if (value < 42) darkPixels += 1;
  }

  const pixels = width * height;
  const avg = total / pixels;
  const variance = totalSq / pixels - avg * avg;
  const contrast = Math.min(100, Math.sqrt(Math.max(0, variance)) * 2.1);
  let edgeStrength = 0;
  let edgeCount = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const p = y * width + x;
      const gx = Math.abs((gray[p - 1] ?? 0) - (gray[p + 1] ?? 0));
      const gy = Math.abs((gray[p - width] ?? 0) - (gray[p + width] ?? 0));
      const edge = gx + gy;
      edgeStrength += edge;
      if (edge > 34) edgeCount += 1;
    }
  }

  const edgeDensity = edgeCount / pixels;
  const edgeScore = Math.min(100, edgeDensity * 520 + edgeStrength / pixels * 1.6);
  const exposureScore = Math.max(0, 100 - Math.abs(avg - 138) * .85);
  const glarePenalty = Math.min(30, brightPixels / pixels * 180);
  const darkPenalty = Math.min(24, darkPixels / pixels * 140);
  const fillScore = estimateDocumentFill(gray, width, height);
  const objectScore = estimateObjectSeparation(gray, width, height);
  const structure = analyzeDocumentStructure(gray, width, height, mode);
  const cvDocument = detectDocumentWithOpenCv(canvas);
  const score = clamp(
    contrast * .10 + edgeScore * .13 + exposureScore * .08 + fillScore * .15 + objectScore * .22 + structure.score * .22 + cvDocument.score * .24 - glarePenalty - darkPenalty,
    0,
    100
  );

  let hint = 'Centra el documento';
  if (cvDocument.available && !cvDocument.likely) hint = 'Alinea una identificación dentro del marco';
  else if (objectScore < 42) hint = 'Coloca el documento dentro del marco';
  else if (fillScore < 38) hint = 'Acerca o centra el documento';
  else if (structure.rectScore < 40) hint = 'Alinea los bordes del documento';
  else if (structure.textScore < 42 || structure.spreadScore < 44) hint = 'Muestra los datos del documento';
  else if (!structure.layoutLikely) hint = mode === 'back' ? 'Enfoca el reverso del documento' : 'Enfoca la parte frontal del documento';
  else if (glarePenalty > 14) hint = 'Reduce reflejos';
  else if (contrast < 32 || edgeScore < 32) hint = 'Enfoca y mejora la luz';
  else if (score >= 86) hint = 'Mantén la posición';

  return {
    score,
    hint,
    documentLikely: objectScore >= 42 && fillScore >= 38 && edgeScore >= 30 && structure.documentLikely && (!cvDocument.available || cvDocument.likely),
    signature: buildSignature(gray, width, height)
  };
}

export function detectDocumentWithOpenCv(canvas: HTMLCanvasElement): OpenCvDocumentResult {
  if (typeof window === 'undefined' || !window.__digidCvReady || !window.cv || typeof window.cv.imread !== 'function') {
    return { available: false, likely: true, score: 0 };
  }
  const cv = window.cv;

  let src: any, small: any, gray: any, blurred: any, edges: any, contours: any, hierarchy: any, kernel: any;
  let bestScore = 0;
  let bestLikely = false;
  try {
    src = cv.imread(canvas);
    small = new cv.Mat();
    const targetWidth = 240;
    const targetHeight = Math.max(120, Math.round(targetWidth * src.rows / src.cols));
    cv.resize(src, small, new cv.Size(targetWidth, targetHeight), 0, 0, cv.INTER_AREA);
    gray = new cv.Mat();
    blurred = new cv.Mat();
    edges = new cv.Mat();
    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.cvtColor(small, gray, cv.COLOR_RGBA2GRAY, 0);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.Canny(blurred, edges, 55, 145);
    kernel = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.dilate(edges, edges, kernel);
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    const imageArea = targetWidth * targetHeight;

    for (let i = 0; i < contours.size(); i += 1) {
      const contour = contours.get(i);
      const perimeter = cv.arcLength(contour, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(contour, approx, 0.035 * perimeter, true);
      const area = cv.contourArea(approx);
      if (approx.rows >= 4 && area > imageArea * 0.24) {
        const rect = cv.boundingRect(approx);
        const aspect = rect.width / Math.max(1, rect.height);
        const areaRatio = area / imageArea;
        const rectangularity = area / Math.max(1, rect.width * rect.height);
        const aspectScore = 1 - Math.min(1, Math.abs(aspect - 1.58) / 0.58);
        const areaScore = clamp((areaRatio - 0.24) / 0.48, 0, 1);
        const rectScore = clamp((rectangularity - 0.58) / 0.34, 0, 1);
        const candidateScore = clamp((aspectScore * 42 + areaScore * 32 + rectScore * 36), 0, 100);
        if (candidateScore > bestScore) {
          bestScore = candidateScore;
          bestLikely = aspect >= 1.05 && aspect <= 2.35 && rectangularity >= 0.56 && areaRatio >= 0.26;
        }
      }
      approx.delete();
      contour.delete();
    }

    return { available: true, likely: bestLikely && bestScore >= 54, score: bestScore };
  } catch (error) {
    console.warn('OpenCV document detection failed.', error);
    return { available: false, likely: true, score: 0 };
  } finally {
    if (src) src.delete();
    if (small) small.delete();
    if (gray) gray.delete();
    if (blurred) blurred.delete();
    if (edges) edges.delete();
    if (contours) contours.delete();
    if (hierarchy) hierarchy.delete();
    if (kernel) kernel.delete();
  }
}

export function analyzeDocumentStructure(gray: Float32Array, width: number, height: number, mode: string): DocumentStructureResult {
  const rectScore = estimateRectangularFrame(gray, width, height);
  const textScore = estimateTextTexture(gray, width, height);
  const spreadScore = estimateContentSpread(gray, width, height);
  const layout = mode === 'back' ? estimateBackLayout(gray, width, height) : estimateFrontLayout(gray, width, height);
  const score = clamp(rectScore * .26 + textScore * .25 + spreadScore * .21 + layout.score * .28, 0, 100);
  return {
    score,
    rectScore,
    textScore,
    spreadScore,
    layoutLikely: layout.likely,
    documentLikely: rectScore >= 42 && textScore >= 42 && spreadScore >= 44 && layout.likely && score >= 56
  };
}

export function estimateRectangularFrame(gray: Float32Array, width: number, height: number): number {
  const top = scanBand(gray, width, height, Math.floor(width * .05), Math.floor(height * .04), Math.floor(width * .95), Math.floor(height * .20), 30);
  const bottom = scanBand(gray, width, height, Math.floor(width * .05), Math.floor(height * .80), Math.floor(width * .95), Math.floor(height * .96), 30);
  const left = scanBand(gray, width, height, Math.floor(width * .03), Math.floor(height * .08), Math.floor(width * .22), Math.floor(height * .92), 30);
  const right = scanBand(gray, width, height, Math.floor(width * .78), Math.floor(height * .08), Math.floor(width * .97), Math.floor(height * .92), 30);
  const edges = [top, bottom, left, right];
  const present = edges.filter(value => value > .018).length;
  const balance = 1 - Math.min(1, (Math.max(...edges) - Math.min(...edges)) / Math.max(.04, Math.max(...edges)));
  return clamp(present * 18 + balance * 28 + edges.reduce((sum, value) => sum + value, 0) * 420, 0, 100);
}

export function estimateTextTexture(gray: Float32Array, width: number, height: number): number {
  const center = scanHorizontalTexture(gray, width, height, Math.floor(width * .22), Math.floor(height * .18), Math.floor(width * .90), Math.floor(height * .84));
  const full = scanHorizontalTexture(gray, width, height, Math.floor(width * .08), Math.floor(height * .12), Math.floor(width * .92), Math.floor(height * .90));
  return clamp(center * 72 + full * 42, 0, 100);
}

export function estimateContentSpread(gray: Float32Array, width: number, height: number): number {
  let activeCells = 0;
  let strongCells = 0;
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const x1 = Math.floor(width * (.08 + col * .21));
      const x2 = Math.floor(width * (.20 + col * .21));
      const y1 = Math.floor(height * (.12 + row * .24));
      const y2 = Math.floor(height * (.27 + row * .24));
      const texture = scanHorizontalTexture(gray, width, height, x1, y1, x2, y2);
      if (texture >= .18) activeCells += 1;
      if (texture >= .34) strongCells += 1;
    }
  }
  return clamp(activeCells * 10 + strongCells * 13, 0, 100);
}

export function estimateFrontLayout(gray: Float32Array, width: number, height: number): { score: number; likely: boolean } {
  const leftPhoto = sampleRegion(gray, width, height, Math.floor(width * .10), Math.floor(height * .32), Math.floor(width * .42), Math.floor(height * .78), false);
  const rightUpperText = scanHorizontalTexture(gray, width, height, Math.floor(width * .42), Math.floor(height * .22), Math.floor(width * .90), Math.floor(height * .42));
  const rightMiddleText = scanHorizontalTexture(gray, width, height, Math.floor(width * .42), Math.floor(height * .40), Math.floor(width * .90), Math.floor(height * .62));
  const rightLowerText = scanHorizontalTexture(gray, width, height, Math.floor(width * .42), Math.floor(height * .60), Math.floor(width * .90), Math.floor(height * .80));
  const topText = scanHorizontalTexture(gray, width, height, Math.floor(width * .20), Math.floor(height * .08), Math.floor(width * .80), Math.floor(height * .25));
  const textBands = [rightUpperText, rightMiddleText, rightLowerText].filter(value => value >= .24).length;
  const rightText = (rightUpperText + rightMiddleText + rightLowerText) / 3;
  const photoScore = clamp((leftPhoto.std - 14) * 3.6 + Math.abs(leftPhoto.avg - 142) * .18, 0, 100);
  const lineScore = clamp(rightText * 92 + topText * 28 + textBands * 12, 0, 100);
  return { score: clamp(photoScore * .42 + lineScore * .58, 0, 100), likely: photoScore >= 30 && lineScore >= 48 && textBands >= 2 };
}

export function estimateBackLayout(gray: Float32Array, width: number, height: number): { score: number; likely: boolean } {
  const upperText = scanHorizontalTexture(gray, width, height, Math.floor(width * .12), Math.floor(height * .14), Math.floor(width * .88), Math.floor(height * .42));
  const middleText = scanHorizontalTexture(gray, width, height, Math.floor(width * .18), Math.floor(height * .38), Math.floor(width * .88), Math.floor(height * .62));
  const lowerDense = scanHorizontalTexture(gray, width, height, Math.floor(width * .08), Math.floor(height * .58), Math.floor(width * .92), Math.floor(height * .86));
  const barcode = estimateBarcodeLikePattern(gray, width, height);
  const score = clamp(upperText * 40 + middleText * 34 + lowerDense * 40 + barcode * 52, 0, 100);
  return { score, likely: upperText >= .30 && middleText >= .22 && (lowerDense >= .32 || barcode >= .34) };
}

export function scanHorizontalTexture(gray: Float32Array, width: number, height: number, x1: number, y1: number, x2: number, y2: number): number {
  let rowsWithTexture = 0;
  let rows = 0;
  for (let y = Math.max(1, y1); y < Math.min(height - 1, y2); y += 3) {
    let changes = 0;
    let strongRuns = 0;
    let inRun = false;
    for (let x = Math.max(1, x1); x < Math.min(width - 1, x2); x += 2) {
      const p = y * width + x;
      const edge = Math.abs((gray[p - 1] ?? 0) - (gray[p + 1] ?? 0));
      if (edge > 18) {
        changes += 1;
        if (!inRun) strongRuns += 1;
        inRun = true;
      } else {
        inRun = false;
      }
    }
    const rowWidth = Math.max(1, Math.floor((x2 - x1) / 2));
    if (changes / rowWidth > .055 && strongRuns >= 2) rowsWithTexture += 1;
    rows += 1;
  }
  return rows ? rowsWithTexture / rows : 0;
}

export function estimateBarcodeLikePattern(gray: Float32Array, width: number, height: number): number {
  let verticalRows = 0;
  let rows = 0;
  const y1 = Math.floor(height * .58);
  const y2 = Math.floor(height * .88);
  const x1 = Math.floor(width * .08);
  const x2 = Math.floor(width * .62);
  for (let y = y1; y < y2; y += 3) {
    let verticalEdges = 0;
    for (let x = Math.max(1, x1); x < Math.min(width - 1, x2); x += 1) {
      const p = y * width + x;
      const gx = Math.abs((gray[p - 1] ?? 0) - (gray[p + 1] ?? 0));
      const gy = Math.abs((gray[p - width] ?? 0) - (gray[p + width] ?? 0));
      if (gx > 20 && gx > gy * 1.25) verticalEdges += 1;
    }
    if (verticalEdges / Math.max(1, x2 - x1) > .12) verticalRows += 1;
    rows += 1;
  }
  return rows ? verticalRows / rows : 0;
}

export function estimateObjectSeparation(gray: Float32Array, width: number, height: number): number {
  const outer = sampleRegion(gray, width, height, 0, 0, width, height, true);
  const center = sampleRegion(gray, width, height, Math.floor(width * .18), Math.floor(height * .20), Math.floor(width * .82), Math.floor(height * .80), false);
  const diff = Math.abs(center.avg - outer.avg);
  const varianceBoost = Math.max(0, center.std - outer.std * .55);
  const brightDocument = center.avg > outer.avg + 18 ? 24 : 0;
  const darkDocument = outer.avg > center.avg + 28 ? 14 : 0;
  return clamp(diff * 1.8 + varianceBoost * 1.1 + brightDocument + darkDocument, 0, 100);
}

export function sampleRegion(gray: Float32Array, width: number, height: number, x1: number, y1: number, x2: number, y2: number, borderOnly: boolean): RegionSample {
  let total = 0;
  let totalSq = 0;
  let count = 0;
  const border = Math.max(8, Math.floor(Math.min(width, height) * .10));
  for (let y = y1; y < y2; y += 2) {
    for (let x = x1; x < x2; x += 2) {
      if (borderOnly) {
        const inBorder = x < border || x >= width - border || y < border || y >= height - border;
        if (!inBorder) continue;
      }
      const value = gray[y * width + x] ?? 0;
      total += value;
      totalSq += value * value;
      count += 1;
    }
  }
  const avg = total / Math.max(1, count);
  const variance = totalSq / Math.max(1, count) - avg * avg;
  return { avg, std: Math.sqrt(Math.max(0, variance)) };
}

export function estimateDocumentFill(gray: Float32Array, width: number, height: number): number {
  const threshold = 34;
  const bands = [
    scanBand(gray, width, height, 0, 0, width, Math.floor(height * .18), threshold),
    scanBand(gray, width, height, 0, Math.floor(height * .82), width, height, threshold),
    scanBand(gray, width, height, 0, 0, Math.floor(width * .18), height, threshold),
    scanBand(gray, width, height, Math.floor(width * .82), 0, width, height, threshold)
  ];
  const balancedEdges = bands.filter(value => value > .025).length * 18;
  const density = bands.reduce((sum, value) => sum + value, 0) / bands.length;
  return clamp(balancedEdges + density * 900, 0, 100);
}

export function scanBand(gray: Float32Array, width: number, height: number, x1: number, y1: number, x2: number, y2: number, threshold: number): number {
  let edges = 0;
  let total = 0;
  for (let y = Math.max(1, y1); y < Math.min(height - 1, y2); y += 2) {
    for (let x = Math.max(1, x1); x < Math.min(width - 1, x2); x += 2) {
      const p = y * width + x;
      const edge = Math.abs((gray[p - 1] ?? 0) - (gray[p + 1] ?? 0)) + Math.abs((gray[p - width] ?? 0) - (gray[p + width] ?? 0));
      if (edge > threshold) edges += 1;
      total += 1;
    }
  }
  return total ? edges / total : 0;
}

export function buildSignature(gray: Float32Array, width: number, height: number): number[] {
  const cols = 8;
  const rows = 5;
  const signature: number[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x1 = Math.floor(col * width / cols);
      const x2 = Math.floor((col + 1) * width / cols);
      const y1 = Math.floor(row * height / rows);
      const y2 = Math.floor((row + 1) * height / rows);
      signature.push(sampleRegion(gray, width, height, x1, y1, x2, y2, false).avg);
    }
  }
  return signature;
}

export function signatureDifference(a: number[] | null | undefined, b: number[] | null | undefined): number {
  if (!a || !b || a.length !== b.length) return 100;
  let total = 0;
  for (let i = 0; i < a.length; i += 1) total += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  return total / a.length;
}

export function percentileFromHistogram(histogram: Uint32Array, target: number): number {
  let count = 0;
  for (let i = 0; i < histogram.length; i += 1) {
    count += histogram[i] ?? 0;
    if (count >= target) return i;
  }
  return histogram.length - 1;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
