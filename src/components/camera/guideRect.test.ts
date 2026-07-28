import { describe, it, expect } from 'vitest';
import {
  guideRect,
  boxCenter,
  rectContainsPoint,
  rectFullyContains,
  ID_ASPECT,
  ID_WIDTH_FRAC,
  ID_MAX_HEIGHT_FRAC,
} from './guideRect';

describe('guideRect', () => {
  describe('guide "face"', () => {
    it('es un óvalo vertical centrado de ~55% de ancho y ~75% de alto, sin importar el aspecto del video', () => {
      for (const videoAspect of [4 / 3, 16 / 9, 9 / 16, 1, 2.5]) {
        const rect = guideRect('face', videoAspect);
        expect(rect.width).toBeCloseTo(0.55, 5);
        expect(rect.height).toBeCloseTo(0.75, 5);
        expect(rect.x).toBeCloseTo((1 - 0.55) / 2, 5);
        expect(rect.y).toBeCloseTo((1 - 0.75) / 2, 5);
      }
    });
  });

  describe('guide "id"', () => {
    it('mantiene el aspecto ID-1 (1.586:1) tanto si cabe al 80% del ancho como si hay que topar por altura', () => {
      // 16:9 no dispara el tope (el marco cabe al 80% del ancho).
      const uncapped = guideRect('id', 16 / 9);
      expect(uncapped.width).toBeCloseTo(ID_WIDTH_FRAC, 5);
      expect(uncapped.height).toBeLessThan(ID_MAX_HEIGHT_FRAC);
      expect((uncapped.width / uncapped.height) * (16 / 9)).toBeCloseTo(ID_ASPECT, 5);

      // videoAspect=2 sí dispara el tope de altura (0.8*2/1.586 > 0.9).
      const capped = guideRect('id', 2);
      expect(capped.height).toBeCloseTo(ID_MAX_HEIGHT_FRAC, 5);
      expect(capped.width).toBeLessThan(ID_WIDTH_FRAC);
      expect((capped.width / capped.height) * 2).toBeCloseTo(ID_ASPECT, 5);
    });

    it('siempre queda centrado: x = (1-width)/2, y = (1-height)/2', () => {
      for (const videoAspect of [4 / 3, 16 / 9, 1, 2, 0.5625]) {
        const rect = guideRect('id', videoAspect);
        expect(rect.x).toBeCloseTo((1 - rect.width) / 2, 5);
        expect(rect.y).toBeCloseTo((1 - rect.height) / 2, 5);
      }
    });
  });
});

describe('boxCenter', () => {
  it('devuelve el punto medio de la caja', () => {
    expect(boxCenter({ x: 0.2, y: 0.1, width: 0.4, height: 0.6 })).toEqual({ x: 0.4, y: 0.4 });
  });
});

describe('rectContainsPoint', () => {
  const rect = { x: 0.1, y: 0.1, width: 0.5, height: 0.5 };

  it('true si el punto cae dentro (incl. bordes)', () => {
    expect(rectContainsPoint(rect, { x: 0.35, y: 0.35 })).toBe(true);
    expect(rectContainsPoint(rect, { x: 0.1, y: 0.1 })).toBe(true);
    expect(rectContainsPoint(rect, { x: 0.6, y: 0.6 })).toBe(true);
  });

  it('false si el punto cae fuera', () => {
    expect(rectContainsPoint(rect, { x: 0.05, y: 0.35 })).toBe(false);
    expect(rectContainsPoint(rect, { x: 0.35, y: 0.61 })).toBe(false);
  });
});

describe('rectFullyContains', () => {
  const container = { x: 0.1, y: 0.1, width: 0.6, height: 0.6 };

  it('true si la caja cae completamente dentro', () => {
    expect(rectFullyContains(container, { x: 0.2, y: 0.2, width: 0.2, height: 0.2 })).toBe(true);
  });

  it('false si la caja se sale por cualquier lado', () => {
    expect(rectFullyContains(container, { x: 0.05, y: 0.2, width: 0.2, height: 0.2 })).toBe(false);
    expect(rectFullyContains(container, { x: 0.6, y: 0.2, width: 0.2, height: 0.2 })).toBe(false);
    expect(rectFullyContains(container, { x: 0.2, y: 0.65, width: 0.2, height: 0.2 })).toBe(false);
  });
});
