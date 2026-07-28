import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DetectionUnavailableError } from './errors';

const forVisionTasks = vi.fn();
const createFromOptions = vi.fn();

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: (...args: unknown[]) => forVisionTasks(...args) },
  FaceDetector: { createFromOptions: (...args: unknown[]) => createFromOptions(...args) },
}));

// Import tras el mock para que apunte a los stubs de arriba.
import { createFaceFrameDetector, disposeFaceDetector } from './faceDetector';

function fakeDetection(score: number, box = { originX: 10, originY: 20, width: 30, height: 40 }) {
  return { boundingBox: box, categories: [{ score }] };
}

function makeFakeDetector(detections: ReturnType<typeof fakeDetection>[] = []) {
  return {
    detect: vi.fn().mockReturnValue({ detections }),
    close: vi.fn(),
  };
}

beforeEach(() => {
  forVisionTasks.mockReset().mockResolvedValue('FAKE_VISION_FILESET');
  createFromOptions.mockReset().mockResolvedValue(makeFakeDetector());
});

afterEach(async () => {
  await disposeFaceDetector();
});

describe('createFaceFrameDetector', () => {
  it('usa la URL del WASM y del modelo por defecto (CDN jsDelivr pineada + modelo de Google)', async () => {
    await createFaceFrameDetector();

    expect(forVisionTasks).toHaveBeenCalledWith(expect.stringContaining('cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@'));
    expect(forVisionTasks).toHaveBeenCalledWith(expect.stringContaining('/wasm'));
    expect(createFromOptions).toHaveBeenCalledWith(
      'FAKE_VISION_FILESET',
      expect.objectContaining({
        baseOptions: expect.objectContaining({
          modelAssetPath: expect.stringContaining('storage.googleapis.com/mediapipe-models/face_detector'),
        }),
        runningMode: 'IMAGE',
      }),
    );
  });

  it('usa las URLs configuradas en assets cuando se proveen', async () => {
    await createFaceFrameDetector({
      mediapipeWasmUrl: 'https://miservidor.test/wasm',
      faceModelUrl: 'https://miservidor.test/model.tflite',
    });

    expect(forVisionTasks).toHaveBeenCalledWith('https://miservidor.test/wasm');
    expect(createFromOptions).toHaveBeenCalledWith(
      'FAKE_VISION_FILESET',
      expect.objectContaining({
        baseOptions: { modelAssetPath: 'https://miservidor.test/model.tflite' },
      }),
    );
  });

  it('mapea la detección de mayor score a NormalizedBox dividido por las dimensiones del frame', async () => {
    const fake = makeFakeDetector([
      fakeDetection(0.4, { originX: 0, originY: 0, width: 50, height: 50 }),
      fakeDetection(0.9, { originX: 20, originY: 40, width: 60, height: 80 }),
    ]);
    createFromOptions.mockResolvedValue(fake);

    const detect = await createFaceFrameDetector();
    const frame = { width: 200, height: 400 } as ImageData;
    const result = await detect(frame);

    expect(result).toEqual({ box: { x: 20 / 200, y: 40 / 400, width: 60 / 200, height: 80 / 400 } });
  });

  it('devuelve null cuando no hay detecciones', async () => {
    createFromOptions.mockResolvedValue(makeFakeDetector([]));

    const detect = await createFaceFrameDetector();
    const result = await detect({ width: 100, height: 100 } as ImageData);

    expect(result).toBeNull();
  });

  it('lanza DetectionUnavailableError si falla la carga del fileset', async () => {
    forVisionTasks.mockRejectedValue(new Error('no wasm support'));

    await expect(createFaceFrameDetector()).rejects.toBeInstanceOf(DetectionUnavailableError);
  });

  it('lanza DetectionUnavailableError si falla la creación del detector', async () => {
    createFromOptions.mockRejectedValue(new Error('modelo inválido'));

    await expect(createFaceFrameDetector()).rejects.toBeInstanceOf(DetectionUnavailableError);
  });

  it('cachea la instancia del detector: la segunda llamada no vuelve a inicializar el WASM', async () => {
    await createFaceFrameDetector();
    await createFaceFrameDetector();

    expect(forVisionTasks).toHaveBeenCalledTimes(1);
    expect(createFromOptions).toHaveBeenCalledTimes(1);
  });

  it('disposeFaceDetector cierra el detector y limpia la caché para la próxima llamada', async () => {
    const fake = makeFakeDetector([]);
    createFromOptions.mockResolvedValue(fake);

    await createFaceFrameDetector();
    await disposeFaceDetector();

    expect(fake.close).toHaveBeenCalled();

    await createFaceFrameDetector();
    expect(createFromOptions).toHaveBeenCalledTimes(2);
  });
});
