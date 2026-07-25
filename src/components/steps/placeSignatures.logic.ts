import type { SignatureCoordinate } from '../../types/api';
import type { PageInfo } from '../pdf/PdfViewer';

export function parseCoordinates(
  firmasJson: string | null, idFirmante: number,
): SignatureCoordinate[] {
  if (!firmasJson) return [];
  try {
    const all = JSON.parse(firmasJson) as SignatureCoordinate[];
    return all.filter((c) => Number(c.firmante) === Number(idFirmante));
  } catch {
    return [];
  }
}

export interface OverlayPosition { x: number; y: number; rotation: number }

/**
 * Reproduce el mapeo de firmar.js del flujo legacy:
 *  - x se escala del sistema del documento (AnchoPagina) al ancho renderizado,
 *    más el margen si la página es más angosta que el contenedor.
 *  - y se escala por alto de página y suma las alturas (+1px de separación)
 *    de las páginas anteriores (las páginas se apilan verticalmente).
 */
export function computeOverlayPosition(
  coord: SignatureCoordinate,
  pages: PageInfo[],
  containerWidth: number,
): OverlayPosition | null {
  const page = pages.find((p) => p.numPage === Number(coord.pagina));
  if (!page) return null;
  let offsetY = 0;
  for (const p of pages) {
    if (p.numPage === page.numPage) break;
    offsetY += p.height + 1;
  }
  const margin = (containerWidth - page.width) / 2;
  const x = (page.width * coord.xDoc) / coord.AnchoPagina + Math.max(0, margin);
  const y = (coord.ydoc * page.height) / coord.altoPagina + offsetY;
  return { x, y, rotation: coord.position ?? 0 };
}
