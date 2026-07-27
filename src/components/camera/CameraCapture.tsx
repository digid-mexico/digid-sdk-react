import { useEffect, useRef, useState } from 'react';
import { useCamera } from './useCamera';
import { Button } from '../ui/Button';
import { useStrings } from '../../i18n';

interface Props {
  /** dataURL JPEG de la captura confirmada */
  onCapture: (dataUrl: string) => void;
  onCancel?: () => void;
  mirror?: boolean; // true en desktop (webcam frontal)
  /** Cámara a solicitar: trasera (INE) o frontal (selfie). Default: trasera. */
  facingMode?: 'environment' | 'user';
}

export function CameraCapture({ onCapture, onCancel, mirror = false, facingMode = 'environment' }: Props) {
  const s = useStrings();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { stream, error, open, close } = useCamera(facingMode);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => { void open(); }, [open]);
  useEffect(() => {
    if (!videoRef.current) return;
    if (stream) {
      videoRef.current.srcObject = stream;
      // Autoplay/AbortError son esperables (p.ej. si el stream cambia
      // rápidamente) y no representan un error real para el usuario.
      void videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.srcObject = null;
    }
  }, [stream]);

  function capture() {
    const video = videoRef.current, canvas = canvasRef.current;
    if (!video || !canvas) return;
    // El video puede no tener dimensiones aún (permiso pendiente / stream
    // no listo): evita capturar un frame en blanco de 0x0.
    if (video.videoWidth === 0) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    if (mirror) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setPreview(canvas.toDataURL('image/jpeg', 0.9));
    close(); // apaga la cámara en cuanto hay captura
  }

  if (error) return <p role="alert">{s.errors.camera}</p>;

  return (
    <div className="digid-camera">
      {preview === null ? (
        <>
          <video ref={videoRef} autoPlay playsInline muted
            style={mirror ? { transform: 'scaleX(-1)' } : undefined} />
          <div className="digid-footer">
            {onCancel && <Button variant="secondary" onClick={() => { close(); onCancel(); }}>✕</Button>}
            <Button onClick={capture} disabled={!stream} aria-label="Capturar">📷</Button>
          </div>
        </>
      ) : (
        <>
          <img src={preview} alt="Vista previa de la captura" />
          <div className="digid-footer">
            <Button variant="secondary" onClick={() => { setPreview(null); void open(); }}>
              ↺
            </Button>
            <Button onClick={() => onCapture(preview)}>{s.idCapture.continue}</Button>
          </div>
        </>
      )}
      <canvas ref={canvasRef} hidden />
    </div>
  );
}
