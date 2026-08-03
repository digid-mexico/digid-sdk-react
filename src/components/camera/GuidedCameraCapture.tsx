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
import { ScanPreviewLayout } from '../scan/ScanPreviewLayout';
import { acceptBarcode, acceptFaceSelfie, acceptFaceSmall } from './acceptance';
import { cameraErrorMessage } from './cameraError';

export type { GuideKind };
export type DetectorKind = 'face-small' | 'face-selfie' | 'barcode' | 'none';
/**
 * 'plain' (default): chrome original (stage con bg #111928 recortado, status
 * en texto gris plano, footer con botón secundario ✕ + botón manual 📷).
 * 'scan': reutiliza el chrome del escáner de INE (Task 23) — stage full-bleed
 * navy, cierre en la topbar, status como badge de vidrio y obturador aqua
 * (.digid-scan__shutter) — para unificar visualmente con DocScanCapture
 * (Task 24, selfie). El óvalo guía no cambia entre chromes.
 */
export type CameraChrome = 'plain' | 'scan';

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
  /** Estilo visual del wrapper y controles. Default: 'plain' (no rompe usos existentes). */
  chrome?: CameraChrome;
}

const DEFAULT_VIDEO_ASPECT = 4 / 3;
const BARCODE_SAMPLE_WIDTH = 640;

// Exportadas (además de usarse internamente) para poder pinnear en pruebas
// que las coordenadas de la máscara SVG coinciden exactamente con
// guideRect(...)*100, sin reimplementar la aritmética en el test.
export function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  return (
    `M${x + rr},${y} ` +
    `H${x + w - rr} A${rr},${rr} 0 0 1 ${x + w},${y + rr} ` +
    `V${y + h - rr} A${rr},${rr} 0 0 1 ${x + w - rr},${y + h} ` +
    `H${x + rr} A${rr},${rr} 0 0 1 ${x},${y + h - rr} ` +
    `V${y + rr} A${rr},${rr} 0 0 1 ${x + rr},${y} Z`
  );
}

export function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return `M${cx - rx},${cy} A${rx},${ry} 0 1 0 ${cx + rx},${cy} A${rx},${ry} 0 1 0 ${cx - rx},${cy} Z`;
}

export const OUTER_PATH = 'M0,0 H100 V100 H0 Z';
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
  chrome = 'plain',
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

  // Actualiza el aspecto del video tanto al cargar metadatos como ante un
  // "resize" del track a mitad de sesión (p.ej. el navegador re-orienta el
  // frame al rotar el teléfono): sin esto, el aspecto del stage y de la
  // máscara SVG quedan desincronizados del video real, `object-fit: cover`
  // empieza a recortar, y el marco visible deja de coincidir con la región
  // que en verdad usan accept()/el recorte de captura.
  function handleVideoDimensionsChange() {
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

  // Antes era un <p> suelto sin salida: negar el permiso dejaba al firmante
  // sin poder reintentar, cancelar ni continuar de ningún modo.
  if (error) {
    return (
      <div className="digid-camera digid-guided-camera digid-guided-camera--error">
        <p role="alert">{cameraErrorMessage(error, s)}</p>
        <div className="digid-footer">
          {onCancel && (
            <Button variant="secondary" onClick={() => { close(); onCancel(); }}>
              {s.idCapture.back}
            </Button>
          )}
          <Button onClick={() => void open()}>{s.capture.retry}</Button>
        </div>
      </div>
    );
  }

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
  const scanChrome = chrome === 'scan';

  // El PREVIEW en vivo se espeja siempre que la cámara sea frontal, en
  // cualquier dispositivo: es la convención de toda app de selfie y lo que
  // espera quien se está viendo — sin esto, mover la cara a la derecha la
  // mueve a la izquierda en pantalla y encuadrarse se vuelve antinatural.
  //
  // Es una decisión distinta de `mirror`, que sigue controlando solo si se
  // voltea el FRAME CAPTURADO (qué imagen se guarda). Se mantienen separadas a
  // propósito: cambiar lo que se almacena afectaría a la verificación de
  // identidad en el backend, mientras que espejar la vista previa no.
  const espejarPreview = facingMode === 'user';

  // Contenido del stage (video + máscara SVG + anillo de cuenta regresiva):
  // idéntico en ambos chromes — el óvalo/marco guía no cambia (Task 24).
  const stage = (
    <div className="digid-guided-camera__stage" style={{ aspectRatio: String(videoAspect) }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        onLoadedMetadata={handleVideoDimensionsChange}
        onResize={handleVideoDimensionsChange}
        style={espejarPreview ? { transform: 'scaleX(-1)' } : undefined}
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
              vectorEffect="non-scaling-stroke"
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
            vectorEffect="non-scaling-stroke"
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
  );

  const countdownPct = auto.status === 'countdown' && (
    // aria-hidden: el porcentaje cambia ~5 veces por segundo; que formara
    // parte del texto accesible del role=status haría que el lector de
    // pantalla lo anunciara a esa frecuencia. El anillo de progreso ya lo
    // refleja visualmente y el texto "Capturando…" (sí anunciado) ya
    // comunica el estado.
    <span aria-hidden="true"> {Math.round(auto.countdownProgress * 100)}%</span>
  );

  return (
    <div
      className={`digid-camera digid-guided-camera${scanChrome ? ' digid-guided-camera--scan' : ''}`}
      data-guide={guide}
      data-chrome={chrome}
    >
      {preview === null ? (
        scanChrome ? (
          <div className="digid-scan__view">
            <div className="digid-scan__topbar">
              {onCancel && (
                <button
                  type="button"
                  className="digid-scan__action"
                  aria-label={s.capture.cancel}
                  onClick={() => {
                    close();
                    onCancel();
                  }}
                >
                  ✕
                </button>
              )}
              <span className="digid-scan__action-spacer" aria-hidden="true" />
            </div>
            <div className="digid-scan__stage">
              {stage}
              <div
                className={`digid-scan__badge${
                  auto.status === 'holding' || auto.status === 'countdown' ? ' digid-scan__badge--good' : ''
                }`}
                role="status"
                aria-live="polite"
              >
                <span className="digid-scan__badge-dot" aria-hidden="true" />
                <span>
                  {statusText}
                  {countdownPct}
                </span>
              </div>
              <div className="digid-scan__controls digid-scan__controls--center">
                <button
                  type="button"
                  className="digid-scan__shutter"
                  onClick={capture}
                  disabled={!stream}
                  aria-label={s.capture.manualButton}
                />
              </div>
            </div>
          </div>
        ) : (
          <>
            {stage}
            <p role="status" aria-live="polite" className="digid-guided-camera__status">
              {statusText}
              {countdownPct}
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
        )
      ) : scanChrome ? (
        // Mismo layout que el preview de INE (DocScanCapture): encabezado,
        // imagen enmarcada y checklist. Antes era un <img> suelto sin clase,
        // así que la selfie salía a tamaño natural y pegada arriba a la
        // izquierda, en nada parecida al preview del documento.
        <ScanPreviewLayout
          eyebrow={s.scanUi.eyebrow}
          title={s.scanUi.preview.selfieTitle}
          subtitle={s.scanUi.preview.subcopy}
          imageSrc={preview}
          imageAlt="Selfie capturada"
          checklist={[{ key: 'captured', label: s.scanUi.preview.selfieCheck }]}
          actions={
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setPreview(null);
                  void open();
                }}
              >
                {s.scanUi.preview.repeat}
              </Button>
              <Button onClick={() => onCapture(preview)}>{s.scanUi.preview.continue}</Button>
            </>
          }
        />
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
