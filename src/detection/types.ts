/** Caja delimitadora normalizada (0..1) relativa al frame muestreado. */
export interface NormalizedBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectionResult {
  box: NormalizedBox;
}

/** Devuelve la detección más relevante dentro del frame muestreado, o null. */
export type FrameDetector = (frame: ImageData) => Promise<DetectionResult | null>;

export interface DetectionAssets {
  /** Base para el WASM de MediaPipe (default: jsDelivr CDN). */
  mediapipeWasmUrl?: string;
  /** URL del modelo blaze_face_short_range.tflite (default: Google storage). */
  faceModelUrl?: string;
  /** Override del locateFile de zxing-wasm (default: el propio paquete/jsDelivr). */
  zxingWasmUrl?: string;
}
