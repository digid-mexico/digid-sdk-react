// Captura guiada de INE con marco fijo + detección automática vía OpenCV
// (núcleo portado en Task 22, src/scan/). Port de Camera.jsx (prototipo KYC),
// recortado a lo que aplica dentro del SDK: sin grabadora de calibración
// (?record=1), sin panel de debug (?debug=1), sin video de "prueba de vida"
// en paralelo y sin el tope duro de intento/panel de reintento — esa
// infraestructura pertenece al proyecto KYC, no a este SDK. El pipeline de
// detección/recorte/calidad (marco, ROI, confirmador, freno anti-borrosidad)
// se conserva sin cambios de umbrales.
import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import { useCamera } from '../camera/useCamera';
import { Button } from '../ui/Button';
import { useStrings } from '../../i18n';
import { FlowContext } from '../../core/FlowContext';
import { isMobileDevice, shouldMirrorPreview } from '../../utils/device';
import {
  validateImageFile, isDecodedSizeAllowed, IMAGE_TOO_LARGE_MESSAGE,
} from '../../utils/image';
import {
  initDocScan,
  docScanReady,
  detectDocument,
  detectDocumentStill,
  extractDocument,
  assessDocQuality,
  extremeBlur,
  cornerMovement,
  scaleCorners,
  mapCornersToDisplay,
  orientDocumentForStep,
  createDetectionConfirmer,
} from '../../scan/docscan';
import type { DetectionConfirmer } from '../../scan/docscan';
import {
  marcoFrameRect,
  frameRectToDisplay,
  roiFromMarco,
  rectToRoiCanvas,
  roiCornersToFrame,
  scaleRect,
  validateQuadInMarco,
  marcoGuidance,
  MARCO_WIDTH_FRAC,
  MARCO_WIDTH_FRAC_DESKTOP,
} from '../../scan/marco';
import { analyzeDocumentQuality, createEnhancedDocumentImage } from '../../scan/scan';
import type { Corners, Rect, StillDetectDocumentResult } from '../../scan/types';
import { ScanOverlay, type MarcoView, type QuadView } from './ScanOverlay';
import { ScanTipsSheet } from './ScanTipsSheet';
import { ScanPreviewLayout } from './ScanPreviewLayout';
import { IconGallery, IconId } from './icons';

export interface DocScanCaptureProps {
  side: 'front' | 'back';
  /** dataURL JPEG del recorte final, ya confirmado por el firmante en el preview. */
  onCapture: (dataUrl: string) => void;
  onCancel: () => void;
}

// Ancho fijo del canvas de detección del ROI del marco (igual que Camera.jsx:
// con el usuario alineando la credencial al marco, la tarjeta siempre ocupa
// una proporción conocida del ROI).
const ROI_DETECT_WIDTH = 720;
// Ancho máximo del frame COMPLETO para recorte (la detección nunca corre a
// esta resolución; solo el warp final).
const FULL_FRAME_WIDTH = 4096;
// Ticks estables seguidos antes de auto-capturar (calibración reverso
// 2026-07-24, ver docscan.ts/marco.ts).
const STABLE_NEEDED = 2;
// Umbral de movimiento (cornerMovement) bajo el cual se considera "estable"
// para efectos de la cuenta de auto-captura (distinto del umbral del
// confirmador de overlay, más laxo: confirmar rápido, capturar exigente).
// Calibrado en Camera.jsx a una cadencia de 200ms (TICK_MS_LIVE) — no
// cambiar uno sin el otro.
const MOVEMENT_STABLE_THRESHOLD = 0.045;
// Cadencia del bucle de escaneo cuando el worker está listo y detectando en
// vivo (fastLoop en Camera.jsx): los umbrales de movimiento (0.045 aquí,
// 0.05 en createDetectionConfirmer) son desplazamientos POR TICK calibrados
// a este intervalo — no se pueden subir/bajar de forma independiente.
const TICK_MS_LIVE = 200;
// Cadencia mientras el worker no está listo (loading/manual): no hay
// detección que mantener fluida, así que se afloja el muestreo.
const TICK_MS_IDLE = 360;
// Reintento cuando el tick encuentra el video aún no listo o el anterior
// sigue en curso (busyRef): igual que Camera.jsx (scheduleScan(500)).
const TICK_MS_RETRY = 500;
// Tope de espera a que el worker de escaneo quede listo antes de degradar a
// captura manual (marco visible, sin detección automática).
const READY_TIMEOUT_MS = 8000;
// Resolución ideal solicitada a getUserMedia (igual que Camera.jsx: el
// escáner necesita más detalle que una llamada de video genérica para que
// el recorte final sea legible). Constante de módulo (no un literal dentro
// del componente) para que la referencia sea estable entre renders: si
// cambiara en cada render, el `open` de useCamera cambiaría de identidad y
// el efecto que lo invoca reabriría la cámara en bucle.
const SCAN_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: 'environment',
  width: { ideal: 1920 },
  height: { ideal: 1080 },
};

