import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SignaturePad, type SignaturePadHandle } from './SignaturePad';

function drawStroke(canvas: HTMLElement) {
  fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 10, clientY: 10 });
  fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 40, clientY: 40 });
  fireEvent.pointerUp(canvas, { pointerId: 1 });
}

describe('SignaturePad', () => {
  it('notifica onDirtyChange(true) al primer trazo', () => {
    const onDirty = vi.fn();
    render(<SignaturePad onDirtyChange={onDirty} strokeColor="#000000" strokeWidth={2} />);
    drawStroke(screen.getByTestId('digid-signature-canvas'));
    expect(onDirty).toHaveBeenCalledWith(true);
  });

  it('clear() limpia y notifica onDirtyChange(false)', () => {
    const onDirty = vi.fn();
    const ref = { current: null as SignaturePadHandle | null };
    render(
      <SignaturePad padRef={ref} onDirtyChange={onDirty} strokeColor="#000000" strokeWidth={2} />,
    );
    drawStroke(screen.getByTestId('digid-signature-canvas'));
    ref.current!.clear();
    expect(onDirty).toHaveBeenLastCalledWith(false);
  });

  it('expone toDataURL', () => {
    const ref = { current: null as SignaturePadHandle | null };
    render(<SignaturePad padRef={ref} strokeColor="#000000" strokeWidth={2} />);
    expect(ref.current!.toDataURL()).toMatch(/^data:image\/png/);
  });
});
