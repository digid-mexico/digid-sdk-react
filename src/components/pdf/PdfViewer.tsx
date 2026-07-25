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
  /**
   * URL del worker de pdfjs-dist (pdf.worker.min.mjs). Requerida en builds
   * CJS: `new URL(..., import.meta.url)` no puede resolverse ahí porque
   * esbuild reemplaza `import.meta` por `{}` en ese formato de salida.
   */
  workerSrc?: string;
  /** Overlays absolutos (previews de firma) montados sobre las páginas. */
  children?: ReactNode;
  className?: string;
}

/**
 * Configura pdfjs.GlobalWorkerOptions.workerSrc, en orden de prioridad:
 * 1. La prop `workerSrc` explícita.
 * 2. Un valor ya configurado por el consumidor (p.ej. de forma global).
 * 3. Resolución automática vía `import.meta.url` (solo funciona en ESM).
 */
function configureWorker(pdfjs: typeof import('pdfjs-dist'), workerSrc?: string): void {
  if (workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
    return;
  }
  if (pdfjs.GlobalWorkerOptions.workerSrc) {
    return;
  }
  try {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();
  } catch (err) {
    // esbuild reemplaza `import.meta` por `{}` en el build .cjs, así que esto
    // siempre falla para consumidores CJS. No hay forma automática de
    // resolverlo: deben pasar la prop `workerSrc`.
    console.error(
      '[PdfViewer] No fue posible resolver pdf.worker.min.mjs automáticamente ' +
        '(probablemente estás en un entorno CJS). Pasa la prop `workerSrc` con ' +
        'la URL del worker de pdfjs-dist.',
      err,
    );
  }
}

export function PdfViewer({ url, onPagesRendered, workerSrc, children, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const canvasesRef = useRef<HTMLCanvasElement[]>([]);
  const onPagesRenderedRef = useRef(onPagesRendered);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onPagesRenderedRef.current = onPagesRendered;
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Dynamic import: pdfjs (~350KB) solo se descarga cuando se muestra un PDF.
        const pdfjs = await import('pdfjs-dist');
        configureWorker(pdfjs, workerSrc);
        const pdf = await pdfjs.getDocument({ url }).promise;
        if (cancelled || !pagesRef.current || !containerRef.current) return;
        // limpia solo los canvas que este componente agregó, nunca los
        // overlays de React (children) que pudieran compartir el contenedor.
        canvasesRef.current.forEach((c) => c.remove());
        canvasesRef.current = [];

        // Escala: ancho del contenedor / página más ancha. Reutiliza los
        // PDFPageProxy obtenidos aquí para no pedirlos dos veces por página.
        const pdfPages = [];
        let maxWidth = 0;
        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled) return;
          const page = await pdf.getPage(i);
          pdfPages.push(page);
          const vp = page.getViewport({ scale: 1 });
          maxWidth = Math.max(maxWidth, vp.width);
        }
        const scale = (containerRef.current.clientWidth || maxWidth) / maxWidth;
        const dpr = Math.max(1.5, window.devicePixelRatio || 1);

        const pages: PageInfo[] = [];
        for (const [idx, page] of pdfPages.entries()) {
          const numPage = idx + 1;
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
          canvasesRef.current.push(canvas);
          pages.push({ numPage, width: viewport.width / dpr, height: viewport.height / dpr });
        }
        onPagesRenderedRef.current?.(pages);
      } catch (err) {
        console.error(err);
        if (!cancelled) setError('No fue posible cargar el documento PDF.');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, workerSrc]);

  if (error) return <p role="alert">{error}</p>;
  return (
    <div ref={containerRef} className={`digid-pdf${className ? ` ${className}` : ''}`}>
      <div ref={pagesRef} data-testid="digid-pdf-pages" className="digid-pdf__pages">
        {children}
      </div>
    </div>
  );
}