type Phase = 'loading' | 'live' | 'manual' | 'preview';

interface PreviewState {
  dataUrl: string;
  score: number;
  hint: string;
  ok: boolean;
  source: string;
}

// Retención mínima de cada mensaje de estado (anti-parpadeo) y prioridad (un
// mensaje solo se reemplaza antes de expirar por otro de prioridad mayor).
const STATUS_TIERS = {
  guidance: { hold: 1600, priority: 1 },
  detected: { hold: 900, priority: 2 },
  capturing: { hold: 600, priority: 3 },
  qualityHint: { hold: 2400, priority: 4 },
} as const;
type TierKey = keyof typeof STATUS_TIERS;

function grabFrame(
  video: HTMLVideoElement,
  maxWidth: number,
  canvasRef: MutableRefObject<HTMLCanvasElement | null>,
): HTMLCanvasElement {
  if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
  const canvas = canvasRef.current;
  const videoWidth = video.videoWidth || 1280;
  const videoHeight = video.videoHeight || 720;
  const scale = Math.min(1, maxWidth / videoWidth);
  const width = Math.round(videoWidth * scale);
  const height = Math.round(videoHeight * scale);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  canvas.getContext('2d', { willReadFrequently: true })!.drawImage(video, 0, 0, width, height);
  return canvas;
}

function grabRoi(
  video: HTMLVideoElement,
  roi: Rect,
  targetW: number,
  canvasRef: MutableRefObject<HTMLCanvasElement | null>,
): HTMLCanvasElement {
  if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
  const canvas = canvasRef.current;
  const width = Math.min(targetW, Math.max(1, Math.round(roi.width)));
  const height = Math.max(1, Math.round((width * roi.height) / roi.width));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  canvas
    .getContext('2d', { willReadFrequently: true })!
    .drawImage(video, roi.x, roi.y, roi.width, roi.height, 0, 0, width, height);
  return canvas;
}

function cropRect(sourceCanvas: HTMLCanvasElement, rect: Rect): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(rect.width));
  out.height = Math.max(1, Math.round(rect.height));
  out
    .getContext('2d', { willReadFrequently: true })!
    .drawImage(sourceCanvas, rect.x, rect.y, rect.width, rect.height, 0, 0, out.width, out.height);
  return out;
}

