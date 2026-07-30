// Motor de escaneo y detección on-device — API INESTABLE.
//
//   import { initDocScan } from '@digid-sdk/firma-autografa-react/engine';
//
// Se publica para quien quiera construir su propia UI de captura sobre el mismo
// núcleo que usan los pasos de INE y selfie: cliente del worker de OpenCV,
// veredicto de calidad, geometría del marco guiado y detectores de rostro /
// código de barras.
//
// **No está cubierto por SemVer.** Buena parte de lo que sale de aquí son
// umbrales calibrados con fotos reales (WASH_VALVE_CAP, EXTREME_BLUR_RATIO,
// MARCO_MIN_COVERAGE…) que se reajustan cuando los datos de campo lo piden.
// Esos ajustes pueden llegar en cualquier versión, incluida una patch. Si
// dependes de este subpath, fija la versión exacta del SDK y revisa el
// CHANGELOG antes de actualizar.
//
// La ruta soportada y estable es <FirmaAutografa> desde la entrada principal.

// --- Detección on-device (nitidez, rostro, código de barras) --------------
export { laplacianVariance, isSharp, SHARPNESS_MIN } from './detection/sharpness';
export type {
  NormalizedBox, DetectionResult, FrameDetector, DetectionAssets,
} from './detection/types';
export { DetectionUnavailableError } from './detection/errors';
export { createFaceFrameDetector, disposeFaceDetector } from './detection/faceDetector';
export { createBarcodeFrameDetector, disposeBarcodeDetector } from './detection/barcodeDetector';
export { useAutoCapture } from './detection/useAutoCapture';
export type { AutoCaptureStatus, AutoCaptureOptions, AutoCaptureState } from './detection/useAutoCapture';

// --- Escaneo de documentos con OpenCV (worker, calidad, orientación) ------
export {
  initDocScan, docScanReady, detectDocument, detectDocumentStill, assessDocQuality, extractDocument,
  qualityVerdict, isWashOnlyReject, extremeBlur, frameGuidance, createDetectionConfirmer,
  cornerMovement, scaleCorners, mapCornersToDisplay, quadArea, quadSize, quadAspect,
  planStillDetectAttempts, portraitToLandscape, orientationFlipNeeded, orientDocumentForStep,
  CONFIRM_FRAMES, CONFIRM_MOVEMENT, WASH_VALVE_CAP, EXTREME_BLUR_SHARPNESS, EXTREME_BLUR_RATIO,
} from './scan/docscan';
export type { DetectionConfirmer } from './scan/docscan';

// --- Geometría del marco guiado ------------------------------------------
export {
  marcoDisplayRect, displayRectToFrame, marcoFrameRect, frameRectToDisplay, roiFromMarco,
  rectToRoiCanvas, roiCornersToFrame, scaleRect, validateQuadInMarco, marcoGuidance,
  MARCO_ASPECT, MARCO_WIDTH_FRAC, MARCO_WIDTH_FRAC_DESKTOP, MARCO_MAX_HEIGHT_FRAC,
  ROI_MARGIN_FRAC, MARCO_MIN_COVERAGE, MARCO_CONTAINED_COVERAGE, MARCO_NOQUAD_TIP_TICKS,
} from './scan/marco';
export type {
  Point, Corners, Rect, FrameStats, DetectDocumentResult, StillDetectDocumentResult,
  QualityMetrics, QualityVerdict, QualityAssessment, StillDetectAttempt, GuidanceMessage,
  MarcoValidation, ScanAssets,
} from './scan/types';

// --- Utilidades de dispositivo usadas por las UIs de captura --------------
export { isIOS, shouldMirrorPreview, isMobileDeviceUA } from './utils/device';
