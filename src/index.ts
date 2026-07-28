export { FirmaAutografa, type FirmaAutografaProps } from './components/FirmaAutografa';
export { useAutografaFlow } from './core/useAutografaFlow';
export { ApiClient, type ApiClientOptions } from './api/client';
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
