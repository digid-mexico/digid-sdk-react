import { describe, it, expect } from 'vitest';
import { laplacianVariance, isSharp, SHARPNESS_MIN } from './sharpness';

/** Crea un ImageData RGBA de un solo color sólido (imagen "plana", sin bordes). */
function flatImageData(width: number, height: number, gray = 128): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = gray;
    data[i * 4 + 1] = gray;
    data[i * 4 + 2] = gray;
    data[i * 4 + 3] = 255;
  }
  return new ImageData(data, width, height);
}

/** Crea un ImageData en patrón de tablero de ajedrez (alto contraste pixel a pixel). */
function checkerboardImageData(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const value = (x + y) % 2 === 0 ? 0 : 255;
      data[i * 4] = value;
      data[i * 4 + 1] = value;
      data[i * 4 + 2] = value;
      data[i * 4 + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
}

describe('laplacianVariance', () => {
  it('es ~0 para una imagen plana (sin bordes que detectar)', () => {
    const img = flatImageData(20, 20);
    expect(laplacianVariance(img.data, img.width, img.height)).toBeCloseTo(0, 5);
  });

  it('es alta para un patrón de alto contraste (tablero de ajedrez)', () => {
    const img = checkerboardImageData(20, 20);
    expect(laplacianVariance(img.data, img.width, img.height)).toBeGreaterThan(10000);
  });

  it('ignora el canal alfa y usa solo la luminancia RGB', () => {
    const flat = flatImageData(10, 10, 100);
    // Alfa distinto no debería afectar el cálculo de nitidez.
    for (let i = 0; i < flat.data.length / 4; i++) flat.data[i * 4 + 3] = 10;
    expect(laplacianVariance(flat.data, flat.width, flat.height)).toBeCloseTo(0, 5);
  });
});

describe('isSharp', () => {
  it('SHARPNESS_MIN está calibrado por encima de 0', () => {
    expect(SHARPNESS_MIN).toBeGreaterThan(0);
  });

  it('rechaza una imagen plana/borrosa', () => {
    expect(isSharp(flatImageData(20, 20))).toBe(false);
  });

  it('acepta un patrón de alto contraste como nítido', () => {
    expect(isSharp(checkerboardImageData(20, 20))).toBe(true);
  });
});
