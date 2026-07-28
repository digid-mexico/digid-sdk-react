import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useCamera } from './useCamera';
import { Button } from '../ui/Button';
import { useStrings } from '../../i18n';
import { FlowContext } from '../../core/FlowContext';
import { useAutoCapture, type AutoCaptureStatus } from '../../detection/useAutoCapture';
import { createFaceFrameDetector } from '../../detection/faceDetector';
import { createBarcodeFrameDetector } from '../../detection/barcodeDetector';
import type { DetectionResult, FrameDetector } from '../../detection/types';
import { guideRect, type GuideKind } from './guideRect';
import { acceptBarcode, acceptFaceSelfie, acceptFaceSmall } from './acceptance';

export type { GuideKind };
export type DetectorKind = 'face-small' | 'face-selfie' | 'barcode' | 'none';

interface Props {
  guide: GuideKind;
  /** Qué detector on-device usar para la auto-captura; 'none' desactiva la auto-captura (solo manual). */
  detector: DetectorKind;
  /** dataURL JPEG de la captura confirmada (ya recortada a la ventana guía). */
  onCapture: (dataUrl: string) => void;
  onCancel?: () => void;
  mirror?: boolean; // true en desktop (webcam frontal)
  /** Cámara a solicitar: trasera (INE) o frontal (selfie). Default: trasera. */
  facingMode?: 'environment' | 'user';
}

const DEFAULT_VIDEO_ASPECT = 4 / 3;
const BARCODE_SAMPLE_WIDTH = 640;

function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  return (
    `M${x + rr},${y} ` +
    `H${x + w - rr} A${rr},${rr} 0 0 1 ${x + w},${y + rr} ` +
    `V${y + h - rr} A${rr},${rr} 0 0 1 ${x + w - rr},${y + h} ` +
    `H${x + rr} A${rr},${rr} 0 0 1 ${x},${y + h - rr} ` +
    `V${y + rr} A${rr},${rr} 0 0 1 ${x + rr},${y} Z`
  );
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return `M${cx - rx},${cy} A${rx},${ry} 0 1 0 ${cx + rx},${cy} A${rx},${ry} 0 1 0 ${cx - rx},${cy} Z`;
}

const OUTER_PATH = 'M0,0 H100 V100 H0 Z';
const CORNER_LEN = 8;

function cornerAccentPaths(x: number, y: number, w: number, h: number): string[] {
  const x2 = x + w;
  const y2 = y + h;
  return [
    `M${x},${y + CORNER_LEN} V${y} H${x + CORNER_LEN}`, // top-left
    `M${x2 - CORNER_LEN},${y} H${x2} V${y + CORNER_LEN}`, // top-right
    `M${x2},${y2 - CORNER_LEN} V${y2} H${x2 - CORNER_LEN}`, // bottom-right
    `M${x + CORNER_LEN},${y2} H${x} V${y2 - CORNER_LEN}`, // bottom-left
  ];
}

function detectorFactoryFor(
  kind: DetectorKind,
  assets: Parameters<typeof createFaceFrameDetector>[0],
): () => Promise<FrameDetector> {
  switch (kind) {
    case 'face-small':
    case 'face-selfie':
      return () => createFaceFrameDetector(assets);
    case 'barcode':
      return () => createBarcodeFrameDetector(assets);
    case 'none':
    default:
      return () => Promise.reject(new Error('GuidedCameraCapture: detector="none" no debe invocarse'));
  }
}

