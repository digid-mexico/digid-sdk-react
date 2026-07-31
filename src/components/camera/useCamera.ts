import { useCallback, useEffect, useRef, useState } from 'react';

export function useCamera(
  facingMode: 'environment' | 'user' = 'environment',
  // Constraints de video propias (p.ej. resolución ideal para el escáner de
  // INE, ver DocScanCapture): si se pasa, reemplaza por completo al
  // `{ facingMode }` por defecto. Opcional y retrocompatible — los llamadores
  // existentes (GuidedCameraCapture/SelfieStep) no lo pasan y no cambian de
  // comportamiento.
  videoConstraints?: MediaTrackConstraints,
) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);
  // Se incrementa en cada close()/open() para invalidar llamadas a
  // getUserMedia en vuelo que quedaron obsoletas (evita fuga de cámara).
  const generationRef = useRef(0);
  // Apertura en vuelo, para serializar: ver el comentario dentro de open().
  const inFlightRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const close = useCallback(() => {
    generationRef.current += 1;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  const open = useCallback(async () => {
    const anterior = inFlightRef.current;
    const intento = (async () => {
      // Serializa las aperturas: nunca debe haber dos getUserMedia en vuelo
      // sobre la misma cámara. Si se solapan, el navegador puede devolver
      // tracks compartidos entre ambas llamadas, y entonces el stop() de la
      // que pierde deja muerta a la que gana: el <video> recibe un stream con
      // tracks ya terminados, nunca alcanza readyState 2 y la UI se queda
      // esperando frames que no llegan.
      //
      // Pasa en cuanto el consumidor usa <StrictMode>, que en desarrollo monta,
      // desmonta y vuelve a montar: open() → close() → open() en milisegundos.
      // StrictMode viene por defecto en la plantilla de React de Vite, así que
      // es el caso común, no un borde.
      if (anterior) await anterior.catch(() => {});
      close();
      setError(null);
      const myGeneration = generationRef.current;
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: videoConstraints ?? { facingMode } });
        // Si el componente se desmontó o otro open()/close() superó esta
        // llamada mientras getUserMedia estaba pendiente, el stream quedó
        // huérfano: apágalo de inmediato y no actualices estado.
        if (!mountedRef.current || generationRef.current !== myGeneration) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = s;
        setStream(s);
      } catch (e) {
        if (!mountedRef.current || generationRef.current !== myGeneration) return;
        setError(e instanceof Error ? e : new Error(String(e)));
      }
    })();
    inFlightRef.current = intento;
    await intento;
  }, [close, facingMode, videoConstraints]);

  // Garantiza que la cámara se apaga al desmontar el componente.
  useEffect(() => close, [close]);

  return { stream, error, open, close };
}
