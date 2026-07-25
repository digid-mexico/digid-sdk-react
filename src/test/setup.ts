import '@testing-library/jest-dom/vitest';

// Este setup corre también para archivos con `@vitest-environment node`
// (p.ej. src/api/client.test.ts), donde no existe `HTMLElement`.
if (typeof HTMLElement !== 'undefined') {
  // jsdom no implementa Pointer Capture (necesario para SignaturePad)
  if (!HTMLElement.prototype.setPointerCapture) {
    HTMLElement.prototype.setPointerCapture = () => {};
  }
}
