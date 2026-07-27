import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useStrings } from '../../i18n';

export interface PageInfo {
  numPage: number;
  width: number; // px CSS renderizados
  height: number;
}

const ZOOM_STEP = 0.25;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const PAGE_GAP = 1; // px, coincide con canvas.style.marginBottom

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
  /**
   * Muestra una barra de zoom + navegación de páginas encima del visor.
   * Solo debe activarse en la vista de revisión (StartStep): el zoom
   * re-renderiza las páginas a otra escala, así que PlaceSignaturesStep
   * (que mide PageInfo para posicionar overlays de firma) NUNCA debe pasar
   * esta prop, o el cálculo de overlays se desalinearía con el PDF.
   */
  toolbar?: boolean;
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

/** Offset (px CSS) del borde superior de `pageNum` (1-indexado) respecto al inicio del scroll. */
function pageOffset(pages: PageInfo[], pageNum: number): number {
  let offset = 0;
  for (let i = 0; i < pageNum - 1; i++) {
    offset += (pages[i]?.height ?? 0) + PAGE_GAP;
  }
  return offset;
}

/** Página actual dado un scrollTop: la última página cuyo offset <= scrollTop (+1px de tolerancia). */
function pageAtScrollTop(pages: PageInfo[], scrollTop: number): number {
  let current = 1;
  for (let i = 0; i < pages.length; i++) {
    if (pageOffset(pages, i + 1) <= scrollTop + 1) current = i + 1;
  }
  return current;
}