export function DocScanCapture({ side, onCapture, onCancel }: DocScanCaptureProps) {
  const s = useStrings();
  const cam = s.scanUi.camera;
  // Lectura defensiva: scanAssets puede no venir del FlowContext (integrador
  // sin configurar, o uso fuera de <FirmaAutografa>).
  const flow = useContext(FlowContext);
  const scanAssets = flow?.scanAssets;

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { stream, error, open, close } = useCamera('environment', SCAN_VIDEO_CONSTRAINTS);

  const [phase, setPhase] = useState<Phase>('loading');
  const phaseRef = useRef<Phase>('loading');
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const [statusMessage, setStatusMessage] = useState<string>(cam.preparing);
  const [statusGood, setStatusGood] = useState(false);
  const [marcoView, setMarcoView] = useState<MarcoView | null>(null);
  const [quad, setQuad] = useState<QuadView | null>(null);
  const [showTips, setShowTips] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  // Arranque por dispositivo (sin track todavía): escritorio espejado, móvil
  // no (igual que Camera.jsx) — evita el flash de un frame sin espejar en
  // desktop antes de que el track resuelva sus settings reales.
  const [mirrored, setMirrored] = useState(() => shouldMirrorPreview());

  const busyRef = useRef(false);
  const stableFramesRef = useRef(0);
  const previousCornersRef = useRef<Corners | null>(null);
  const missRef = useRef(0);
  const noQuadStreakRef = useRef(0);
  const confirmerRef = useRef<DetectionConfirmer | null>(null);
  if (confirmerRef.current === null) confirmerRef.current = createDetectionConfirmer();
  const detectCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fullCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stickyRef = useRef({ message: '', until: 0, priority: 0 });
  const marcoWidthFracRef = useRef(isMobileDevice() ? MARCO_WIDTH_FRAC : MARCO_WIDTH_FRAC_DESKTOP);
  const startTimeRef = useRef(0);
  const tickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<() => void>(() => {});
  // Se pone en true SOLO al desmontar (cleanup de efecto con deps []): un
  // tick en curso al momento del desmontaje puede resolver sus promesas
  // DESPUÉS (videoRef.current ya es null), y sin esta bandera reprogramaría
  // el siguiente tick para siempre (scheduleTick se sigue llamando desde la
  // rama "video no listo" cuando !video, entrando en un bucle infinito que
  // nunca se limpia). scheduleTick la consulta como barrera única.
  const unmountedRef = useRef(false);
  useEffect(() => () => {
    unmountedRef.current = true;
  }, []);
  // Evita que un doble click/tap en el obturador dispare captureManual() dos
  // veces en paralelo mientras la primera sigue en curso (assessDocQuality,
  // etc. son async).
  const manualCaptureInFlightRef = useRef(false);

  useEffect(() => {
    void open();
  }, [open]);

  useEffect(() => {
    if (!videoRef.current) return;
    if (stream) {
      videoRef.current.srcObject = stream;
      void videoRef.current.play().catch(() => {});
      const track = stream.getVideoTracks()[0];
      setMirrored(shouldMirrorPreview(track && track.getSettings ? track.getSettings() : {}));
    } else {
      videoRef.current.srcObject = null;
    }
  }, [stream]);

  useEffect(() => {
    startTimeRef.current = Date.now();
    initDocScan(scanAssets);
    // Solo al montar: el worker se inicializa una única vez por captura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showStatus = useCallback((message: string, good: boolean, tier: TierKey) => {
    const now = Date.now();
    const current = stickyRef.current;
    const info = STATUS_TIERS[tier];
    if (message !== current.message && now < current.until && info.priority <= current.priority) {
      return;
    }
    stickyRef.current = { message, until: now + info.hold, priority: info.priority };
    setStatusMessage(message);
    setStatusGood(good);
  }, []);

  const computeMarco = useCallback((srcW: number, srcH: number, dispW: number, dispH: number) => {
    const coverScale = Math.max(dispW / srcW, dispH / srcH);
    const marcoFrame = marcoFrameRect(srcW, srcH, {
      widthFrac: marcoWidthFracRef.current,
      maxW: (dispW / coverScale) * 0.92,
      maxH: (dispH / coverScale) * 0.56,
    });
    return { marcoFrame, marcoDisp: frameRectToDisplay(marcoFrame, srcW, srcH, dispW, dispH) };
  }, []);

  const extractFromFullFrame = useCallback(async (video: HTMLVideoElement, frameCorners: Corners, aspect?: number) => {
    const fullCanvas = grabFrame(video, FULL_FRAME_WIDTH, fullCanvasRef);
    const factor = fullCanvas.width / (video.videoWidth || fullCanvas.width);
    return extractDocument(fullCanvas, { corners: scaleCorners(frameCorners, factor), aspect });
  }, []);

  const extractStillOriented = useCallback(
    async (canvas: HTMLCanvasElement, detection: StillDetectDocumentResult) => {
      let docCanvas = await extractDocument(canvas, detection);
      if (docCanvas && detection.rotated) docCanvas = orientDocumentForStep(docCanvas, side);
      return docCanvas;
    },
    [side],
  );

  const scheduleTick = useCallback((delay: number) => {
    // Barrera única: ningún llamador (tick() en cualquiera de sus ramas, o
    // el efecto que arranca el bucle) vuelve a armar un timeout una vez
    // desmontado el componente.
    if (unmountedRef.current) return;
    if (tickTimerRef.current) clearTimeout(tickTimerRef.current);
    tickTimerRef.current = setTimeout(() => tickRef.current(), delay);
  }, []);

  // Cancela cualquier tick programado: se llama al confirmarse una captura
  // (auto, manual o de galería) para que el bucle en vivo no siga
  // ejecutando un tick de más mientras se muestra el preview.
  const stopTickLoop = useCallback(() => {
    if (tickTimerRef.current) {
      clearTimeout(tickTimerRef.current);
      tickTimerRef.current = null;
    }
  }, []);

  const tick = useCallback(async () => {
    if (unmountedRef.current || phaseRef.current === 'preview') return; // desmontado o pausado durante el preview
    const video = videoRef.current;
    // Salida garantizada del estado 'loading'. Va ANTES de la guarda de
    // readyState a propósito: antes vivía después, así que solo cubría el caso
    // "el worker no carga". Si la cámara no entregaba frames —permiso a medias,
    // dispositivo tomado por otra app— el bucle se reprogramaba para siempre y
    // el firmante se quedaba en "Preparando el escáner…" sin mensaje ni salida.
    if (phaseRef.current === 'loading' && Date.now() - startTimeRef.current > READY_TIMEOUT_MS) {
      setPhase('manual');
      showStatus(cam.manualNotice, false, 'guidance');
    }
    if (busyRef.current || !video || video.readyState < 2) {
      scheduleTick(TICK_MS_RETRY);
      return;
    }
    busyRef.current = true;
    // fastLoop (igual que Camera.jsx): true solo mientras el worker detecta
    // en vivo — decide la cadencia del PRÓXIMO tick al final de esta pasada.
    let fastLoop = false;
    try {
      if (docScanReady()) {
        fastLoop = true;
        if (phaseRef.current !== 'live') setPhase('live');
        const dispW = video.clientWidth || 1;
        const dispH = video.clientHeight || 1;
        const srcW = video.videoWidth || 1280;
        const srcH = video.videoHeight || 720;
        const { marcoFrame, marcoDisp } = computeMarco(srcW, srcH, dispW, dispH);
        setMarcoView((previous) => {
          const next: MarcoView = { w: dispW, h: dispH, rect: marcoDisp };
          return previous
            && previous.w === next.w && previous.h === next.h
            && previous.rect.x === next.rect.x && previous.rect.width === next.rect.width
            ? previous
            : next;
        });
        const roi = roiFromMarco(marcoFrame, srcW, srcH);
        const detectCanvas = grabRoi(video, roi, ROI_DETECT_WIDTH, detectCanvasRef);
        const marcoInCanvas = rectToRoiCanvas(marcoFrame, roi, detectCanvas.width);
        const detection = await detectDocument(detectCanvas, { minAreaRatio: 0.15, maxAreaRatio: 0.98 });
        const validation = detection && detection.corners
          ? validateQuadInMarco(detection.corners, marcoInCanvas)
          : undefined;

        if (detection && detection.corners && validation && validation.ok) {
          missRef.current = 0;
          noQuadStreakRef.current = 0;
          const movement = cornerMovement(previousCornersRef.current, detection.corners, detectCanvas.width, detectCanvas.height);
          previousCornersRef.current = detection.corners;
          const confirmed = confirmerRef.current!.push(detection.corners, detectCanvas.width, detectCanvas.height);

          if (!confirmed) {
            stableFramesRef.current = 0;
            setQuad(null);
          } else {
            const frameCorners = roiCornersToFrame(detection.corners, roi, detectCanvas.width);
            setQuad({ points: mapCornersToDisplay(frameCorners, srcW, srcH, dispW, dispH), w: dispW, h: dispH });

            const guidance = marcoGuidance({ corners: detection.corners, frame: detection.frame, validation });
            if (guidance) {
              stableFramesRef.current = 0;
              showStatus(guidance.message, false, 'guidance');
            } else if (movement < MOVEMENT_STABLE_THRESHOLD) {
              stableFramesRef.current += 1;
              const capturing = stableFramesRef.current >= STABLE_NEEDED;
              showStatus(
                capturing ? cam.detectedCapturing : cam.detectedHolding,
                true,
                capturing ? 'capturing' : 'detected',
              );
            } else {
              stableFramesRef.current = 0;
              showStatus(cam.detectedNoMove, true, 'detected');
            }

            if (!guidance && stableFramesRef.current >= STABLE_NEEDED) {
              const docCanvas = await extractFromFullFrame(video, frameCorners, detection.aspect);
              if (docCanvas) {
                const quality = await assessDocQuality(docCanvas);
                if (quality && extremeBlur(quality.metrics)) {
                  stableFramesRef.current = 0;
                  showStatus(cam.blurryRetry, false, 'qualityHint');
                } else {
                  const enhanced = createEnhancedDocumentImage(docCanvas);
                  close();
                  stopTickLoop();
                  setPreview({
                    dataUrl: enhanced.dataUrl,
                    score: quality ? quality.score : 0,
                    hint: quality ? quality.hint : '',
                    ok: quality ? quality.ok : true,
                    source: cam.sourceAuto,
                  });
                  setPhase('preview');
                  return; // sin reschedule: se retoma al "Repetir"
                }
              } else {
                stableFramesRef.current = 0;
              }
            }
          }
        } else {
          missRef.current += 1;
          noQuadStreakRef.current += 1;
          const guidance = marcoGuidance({
            corners: detection && detection.corners ? detection.corners : null,
            frame: detection ? detection.frame : null,
            validation,
            noQuadStreak: noQuadStreakRef.current,
          });
          if (missRef.current >= 2) {
            setQuad(null);
            previousCornersRef.current = null;
            confirmerRef.current!.reset();
            stableFramesRef.current = 0;
          }
          showStatus(guidance ? guidance.message : '', false, 'guidance');
        }
      } else {
        // El worker aún no está listo (o falló): marco visible, sin
        // detección en vivo. Tras READY_TIMEOUT_MS se degrada a manual.
        setQuad(null);
        const dispW = video.clientWidth || 1;
        const dispH = video.clientHeight || 1;
        const srcW = video.videoWidth || 1280;
        const srcH = video.videoHeight || 720;
        const { marcoDisp } = computeMarco(srcW, srcH, dispW, dispH);
        setMarcoView((previous) => {
          const next: MarcoView = { w: dispW, h: dispH, rect: marcoDisp };
          return previous
            && previous.w === next.w && previous.h === next.h
            && previous.rect.x === next.rect.x && previous.rect.width === next.rect.width
            ? previous
            : next;
        });
        // (el degradado por timeout se evalúa al inicio del tick)
      }
    } catch {
      stableFramesRef.current = 0;
      showStatus(cam.evalError, false, 'guidance');
    } finally {
      busyRef.current = false;
    }
    scheduleTick(fastLoop ? TICK_MS_LIVE : TICK_MS_IDLE);
  }, [
    computeMarco, showStatus, close, extractFromFullFrame, scheduleTick, stopTickLoop,
    cam.manualNotice, cam.sourceAuto, cam.detectedCapturing, cam.detectedHolding, cam.detectedNoMove,
    cam.blurryRetry, cam.evalError,
  ]);

  useEffect(() => {
    tickRef.current = () => {
      void tick();
    };
  }, [tick]);

  useEffect(() => {
    if (!stream) return;
    scheduleTick(450);
    return () => {
      if (tickTimerRef.current) clearTimeout(tickTimerRef.current);
    };
  }, [stream, scheduleTick]);

  const captureManual = useCallback(async () => {
    // Guarda contra doble click/tap: sin esto, dos taps rápidos sobre el
    // obturador disparan dos capturas en paralelo (detectDocumentStill,
    // assessDocQuality, etc. son async) que pisan el preview entre sí.
    if (manualCaptureInFlightRef.current) return;
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    manualCaptureInFlightRef.current = true;
    try {
      const dispW = video.clientWidth || 1;
      const dispH = video.clientHeight || 1;
      const srcW = video.videoWidth || 1280;
      const srcH = video.videoHeight || 720;
      const fullCanvas = grabFrame(video, FULL_FRAME_WIDTH, fullCanvasRef);
      const factor = fullCanvas.width / srcW;
      const { marcoFrame } = computeMarco(srcW, srcH, dispW, dispH);
      let docCanvas: HTMLCanvasElement | null = null;
      if (docScanReady()) {
        const roi = roiFromMarco(marcoFrame, srcW, srcH);
        const roiFull = scaleRect(roi, factor);
        const roiCanvas = cropRect(fullCanvas, roiFull);
        const detection = await detectDocumentStill(roiCanvas);
        docCanvas = detection ? await extractStillOriented(roiCanvas, detection) : null;
      }
      // Sin quad (o worker no disponible): captura el rectángulo del marco
      // tal cual — el usuario alineó la credencial al marco y presionó el
      // obturador; esto NUNCA se bloquea por calidad.
      const sourceCanvas = docCanvas || cropRect(fullCanvas, scaleRect(marcoFrame, factor));
      const enhanced = createEnhancedDocumentImage(sourceCanvas);
      const assessed = docScanReady() ? await assessDocQuality(sourceCanvas) : null;
      const heuristic = assessed ? null : analyzeDocumentQuality(sourceCanvas, side);
      close();
      stopTickLoop();
      setPreview({
        dataUrl: enhanced.dataUrl,
        score: assessed ? assessed.score : heuristic!.score,
        hint: assessed ? assessed.hint : heuristic!.hint,
        ok: assessed ? assessed.ok : true,
        source: cam.sourceManual,
      });
      setPhase('preview');
    } finally {
      manualCaptureInFlightRef.current = false;
    }
  }, [computeMarco, extractStillOriented, close, stopTickLoop, side, cam.sourceManual]);

  const processFile = useCallback(
    (file: File) => {
      void (async () => {
        // Mismas garantías que la subida desde IdCaptureStep/SelfieStep
        // (magic bytes + tope de 10 MB): esta ruta también acepta un archivo
        // elegido por el usuario, así que no puede confiar en la extensión ni
        // en el `accept` del input, que el navegador no obliga.
        try {
          await validateImageFile(file);
        } catch (e) {
          flow?.notify('error', e instanceof Error ? e.message : s.errors.generic);
          return;
        }
        const img = new Image();
        img.onload = () => {
          // El tope de bytes no acota la memoria del canvas: se rechaza aquí,
          // ya conocidas las dimensiones reales, antes del primer drawImage.
          if (!isDecodedSizeAllowed(img.naturalWidth, img.naturalHeight)) {
            URL.revokeObjectURL(img.src);
            flow?.notify('error', IMAGE_TOO_LARGE_MESSAGE);
            return;
          }
          void (async () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            canvas.getContext('2d', { willReadFrequently: true })!.drawImage(img, 0, 0);
            // La detección nunca corre a resolución nativa de la foto: la
            // escalera de detectDocumentStill baja a escalas calibradas.
            const detection = docScanReady() ? await detectDocumentStill(canvas) : null;
            const docCanvas = detection ? await extractStillOriented(canvas, detection) : null;
            const sourceCanvas = docCanvas || canvas;
            const assessed = docScanReady() ? await assessDocQuality(sourceCanvas) : null;
            const heuristic = assessed ? null : analyzeDocumentQuality(sourceCanvas, side);
            const enhanced = createEnhancedDocumentImage(sourceCanvas);
            close();
            stopTickLoop();
            setPreview({
              dataUrl: enhanced.dataUrl,
              score: assessed ? assessed.score : heuristic!.score,
              hint: assessed ? assessed.hint : heuristic!.hint,
              ok: assessed ? assessed.ok : true,
              source: cam.sourceFile,
            });
            setPhase('preview');
            URL.revokeObjectURL(img.src);
          })();
        };
        // Archivo corrupto/formato no decodificable: sin este handler, el
        // object URL nunca se revoca (fuga) y la UI se queda pegada sin
        // preview ni aviso alguno. Se notifica si hay FlowContext disponible
        // (uso normal dentro de <FirmaAutografa>); fuera de él, al menos no
        // hay fuga y el firmante puede reintentar con el botón u otro archivo.
        img.onerror = () => {
          URL.revokeObjectURL(img.src);
          flow?.notify('error', s.errors.generic);
        };
        img.src = URL.createObjectURL(file);
      })();
    },
    [extractStillOriented, close, stopTickLoop, side, cam.sourceFile, flow, s.errors.generic],
  );

  const retake = useCallback(() => {
    setPreview(null);
    stableFramesRef.current = 0;
    previousCornersRef.current = null;
    missRef.current = 0;
    noQuadStreakRef.current = 0;
    confirmerRef.current!.reset();
    setQuad(null);
    setPhase(docScanReady() ? 'live' : 'manual');
    void open();
  }, [open]);

  if (error) return <p role="alert">{s.errors.camera}</p>;

  if (preview) {
    return (
      <ScanPreviewLayout
        eyebrow={preview.source}
        title={side === 'back' ? s.scanUi.preview.backTitle : s.scanUi.preview.frontTitle}
        subtitle={s.scanUi.preview.subcopy}
        imageSrc={preview.dataUrl}
        imageAlt="Documento capturado"
        checklist={[
          {
            key: 'legible',
            label: side === 'back' ? s.scanUi.preview.legibleBack : s.scanUi.preview.legibleFront,
          },
          { key: 'complete', label: s.scanUi.preview.complete },
          { key: 'quality', label: s.scanUi.preview.quality(Math.round(preview.score)) },
        ]}
        hint={!preview.ok && preview.hint ? preview.hint : undefined}
        actions={
          <>
            <Button variant="secondary" onClick={retake}>
              {s.scanUi.preview.repeat}
            </Button>
            <Button onClick={() => onCapture(preview.dataUrl)}>{s.scanUi.preview.continue}</Button>
          </>
        }
      />
    );
  }

  return (
    <div className="digid-scan" data-phase={phase}>
      <div className="digid-scan__view">
        <div className="digid-scan__topbar">
          <button
            type="button"
            className="digid-scan__action"
            onClick={() => {
              close();
              onCancel();
            }}
            aria-label={cam.close}
          >
            ✕
          </button>
          <span className="digid-scan__action-spacer" aria-hidden="true" />
        </div>
        <div className="digid-scan__copy">
          <p className="digid-scan__cam-eyebrow">{side === 'back' ? cam.backEyebrow : cam.frontEyebrow}</p>
          <p className="digid-scan__cam-title">{side === 'back' ? cam.backTitle : cam.frontTitle}</p>
          <span className="digid-scan__doc-chip">
            <IconId />
            {s.scanUi.docChip}
          </span>
        </div>
        <div className="digid-scan__stage">
          <video
            ref={videoRef}
            className={mirrored ? 'digid-scan__video--mirrored' : undefined}
            autoPlay
            muted
            playsInline
          />
          <ScanOverlay marcoView={marcoView} quad={quad} good={statusGood} mirrored={mirrored} />
          <div
            className={`digid-scan__badge${statusGood ? ' digid-scan__badge--good' : ''}`}
            role="status"
            aria-live="polite"
          >
            <span className="digid-scan__badge-dot" aria-hidden="true" />
            <span>{statusMessage}</span>
          </div>
          <div className="digid-scan__controls">
            <button
              type="button"
              className="digid-scan__round-control"
              onClick={() => fileRef.current?.click()}
              aria-label={cam.gallery}
            >
              <IconGallery />
            </button>
            <button
              type="button"
              className="digid-scan__shutter"
              onClick={() => void captureManual()}
              aria-label={cam.shutter}
            />
            <button
              type="button"
              className={`digid-scan__round-control${showTips ? ' digid-scan__round-control--active' : ''}`}
              onClick={() => setShowTips((v) => !v)}
              aria-label={cam.tipsButton}
              aria-expanded={showTips}
            >
              ?
            </button>
          </div>
          <ScanTipsSheet open={showTips} onClose={() => setShowTips(false)} />
        </div>
        <input
          ref={fileRef}
          type="file"
          // Igual que los inputs de IdCaptureStep/SelfieStep: solo los dos
          // formatos que validateImageFile acepta por magic bytes.
          accept="image/png,image/jpeg"
          hidden
          data-testid="digid-scan-file-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) processFile(f);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
