import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface PageInfo {
  numPage: number;
  width: number; // px CSS renderizados
  height: number;
}

interface Props {
  url: string;
  /** Se llama al terminar de renderizar todas las páginas. */
  onPagesRendered?: (pages: PageInfo[]) => void;
  /** Overlays absolutos (previews de firma) montados sobre las páginas. */
  children?: ReactNode;
  className?: string;
}

export function PdfViewer({ url, onPagesRendered, children, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Dynamic import: pdfjs (~350KB) solo se descarga cuando se muestra un PDF.
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString();
        const pdf = await pdfjs.getDocument({ url }).promise;
        if (cancelled || !pagesRef.current || !containerRef.current) return;
        // limpia solo los canvas previos (los children de React quedan intactos)
        pagesRef.current.querySelectorAll('canvas').forEach((c) => c.remove());

        // Escala: ancho del contenedor / página más ancha
        let maxWidth = 0;
        for (let i = 1; i <= pdf.numPages; i++) {
          const vp = (await pdf.getPage(i)).getViewport({ scale: 1 });
          maxWidth = Math.max(maxWidth, vp.width);
        }
        const scale = (containerRef.current.clientWidth || maxWidth) / maxWidth;
        const dpr = Math.max(1.5, window.devicePixelRatio || 1);

        const pages: PageInfo[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: scale * dpr });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${viewport.width / dpr}px`;
          canvas.style.height = `${viewport.height / dpr}px`;
          canvas.style.marginBottom = '1px';
          const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
          await page.render({ canvasContext: ctx, viewport }).promise;
          if (cancelled) return;
          pagesRef.current.appendChild(canvas);
          pages.push({ numPage: i, width: viewport.width / dpr, height: viewport.height / dpr });
        }
        onPagesRendered?.(pages);
      } catch {
        if (!cancelled) setError('No fue posible cargar el documento PDF.');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  if (error) return <p role="alert">{error}</p>;
  return (
    <div ref={containerRef} className={`digid-pdf${className ? ` ${className}` : ''}`}>
      <div ref={pagesRef} data-testid="digid-pdf-pages" className="digid-pdf__pages">
        {children}
      </div>
    </div>
  );
}
