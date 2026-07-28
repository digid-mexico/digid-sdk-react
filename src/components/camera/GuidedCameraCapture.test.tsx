import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { GuidedCameraCapture, roundedRectPath, ellipsePath, OUTER_PATH } from './GuidedCameraCapture';
import { I18nProvider, es } from '../../i18n';
import { FlowContext, type FlowContextValue } from '../../core/FlowContext';
import { guideRect } from './guideRect';
import { DetectionUnavailableError } from '../../detection/errors';
import type { FrameDetector } from '../../detection/types';

vi.mock('../../detection/faceDetector', () => ({
  createFaceFrameDetector: vi.fn(),
  disposeFaceDetector: vi.fn(),
}));
vi.mock('../../detection/barcodeDetector', () => ({
  createBarcodeFrameDetector: vi.fn(),
  disposeBarcodeDetector: vi.fn(),
}));
// isSharp() sobre el stub de ImageData de setup.ts (todo ceros) daría varianza
// 0 y nunca pasaría el umbral; se mockea para poder ejercitar holding/countdown.
vi.mock('../../detection/sharpness', () => ({
  isSharp: vi.fn(() => true),
}));

import { createFaceFrameDetector } from '../../detection/faceDetector';
import { createBarcodeFrameDetector } from '../../detection/barcodeDetector';