export function PdfViewer({
  url, onPagesRendered, workerSrc, children, className, toolbar = false,
}: Props) {
  const s = useStrings();
  const containerRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const canvasesRef = useRef<HTMLCanvasElement[]>([]);
  const onPagesRenderedRef = useRef(onPagesRendered);
  const pagesInfoRef = useRef<PageInfo[]>([]);
  const rafPendingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');

  useEffect(() => {
    onPagesRenderedRef.current = onPagesRendered;
  });

  useEffect(() => {
    pagesInfoRef.current = pages;
  }, [pages]);

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Dynamic import: pdfjs (~350KB) solo se descarga cuando se muestra un PDF.
        const pdfjs = await import('pdfjs-dist');
        configureWorker(pdfjs, workerSrc);
        const pdf = await pdfjs.getDocument({ url }).promise;
        if (cancelled || !pagesRef.current || !containerRef.current) return;

        // Preserva la posición relativa del scroll a través del re-render
        // (se dispara también cuando cambia el zoom, no solo al cargar un PDF
        // nuevo): captura la proporción ANTES de tocar el DOM.
        const scrollRatio = containerRef.current.scrollHeight > 0
          ? containerRef.current.scrollTop / containerRef.current.scrollHeight
          : 0;

        // limpia solo los canvas que este componente agregó, nunca los
        // overlays de React (children) que pudieran compartir el contenedor.
        canvasesRef.current.forEach((c) => c.remove());
        canvasesRef.current = [];

        // Escala: ancho del contenedor / página más ancha, multiplicado por
        // el zoom del toolbar (1 si no hay toolbar). Reutiliza los
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
        const scale = ((containerRef.current.clientWidth || maxWidth) / maxWidth) * zoom;
        const dpr = Math.max(1.5, window.devicePixelRatio || 1);

        const rendered: PageInfo[] = [];
        for (const [idx, page] of pdfPages.entries()) {
          const numPage = idx + 1;
          const viewport = page.getViewport({ scale: scale * dpr });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${viewport.width / dpr}px`;
          canvas.style.height = `${viewport.height / dpr}px`;
          canvas.style.marginBottom = `${PAGE_GAP}px`;
          // Centra el canvas cuando es más angosto que el contenedor y
          // permite que se desborde (scrolleable) cuando el zoom lo hace más
          // ancho: con `.digid-pdf__pages` en `align-items: stretch`, un
          // margen horizontal auto se resuelve a valores iguales cuando hay
          // espacio libre (mismo resultado visual que `align-items: center`)
          // y colapsa a 0 cuando el canvas desborda, permitiendo scroll.
          canvas.style.marginInline = 'auto';
          const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
          await page.render({ canvasContext: ctx, viewport }).promise;
          if (cancelled) return;
          pagesRef.current.appendChild(canvas);
          canvasesRef.current.push(canvas);
          rendered.push({ numPage, width: viewport.width / dpr, height: viewport.height / dpr });
        }

        containerRef.current.scrollTop = scrollRatio * containerRef.current.scrollHeight;

        setPages(rendered);
        setCurrentPage((p) => Math.min(Math.max(1, p), rendered.length || 1));
        onPagesRenderedRef.current?.(rendered);
      } catch (err) {
        console.error(err);
        if (!cancelled) setError('No fue posible cargar el documento PDF.');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, workerSrc, zoom]);

  // Actualiza la página actual mientras el usuario hace scroll manualmente
  // (throttle vía requestAnimationFrame para no recalcular en cada evento).
  useEffect(() => {
    if (!toolbar) return;
    const el = containerRef.current;
    if (!el) return;
    const handleScroll = () => {
      if (rafPendingRef.current) return;
      rafPendingRef.current = true;
      requestAnimationFrame(() => {
        rafPendingRef.current = false;
        setCurrentPage(pageAtScrollTop(pagesInfoRef.current, el.scrollTop));
      });
    };
    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, [toolbar]);

  function goToPage(target: number) {
    const numPages = pages.length || 1;
    const clamped = Math.max(1, Math.min(numPages, target));
    containerRef.current?.scrollTo({ top: pageOffset(pages, clamped), behavior: 'smooth' });
    setCurrentPage(clamped);
  }

  function commitPageInput() {
    const parsed = parseInt(pageInput, 10);
    if (Number.isNaN(parsed)) {
      setPageInput(String(currentPage));
      return;
    }
    goToPage(parsed);
  }

  if (error) return <p role="alert">{error}</p>;

  const numPages = pages.length;

  return (
    <>
      {toolbar && (
        <div className="digid-pdf-toolbar">
          <button
            type="button"
            aria-label={s.pdf.zoomOut}
            disabled={zoom <= ZOOM_MIN}
            onClick={() => setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))}
          >
            −
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            aria-label={s.pdf.zoomIn}
            disabled={zoom >= ZOOM_MAX}
            onClick={() => setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))}
          >
            +
          </button>
          <button type="button" aria-label={s.pdf.fitWidth} onClick={() => setZoom(1)}>
            {s.pdf.fitWidth}
          </button>
          <span className="digid-pdf-toolbar__sep" />
          <button
            type="button"
            aria-label={s.pdf.prevPage}
            disabled={currentPage <= 1}
            onClick={() => goToPage(currentPage - 1)}
          >
            ‹
          </button>
          <span>{s.pdf.page}</span>
          <input
            type="number"
            aria-label={s.pdf.page}
            value={pageInput}
            min={1}
            max={numPages || 1}
            onChange={(e) => setPageInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitPageInput();
            }}
            onBlur={commitPageInput}
          />
          <span>{s.pdf.pageOf(currentPage, numPages)}</span>
          <button
            type="button"
            aria-label={s.pdf.nextPage}
            disabled={numPages === 0 || currentPage >= numPages}
            onClick={() => goToPage(currentPage + 1)}
          >
            ›
          </button>
        </div>
      )}
      <div
        ref={containerRef}
        className={`digid-pdf${toolbar ? ' digid-pdf--with-toolbar' : ''}${className ? ` ${className}` : ''}`}
      >
        <div ref={pagesRef} data-testid="digid-pdf-pages" className="digid-pdf__pages">
          {children}
        </div>
      </div>
    </>
  );
}