export function GuidedCameraCapture({
  guide,
  detector,
  onCapture,
  onCancel,
  mirror = false,
  facingMode = 'environment',
}: Props) {
  const s = useStrings();
  // Lectura defensiva: este componente también se exporta para uso fuera de
  // <FirmaAutografa> (no usamos useFlow(), que lanza si no hay Provider).
  const flow = useContext(FlowContext);
  const detectionAssets = flow?.detectionAssets;

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { stream, error, open, close } = useCamera(facingMode);
  const [preview, setPreview] = useState<string | null>(null);
  const [videoAspect, setVideoAspect] = useState(DEFAULT_VIDEO_ASPECT);

  useEffect(() => {
    void open();
  }, [open]);

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

  function handleLoadedMetadata() {
    const video = videoRef.current;
    if (video && video.videoWidth > 0 && video.videoHeight > 0) {
      setVideoAspect(video.videoWidth / video.videoHeight);
    }
  }

  const rect = useMemo(() => guideRect(guide, videoAspect), [guide, videoAspect]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) return;
    const cropX = Math.round(rect.x * video.videoWidth);
    const cropY = Math.round(rect.y * video.videoHeight);
    const cropW = Math.max(1, Math.round(rect.width * video.videoWidth));
    const cropH = Math.max(1, Math.round(rect.height * video.videoHeight));
    canvas.width = cropW;
    canvas.height = cropH;
    const ctx = canvas.getContext('2d')!;
    if (mirror) {
      // El recorte es horizontalmente simétrico (guía centrada), así que
      // espejar antes de recortar produce la misma región visual que vio
      // el firmante en el preview espejado por CSS.
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    setPreview(canvas.toDataURL('image/jpeg', 0.9));
    close(); // apaga la cámara en cuanto hay captura
  }, [close, mirror, rect]);

  const autoEnabled = detector !== 'none' && !!stream && preview === null;

  const createDetector = useCallback(
    () => detectorFactoryFor(detector, detectionAssets)(),
    [detector, detectionAssets],
  );

  const accept = useCallback(
    (r: DetectionResult) => {
      switch (detector) {
        case 'face-selfie':
          return acceptFaceSelfie(r.box, rect);
        case 'face-small':
          return acceptFaceSmall(r.box, rect);
        case 'barcode':
          return acceptBarcode(r.box, rect);
        case 'none':
        default:
          return false;
      }
    },
    [detector, rect],
  );

  const auto = useAutoCapture({
    videoRef,
    enabled: autoEnabled,
    createDetector,
    accept,
    onCapture: capture,
    sampleWidth: detector === 'barcode' ? BARCODE_SAMPLE_WIDTH : undefined,
  });

  if (error) return <p role="alert">{s.errors.camera}</p>;

  const statusText = statusMessage(auto.status, guide, s);
  const gx = rect.x * 100;
  const gy = rect.y * 100;
  const gw = rect.width * 100;
  const gh = rect.height * 100;
  const innerPath =
    guide === 'id'
      ? roundedRectPath(gx, gy, gw, gh, 4)
      : ellipsePath(gx + gw / 2, gy + gh / 2, gw / 2, gh / 2);

  const ringCircumference = 2 * Math.PI * 18;
  const ringOffset = ringCircumference * (1 - auto.countdownProgress);

  return (
    <div className="digid-camera digid-guided-camera" data-guide={guide}>
      {preview === null ? (
        <>
          <div className="digid-guided-camera__stage" style={{ aspectRatio: String(videoAspect) }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              onLoadedMetadata={handleLoadedMetadata}
              style={mirror ? { transform: 'scaleX(-1)' } : undefined}
            />
            <svg
              className="digid-guided-camera__mask"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path fillRule="evenodd" fill="rgba(0,0,0,.5)" d={`${OUTER_PATH} ${innerPath}`} />
              {guide === 'id' &&
                cornerAccentPaths(gx, gy, gw, gh).map((d, i) => (
                  <path
                    key={i}
                    d={d}
                    fill="none"
                    stroke="var(--digid-primary)"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                  />
                ))}
              {guide === 'face' && (
                <ellipse
                  cx={gx + gw / 2}
                  cy={gy + gh / 2}
                  rx={gw / 2}
                  ry={gh / 2}
                  fill="none"
                  stroke="var(--digid-primary)"
                  strokeWidth={1}
                />
              )}
            </svg>
            {auto.status === 'countdown' && (
              <svg className="digid-guided-camera__ring" viewBox="0 0 40 40" aria-hidden="true">
                <circle cx={20} cy={20} r={18} className="digid-guided-camera__ring-track" />
                <circle
                  cx={20}
                  cy={20}
                  r={18}
                  className="digid-guided-camera__ring-progress"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringOffset}
                />
              </svg>
            )}
          </div>
          <p role="status" aria-live="polite" className="digid-guided-camera__status">
            {statusText}
            {auto.status === 'countdown' && ` ${Math.round(auto.countdownProgress * 100)}%`}
          </p>
          <div className="digid-footer">
            {onCancel && (
              <Button
                variant="secondary"
                aria-label={s.capture.cancel}
                onClick={() => {
                  close();
                  onCancel();
                }}
              >
                ✕
              </Button>
            )}
            <Button onClick={capture} disabled={!stream} aria-label={s.capture.manualButton}>
              📷
            </Button>
          </div>
        </>
      ) : (
        <>
          <img src={preview} alt="Vista previa de la captura" />
          <div className="digid-footer">
            <Button
              variant="secondary"
              onClick={() => {
                setPreview(null);
                void open();
              }}
            >
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

function statusMessage(status: AutoCaptureStatus, guide: GuideKind, s: ReturnType<typeof useStrings>): string {
  switch (status) {
    case 'loading':
      return s.capture.loading;
    case 'searching':
      return guide === 'id' ? s.capture.searchingId : s.capture.searchingFace;
    case 'adjusting':
      return s.capture.adjusting;
    case 'holding':
      return s.capture.holding;
    case 'countdown':
      return s.capture.countdown;
    case 'unavailable':
      return s.capture.unavailable;
    case 'idle':
    default:
      return '';
  }
}
