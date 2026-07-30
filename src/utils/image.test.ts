import { describe, it, expect } from 'vitest';
import {
  sniffImageType, validateImageFile, dataUrlToBlob, isDecodedSizeAllowed, MAX_IMAGE_PIXELS,
} from './image';

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('sniffImageType', () => {
  it('detecta JPEG por magic bytes', () => {
    expect(sniffImageType(JPEG_BYTES)).toBe('image/jpeg');
  });
  it('detecta PNG por magic bytes', () => {
    expect(sniffImageType(PNG_BYTES)).toBe('image/png');
  });
  it('rechaza otros formatos', () => {
    expect(sniffImageType(new Uint8Array([0x00, 0x01, 0x02, 0x03]))).toBeNull();
  });
  it('rechaza bytes con firma PNG parcial y cola basura', () => {
    expect(
      sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xff, 0xff, 0xff, 0xff])),
    ).toBeNull();
  });
});

describe('validateImageFile', () => {
  it('acepta un JPEG válido dentro del límite', async () => {
    const file = new File([JPEG_BYTES], 'ine.jpg', { type: 'image/jpeg' });
    await expect(validateImageFile(file)).resolves.toBe('image/jpeg');
  });
  it('rechaza un archivo renombrado (magic bytes no coinciden)', async () => {
    const file = new File([new Uint8Array([0x00])], 'fake.jpg', { type: 'image/jpeg' });
    await expect(validateImageFile(file)).rejects.toThrow(/formato/i);
  });
  it('rechaza archivos mayores al límite', async () => {
    const big = new File([new Uint8Array(11 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' });
    await expect(validateImageFile(big)).rejects.toThrow(/tamaño/i);
  });
  it('acepta un PNG válido dentro del límite', async () => {
    const file = new File([PNG_BYTES], 'ine.png', { type: 'image/png' });
    await expect(validateImageFile(file)).resolves.toBe('image/png');
  });
});

describe('isDecodedSizeAllowed', () => {
  it('acepta la foto de un celular actual (48 MP)', () => {
    expect(isDecodedSizeAllowed(8000, 6000)).toBe(true);
  });
  it('rechaza una bomba de descompresión (pocos bytes, cientos de MP)', () => {
    // 30000x30000 = 900 MP => ~3.6 GB de canvas RGBA
    expect(isDecodedSizeAllowed(30000, 30000)).toBe(false);
  });
  it('acepta exactamente el tope y rechaza un píxel más', () => {
    expect(isDecodedSizeAllowed(MAX_IMAGE_PIXELS, 1)).toBe(true);
    expect(isDecodedSizeAllowed(MAX_IMAGE_PIXELS + 1, 1)).toBe(false);
  });
  it('rechaza dimensiones degeneradas (imagen que no decodificó)', () => {
    expect(isDecodedSizeAllowed(0, 0)).toBe(false);
  });
});

describe('dataUrlToBlob', () => {
  it('convierte dataURL a Blob con el MIME correcto', () => {
    const blob = dataUrlToBlob('data:image/jpeg;base64,/9j/4AA=');
    expect(blob.type).toBe('image/jpeg');
    expect(blob.size).toBeGreaterThan(0);
  });
  it('rechaza un dataURL malformado', () => {
    expect(() => dataUrlToBlob('no-es-un-dataurl')).toThrow(/dataurl/i);
  });
});
