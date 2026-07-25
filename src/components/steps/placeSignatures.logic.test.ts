import { describe, it, expect } from 'vitest';
import { parseCoordinates, computeOverlayPosition } from './placeSignatures.logic';
import type { PageInfo } from '../pdf/PdfViewer';

const pages: PageInfo[] = [
  { numPage: 1, width: 612, height: 792 },
  { numPage: 2, width: 612, height: 792 },
];

describe('parseCoordinates', () => {
  it('filtra solo las firmas del firmante actual', () => {
    const json = JSON.stringify([
      { id: 'a', firmante: 7, pagina: 1, xDoc: 100, ydoc: 200, AnchoPagina: 612, altoPagina: 792, position: 0, nombre: 'Ana' },
      { id: 'b', firmante: 8, pagina: 1, xDoc: 10, ydoc: 20, AnchoPagina: 612, altoPagina: 792, position: 0, nombre: 'Otro' },
    ]);
    expect(parseCoordinates(json, 7)).toHaveLength(1);
    expect(parseCoordinates(null, 7)).toHaveLength(0);
    expect(parseCoordinates('no-json', 7)).toHaveLength(0);
  });
});

describe('computeOverlayPosition', () => {
  it('escala x por ancho de página e y acumula alturas de páginas previas', () => {
    const coord = { id: 'a', firmante: 7, pagina: 2, xDoc: 306, ydoc: 396,
      AnchoPagina: 612, altoPagina: 792, position: 0, nombre: 'Ana' };
    const pos = computeOverlayPosition(coord, pages, 612)!;
    // x: 306/612 * 612 = 306 (+ margen 0 si la página ocupa todo el ancho)
    expect(pos.x).toBeCloseTo(306);
    // y: 396/792 * 792 + (792 + 1) de la página 1
    expect(pos.y).toBeCloseTo(396 + 793);
    expect(pos.rotation).toBe(0);
  });

  it('devuelve null si la página no existe', () => {
    const coord = { id: 'a', firmante: 7, pagina: 99, xDoc: 0, ydoc: 0,
      AnchoPagina: 612, altoPagina: 792, position: 0, nombre: 'Ana' };
    expect(computeOverlayPosition(coord, pages, 612)).toBeNull();
  });
});
