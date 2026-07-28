import { describe, it, expect } from 'vitest';
import { clamp, signatureDifference, percentileFromHistogram } from './scan';

describe('clamp', () => {
  it('limita al rango', () => {
    expect(clamp(150, 0, 100)).toBe(100);
    expect(clamp(-5, 0, 100)).toBe(0);
    expect(clamp(42, 0, 100)).toBe(42);
  });
});

describe('signatureDifference', () => {
  it('firma identica da 0', () => {
    expect(signatureDifference([10, 20], [10, 20])).toBe(0);
  });
  it('firmas incomparables dan 100', () => {
    expect(signatureDifference([1], [1, 2])).toBe(100);
    expect(signatureDifference(null, [1])).toBe(100);
  });
  it('promedia diferencias absolutas', () => {
    expect(signatureDifference([0, 10], [10, 30])).toBe(15);
  });
});

describe('percentileFromHistogram', () => {
  it('encuentra el bin donde se acumula el objetivo', () => {
    const h = new Uint32Array(256);
    h[10] = 5;
    h[200] = 5;
    expect(percentileFromHistogram(h, 5)).toBe(10);
    expect(percentileFromHistogram(h, 6)).toBe(200);
  });
});
