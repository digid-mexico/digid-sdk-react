import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { DocScanCapture } from './DocScanCapture';
import { I18nProvider, es } from '../../i18n';
import type { Corners } from '../../scan/types';

// NOTA: se usa `fireEvent` (no `userEvent`) en todo este archivo. Con fake
// timers activos, `userEvent` cuelga: sus interacciones internas dependen de
// temporizadores reales que nunca avanzan (mismo motivo por el que
// GuidedCameraCapture.test.tsx tampoco usa userEvent).

vi.mock('../../scan/docscan', () => ({
  initDocScan: vi.fn(),
  docScanReady: vi.fn(() => false),
  detectDocument: vi.fn().mockResolvedValue(null),
  detectDocumentStill: vi.fn().mockResolvedValue(null),
  extractDocument: vi.fn().mockResolvedValue(null),
  assessDocQuality: vi.fn().mockResolvedValue(null),
  extremeBlur: vi.fn(() => false),
  cornerMovement: vi.fn(() => 0),
  scaleCorners: vi.fn((c: unknown) => c),
  mapCornersToDisplay: vi.fn(() => [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 1, y: 2 }]),
  orientDocumentForStep: vi.fn((c: unknown) => c),
  createDetectionConfirmer: vi.fn(() => ({ push: vi.fn(() => true), reset: vi.fn() })),
}));

vi.mock('../../scan/marco', () => ({
  marcoFrameRect: vi.fn(() => ({ x: 0, y: 0, width: 100, height: 63 })),
  frameRectToDisplay: vi.fn(() => ({ x: 10, y: 10, width: 200, height: 126 })),
  roiFromMarco: vi.fn(() => ({ x: 0, y: 0, width: 120, height: 75 })),
  rectToRoiCanvas: vi.fn(() => ({ x: 0, y: 0, width: 720, height: 454 })),
  roiCornersToFrame: vi.fn((c: unknown) => c),
  scaleRect: vi.fn((r: unknown) => r),
  validateQuadInMarco: vi.fn(() => ({ ok: true, coverage: 0.8 })),
  marcoGuidance: vi.fn(() => null),
  MARCO_WIDTH_FRAC: 0.8,
  MARCO_WIDTH_FRAC_DESKTOP: 0.42,
}));

vi.mock('../../scan/scan', () => ({
  analyzeDocumentQuality: vi.fn(() => ({ score: 70, hint: 'Enfoca el documento', documentLikely: true, signature: [] })),
  createEnhancedDocumentImage: vi.fn(() => ({ canvas: document.createElement('canvas'), dataUrl: 'data:image/jpeg;base64,enhanced' })),
  stopStream: vi.fn(),
  getFrameImage: vi.fn(),
  signatureDifference: vi.fn(() => 100),
}));

import {
  docScanReady,
  detectDocument,
  detectDocumentStill,
  extractDocument,
  assessDocQuality,
} from '../../scan/docscan';
import { validateQuadInMarco, marcoGuidance } from '../../scan/marco';

const FAKE_CORNERS: Corners = {
  topLeftCorner: { x: 10, y: 10 },
  topRightCorner: { x: 100, y: 10 },
  bottomLeftCorner: { x: 10, y: 60 },
  bottomRightCorner: { x: 100, y: 60 },
};

