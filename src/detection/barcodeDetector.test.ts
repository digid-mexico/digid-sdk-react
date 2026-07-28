import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DetectionUnavailableError } from './errors';

const prepareZXingModule = vi.fn();
const readBarcodes = vi.fn();

vi.mock('zxing-wasm', () => ({
  prepareZXingModule: (...args: unknown[]) => prepareZXingModule(...args),
  readBarcodes: (...args: unknown[]) => readBarcodes(...args),
}));

// Import tras el mock para que apunte a los stubs de arriba.
import { createBarcodeFrameDetector, disposeBarcodeDetector } from './barcodeDetector';

function point(x: number, y: number) {
  return { x, y };
}

beforeEach(() => {
  prepareZXingModule.mockReset().mockResolvedValue({});
  readBarcodes.mockReset().mockResolvedValue([]);
});

afterEach(async () => {
  await disposeBarcodeDetector();
});

describe('createBarcodeFrameDetector', () => {
  it('prepara el módulo eagerly (fireImmediately) sin override de locateFile cuando no se pasan assets', async () => {
    await createBarcodeFrameDetector();

    expect(prepareZXingModule).toHaveBeenCalledTimes(1);
    const [options] = prepareZXingModule.mock.calls[0] as [{ fireImmediately?: boolean; overrides?: unknown }];
    expect(options.fireImmediately).toBe(true);
    expect(options.overrides).toBeUndefined();
  });

  it('configura locateFile con la URL de assets.zxingWasmUrl cuando se provee', async () => {
    await createBarcodeFrameDetector({ zxingWasmUrl: 'https://miservidor.test/zxing' });

    const [options] = prepareZXingModule.mock.calls[0] as [
      { overrides: { locateFile: (path: string, prefix: string) => string } },
    ];
    expect(options.overrides.locateFile('zxing_full.wasm', '/default/')).toBe(
      'https://miservidor.test/zxing/zxing_full.wasm',
    );
  });

  it('lee QRCode y PDF417 pidiendo un solo símbolo', async () => {
    const detect = await createBarcodeFrameDetector();
    const frame = { width: 100, height: 100 } as ImageData;
    await detect(frame);

    expect(readBarcodes).toHaveBeenCalledWith(frame, { formats: ['QRCode', 'PDF417'], maxNumberOfSymbols: 1 });
  });

  it('mapea la posición del primer resultado válido a NormalizedBox', async () => {
    readBarcodes.mockResolvedValue([
      {
        isValid: true,
        position: {
          topLeft: point(10, 20),
          topRight: point(50, 20),
          bottomLeft: point(10, 60),
          bottomRight: point(50, 60),
        },
      },
    ]);

    const detect = await createBarcodeFrameDetector();
    const result = await detect({ width: 200, height: 400 } as ImageData);

    expect(result).toEqual({
      box: { x: 10 / 200, y: 20 / 400, width: 40 / 200, height: 40 / 400 },
    });
  });

  it('devuelve null cuando no hay resultados o el resultado no es válido', async () => {
    readBarcodes.mockResolvedValue([]);
    const detect = await createBarcodeFrameDetector();
    expect(await detect({ width: 100, height: 100 } as ImageData)).toBeNull();

    readBarcodes.mockResolvedValue([{ isValid: false, position: undefined }]);
    expect(await detect({ width: 100, height: 100 } as ImageData)).toBeNull();
  });

  it('lanza DetectionUnavailableError si falla la preparación del módulo WASM', async () => {
    prepareZXingModule.mockRejectedValue(new Error('sin soporte WASM'));

    await expect(createBarcodeFrameDetector()).rejects.toBeInstanceOf(DetectionUnavailableError);
  });

  it('cachea la preparación del módulo: la segunda llamada no vuelve a prepararlo', async () => {
    await createBarcodeFrameDetector();
    await createBarcodeFrameDetector();

    expect(prepareZXingModule).toHaveBeenCalledTimes(1);
  });

  it('disposeBarcodeDetector limpia la caché para que la próxima llamada vuelva a preparar el módulo', async () => {
    await createBarcodeFrameDetector();
    await disposeBarcodeDetector();
    await createBarcodeFrameDetector();

    expect(prepareZXingModule).toHaveBeenCalledTimes(2);
  });
});
