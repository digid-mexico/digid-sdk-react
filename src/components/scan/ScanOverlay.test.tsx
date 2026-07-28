import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ScanOverlay } from './ScanOverlay';

const MARCO_VIEW = { w: 320, h: 240, rect: { x: 10, y: 10, width: 200, height: 126 } };
const QUAD = {
  w: 320,
  h: 240,
  points: [{ x: 20, y: 20 }, { x: 200, y: 20 }, { x: 200, y: 150 }, { x: 20, y: 150 }],
};

describe('ScanOverlay', () => {
  it('el cuadrilátero detectado NO trae la clase de espejo cuando mirrored=false', () => {
    const { container } = render(<ScanOverlay marcoView={MARCO_VIEW} quad={QUAD} good={false} mirrored={false} />);
    const detect = container.querySelector('.digid-scan__detect');
    expect(detect).not.toBeNull();
    expect(detect).not.toHaveClass('digid-scan__detect--mirrored');
  });

  it('el cuadrilátero detectado SÍ trae la clase de espejo cuando mirrored=true (webcam de escritorio)', () => {
    const { container } = render(<ScanOverlay marcoView={MARCO_VIEW} quad={QUAD} good={false} mirrored={true} />);
    const detect = container.querySelector('.digid-scan__detect');
    expect(detect).toHaveClass('digid-scan__detect--mirrored');
  });

  it('el marco fijo (scrim + borde) NUNCA se espeja: está centrado y es mirror-invariante', () => {
    const { container } = render(<ScanOverlay marcoView={MARCO_VIEW} quad={QUAD} good={false} mirrored={true} />);
    const marco = container.querySelector('.digid-scan__marco');
    expect(marco).not.toBeNull();
    expect(marco?.getAttribute('class')).not.toMatch(/mirrored/);
  });
});