function fakeStream(): MediaStream {
  const track = { stop: vi.fn(), getSettings: () => ({}) };
  return {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
}

function prepareVideo(container: HTMLElement, width = 1280, height = 720) {
  const video = container.querySelector('video');
  if (!video) throw new Error('no <video> en el contenedor');
  Object.defineProperty(video, 'videoWidth', { value: width, configurable: true });
  Object.defineProperty(video, 'videoHeight', { value: height, configurable: true });
  Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
}

async function flush(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function advanceUntil(predicate: () => boolean, { stepMs = 100, maxMs = 10000 } = {}) {
  let elapsed = 0;
  while (!predicate() && elapsed < maxMs) {
    await flush(stepMs);
    elapsed += stepMs;
  }
  if (!predicate()) throw new Error(`advanceUntil: condición no se cumplió tras ${maxMs}ms`);
}

function renderCapture(props: Partial<React.ComponentProps<typeof DocScanCapture>> = {}) {
  const merged = {
    side: 'front' as const,
    onCapture: vi.fn(),
    onCancel: vi.fn(),
    ...props,
  };
  const utils = render(
    <I18nProvider value={es}>
      <DocScanCapture {...merged} />
    </I18nProvider>,
  );
  return { ...utils, props: merged };
}

const cam = es.scanUi.camera;

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(fakeStream()) },
  });
  // vi.mock ya fija el comportamiento por defecto de cada mock, pero
  // mockReturnValue/mockResolvedValue de un test anterior sobrevive entre
  // tests (no son spies de vi.spyOn, así que restoreAllMocks no los toca).
  // Se re-arma el estado neutro en cada test para que no haya fugas.
  vi.mocked(docScanReady).mockReturnValue(false);
  vi.mocked(detectDocument).mockResolvedValue(null);
  vi.mocked(detectDocumentStill).mockResolvedValue(null);
  vi.mocked(extractDocument).mockResolvedValue(null);
  vi.mocked(assessDocQuality).mockResolvedValue(null);
  vi.mocked(validateQuadInMarco).mockReturnValue({ ok: true, coverage: 0.8 });
  vi.mocked(marcoGuidance).mockReturnValue(null);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('DocScanCapture', () => {
  it('arranca en modo "preparando" y monta el <video> de inmediato', async () => {
    const { container } = renderCapture();
    expect(container.querySelector('video')).not.toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(cam.preparing);
    await flush(0); // deja asentar open()/getUserMedia antes de desmontar
  });

  it('muestra el mensaje de guía de marcoGuidance cuando no hay credencial detectada', async () => {
    vi.mocked(docScanReady).mockReturnValue(true);
    vi.mocked(detectDocument).mockResolvedValue({ corners: null, frame: null });
    vi.mocked(marcoGuidance).mockReturnValue({ message: 'Coloca la credencial dentro del marco', tone: 'idle' });

    const { container } = renderCapture();
    prepareVideo(container);
    await advanceUntil(() => screen.getByRole('status').textContent === 'Coloca la credencial dentro del marco');
  });

  it('una detección confirmada dibuja el polígono del cuadrilátero detectado', async () => {
    vi.mocked(docScanReady).mockReturnValue(true);
    vi.mocked(detectDocument).mockResolvedValue({
      corners: FAKE_CORNERS, frame: null, aspect: 1.586, areaRatio: 0.5, score: 80,
    });
    vi.mocked(validateQuadInMarco).mockReturnValue({ ok: true, coverage: 0.8 });
    vi.mocked(marcoGuidance).mockReturnValue(null);

    const { container } = renderCapture();
    prepareVideo(container);
    await advanceUntil(() => container.querySelector('.digid-scan__detect polygon') !== null);
    expect(container.querySelector('.digid-scan__detect polygon')).toHaveAttribute('points', '1,1 2,1 2,2 1,2');
  });

  it('detección estable dispara la auto-captura; el preview confirma con onCapture', async () => {
    vi.mocked(docScanReady).mockReturnValue(true);
    vi.mocked(detectDocument).mockResolvedValue({
      corners: FAKE_CORNERS, frame: null, aspect: 1.586, areaRatio: 0.5, score: 80,
    });
    vi.mocked(validateQuadInMarco).mockReturnValue({ ok: true, coverage: 0.8 });
    vi.mocked(marcoGuidance).mockReturnValue(null);
    vi.mocked(extractDocument).mockResolvedValue(document.createElement('canvas'));
    vi.mocked(assessDocQuality).mockResolvedValue({
      ok: true, score: 92, hint: '', codes: [],
      metrics: { sharpness: 120, brightness: 130, contrast: 40, glareRatio: 0.01 },
    });

    const { container, props } = renderCapture({ side: 'front' });
    prepareVideo(container);
    await advanceUntil(() => screen.queryByAltText('Documento capturado') !== null);
    expect(props.onCapture).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: es.scanUi.preview.continue }));
    expect(props.onCapture).toHaveBeenCalledWith('data:image/jpeg;base64,enhanced');
  });

  it('el obturador manual captura aunque no haya detección de quad', async () => {
    vi.mocked(docScanReady).mockReturnValue(true);
    vi.mocked(detectDocumentStill).mockResolvedValue(null); // sin quad: recorta el marco tal cual
    vi.mocked(assessDocQuality).mockResolvedValue({
      ok: true, score: 65, hint: '', codes: [],
      metrics: { sharpness: 60, brightness: 130, contrast: 30, glareRatio: 0.01 },
    });

    const { container, props } = renderCapture();
    prepareVideo(container);
    await flush(50); // deja asentar el efecto de apertura de cámara

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: cam.shutter }));
      await vi.advanceTimersByTimeAsync(0);
    });
    await advanceUntil(() => screen.queryByAltText('Documento capturado') !== null);

    fireEvent.click(screen.getByRole('button', { name: es.scanUi.preview.continue }));
    expect(props.onCapture).toHaveBeenCalledWith('data:image/jpeg;base64,enhanced');
  });

  it('si el worker de escaneo nunca queda listo, degrada a modo manual con aviso', async () => {
    vi.mocked(docScanReady).mockReturnValue(false);
    const { container } = renderCapture();
    prepareVideo(container);
    await advanceUntil(() => screen.getByRole('status').textContent === cam.manualNotice, { stepMs: 500, maxMs: 10000 });
  });

  it('subir una foto de la galería corre detectDocumentStill y muestra el preview', async () => {
    const OriginalImage = global.Image;
    // La decodificación real de imágenes no es testeable en jsdom (igual que
    // normalizeToJpeg, ver utils/image.ts); el pipeline de detección ya está
    // mockeado, así que basta un stub de Image que dispare onload.
    // @ts-expect-error stub deliberadamente simplificado para el test
    global.Image = class {
      onload: (() => void) | null = null;
      naturalWidth = 640;
      naturalHeight = 400;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    };

    try {
      vi.mocked(docScanReady).mockReturnValue(true);
      vi.mocked(detectDocumentStill).mockResolvedValue({
        corners: FAKE_CORNERS, frame: null, aspect: 1.586, rotated: false,
      });
      vi.mocked(extractDocument).mockResolvedValue(document.createElement('canvas'));
      vi.mocked(assessDocQuality).mockResolvedValue({
        ok: true, score: 88, hint: '', codes: [],
        metrics: { sharpness: 100, brightness: 130, contrast: 40, glareRatio: 0.01 },
      });

      const { container, props } = renderCapture({ side: 'back' });
      prepareVideo(container);
      await flush(50);

      const fileInput = screen.getByTestId('digid-scan-file-input') as HTMLInputElement;
      const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'ine.jpg', { type: 'image/jpeg' });
      await act(async () => {
        Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
        fireEvent.change(fileInput);
        await vi.advanceTimersByTimeAsync(0);
      });
      await advanceUntil(() => screen.queryByAltText('Documento capturado') !== null);

      expect(detectDocumentStill).toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: es.scanUi.preview.continue }));
      expect(props.onCapture).toHaveBeenCalledWith('data:image/jpeg;base64,enhanced');
    } finally {
      global.Image = OriginalImage;
    }
  });

  it('cancelar cierra la cámara y llama a onCancel', async () => {
    const { container, props } = renderCapture();
    prepareVideo(container);
    await flush(50);
    fireEvent.click(screen.getByRole('button', { name: cam.close }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });
});
