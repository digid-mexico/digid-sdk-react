import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { RefObject } from 'react';
import { useAutoCapture } from './useAutoCapture';
import type { DetectionResult, FrameDetector } from './types';

vi.mock('./sharpness', () => ({
  isSharp: vi.fn(() => true),
}));

import { isSharp } from './sharpness';

function fakeVideoRef(width = 640, height = 480): RefObject<HTMLVideoElement | null> {
  return {
    current: { videoWidth: width, videoHeight: height } as unknown as HTMLVideoElement,
  };
}

const ACCEPTED: DetectionResult = { box: { x: 0.4, y: 0.4, width: 0.2, height: 0.2 } };

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(isSharp).mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useAutoCapture', () => {
  it('permanece idle y no crea el detector cuando enabled=false', async () => {
    const videoRef = fakeVideoRef();
    const createDetector = vi.fn();
    const { result } = renderHook(() =>
      useAutoCapture({
        videoRef,
        enabled: false,
        createDetector,
        accept: () => true,
        onCapture: vi.fn(),
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(result.current.status).toBe('idle');
    expect(createDetector).not.toHaveBeenCalled();
  });

  it('pasa por loading y llega a searching cuando el detector no encuentra nada', async () => {
    const videoRef = fakeVideoRef();
    const detector: FrameDetector = vi.fn().mockResolvedValue(null);
    const createDetector = vi.fn().mockResolvedValue(detector);

    const { result } = renderHook(() =>
      useAutoCapture({
        videoRef,
        enabled: true,
        createDetector,
        accept: () => true,
        onCapture: vi.fn(),
      }),
    );

    // Justo tras habilitar, antes de que resuelva createDetector.
    expect(result.current.status).toBe('loading');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(createDetector).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('searching');
    expect(detector).toHaveBeenCalled();
  });

  it('pasa a adjusting cuando hay detección pero accept() la rechaza', async () => {
    const videoRef = fakeVideoRef();
    const detector: FrameDetector = vi.fn().mockResolvedValue(ACCEPTED);
    const createDetector = vi.fn().mockResolvedValue(detector);

    const { result } = renderHook(() =>
      useAutoCapture({
        videoRef,
        enabled: true,
        createDetector,
        accept: () => false,
        onCapture: vi.fn(),
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(result.current.status).toBe('adjusting');
  });

  it('pasa a adjusting cuando la detección es aceptada pero el frame no es nítido', async () => {
    vi.mocked(isSharp).mockReturnValue(false);
    const videoRef = fakeVideoRef();
    const detector: FrameDetector = vi.fn().mockResolvedValue(ACCEPTED);
    const createDetector = vi.fn().mockResolvedValue(detector);

    const { result } = renderHook(() =>
      useAutoCapture({
        videoRef,
        enabled: true,
        createDetector,
        accept: () => true,
        onCapture: vi.fn(),
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(result.current.status).toBe('adjusting');
  });

  it('ignora la nitidez cuando requireSharp=false', async () => {
    vi.mocked(isSharp).mockReturnValue(false);
    const videoRef = fakeVideoRef();
    const detector: FrameDetector = vi.fn().mockResolvedValue(ACCEPTED);
    const createDetector = vi.fn().mockResolvedValue(detector);

    const { result } = renderHook(() =>
      useAutoCapture({
        videoRef,
        enabled: true,
        createDetector,
        accept: () => true,
        onCapture: vi.fn(),
        requireSharp: false,
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(result.current.status).toBe('holding');
  });

  it('holding → countdown → onCapture exactamente una vez tras estabilidad + cuenta regresiva', async () => {
    const videoRef = fakeVideoRef();
    const detector: FrameDetector = vi.fn().mockResolvedValue(ACCEPTED);
    const createDetector = vi.fn().mockResolvedValue(detector);
    const onCapture = vi.fn();

    const { result } = renderHook(() =>
      useAutoCapture({
        videoRef,
        enabled: true,
        createDetector,
        accept: () => true,
        onCapture,
        intervalMs: 200,
        stableMs: 1200,
        countdownMs: 1000,
      }),
    );

    // Deja pasar tiempo suficiente para acumular estabilidad pero no para
    // completar la cuenta regresiva todavía.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.status).toBe('holding');
    expect(onCapture).not.toHaveBeenCalled();

    // Cruza el umbral de estabilidad: debe entrar en countdown.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(result.current.status).toBe('countdown');
    expect(result.current.countdownProgress).toBeGreaterThan(0);
    expect(result.current.countdownProgress).toBeLessThan(1);
    expect(onCapture).not.toHaveBeenCalled();

    // Completa la cuenta regresiva.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(onCapture).toHaveBeenCalledTimes(1);

    // El loop se detiene: seguir avanzando el reloj no debe volver a disparar.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(onCapture).toHaveBeenCalledTimes(1);
  });

  it('un frame fallido durante la cuenta regresiva reinicia el ciclo (regresión)', async () => {
    const videoRef = fakeVideoRef();
    let acceptedNow = true;
    const detector: FrameDetector = vi.fn().mockImplementation(async () =>
      acceptedNow ? ACCEPTED : { box: { x: 0, y: 0, width: 0.05, height: 0.05 } },
    );
    const createDetector = vi.fn().mockResolvedValue(detector);
    const onCapture = vi.fn();

    const { result } = renderHook(() =>
      useAutoCapture({
        videoRef,
        enabled: true,
        createDetector,
        accept: (r) => r.box.width > 0.1,
        onCapture,
        intervalMs: 200,
        stableMs: 1200,
        countdownMs: 1000,
      }),
    );

    // Llega a countdown.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1400);
    });
    expect(result.current.status).toBe('countdown');

    // Una detección rechazada a mitad de la cuenta regresiva la reinicia.
    acceptedNow = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(result.current.status).toBe('adjusting');
    expect(result.current.countdownProgress).toBe(0);

    // Aunque siga corriendo el reloj no debe capturar: hay que volver a
    // acumular estabilidad completa desde cero.
    acceptedNow = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1400);
    });
    expect(onCapture).not.toHaveBeenCalled();
    expect(result.current.status).toBe('countdown');
  });

  it('pasa a unavailable cuando el detector falla al crearse', async () => {
    const videoRef = fakeVideoRef();
    const createDetector = vi.fn().mockRejectedValue(new Error('no wasm'));

    const { result } = renderHook(() =>
      useAutoCapture({
        videoRef,
        enabled: true,
        createDetector,
        accept: () => true,
        onCapture: vi.fn(),
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe('unavailable');
  });

  it('trata videoWidth=0 como "sin detección" (searching)', async () => {
    const videoRef = fakeVideoRef(0, 0);
    const detector: FrameDetector = vi.fn().mockResolvedValue(ACCEPTED);
    const createDetector = vi.fn().mockResolvedValue(detector);

    const { result } = renderHook(() =>
      useAutoCapture({
        videoRef,
        enabled: true,
        createDetector,
        accept: () => true,
        onCapture: vi.fn(),
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(result.current.status).toBe('searching');
    expect(detector).not.toHaveBeenCalled();
  });

  it('tras N fallos de detección en runtime (excepciones) pasa a unavailable y detiene el loop', async () => {
    const videoRef = fakeVideoRef();
    const detector: FrameDetector = vi.fn().mockRejectedValue(new Error('boom'));
    const createDetector = vi.fn().mockResolvedValue(detector);

    const { result } = renderHook(() =>
      useAutoCapture({
        videoRef,
        enabled: true,
        createDetector,
        accept: () => true,
        onCapture: vi.fn(),
        intervalMs: 100,
        maxDetectorFailures: 5,
      }),
    );

    // 5 ticks de 100ms = exactamente los 5 fallos consecutivos configurados.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(result.current.status).toBe('unavailable');
    const callsAtUnavailable = vi.mocked(detector).mock.calls.length;
    expect(callsAtUnavailable).toBe(5);

    // El loop se detuvo: seguir avanzando el reloj no genera más llamadas.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(vi.mocked(detector).mock.calls.length).toBe(callsAtUnavailable);
  });

  it('un detect exitoso reinicia el contador de fallos consecutivos', async () => {
    const videoRef = fakeVideoRef();
    let call = 0;
    const detector: FrameDetector = vi.fn().mockImplementation(async () => {
      call++;
      // Falla 4 veces, un éxito (sin detección), y falla 4 veces más: nunca
      // hay 5 fallos consecutivos si el contador se reinicia correctamente
      // en el éxito intermedio (si no se reiniciara, el 5º fallo absoluto —
      // 1 después del éxito — dispararía unavailable de todos modos).
      if (call === 5) return null;
      throw new Error('boom');
    });
    const createDetector = vi.fn().mockResolvedValue(detector);

    const { result } = renderHook(() =>
      useAutoCapture({
        videoRef,
        enabled: true,
        createDetector,
        accept: () => true,
        onCapture: vi.fn(),
        intervalMs: 100,
        maxDetectorFailures: 5,
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(900); // 9 ticks: fail x4, success, fail x4
    });

    expect(result.current.status).not.toBe('unavailable');
    expect(vi.mocked(detector).mock.calls.length).toBe(9);
  });

  it('usa sampleWidth para el ancho de muestreo del canvas (default 320)', async () => {
    const videoRef = fakeVideoRef(1280, 720);
    let sampledWidth = 0;
    const detector: FrameDetector = vi.fn().mockImplementation(async (frame: ImageData) => {
      sampledWidth = frame.width;
      return null;
    });
    const createDetector = vi.fn().mockResolvedValue(detector);

    renderHook(() =>
      useAutoCapture({ videoRef, enabled: true, createDetector, accept: () => true, onCapture: vi.fn() }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(sampledWidth).toBe(320);
  });

  it('permite un sampleWidth mayor (p.ej. 640 para códigos de barras)', async () => {
    const videoRef = fakeVideoRef(1280, 720);
    let sampledWidth = 0;
    const detector: FrameDetector = vi.fn().mockImplementation(async (frame: ImageData) => {
      sampledWidth = frame.width;
      return null;
    });
    const createDetector = vi.fn().mockResolvedValue(detector);

    renderHook(() =>
      useAutoCapture({
        videoRef,
        enabled: true,
        createDetector,
        accept: () => true,
        onCapture: vi.fn(),
        sampleWidth: 640,
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(sampledWidth).toBe(640);
  });

  it('crea el contexto 2d del canvas de muestreo con willReadFrequently', async () => {
    const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    const videoRef = fakeVideoRef();
    const detector: FrameDetector = vi.fn().mockResolvedValue(null);
    const createDetector = vi.fn().mockResolvedValue(detector);

    renderHook(() =>
      useAutoCapture({ videoRef, enabled: true, createDetector, accept: () => true, onCapture: vi.fn() }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(getContextSpy).toHaveBeenCalledWith('2d', { willReadFrequently: true });
  });

  it('limpia el intervalo al desmontar (no siguen llegando frames)', async () => {
    const videoRef = fakeVideoRef();
    const detector: FrameDetector = vi.fn().mockResolvedValue(null);
    const createDetector = vi.fn().mockResolvedValue(detector);

    const { unmount } = renderHook(() =>
      useAutoCapture({
        videoRef,
        enabled: true,
        createDetector,
        accept: () => true,
        onCapture: vi.fn(),
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    const callsBeforeUnmount = vi.mocked(detector).mock.calls.length;
    expect(callsBeforeUnmount).toBeGreaterThan(0);

    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(vi.mocked(detector).mock.calls.length).toBe(callsBeforeUnmount);
  });
});
