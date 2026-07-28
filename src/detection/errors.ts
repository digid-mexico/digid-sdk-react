/**
 * Se lanza cuando un detector (MediaPipe FaceDetector o zxing-wasm) no pudo
 * cargarse (WASM/modelo no disponible, red, dispositivo sin soporte, etc.).
 * Los callers deben capturarla y degradar a captura manual.
 */
export class DetectionUnavailableError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'DetectionUnavailableError';
    this.cause = cause;
  }
}
