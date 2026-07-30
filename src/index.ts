// API pública estable del SDK. Todo lo que se exporta desde aquí está cubierto
// por SemVer: quitarlo, renombrarlo o cambiarle la forma exige un major (ver
// docs/VERSIONADO.md).
//
// El motor de escaneo y detección (geometría del marco, umbrales de calibración,
// cliente del worker de OpenCV) NO vive aquí: se publica aparte en
// `@digid-sdk/firma-autografa-react/engine` y es API inestable. Se separó porque
// son ~77 símbolos, la mayoría constantes de calibración que se ajustan con datos
// de campo; tenerlos en la superficie estable convertía cada reajuste de umbral
// en un breaking change.

// --- Componente principal -------------------------------------------------
export { FirmaAutografa, type FirmaAutografaProps } from './components/FirmaAutografa';

// --- Núcleo del flujo -----------------------------------------------------
export { useAutografaFlow } from './core/useAutografaFlow';
export { ApiClient, type ApiClientOptions, type TokenTransport } from './api/client';
export { flowReducer, initialFlowState, computeStepOrder } from './core/flowReducer';
export type { FlowState, FlowStep, FlowAction, ExitReason } from './core/flowReducer';

// --- Errores y tipos de la API -------------------------------------------
export { DigidError } from './types/api';
export type {
  StartAutografaData, AsignadoData, SignatureCoordinate, SaveFileStep, DigidErrorCode,
} from './types/api';

// --- Configuración de assets (tipan props de <FirmaAutografa>) ------------
// Viven en los módulos del motor, pero se re-exportan aquí a propósito: sin
// ellos el integrador no puede tipar las props `detectionAssets` / `scanAssets`
// sin importar del subpath inestable.
export type { DetectionAssets } from './detection/types';
export type { ScanAssets } from './scan/types';

// --- Theming e i18n -------------------------------------------------------
export type { DigidTheme } from './theme/ThemeProvider';
export { es, I18nProvider, useStrings } from './i18n';
export type { Strings } from './i18n/es';

// --- Pasos y componentes sueltos, para armar un flujo propio --------------
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
