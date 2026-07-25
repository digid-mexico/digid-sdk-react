export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_IMAGE_DIMENSION = 1920; // px, lado mayor tras downscale

export function sniffImageType(bytes: Uint8Array): 'image/jpeg' | 'image/png' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'image/jpeg';
  const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= PNG_SIGNATURE.length && PNG_SIGNATURE.every((b, i) => bytes[i] === b))
    return 'image/png';
  return null;
}

/**
 * Lee un Blob como ArrayBuffer vía FileReader.
 * Se evita Blob.prototype.arrayBuffer porque jsdom (entorno de test) no lo implementa;
 * FileReader tiene soporte universal tanto en navegadores como en jsdom.
 */
function readAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('No fue posible leer el archivo.'));
    reader.readAsArrayBuffer(blob);
  });
}

/** Valida tamaño y magic bytes. Devuelve el MIME real o lanza Error con mensaje para el usuario. */
export async function validateImageFile(file: File): Promise<'image/jpeg' | 'image/png'> {
  if (file.size > MAX_IMAGE_BYTES)
    throw new Error('El archivo excede el tamaño máximo de 10 MB.');
  const head = new Uint8Array(await readAsArrayBuffer(file.slice(0, 8)));
  const type = sniffImageType(head);
  if (!type) throw new Error('El formato del archivo no es válido. Use JPEG o PNG.');
  return type;
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const match = dataUrl.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,(.*)$/s);
  if (!match) throw new Error('El dataURL no es válido.');
  const [, mimeFromMatch, isBase64, payload] = match;
  const mime = mimeFromMatch ?? 'application/octet-stream';
  if (!payload) throw new Error('El dataURL no es válido.');
  let bin: string;
  if (isBase64) {
    try {
      bin = atob(payload);
    } catch {
      throw new Error('El dataURL no es válido.');
    }
  } else {
    bin = decodeURIComponent(payload);
  }
  if (!bin) throw new Error('El dataURL no es válido.');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * Re-encodea la imagen a JPEG con lado mayor <= MAX_IMAGE_DIMENSION.
 * Efecto de seguridad/privacidad: elimina metadatos EXIF (incl. GPS) y
 * normaliza el payload que se sube al backend.
 * No testeable en jsdom (usa createImageBitmap/canvas): se cubre en playground.
 */
export async function normalizeToJpeg(source: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('No fue posible procesar la imagen.'))),
      'image/jpeg',
      0.9,
    ),
  );
}
