import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PdfViewer } from './PdfViewer';

vi.mock('pdfjs-dist', () => {
  const page = {
    getViewport: ({ scale }: { scale: number }) => ({ width: 612 * scale, height: 792 * scale }),
    render: () => ({ promise: Promise.resolve() }),
  };
  return {
    GlobalWorkerOptions: { workerSrc: '' },
    getDocument: vi.fn(() => ({
      promise: Promise.resolve({ numPages: 2, getPage: () => Promise.resolve(page) }),
    })),
  };
});

describe('PdfViewer', () => {
  it('renderiza un canvas por página y notifica dimensiones', async () => {
    const onPages = vi.fn();
    render(<PdfViewer url="/doc.pdf" onPagesRendered={onPages} />);
    await waitFor(() => expect(onPages).toHaveBeenCalled());
    const pages = onPages.mock.lastCall![0];
    expect(pages).toHaveLength(2);
    expect(pages[0]).toMatchObject({ numPage: 1 });
    expect(screen.getByTestId('digid-pdf-pages').querySelectorAll('canvas')).toHaveLength(2);
  });

  it('muestra error si el PDF no carga', async () => {
    const { getDocument } = await import('pdfjs-dist');
    vi.mocked(getDocument).mockReturnValueOnce({
      promise: Promise.reject(new Error('404')),
    } as never);
    render(<PdfViewer url="/bad.pdf" />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });

  it('usa el workerSrc explícito (necesario para consumidores CJS)', async () => {
    const { GlobalWorkerOptions } = await import('pdfjs-dist');
    render(<PdfViewer url="/doc.pdf" workerSrc="/custom-worker.js" />);
    await waitFor(() => expect(GlobalWorkerOptions.workerSrc).toBe('/custom-worker.js'));
  });
});

describe('PdfViewer con toolbar', () => {
  async function renderPages() {
    const utils = render(<PdfViewer url="/doc.pdf" toolbar />);
    await waitFor(() =>
      expect(utils.getByTestId('digid-pdf-pages').querySelectorAll('canvas')).toHaveLength(2),
    );
    return utils;
  }

  function canvasWidth(container: HTMLElement, idx = 0) {
    const canvas = container.querySelectorAll('canvas')[idx] as HTMLCanvasElement;
    return parseFloat(canvas.style.width);
  }

  function canvasHeight(container: HTMLElement, idx = 0) {
    const canvas = container.querySelectorAll('canvas')[idx] as HTMLCanvasElement;
    return parseFloat(canvas.style.height);
  }

  it('sin toolbar (por defecto) no renderiza controles de zoom ni de página', async () => {
    render(<PdfViewer url="/doc.pdf" />);
    await waitFor(() => expect(screen.getByTestId('digid-pdf-pages').querySelectorAll('canvas')).toHaveLength(2));
    expect(screen.queryByRole('button', { name: 'Acercar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: 'Página' })).not.toBeInTheDocument();
  });

  it('con toolbar renderiza los controles de zoom y de página con nombres accesibles', async () => {
    await renderPages();
    expect(screen.getByRole('button', { name: 'Alejar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Acercar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ajustar al ancho' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Página' })).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('acercar sube el zoom a 125% y agranda los canvas', async () => {
    const { container } = await renderPages();
    const before = canvasWidth(container);
    await userEvent.click(screen.getByRole('button', { name: 'Acercar' }));
    await waitFor(() => expect(screen.getByText('125%')).toBeInTheDocument());
    await waitFor(() => expect(canvasWidth(container)).toBeCloseTo(before * 1.25, 0));
  });

  it('deshabilita alejar en 50% y acercar en 300%', async () => {
    await renderPages();
    const zoomOut = screen.getByRole('button', { name: 'Alejar' });
    const zoomIn = screen.getByRole('button', { name: 'Acercar' });
    for (let i = 0; i < 2; i++) {
      // eslint-disable-next-line no-await-in-loop
      await userEvent.click(zoomOut); // 100% -> 75% -> 50%
    }
    await waitFor(() => expect(screen.getByText('50%')).toBeInTheDocument());
    expect(zoomOut).toBeDisabled();

    for (let i = 0; i < 10; i++) {
      // eslint-disable-next-line no-await-in-loop
      await userEvent.click(zoomIn); // clampeado a 300%
    }
    await waitFor(() => expect(screen.getByText('300%')).toBeInTheDocument());
    expect(zoomIn).toBeDisabled();
  });

  it('ajustar al ancho regresa el zoom a 100%', async () => {
    await renderPages();
    await userEvent.click(screen.getByRole('button', { name: 'Acercar' }));
    await waitFor(() => expect(screen.getByText('125%')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Ajustar al ancho' }));
    await waitFor(() => expect(screen.getByText('100%')).toBeInTheDocument());
  });

  it('el botón anterior está deshabilitado en la página 1 y siguiente hace scroll a la página 2', async () => {
    const { container } = await renderPages();
    const scroller = container.querySelector('.digid-pdf') as HTMLElement;
    const scrollSpy = vi.spyOn(scroller, 'scrollTo');
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));

    const page1Height = canvasHeight(container, 0);
    expect(scrollSpy).toHaveBeenCalledWith({ top: page1Height + 1, behavior: 'smooth' });
  });

  it('permite saltar a una página escribiendo el número y presionando Enter', async () => {
    const { container } = await renderPages();
    const scroller = container.querySelector('.digid-pdf') as HTMLElement;
    const scrollSpy = vi.spyOn(scroller, 'scrollTo');
    const input = screen.getByRole('spinbutton', { name: 'Página' });

    await userEvent.clear(input);
    await userEvent.type(input, '2{Enter}');

    const page1Height = canvasHeight(container, 0);
    expect(scrollSpy).toHaveBeenCalledWith({ top: page1Height + 1, behavior: 'smooth' });
  });
});
