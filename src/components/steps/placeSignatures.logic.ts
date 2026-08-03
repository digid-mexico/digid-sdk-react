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
export interface OverlaySize { width: number; height: number }

/**
 * Tamaño FIJO (en milímetros) con el que el backend estampa la imagen de la
 * firma sobre el PDF final (ver `SignatureNotificationService::stampSignatures`,
 * `$pdf->Image($pathImg, $x, $y, 37, 24)` vía FPDI/FPDF). No depende del
 * tamaño de página ni del zoom: el documento final siempre lleva un rectángulo
 * de 35×22mm físicos (calibrado visualmente contra el portal), sin importar carta, A4 u otro tamaño.
 */
export const SIGN_STAMP_MM = { width: 35, height: 22 };

/** 1 punto PDF = 25.4/72 mm (72pt = 1 pulgada = 25.4mm). */
export const MM_PER_PT = 25.4 / 72;

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

/**
 * Tamaño en css px del overlay de previsualización de firma, calculado para
 * que coincida con el rectángulo que el backend
 * estampa en el PDF final (ver `SIGN_STAMP_MM`).
 *
 * `page.widthPt`/`page.heightPt` son las dimensiones físicas de la página
 * (viewport de pdf.js a scale 1, en puntos PDF), independientes del zoom.
 * `page.width` es el ancho ya renderizado en css px (a la escala actual).
 * Convertimos 37mm a una fracción del ancho físico de la página y aplicamos
 * esa fracción al ancho renderizado, de forma que el overlay escala junto
 * con el PDF a cualquier zoom o tamaño de contenedor.
 */
export function computeOverlaySize(page: PageInfo): OverlaySize {
  if (!page.widthPt) {
    // Fallback legacy: si no tenemos las dimensiones físicas de la página
    // (p.ej. un mock de PdfViewer desactualizado), usamos el tamaño fijo
    // anterior en vez de dividir por cero.
    return { width: 100, height: 50 };
  }
  const pageWidthMm = page.widthPt * MM_PER_PT;
  const cssPerMm = page.width / pageWidthMm;
  return {
    width: SIGN_STAMP_MM.width * cssPerMm,
    height: SIGN_STAMP_MM.height * cssPerMm,
  };
}

export interface OverlayRect extends OverlayPosition, OverlaySize {}

/**
 * Combina `computeOverlayPosition` + `computeOverlaySize`: posición y tamaño
 * del overlay para una coordenada de firma dada, ya resueltos contra la
 * página que le corresponde. Devuelve null si la página no existe (mismo
 * criterio que `computeOverlayPosition`).
 */
export function computeOverlayRect(
  coord: SignatureCoordinate,
  pages: PageInfo[],
  containerWidth: number,
): OverlayRect | null {
  const position = computeOverlayPosition(coord, pages, containerWidth);
  if (!position) return null;
  const page = pages.find((p) => p.numPage === Number(coord.pagina))!;
  const size = computeOverlaySize(page);
  return { ...position, ...size };
}