function fakeStream(): MediaStream {
  return { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
}

function setVideoDims(container: HTMLElement, width = 640, height = 480) {
  const video = container.querySelector('video');
  if (!video) throw new Error('no <video> en el contenedor');
  Object.defineProperty(video, 'videoWidth', { value: width, configurable: true });
  Object.defineProperty(video, 'videoHeight', { value: height, configurable: true });
}

/** El `d` esperado de la máscara SVG para `guide`/`videoAspect`, calculado con
 * las mismas funciones puras que usa el componente (no una reimplementación),
 * para poder pinnear que las coordenadas realmente vienen de guideRect(...)*100. */
function expectedMaskPathD(guide: 'id' | 'face', videoAspect: number): string {
  const rect = guideRect(guide, videoAspect);
  const gx = rect.x * 100;
  const gy = rect.y * 100;
  const gw = rect.width * 100;
  const gh = rect.height * 100;
  const innerPath =
    guide === 'id'
      ? roundedRectPath(gx, gy, gw, gh, 4)
      : ellipsePath(gx + gw / 2, gy + gh / 2, gw / 2, gh / 2);
  return `${OUTER_PATH} ${innerPath}`;
}

async function flush(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/**
 * Avanza el reloj en pasos pequeños hasta que `predicate()` sea verdadero.
 * El arranque exacto del intervalo de detección depende de cuántas vueltas
 * de microtasks toma resolver getUserMedia/createDetector, así que fijar un
 * número exacto de ms es frágil; sondear en pasos es robusto a eso.
 */
async function advanceUntil(predicate: () => boolean, { stepMs = 100, maxMs = 6000 } = {}) {
  let elapsed = 0;
  while (!predicate() && elapsed < maxMs) {
    await flush(stepMs);
    elapsed += stepMs;
  }
  if (!predicate()) throw new Error(`advanceUntil: condición no se cumplió tras ${maxMs}ms`);
}

function renderGuided(props: Partial<React.ComponentProps<typeof GuidedCameraCapture>> = {}) {
  const merged = {
    guide: 'id' as const,
    detector: 'face-small' as const,
    onCapture: vi.fn(),
    ...props,
  };
  return render(
    <I18nProvider value={es}>
      <GuidedCameraCapture {...merged} />
    </I18nProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(fakeStream()) },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('GuidedCameraCapture', () => {
  it('renderiza la máscara guía y el estado "searching" cuando aún no hay detección', async () => {
    const detectorFn: FrameDetector = vi.fn().mockResolvedValue(null);
    vi.mocked(createFaceFrameDetector).mockResolvedValue(detectorFn);

    const { container } = renderGuided({ guide: 'id', detector: 'face-small' });
    setVideoDims(container);
    await flush(400);

    expect(container.querySelector('svg.digid-guided-camera__mask')).not.toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(es.capture.searchingId);
  });

  it('muestra el texto de guía correcto para guide="face"', async () => {
    const detectorFn: FrameDetector = vi.fn().mockResolvedValue(null);
    vi.mocked(createFaceFrameDetector).mockResolvedValue(detectorFn);

    const { container } = renderGuided({ guide: 'face', detector: 'face-selfie' });
    setVideoDims(container);
    await flush(400);

    expect(screen.getByRole('status')).toHaveTextContent(es.capture.searchingFace);
  });

  it('el atributo data-guide distingue el marco de id vs face', async () => {
    const detectorFn: FrameDetector = vi.fn().mockResolvedValue(null);
    vi.mocked(createFaceFrameDetector).mockResolvedValue(detectorFn);

    const { container: idContainer } = renderGuided({ guide: 'id', detector: 'face-small' });
    expect(idContainer.querySelector('.digid-guided-camera')).toHaveAttribute('data-guide', 'id');

    const { container: faceContainer } = renderGuided({ guide: 'face', detector: 'face-selfie' });
    expect(faceContainer.querySelector('.digid-guided-camera')).toHaveAttribute('data-guide', 'face');

    // Deja asentar los efectos (getUserMedia/createDetector) para no dejar
    // actualizaciones de estado pendientes fuera de act() al terminar el test.
    setVideoDims(idContainer);
    setVideoDims(faceContainer);
    await flush(400);
  });

  it('detección aceptada y estable dispara la auto-captura; confirmar llama onCapture con el dataURL', async () => {
    const guide = guideRect('face', 4 / 3);
    const acceptedBox = {
      x: guide.x + guide.width / 2 - 0.05,
      y: guide.y + guide.height / 2 - 0.1,
      width: 0.1,
      height: guide.height * 0.5,
    };
    const detectorFn: FrameDetector = vi.fn().mockResolvedValue({ box: acceptedBox });
    vi.mocked(createFaceFrameDetector).mockResolvedValue(detectorFn);
    const onCapture = vi.fn();

    const { container } = renderGuided({ guide: 'face', detector: 'face-selfie', onCapture });
    setVideoDims(container);
    await flush(400); // loading -> searching -> primeros frames evaluados
    // Estabilidad (holding) acumulada -> entra a countdown (el texto incluye
    // el porcentaje de avance, p.ej. "Capturando… 40%").
    await advanceUntil(() =>
      (screen.queryByRole('status')?.textContent ?? '').startsWith(es.capture.countdown),
    );

    // Cuenta regresiva completa -> auto-captura (muestra el preview).
    await advanceUntil(() => screen.queryByAltText('Vista previa de la captura') !== null);
    expect(onCapture).not.toHaveBeenCalled(); // aún no se confirma

    fireEvent.click(screen.getByRole('button', { name: es.idCapture.continue }));
    expect(onCapture).toHaveBeenCalledWith('data:image/png;base64,stub');
  });

  it('si el detector no está disponible, pasa a "unavailable" y el botón manual sigue funcionando', async () => {
    vi.mocked(createFaceFrameDetector).mockRejectedValue(new DetectionUnavailableError('sin wasm'));
    const onCapture = vi.fn();

    const { container } = renderGuided({ guide: 'id', detector: 'face-small', onCapture });
    setVideoDims(container);
    await flush(400);

    expect(screen.getByRole('status')).toHaveTextContent(es.capture.unavailable);

    const manualBtn = screen.getByRole('button', { name: es.capture.manualButton });
    expect(manualBtn).not.toBeDisabled();
    fireEvent.click(manualBtn);

    expect(screen.getByAltText('Vista previa de la captura')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: es.idCapture.continue }));
    expect(onCapture).toHaveBeenCalledWith('data:image/png;base64,stub');
  });

  it('el botón manual captura incluso durante "searching" (sin esperar la detección automática)', async () => {
    const detectorFn: FrameDetector = vi.fn().mockResolvedValue(null);
    vi.mocked(createFaceFrameDetector).mockResolvedValue(detectorFn);

    const { container } = renderGuided({ guide: 'id', detector: 'face-small' });
    setVideoDims(container);
    await flush(200);
    expect(screen.getByRole('status')).toHaveTextContent(es.capture.searchingId);

    fireEvent.click(screen.getByRole('button', { name: es.capture.manualButton }));
    expect(screen.getByAltText('Vista previa de la captura')).toBeInTheDocument();
  });

  it('detector="barcode" usa createBarcodeFrameDetector con sampleWidth 640', async () => {
    let sampledWidth = 0;
    const detectorFn: FrameDetector = vi.fn().mockImplementation(async (frame: ImageData) => {
      sampledWidth = frame.width;
      return null;
    });
    vi.mocked(createBarcodeFrameDetector).mockResolvedValue(detectorFn);

    const { container } = renderGuided({ guide: 'id', detector: 'barcode' });
    setVideoDims(container, 1280, 720);
    await advanceUntil(() => sampledWidth > 0);

    expect(createBarcodeFrameDetector).toHaveBeenCalled();
    expect(createFaceFrameDetector).not.toHaveBeenCalled();
    expect(sampledWidth).toBe(640);
  });

  it('detector="none" desactiva la auto-captura (sin llamadas a los factories); solo manual', async () => {
    const { container } = renderGuided({ guide: 'id', detector: 'none' });
    setVideoDims(container);
    await flush(400);

    expect(createFaceFrameDetector).not.toHaveBeenCalled();
    expect(createBarcodeFrameDetector).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: es.capture.manualButton }));
    expect(screen.getByAltText('Vista previa de la captura')).toBeInTheDocument();
  });

  it('funciona fuera de FlowContext (sin <FirmaAutografa>), pasando detectionAssets=undefined', async () => {
    const detectorFn: FrameDetector = vi.fn().mockResolvedValue(null);
    vi.mocked(createFaceFrameDetector).mockResolvedValue(detectorFn);

    const { container } = render(
      <I18nProvider value={es}>
        <GuidedCameraCapture guide="id" detector="face-small" onCapture={vi.fn()} />
      </I18nProvider>,
    );
    setVideoDims(container);
    await flush(400);

    expect(createFaceFrameDetector).toHaveBeenCalledWith(undefined);
  });

  it('usa detectionAssets del FlowContext cuando el componente se monta dentro de uno', async () => {
    const detectorFn: FrameDetector = vi.fn().mockResolvedValue(null);
    vi.mocked(createFaceFrameDetector).mockResolvedValue(detectorFn);
    const assets = { mediapipeWasmUrl: 'https://example.test/wasm' };
    const ctx = { detectionAssets: assets } as unknown as FlowContextValue;

    const { container } = render(
      <I18nProvider value={es}>
        <FlowContext.Provider value={ctx}>
          <GuidedCameraCapture guide="id" detector="face-small" onCapture={vi.fn()} />
        </FlowContext.Provider>
      </I18nProvider>,
    );
    setVideoDims(container);
    await flush(400);

    expect(createFaceFrameDetector).toHaveBeenCalledWith(assets);
  });

  it('llama onCancel y apaga la cámara al cancelar', async () => {
    const detectorFn: FrameDetector = vi.fn().mockResolvedValue(null);
    vi.mocked(createFaceFrameDetector).mockResolvedValue(detectorFn);
    const onCancel = vi.fn();

    const { container } = renderGuided({ guide: 'id', detector: 'face-small', onCancel });
    setVideoDims(container);
    await flush(200);

    fireEvent.click(screen.getByRole('button', { name: es.capture.cancel }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('muestra el error de cámara y no la máscara si getUserMedia falla', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error('sin permiso')) },
    });
    renderGuided({ guide: 'id', detector: 'face-small' });
    await flush(0);

    expect(screen.getByRole('alert')).toHaveTextContent(es.errors.camera);
  });

  it('el aspecto del stage y la máscara SVG coinciden exactamente con guideRect(...)*100 (guide="id")', async () => {
    const detectorFn: FrameDetector = vi.fn().mockResolvedValue(null);
    vi.mocked(createFaceFrameDetector).mockResolvedValue(detectorFn);

    const { container } = renderGuided({ guide: 'id', detector: 'face-small' });
    const video = container.querySelector('video')!;
    setVideoDims(container, 1280, 720); // 16:9
    fireEvent.loadedMetadata(video);
    await flush(400);

    const stage = container.querySelector<HTMLDivElement>('.digid-guided-camera__stage')!;
    expect(stage.style.aspectRatio).toBe(String(1280 / 720));

    const maskPath = container.querySelector('svg.digid-guided-camera__mask path')!;
    expect(maskPath).toHaveAttribute('d', expectedMaskPathD('id', 1280 / 720));
  });

  it('el aspecto del stage y la máscara SVG coinciden exactamente con guideRect(...)*100 (guide="face")', async () => {
    const detectorFn: FrameDetector = vi.fn().mockResolvedValue(null);
    vi.mocked(createFaceFrameDetector).mockResolvedValue(detectorFn);

    const { container } = renderGuided({ guide: 'face', detector: 'face-selfie' });
    const video = container.querySelector('video')!;
    setVideoDims(container, 720, 1280); // 9:16 (selfie en retrato)
    fireEvent.loadedMetadata(video);
    await flush(400);

    const stage = container.querySelector<HTMLDivElement>('.digid-guided-camera__stage')!;
    expect(stage.style.aspectRatio).toBe(String(720 / 1280));

    const maskPath = container.querySelector('svg.digid-guided-camera__mask path')!;
    expect(maskPath).toHaveAttribute('d', expectedMaskPathD('face', 720 / 1280));
  });

  it('una rotación a mitad de sesión (resize del track) resincroniza el aspecto del stage y la máscara', async () => {
    const detectorFn: FrameDetector = vi.fn().mockResolvedValue(null);
    vi.mocked(createFaceFrameDetector).mockResolvedValue(detectorFn);

    const { container } = renderGuided({ guide: 'id', detector: 'face-small' });
    const video = container.querySelector('video')!;

    // Arranca en horizontal (16:9).
    setVideoDims(container, 1280, 720);
    fireEvent.loadedMetadata(video);
    await flush(400);
    const stage = container.querySelector<HTMLDivElement>('.digid-guided-camera__stage')!;
    expect(stage.style.aspectRatio).toBe(String(1280 / 720));

    // El usuario rota el teléfono: el navegador re-orienta el track y emite
    // "resize" con las nuevas dimensiones (sin loadedmetadata de nuevo).
    setVideoDims(container, 720, 1280);
    fireEvent.resize(video);

    expect(stage.style.aspectRatio).toBe(String(720 / 1280));
    const maskPath = container.querySelector('svg.digid-guided-camera__mask path')!;
    expect(maskPath).toHaveAttribute('d', expectedMaskPathD('id', 720 / 1280));

    await flush(400); // deja asentar el resto de efectos antes de terminar el test
  });
});
