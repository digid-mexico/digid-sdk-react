import { describe, it, expect } from 'vitest';
import { acceptBarcode, acceptFaceSelfie, acceptFaceSmall } from './acceptance';
import { rectContainsPoint } from './guideRect';
import type { NormalizedBox } from '../../detection/types';

// Guía no circular (como el óvalo real: FACE_WIDTH_FRAC=0.55, FACE_HEIGHT_FRAC=0.75)
// para que un chequeo de rect-bounding en vez de la elipse real se note.
const faceGuide: NormalizedBox = { x: 0.225, y: 0.125, width: 0.55, height: 0.75 };
const idGuide: NormalizedBox = { x: 0.1, y: 0.2, width: 0.8, height: 0.6 };

describe('acceptFaceSelfie', () => {
  it('acepta un rostro centrado con alto dentro de 30%-90% de la guía', () => {
    const box: NormalizedBox = { x: 0.4, y: 0.4, width: 0.2, height: faceGuide.height * 0.5 };
    expect(acceptFaceSelfie(box, faceGuide)).toBe(true);
  });

  it('rechaza si el alto es menor a 30% de la guía', () => {
    const box: NormalizedBox = { x: 0.45, y: 0.48, width: 0.1, height: faceGuide.height * 0.2 };
    expect(acceptFaceSelfie(box, faceGuide)).toBe(false);
  });

  it('rechaza si el alto excede 90% de la guía', () => {
    const box: NormalizedBox = { x: 0.4, y: 0.15, width: 0.2, height: faceGuide.height * 0.95 };
    expect(acceptFaceSelfie(box, faceGuide)).toBe(false);
  });

  it('usa la elipse real, no la caja delimitadora: rechaza un centro cerca de la esquina del rectángulo guía', () => {
    // Punto a un 5% de ancho/alto de la esquina superior-izquierda: cae
    // claramente DENTRO del rectángulo delimitador de la guía, pero fuera
    // del óvalo inscrito en él (las esquinas de un óvalo no circular caen
    // fuera de la elipse) — el firmante tendría el rostro visiblemente fuera
    // del óvalo dibujado en pantalla. Si acceptFaceSelfie usara
    // rectContainsPoint en vez de la elipse real, esto se aceptaría
    // incorrectamente.
    const centerPoint = {
      x: faceGuide.x + 0.05 * faceGuide.width,
      y: faceGuide.y + 0.05 * faceGuide.height,
    };
    expect(rectContainsPoint(faceGuide, centerPoint)).toBe(true); // control: sí cae en el rect
    const height = faceGuide.height * 0.5;
    const width = 0.1;
    const box: NormalizedBox = {
      x: centerPoint.x - width / 2,
      y: centerPoint.y - height / 2,
      width,
      height,
    };
    expect(acceptFaceSelfie(box, faceGuide)).toBe(false);
  });

  it('acepta un centro cercano al borde del óvalo sobre su eje mayor', () => {
    // Punto sobre el eje horizontal de la elipse, justo dentro de su borde.
    const rx = faceGuide.width / 2;
    const cx = faceGuide.x + rx;
    const cy = faceGuide.y + faceGuide.height / 2;
    const box: NormalizedBox = {
      x: cx + rx * 0.9 - 0.05,
      y: cy - faceGuide.height * 0.25,
      width: 0.1,
      height: faceGuide.height * 0.5,
    };
    expect(acceptFaceSelfie(box, faceGuide)).toBe(true);
  });
});

describe('acceptFaceSmall', () => {
  it('acepta una fotografía pequeña completamente dentro del marco, alto 15%-45%', () => {
    const box: NormalizedBox = { x: 0.3, y: 0.3, width: 0.1, height: idGuide.height * 0.3 };
    expect(acceptFaceSmall(box, idGuide)).toBe(true);
  });

  it('rechaza si la caja se sale del marco (aunque el alto sea válido)', () => {
    const box: NormalizedBox = { x: idGuide.x - 0.05, y: 0.3, width: 0.1, height: idGuide.height * 0.3 };
    expect(acceptFaceSmall(box, idGuide)).toBe(false);
  });

  it('rechaza si el alto es menor a 15% o mayor a 45% del marco', () => {
    const tooSmall: NormalizedBox = { x: 0.3, y: 0.3, width: 0.05, height: idGuide.height * 0.1 };
    const tooBig: NormalizedBox = { x: 0.3, y: 0.25, width: 0.2, height: idGuide.height * 0.5 };
    expect(acceptFaceSmall(tooSmall, idGuide)).toBe(false);
    expect(acceptFaceSmall(tooBig, idGuide)).toBe(false);
  });
});

describe('acceptBarcode', () => {
  it('acepta si el centro del código cae dentro del marco', () => {
    const box: NormalizedBox = { x: 0.4, y: 0.4, width: 0.2, height: 0.1 };
    expect(acceptBarcode(box, idGuide)).toBe(true);
  });

  it('rechaza si el centro cae fuera del marco', () => {
    const box: NormalizedBox = { x: 0, y: 0, width: 0.05, height: 0.05 };
    expect(acceptBarcode(box, idGuide)).toBe(false);
  });
});
