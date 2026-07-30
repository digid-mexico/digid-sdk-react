export { FirmaAutografa, type FirmaAutografaProps } from './components/FirmaAutografa';
export { useAutografaFlow } from './core/useAutografaFlow';
export { ApiClient, type ApiClientOptions, type TokenTransport } from './api/client';
export { flowReducer, initialFlowState, computeStepOrder } from './core/flowReducer';
export type { FlowState, FlowStep, FlowAction, ExitReason } from './core/flowReducer';
export { DigidError } from './types/api';
export type {
  StartAutografaData, AsignadoData, SignatureCoordinate, SaveFileStep, DigidErrorCode,
} from './types/api';
export type { DigidTheme } from './theme/ThemeProvider';
export { es, I18nProvider, useStrings } from './i18n';
export type { Strings } from './i18n/es';
export { StartStep } from './components/steps/StartStep';
export { IdCaptureStep } from './components/steps/IdCaptureStep';
export { SelfieStep } from './components/steps/SelfieStep';
export { CreateSignStep } from './components/steps/CreateSignStep';
export { PlaceSignaturesStep } from './components/steps/PlaceSignaturesStep';
export { CompletedStep } from './components/steps/CompletedStep';
export { PdfViewer } from './components/pdf/PdfViewer';
export { SignaturePad } from './components/signature/SignaturePad';
export { GuidedCameraCapture, type DetectorKind, type CameraChrome } from './components/camera/GuidedCameraCapture';
export type { GuideKind } from './components/camera/guideRect';
export { DocScanCapture, type DocScanCaptureProps } from './components/scan/DocScanCapture';
export { ScanInstruction } from './components/scan/ScanInstruction';

// Infraestructura de detección on-device para captura guiada (Task 21 la
// consume desde las UIs de INE/selfie).
export { laplacianVariance, isSharp, SHARPNESS_MIN } from './detection/sharpness';
export type {
  NormalizedBox, DetectionResult, FrameDetector, DetectionAssets,
} from './detection/types';
export { DetectionUnavailableError } from './detection/errors';
export { createFaceFrameDetector, disposeFaceDetector } from './detection/faceDetector';
export { createBarcodeFrameDetector, disposeBarcodeDetector } from './detection/barcodeDetector';
export { useAutoCapture } from './detection/useAutoCapture';
export type { AutoCaptureStatus, AutoCaptureOptions, AutoCaptureState } from './detection/useAutoCapture';

// Núcleo de escaneo OpenCV portado del prototipo KYC (Task 22): worker client,
// veredicto de calidad, guía de encuadre y geometría del marco guiado. Task 23
// lo conecta a la UI de INE (components/scan/DocScanCapture, usado por
// IdCaptureStep); estos exports quedan además disponibles para quien quiera
// construir su propia UI de captura sobre el mismo núcleo.
export {
  initDocScan, docScanReady, detectDocument, detectDocumentStill, assessDocQuality, extractDocument,
  qualityVerdict, isWashOnlyReject, extremeBlur, frameGuidance, createDetectionConfirmer,
  cornerMovement, scaleCorners, mapCornersToDisplay, quadArea, quadSize, quadAspect,
  planStillDetectAttempts, portraitToLandscape, orientationFlipNeeded, orientDocumentForStep,
  CONFIRM_FRAMES, CONFIRM_MOVEMENT, WASH_VALVE_CAP, EXTREME_BLUR_SHARPNESS, EXTREME_BLUR_RATIO,
} from './scan/docscan';
export type { DetectionConfirmer } from './scan/docscan';
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
export { isIOS, shouldMirrorPreview, isMobileDeviceUA } from './utils/device';
