import type { FaceDetector as MediaPipeFaceDetector } from '@mediapipe/tasks-vision';
import type { DetectionAssets, DetectionResult, FrameDetector, NormalizedBox } from './types';
import { DetectionUnavailableError } from './errors';

// Mantener sincronizada con la versión instalada de @mediapipe/tasks-vision
// (ver package.json) al actualizar la dependencia.
const MEDIAPIPE_VERSION = '1.0.0';
const DEFAULT_WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const DEFAULT_FACE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

// Instancia cacheada a nivel de módulo: MediaPipe solo se inicializa una vez
// aunque se llame createFaceFrameDetector() varias veces (p.ej. entre pasos).
let cachedDetector: Promise<MediaPipeFaceDetector> | null = null;

async function loadFaceDetector(assets?: DetectionAssets): Promise<MediaPipeFaceDetector> {
  if (!cachedDetector) {
    cachedDetector = (async () => {
      const { FilesetResolver, FaceDetector } = await import('@mediapipe/tasks-vision');
      const vision = await FilesetResolver.forVisionTasks(assets?.mediapipeWasmUrl ?? DEFAULT_WASM_URL);
      return FaceDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: assets?.faceModelUrl ?? DEFAULT_FACE_MODEL_URL },
        runningMode: 'IMAGE',
      });
    })().catch((e) => {
      cachedDetector = null;
      throw e;
    });
  }
  return cachedDetector;
}

/** Libera el detector cacheado (cierra el WASM). Útil en tests y al desmontar. */
export async function disposeFaceDetector(): Promise<void> {
  const pending = cachedDetector;
  cachedDetector = null;
  if (!pending) return;
  try {
    const detector = await pending;
    detector.close();
  } catch {
    // Instancia nunca llegó a crearse con éxito: nada que cerrar.
  }
}

function toNormalizedBox(
  box: { originX: number; originY: number; width: number; height: number },
  frameWidth: number,
  frameHeight: number,
): NormalizedBox {
  return {
    x: box.originX / frameWidth,
    y: box.originY / frameHeight,
    width: box.width / frameWidth,
    height: box.height / frameHeight,
  };
}

/**
 * Crea un FrameDetector de rostro basado en MediaPipe FaceDetector. Se usa
 * tanto para la selfie (rostro dentro del óvalo) como para el frontal de la
 * INE (rostro pequeño de la fotografía del documento).
 */
export async function createFaceFrameDetector(assets?: DetectionAssets): Promise<FrameDetector> {
  let detector: MediaPipeFaceDetector;
  try {
    detector = await loadFaceDetector(assets);
  } catch (e) {
    throw new DetectionUnavailableError('El detector de rostro no está disponible en este dispositivo.', e);
  }

  return async (frame: ImageData): Promise<DetectionResult | null> => {
    const { detections } = detector.detect(frame);
    let best: (typeof detections)[number] | undefined;
    let bestScore = -Infinity;
    for (const d of detections) {
      if (!d.boundingBox) continue;
      const score = d.categories[0]?.score ?? 0;
      if (score > bestScore) {
        best = d;
        bestScore = score;
      }
    }
    if (!best?.boundingBox) return null;
    return { box: toNormalizedBox(best.boundingBox, frame.width, frame.height) };
  };
}
