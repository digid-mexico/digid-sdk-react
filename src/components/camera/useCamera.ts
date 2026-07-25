import { useCallback, useEffect, useRef, useState } from 'react';

export function useCamera(facingMode: 'environment' | 'user' = 'environment') {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const close = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  const open = useCallback(async () => {
    close();
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode } });
      streamRef.current = s;
      setStream(s);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, [close, facingMode]);

  // Garantiza que la cámara se apaga al desmontar el componente.
  useEffect(() => close, [close]);

  return { stream, error, open, close };
}
