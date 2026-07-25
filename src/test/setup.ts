import '@testing-library/jest-dom/vitest';

// jsdom no implementa Pointer Capture (necesario para SignaturePad)
if (!HTMLElement.prototype.setPointerCapture) {
  HTMLElement.prototype.setPointerCapture = () => {};
}
