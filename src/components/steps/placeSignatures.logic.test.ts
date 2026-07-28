import { describe, it, expect } from 'vitest';
import {
  parseCoordinates, computeOverlayPosition, computeOverlaySize, computeOverlayRect,
} from './placeSignatures.logic';
import type { PageInfo } from '../pdf/PdfViewer';

const pages: PageInfo[] = [
  { numPage: 1, width: 612, height: 792, widthPt: 612, heightPt: 792 },
  { numPage: 2, width: 612, height: 792, widthPt: 612, heightPt: 792 },
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

  it('suma el margen de centrado cuando el contenedor es más ancho que la página', () => {
    const coord = { id: 'a', firmante: 7, pagina: 1, xDoc: 0, ydoc: 0,
      AnchoPagina: 612, altoPagina: 792, position: 0, nombre: 'Ana' };
    // margen = (800 - 612) / 2 = 94
    const pos = computeOverlayPosition(coord, pages, 800)!;
    expect(pos.x).toBeCloseTo(94);
  });

  it('recorta el margen a 0 cuando el contenedor es más angosto que la página', () => {
    const coord = { id: 'a', firmante: 7, pagina: 1, xDoc: 0, ydoc: 0,
      AnchoPagina: 612, altoPagina: 792, position: 0, nombre: 'Ana' };
    // margen negativo (500 - 612) / 2 = -56 → se recorta a 0
    const pos = computeOverlayPosition(coord, pages, 500)!;
    expect(pos.x).toBeCloseTo(0);
  });
});

describe('computeOverlaySize', () => {
  it('carta (letter) renderizada a su ancho físico (scale 1): 37×24mm → ≈104.88×68.03 css px', () => {
    const page: PageInfo = { numPage: 1, width: 612, height: 792, widthPt: 612, heightPt: 792 };
    const size = computeOverlaySize(page);
    expect(size.width).toBeCloseTo(104.9, 1);
    expect(size.height).toBeCloseTo(68.0, 1);
  });

  it('a la mitad del render (mismo widthPt, mitad de width renderizado) el overlay también se reduce a la mitad', () => {
    const page: PageInfo = { numPage: 1, width: 306, height: 396, widthPt: 612, heightPt: 792 };
    const size = computeOverlaySize(page);
    expect(size.width).toBeCloseTo(52.4, 1);
    expect(size.height).toBeCloseTo(34.0, 1);
  });

  it('A4 renderizada a su ancho físico (scale 1) da el mismo tamaño css: 37mm es 37mm sin importar el tamaño de página', () => {
    const page: PageInfo = { numPage: 1, width: 595.28, height: 841.89, widthPt: 595.28, heightPt: 841.89 };
    const size = computeOverlaySize(page);
    expect(size.width).toBeCloseTo(104.9, 1);
    expect(size.height).toBeCloseTo(68.0, 1);
  });

  it('usa el fallback fijo 100×50 si falta widthPt (compatibilidad con mocks/entornos viejos)', () => {
    const page = { numPage: 1, width: 612, height: 792, widthPt: 0, heightPt: 0 } as PageInfo;
    const size = computeOverlaySize(page);
    expect(size.width).toBe(100);
    expect(size.height).toBe(50);
  });
});

describe('computeOverlayRect', () => {
  it('combina posición y tamaño para la página correspondiente', () => {
    const rectPages: PageInfo[] = [
      { numPage: 1, width: 612, height: 792, widthPt: 612, heightPt: 792 },
    ];
    const coord = { id: 'a', firmante: 7, pagina: 1, xDoc: 0, ydoc: 0,
      AnchoPagina: 612, altoPagina: 792, position: 0, nombre: 'Ana' };
    const rect = computeOverlayRect(coord, rectPages, 612)!;
    expect(rect.x).toBeCloseTo(0);
    expect(rect.y).toBeCloseTo(0);
    expect(rect.width).toBeCloseTo(104.9, 1);
    expect(rect.height).toBeCloseTo(68.0, 1);
  });

  it('devuelve null si la página no existe', () => {
    const coord = { id: 'a', firmante: 7, pagina: 99, xDoc: 0, ydoc: 0,
      AnchoPagina: 612, altoPagina: 792, position: 0, nombre: 'Ana' };
    expect(computeOverlayRect(coord, pages, 612)).toBeNull();
  });
});
