import type { readBarcodes as ReadBarcodesFn } from 'zxing-wasm';
import type { DetectionAssets, DetectionResult, FrameDetector, NormalizedBox } from './types';
import { DetectionUnavailableError } from './errors';

interface Point {
  x: number;
  y: number;
}

// Instancia (módulo zxing-wasm ya preparado) cacheada a nivel de módulo:
// el WASM solo se instancia una vez aunque se llame
// createBarcodeFrameDetector() varias veces (p.ej. entre pasos).
let cachedModule: Promise<{ readBarcodes: typeof ReadBarcodesFn }> | null = null;

async function loadBarcodeModule(assets?: DetectionAssets): Promise<{ readBarcodes: typeof ReadBarcodesFn }> {
  if (!cachedModule) {
    cachedModule = (async () => {
      const mod = await import('zxing-wasm');
      const overrides = assets?.zxingWasmUrl
        ? { locateFile: (path: string) => `${assets.zxingWasmUrl}/${path}` }
        : undefined;
      // fireImmediately: true fuerza la instanciación del WASM ahora (en
      // vez de en la primera lectura) para que un fallo de carga se
      // reporte aquí como DetectionUnavailableError, igual que el
      // detector de rostro.
      await mod.prepareZXingModule({ overrides, fireImmediately: true });
      return mod;
    })().catch((e) => {
      cachedModule = null;
      throw e;
    });
  }
  return cachedModule;
}

/** Libera la caché del módulo zxing-wasm. Útil en tests y al desmontar. */
export async function disposeBarcodeDetector(): Promise<void> {
  cachedModule = null;
}

function boundingBoxFromPosition(
  position: { topLeft: Point; topRight: Point; bottomLeft: Point; bottomRight: Point },
  frameWidth: number,
  frameHeight: number,
): NormalizedBox {
  const xs = [position.topLeft.x, position.topRight.x, position.bottomLeft.x, position.bottomRight.x];
  const ys = [position.topLeft.y, position.topRight.y, position.bottomLeft.y, position.bottomRight.y];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    x: minX / frameWidth,
    y: minY / frameHeight,
    width: (maxX - minX) / frameWidth,
    height: (maxY - minY) / frameHeight,
  };
}

/**
 * Crea un FrameDetector de código de barras (QR/PDF417) basado en
 * zxing-wasm. Se usa para el reverso de la INE.
 */
export async function createBarcodeFrameDetector(assets?: DetectionAssets): Promise<FrameDetector> {
  let mod: { readBarcodes: typeof ReadBarcodesFn };
  try {
    mod = await loadBarcodeModule(assets);
  } catch (e) {
    throw new DetectionUnavailableError('El lector de códigos no está disponible en este dispositivo.', e);
  }

  return async (frame: ImageData): Promise<DetectionResult | null> => {
    const results = await mod.readBarcodes(frame, { formats: ['QRCode', 'PDF417'], maxNumberOfSymbols: 1 });
    const first = results[0];
    if (!first?.isValid || !first.position) return null;
    return { box: boundingBoxFromPosition(first.position, frame.width, frame.height) };
  };
}
