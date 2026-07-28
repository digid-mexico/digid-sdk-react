/**
 * Varianza del Laplaciano sobre la luminancia de la imagen — medida clásica
 * de nitidez: bordes marcados (imagen enfocada) producen respuestas grandes
 * y dispersas; una imagen borrosa o plana produce respuestas cercanas a 0.
 */
export function laplacianVariance(data: Uint8ClampedArray, width: number, height: number): number {
  if (width < 3 || height < 3) return 0;

  // RGBA -> luminancia (evita el canal alfa, que no aporta nitidez).
  const luminance = new Float64Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4] ?? 0;
    const g = data[i * 4 + 1] ?? 0;
    const b = data[i * 4 + 2] ?? 0;
    luminance[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  // Kernel Laplaciano 3x3 de 4 vecinos, se omiten los bordes de la imagen.
  const responses: number[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const center = luminance[idx] ?? 0;
      const top = luminance[idx - width] ?? 0;
      const bottom = luminance[idx + width] ?? 0;
      const left = luminance[idx - 1] ?? 0;
      const right = luminance[idx + 1] ?? 0;
      responses.push(4 * center - top - bottom - left - right);
    }
  }

  if (responses.length === 0) return 0;
  const mean = responses.reduce((acc, v) => acc + v, 0) / responses.length;
  const variance = responses.reduce((acc, v) => acc + (v - mean) ** 2, 0) / responses.length;
  return variance;
}

/**
 * Umbral calibrado empíricamente contra imágenes planas/borrosas (varianza
 * ~0) vs. patrones de alto contraste (varianza en el orden de 10^3-10^6).
 */
export const SHARPNESS_MIN = 15;

export function isSharp(imageData: ImageData): boolean {
  return laplacianVariance(imageData.data, imageData.width, imageData.height) >= SHARPNESS_MIN;
}
