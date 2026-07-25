import { useEffect, useImperativeHandle, useRef, type MutableRefObject } from 'react';

export interface SignaturePadHandle {
  clear: () => void;
  toDataURL: () => string;
}

interface Props {
  strokeColor: string;
  strokeWidth: number;
  onDirtyChange?: (dirty: boolean) => void;
  padRef?: MutableRefObject<SignaturePadHandle | null>;
}

/** Canvas de firma con Pointer Events (mouse+touch+stylus unificados,
 *  sustituye hammer.js) y escala por devicePixelRatio (trazo nítido en retina). */
export function SignaturePad({ strokeColor, strokeWidth, onDirtyChange, padRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const dirty = useRef(false);

  useImperativeHandle(padRef, () => ({
    clear() {
      const c = canvasRef.current!;
      c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
      dirty.current = false;
      onDirtyChange?.(false);
    },
    toDataURL: () => canvasRef.current!.toDataURL('image/png'),
  }));

  useEffect(() => {
    const canvas = canvasRef.current!;
    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      // preserva el dibujo al redimensionar
      const prev = canvas.toDataURL();
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      canvas.getContext('2d')!.scale(dpr, dpr);
      if (dirty.current) {
        const img = new Image();
        img.onload = () =>
          canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.offsetWidth, canvas.offsetHeight);
        img.src = prev;
      }
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  function pos(e: React.PointerEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  return (
    <canvas
      ref={canvasRef}
      data-testid="digid-signature-canvas"
      className="digid-signature-canvas"
      onPointerDown={(e) => {
        canvasRef.current!.setPointerCapture(e.pointerId);
        drawing.current = true;
        last.current = pos(e);
        if (!dirty.current) {
          dirty.current = true;
          onDirtyChange?.(true);
        }
      }}
      onPointerMove={(e) => {
        if (!drawing.current) return;
        const ctx = canvasRef.current!.getContext('2d')!;
        const p = pos(e);
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(last.current.x, last.current.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        last.current = p;
      }}
      onPointerUp={() => {
        drawing.current = false;
      }}
      onPointerLeave={() => {
        drawing.current = false;
      }}
    />
  );
}
