import { useEffect, useRef, useState, type RefObject } from 'react';
import type { DetectionResult, FrameDetector } from './types';
import { isSharp } from './sharpness';

export type AutoCaptureStatus =
  | 'idle'
  | 'loading'
  | 'searching'
  | 'adjusting'
  | 'holding'
  | 'countdown'
  | 'unavailable';

export interface AutoCaptureOptions {
  videoRef: RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  createDetector: () => Promise<FrameDetector>;
  /** Valida la detección contra la zona guía (posición/tamaño). */
  accept: (r: DetectionResult) => boolean;
  onCapture: () => void; // dispara la captura real (la hace el caller)
  intervalMs?: number; // default 200
  stableMs?: number; // default 1200 — detecciones aceptadas continuas
  countdownMs?: number; // default 1000
  requireSharp?: boolean; // default true — isSharp() sobre el frame muestreado
}

export interface AutoCaptureState {
  status: AutoCaptureStatus;
  countdownProgress: number;
}

const SAMPLE_WIDTH = 320;

export function useAutoCapture(opts: AutoCaptureOptions): AutoCaptureState {
  const {
    videoRef,
    enabled,
    intervalMs = 200,
    stableMs = 1200,
    countdownMs = 1000,
    requireSharp = true,
  } = opts;

  const [status, setStatus] = useState<AutoCaptureStatus>('idle');
  const [countdownProgress, setCountdownProgress] = useState(0);

  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Refs "última versión" para callbacks que el caller puede recrear en cada
  // render sin que eso reinicie el ciclo de detección (que solo depende de
  // `enabled` y de las opciones numéricas).
  const createDetectorRef = useRef(opts.createDetector);
  createDetectorRef.current = opts.createDetector;
  const acceptRef = useRef(opts.accept);
  acceptRef.current = opts.accept;
  const onCaptureRef = useRef(opts.onCapture);
  onCaptureRef.current = opts.onCapture;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const myGeneration = ++generationRef.current;
    const isCurrent = () => mountedRef.current && generationRef.current === myGeneration;

    let intervalId: ReturnType<typeof setInterval> | undefined;
    let detector: FrameDetector | null = null;
    let stableStart: number | null = null;
    let countdownStart: number | null = null;
    let captured = false;
    let frameInFlight = false;

    function stop() {
      if (intervalId !== undefined) clearInterval(intervalId);
      intervalId = undefined;
    }

    function resetTo(next: 'searching' | 'adjusting') {
      stableStart = null;
      countdownStart = null;
      setCountdownProgress(0);
      setStatus(next);
    }

    async function runFrame() {
      if (!detector || captured || frameInFlight) return;
      frameInFlight = true;
      try {
        const video = videoRef.current;
        if (!video || video.videoWidth === 0) {
          resetTo('searching');
          return;
        }

        if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
        const canvas = canvasRef.current;
        const scale = SAMPLE_WIDTH / video.videoWidth;
        canvas.width = SAMPLE_WIDTH;
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resetTo('searching');
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);

        let result: DetectionResult | null;
        try {
          result = await detector(frame);
        } catch {
          result = null;
        }

        if (!isCurrent() || captured) return;

        if (!result) {
          resetTo('searching');
          return;
        }

        const sharpOk = !requireSharp || isSharp(frame);
        if (!acceptRef.current(result) || !sharpOk) {
          resetTo('adjusting');
          return;
        }

        const now = Date.now();
        if (stableStart === null) stableStart = now;

        if (countdownStart === null) {
          if (now - stableStart >= stableMs) {
            countdownStart = now;
            setCountdownProgress(0);
            setStatus('countdown');
          } else {
            setStatus('holding');
          }
        } else {
          const elapsed = now - countdownStart;
          const progress = Math.min(1, elapsed / countdownMs);
          setCountdownProgress(progress);
          if (elapsed >= countdownMs) {
            captured = true;
            stop();
            onCaptureRef.current();
          }
        }
      } finally {
        frameInFlight = false;
      }
    }

    if (!enabled) {
      setStatus('idle');
      setCountdownProgress(0);
      return () => stop();
    }

    setStatus('loading');
    setCountdownProgress(0);

    createDetectorRef.current().then(
      (d) => {
        if (!isCurrent()) return;
        detector = d;
        setStatus('searching');
        intervalId = setInterval(() => {
          void runFrame();
        }, intervalMs);
      },
      () => {
        if (!isCurrent()) return;
        setStatus('unavailable');
      },
    );

    return () => {
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- createDetector/accept/onCapture se leen vía refs a propósito: no deben reiniciar el ciclo de detección en cada render.
  }, [enabled, intervalMs, stableMs, countdownMs, requireSharp, videoRef]);

  return { status, countdownProgress };
}
