import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
