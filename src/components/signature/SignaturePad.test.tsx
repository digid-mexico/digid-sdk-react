import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SignaturePad, type SignaturePadHandle } from './SignaturePad';

function drawStroke(canvas: HTMLElement) {
  fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 10, clientY: 10 });
  fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 40, clientY: 40 });
  fireEvent.pointerUp(canvas, { pointerId: 1 });
}

/** Contexto 2d falso con spies, para verificar qué métodos se invocan
 *  (el stub global de setup.ts es silencioso y no permite aserciones). */
function spyContext() {
  const ctx = {
    clearRect: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    strokeStyle: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
  return ctx;
}

describe('SignaturePad', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });


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

  it('sigue dibujando tras pointerleave (pointer capture sigue activo)', () => {
    const ctx = spyContext();
    render(<SignaturePad strokeColor="#000000" strokeWidth={2} />);
    const canvas = screen.getByTestId('digid-signature-canvas');

    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 10, clientY: 10 });
    // el trazo sale del canvas: con setPointerCapture activo el navegador
    // sigue entregando los eventos al mismo elemento.
    fireEvent.pointerLeave(canvas, { pointerId: 1, clientX: -5, clientY: -5 });
    ctx.stroke.mockClear();
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 40, clientY: 40 });

    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('pointercancel detiene el trazo (scroll/gesto interrumpe en mobile)', () => {
    const ctx = spyContext();
    render(<SignaturePad strokeColor="#000000" strokeWidth={2} />);
    const canvas = screen.getByTestId('digid-signature-canvas');

    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerCancel(canvas, { pointerId: 1 });
    ctx.stroke.mockClear();
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 40, clientY: 40 });

    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it('ignora un redraw de resize obsoleto (carrera de generación)', () => {
    const ctx = spyContext();

    class FakeImage {
      onload: (() => void) | null = null;
      src = '';
    }
    const images: FakeImage[] = [];
    vi.stubGlobal(
      'Image',
      vi.fn(() => {
        const img = new FakeImage();
        images.push(img);
        return img;
      }),
    );

    render(<SignaturePad strokeColor="#000000" strokeWidth={2} />);
    const canvas = screen.getByTestId('digid-signature-canvas');
    drawStroke(canvas); // marca dirty=true para que resize() intente redibujar

    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('resize'));
    expect(images).toHaveLength(2);

    images[0]!.onload?.(); // generación obsoleta: no debe pintar
    expect(ctx.drawImage).not.toHaveBeenCalled();

    images[1]!.onload?.(); // generación vigente: sí debe pintar
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
  });
});
