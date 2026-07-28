// Tipos mínimos compartidos por el núcleo de escaneo (docscan/marco/scan),
// portado del prototipo KYC (ver docscan.ts). Los algoritmos y umbrales viven
// en los módulos correspondientes; aquí solo las formas de datos.

/** Punto en coordenadas de pixel (canvas, frame o elemento mostrado, según el contexto). */
export interface Point {
  x: number;
  y: number;
}

/** Cuadrilátero detectado, con las 4 esquinas nombradas por posición. */
export interface Corners {
  topLeftCorner: Point;
  topRightCorner: Point;
  bottomLeftCorner: Point;
  bottomRightCorner: Point;
}

/** Rectángulo en pixeles (marco guiado, ROI, etc.). */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Stats del ENCUADRE COMPLETO devueltas por el worker en cada 'detect' (haya o no deteccion). */
export interface FrameStats {
  brightness: number;
  contrast: number;
  glareRatio: number;
}

/** Resultado de detectDocument()/detectDocumentStill(): corners es null si no hubo deteccion. */
export interface DetectDocumentResult {
  corners: Corners | null;
  areaRatio?: number;
  aspect?: number;
  score?: number;
  frame: FrameStats | null;
}

/** Resultado de detectDocumentStill(): siempre trae corners (o null global si ningun escalon detecto). */
export interface StillDetectDocumentResult extends DetectDocumentResult {
  corners: Corners;
  aspect: number;
  rotated: boolean;
}

/** Métricas de calidad SIN OCR calculadas por el worker sobre el recorte del documento. */
export interface QualityMetrics {
  sharpness: number;
  sharpRatio?: number;
  brightness: number;
  contrast: number;
  glareRatio: number;
  darkRatio?: number;
  lowLightRatio?: number;
  washedRatio?: number;
}

/** Veredicto de qualityVerdict(): puro, sin OCR. */
export interface QualityVerdict {
  ok: boolean;
  score: number;
  hint: string;
  codes: string[];
}

/** Resultado de assessDocQuality(): veredicto + métricas crudas (las consume isWashOnlyReject). */
export interface QualityAssessment extends QualityVerdict {
  metrics: QualityMetrics;
}

/** Intento de la escalera de detección para imágenes estáticas (planStillDetectAttempts). */
export interface StillDetectAttempt {
  width: number;
  minAreaRatio: number;
  maxAreaRatio: number;
}

/** Mensaje de guía de encuadre ({ message, tone }) o null si no hay nada que corregir. */
export interface GuidanceMessage {
  message: string;
  tone: 'idle' | 'warn';
}

/** Resultado de validateQuadInMarco(). */
export interface MarcoValidation {
  ok: boolean;
  coverage: number;
  reason?: string;
  contained?: boolean;
}

/** URLs configurables para el worker de escaneo de documentos (OpenCV). */
export interface ScanAssets {
  /** URL del worker de escaneo (default: '/digid-scan/scan-worker.js'). */
  workerUrl?: string;
}
