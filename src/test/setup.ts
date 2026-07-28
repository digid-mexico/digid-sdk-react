import '@testing-library/jest-dom/vitest';

// Este setup corre también para archivos con `@vitest-environment node`
// (p.ej. src/api/client.test.ts), donde no existe `HTMLElement`.
if (typeof HTMLElement !== 'undefined') {
  // jsdom no implementa Pointer Capture (necesario para SignaturePad)
  if (!HTMLElement.prototype.setPointerCapture) {
    HTMLElement.prototype.setPointerCapture = () => {};
  }
}

if (typeof HTMLCanvasElement !== 'undefined') {
  // jsdom no implementa el contexto 2d de canvas (requiere el paquete nativo
  // `canvas`, que no instalamos). PdfViewer tolera el `null` que jsdom ya
  // devuelve porque su mock de pdfjs nunca invoca métodos sobre el contexto;
  // SignaturePad sí dibuja de verdad, así que aquí damos un stub mínimo con
  // los métodos que usa (clearRect/scale/drawImage/beginPath/moveTo/lineTo/
  // stroke) para que los trazos no truene en jsdom.
  HTMLCanvasElement.prototype.getContext = function () {
    return {
      clearRect() {},
      scale() {},
      drawImage() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      stroke() {},
      save() {},
      restore() {},
      setTransform() {},
      strokeStyle: '',
      lineWidth: 0,
      lineCap: '',
      lineJoin: '',
    } as unknown as CanvasRenderingContext2D;
  } as never;

  // jsdom no implementa toDataURL; SignaturePad.toDataURL() lo necesita.
  HTMLCanvasElement.prototype.toDataURL = function () {
    return 'data:image/png;base64,stub';
  };
}

// jsdom no implementa URL.createObjectURL/revokeObjectURL (usados por
// IdCaptureStep para la vista previa del archivo elegido y su limpieza);
// stubs mínimos bastan para los tests.
if (typeof URL !== 'undefined' && !URL.createObjectURL) {
  URL.createObjectURL = () => 'blob:stub';
}
if (typeof URL !== 'undefined' && !URL.revokeObjectURL) {
  URL.revokeObjectURL = () => {};
}

// jsdom no implementa Element.scrollTo (usado por PlaceSignaturesStep para
// hacer scroll automático a la firma activa dentro del visor de PDF).
if (typeof Element !== 'undefined' && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}

// jsdom no implementa el constructor global ImageData (usado por las
// utilidades de nitidez y detección en src/detection). Polyfill mínimo:
// soporta `new ImageData(width, height)` y `new ImageData(data, width, height?)`.
if (typeof globalThis.ImageData === 'undefined') {
  class ImageDataPolyfill {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    colorSpace: PredefinedColorSpace = 'srgb';

    constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, height?: number) {
      if (dataOrWidth instanceof Uint8ClampedArray) {
        this.data = dataOrWidth;
        this.width = widthOrHeight;
        this.height = height ?? dataOrWidth.length / (4 * widthOrHeight);
      } else {
        this.width = dataOrWidth;
        this.height = widthOrHeight;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      }
    }
  }
  (globalThis as unknown as { ImageData: unknown }).ImageData = ImageDataPolyfill;
}

// Extiende el stub de contexto 2d de canvas (definido arriba) con
// getImageData, usado por useAutoCapture para muestrear el frame de video.
// El contenido no importa para esos tests (la nitidez real se cubre en
// sharpness.test.ts y se mockea en useAutoCapture.test.ts); basta un
// ImageData mínimo del tamaño pedido.
if (typeof HTMLCanvasElement !== 'undefined') {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: unknown[]) {
    const ctx = (originalGetContext as (...a: unknown[]) => unknown).apply(this, args as never);
    if (ctx && typeof (ctx as { getImageData?: unknown }).getImageData === 'undefined') {
      (ctx as { getImageData: (x: number, y: number, w: number, h: number) => ImageData }).getImageData = (
        _x: number,
        _y: number,
        w: number,
        h: number,
      ) => new ImageData(Math.max(1, w), Math.max(1, h));
    }
    return ctx;
  } as never;
}
