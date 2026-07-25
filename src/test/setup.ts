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
