// Overlay del escaneo guiado: marco fijo ID-1 (scrim + borde) y, cuando la
// detección se confirma, el cuadrilátero detectado sobre el documento. Port
// de los SVG .marco-overlay/.detect-overlay de Camera.jsx (prototipo KYC),
// renombrados digid-scan__* y sin cambios de geometría (las coordenadas ya
// vienen calculadas por src/scan/marco.ts y src/scan/docscan.ts).
import type { Point } from '../../scan/types';

export interface MarcoView {
  w: number;
  h: number;
  rect: { x: number; y: number; width: number; height: number };
}

export interface QuadView {
  points: Point[];
  w: number;
  h: number;
}

interface Props {
  marcoView: MarcoView | null;
  quad: QuadView | null;
  good: boolean;
  mirrored?: boolean;
}

export function ScanOverlay({ marcoView, quad, good, mirrored = false }: Props) {
  return (
    <>
      {marcoView && (
        <svg
          className={`digid-scan__marco${good ? ' digid-scan__marco--good' : ''}`}
          viewBox={`0 0 ${marcoView.w} ${marcoView.h}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            className="digid-scan__marco-scrim"
            fillRule="evenodd"
            d={
              `M0 0H${marcoView.w}V${marcoView.h}H0Z ` +
              `M${marcoView.rect.x} ${marcoView.rect.y}` +
              `h${marcoView.rect.width}v${marcoView.rect.height}h${-marcoView.rect.width}Z`
            }
          />
          <rect
            className="digid-scan__marco-frame"
            x={marcoView.rect.x}
            y={marcoView.rect.y}
            width={marcoView.rect.width}
            height={marcoView.rect.height}
            rx="14"
          />
        </svg>
      )}
      {quad && (
        <svg
          className={`digid-scan__detect${good ? ' digid-scan__detect--good' : ''}${mirrored ? ' digid-scan__detect--mirrored' : ''}`}
          viewBox={`0 0 ${quad.w} ${quad.h}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <polygon points={quad.points.map((p) => `${p.x},${p.y}`).join(' ')} />
          {quad.points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="6" />
          ))}
        </svg>
      )}
    </>
  );
}
