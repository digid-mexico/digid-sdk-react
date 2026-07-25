import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCamera } from './useCamera';

const stopTrack = vi.fn();
const fakeStream = {
  getTracks: () => [{ stop: stopTrack }],
} as unknown as MediaStream;

beforeEach(() => {
  stopTrack.mockClear();
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(fakeStream) },
  });
});

describe('useCamera', () => {
  it('abre la cámara trasera por defecto y expone el stream', async () => {
    const { result } = renderHook(() => useCamera());
    await act(() => result.current.open());
    await waitFor(() => expect(result.current.stream).toBe(fakeStream));
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: 'environment' },
    });
  });

  it('detiene todos los tracks al cerrar', async () => {
    const { result } = renderHook(() => useCamera());
    await act(() => result.current.open());
    act(() => result.current.close());
    expect(stopTrack).toHaveBeenCalled();
    expect(result.current.stream).toBeNull();
  });

  it('detiene los tracks al desmontar (fix: cámara quedaba encendida)', async () => {
    const { result, unmount } = renderHook(() => useCamera());
    await act(() => result.current.open());
    unmount();
    expect(stopTrack).toHaveBeenCalled();
  });

  it('expone error cuando el permiso es denegado', async () => {
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'));
    const { result } = renderHook(() => useCamera());
    await act(() => result.current.open());
    await waitFor(() => expect(result.current.error).not.toBeNull());
  });

  it('detiene el stream si el componente se desmonta antes de que getUserMedia resuelva (evita fuga de cámara)', async () => {
    let resolveGetUserMedia!: (s: MediaStream) => void;
    const pending = new Promise<MediaStream>((resolve) => {
      resolveGetUserMedia = resolve;
    });
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockReturnValueOnce(pending);

    const { result, unmount } = renderHook(() => useCamera());
    let openPromise!: Promise<void>;
    act(() => {
      openPromise = result.current.open();
    });

    unmount();

    await act(async () => {
      resolveGetUserMedia(fakeStream);
      await openPromise;
    });

    expect(stopTrack).toHaveBeenCalled();
    expect(result.current.stream).toBeNull();
  });

  it('detiene el stream si close() se llama mientras open() está pendiente', async () => {
    let resolveGetUserMedia!: (s: MediaStream) => void;
    const pending = new Promise<MediaStream>((resolve) => {
      resolveGetUserMedia = resolve;
    });
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockReturnValueOnce(pending);

    const { result } = renderHook(() => useCamera());
    let openPromise!: Promise<void>;
    act(() => {
      openPromise = result.current.open();
    });

    act(() => {
      result.current.close();
    });

    await act(async () => {
      resolveGetUserMedia(fakeStream);
      await openPromise;
    });

    expect(stopTrack).toHaveBeenCalled();
    expect(result.current.stream).toBeNull();
  });
});
