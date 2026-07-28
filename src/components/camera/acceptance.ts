import type { NormalizedBox } from '../../detection/types';
import { boxCenter, rectContainsPoint, rectFullyContains } from './guideRect';

/**
 * Predicados puros de aceptación de una detección contra la ventana guía.
 * Separados de GuidedCameraCapture para poder probarlos sin montar el
 * componente ni simular una cámara.
 */

/** Selfie: el centro del rostro cae dentro del óvalo y su alto ocupa entre ~30% y ~90% del alto de la guía. */
export function acceptFaceSelfie(box: NormalizedBox, guide: NormalizedBox): boolean {
  if (!rectContainsPoint(guide, boxCenter(box))) return false;
  const heightFrac = box.height / guide.height;
  return heightFrac >= 0.3 && heightFrac <= 0.9;
}

/** INE frontal: la fotografía (rostro pequeño) cae completamente dentro del marco y mide entre ~15% y ~45% de su alto. */
export function acceptFaceSmall(box: NormalizedBox, guide: NormalizedBox): boolean {
  if (!rectFullyContains(guide, box)) return false;
  const heightFrac = box.height / guide.height;
  return heightFrac >= 0.15 && heightFrac <= 0.45;
}

/** INE reverso: el centro del código de barras/QR cae dentro del marco. */
export function acceptBarcode(box: NormalizedBox, guide: NormalizedBox): boolean {
  return rectContainsPoint(guide, boxCenter(box));
}
