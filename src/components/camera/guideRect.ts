import type { NormalizedBox } from '../../detection/types';

export type GuideKind = 'id' | 'face';

/** Aspecto (ancho/alto) de una credencial ID-1 (85.6 x 54mm), p.ej. la INE. */
export const ID_ASPECT = 1.586;
/** Fracción del ancho del video que ocupa el marco de identificación. */
export const ID_WIDTH_FRAC = 0.8;
/** Tope de altura (fracción del video) para no desbordar en videos panorámicos. */
export const ID_MAX_HEIGHT_FRAC = 0.9;

const FACE_WIDTH_FRAC = 0.55;
const FACE_HEIGHT_FRAC = 0.75;

/**
 * Rectángulo normalizado (0..1, relativo al frame completo del video) de la
 * ventana guía para el tipo de captura indicado. Es una función pura — no
 * depende del DOM ni de refs — así las pruebas de geometría y de aceptación
 * de detecciones pueden ejercitarla directamente sin montar el componente.
 */
export function guideRect(guide: GuideKind, videoAspect: number): NormalizedBox {
  if (guide === 'face') {
    return {
      x: (1 - FACE_WIDTH_FRAC) / 2,
      y: (1 - FACE_HEIGHT_FRAC) / 2,
      width: FACE_WIDTH_FRAC,
      height: FACE_HEIGHT_FRAC,
    };
  }

  // guide === 'id': mantiene el aspecto ID-1 (1.586:1). Al 80% del ancho del
  // video, si el resultado se desbordara verticalmente (video muy
  // panorámico) se reduce el tamaño manteniendo el aspecto para no exceder
  // ID_MAX_HEIGHT_FRAC.
  let widthFrac = ID_WIDTH_FRAC;
  let heightFrac = (widthFrac * videoAspect) / ID_ASPECT;
  if (heightFrac > ID_MAX_HEIGHT_FRAC) {
    heightFrac = ID_MAX_HEIGHT_FRAC;
    widthFrac = (heightFrac * ID_ASPECT) / videoAspect;
  }
  return {
    x: (1 - widthFrac) / 2,
    y: (1 - heightFrac) / 2,
    width: widthFrac,
    height: heightFrac,
  };
}

export function boxCenter(box: NormalizedBox): { x: number; y: number } {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export function rectContainsPoint(rect: NormalizedBox, point: { x: number; y: number }): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

/**
 * True si `point` cae dentro de la elipse inscrita en `guide` (centrada en
 * su caja, radios = mitad de ancho/alto). A diferencia de rectContainsPoint,
 * evalúa la elipse real: relevante para la guía "face", que se dibuja y
 * acepta como óvalo, no como rectángulo.
 */
export function isInsideEllipse(point: { x: number; y: number }, guide: NormalizedBox): boolean {
  const rx = guide.width / 2;
  const ry = guide.height / 2;
  if (rx <= 0 || ry <= 0) return false;
  const cx = guide.x + rx;
  const cy = guide.y + ry;
  const nx = (point.x - cx) / rx;
  const ny = (point.y - cy) / ry;
  return nx * nx + ny * ny <= 1;
}

/** True si `box` cae completamente dentro de `container`. */
export function rectFullyContains(container: NormalizedBox, box: NormalizedBox): boolean {
  return (
    box.x >= container.x &&
    box.y >= container.y &&
    box.x + box.width <= container.x + container.width &&
    box.y + box.height <= container.y + container.height
  );
}
