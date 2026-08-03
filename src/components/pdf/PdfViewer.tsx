import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { useStrings } from '../../i18n';

export interface PageInfo {
  numPage: number;
  width: number; // px CSS renderizados
  height: number;
  /**
   * Dimensiones físicas de la página (viewport de pdf.js a scale 1, en
   * puntos PDF: 1pt = 25.4/72 mm). A diferencia de `width`/`height`, NO
   * cambian con el zoom — se usan para calcular el tamaño del overlay de
   * firma en css px de forma que corresponda exactamente al rectángulo
   * físico (37×24mm) que el backend estampa en el PDF final.
   */
  widthPt: number;
  heightPt: number;
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

// Well-known path del worker autoalojado: scan-assets/ ya lo incluye (Task 27,
// pineado a la versión de pdfjs-dist en package.json — actualizar el archivo
// copiado si se sube esa dependencia), y los integradores ya sirven esa
// carpeta en /digid-scan/ para el escáner de INE.
const FALLBACK_WORKER_SRC = '/digid-scan/pdf.worker.min.mjs';

/** Cómo se resolvió GlobalWorkerOptions.workerSrc; ver configureWorker. */
type WorkerResolution = 'prop' | 'preexisting' | 'auto' | 'fallback';

/**
 * Configura pdfjs.GlobalWorkerOptions.workerSrc, en orden de prioridad:
 * 1. La prop `workerSrc` explícita.
 * 2. Un valor ya configurado por el consumidor (p.ej. de forma global).
 * 3. Resolución automática vía `import.meta.url` (solo funciona en ESM). Esta
 *    URL puede CONSTRUIRSE bien y aun así apuntar a un 404 en runtime —
 *    Vite/esbuild no la reescribe al pre-empaquetar — así que el llamador
 *    reintenta con el fallback si `getDocument` falla (ver efecto A).
 * 4. Fallback final si la construcción de la URL en sí falla (CJS): FALLBACK_WORKER_SRC.
 */
function configureWorker(pdfjs: typeof import('pdfjs-dist'), workerSrc?: string): WorkerResolution {
  if (workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
    return 'prop';
  }
  if (pdfjs.GlobalWorkerOptions.workerSrc) {
    return 'preexisting';
  }
  try {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();
    return 'auto';
  } catch {
    // esbuild reemplaza `import.meta` por `{}` en el build .cjs, así que esto
    // siempre falla para consumidores CJS. Sin prop ni configuración previa,
    // usa el worker que scan-assets/ ya publica en el propio origen.
    pdfjs.GlobalWorkerOptions.workerSrc = FALLBACK_WORKER_SRC;
    return 'fallback';
  }
}

/**
 * Icono "ajustar al ancho": dos topes verticales y una flecha doble entre
 * ellos. Va como icono y no como texto porque el botón del toolbar mide 32px
 * (regla compartida con los demás) y la etiqueta se desbordaba. El nombre
 * accesible lo sigue dando el aria-label del botón, de ahí el aria-hidden.
 */
function IconFitWidth() {
  return (
    <svg
      viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor"
      strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      <path d="M4 5.5v13M20 5.5v13" />
      <path d="M7.5 12h9" />
      <path d="M10 9.5 7.5 12l2.5 2.5M14 9.5l2.5 2.5-2.5 2.5" />
    </svg>
  );
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

/** Dimensiones físicas de una página a scale 1 (puntos PDF), zoom-independientes. */
interface PagePt { widthPt: number; heightPt: number }

/** Documento + páginas ya descargados y parseados, listos para renderizar a cualquier escala. */
interface LoadedDoc {
  pdfPages: PDFPageProxy[];
  maxWidth: number; // ancho (scale 1) de la página más ancha, para calcular la escala de ajuste
  pagesPt: PagePt[]; // dimensiones físicas (scale 1) por página, mismo orden que pdfPages
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
  const pageInputFocusedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [loadedDoc, setLoadedDoc] = useState<LoadedDoc | null>(null);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');

  useEffect(() => {
    onPagesRenderedRef.current = onPagesRendered;
  });

  useEffect(() => {
    pagesInfoRef.current = pages;
  }, [pages]);

  // No pisa lo que el usuario está escribiendo: si el input de página tiene
  // foco, un cambio de currentPage disparado por el scroll no debe
  // reemplazar el valor que está tecleando.
  useEffect(() => {
    if (pageInputFocusedRef.current) return;
    setPageInput(String(currentPage));
  }, [currentPage]);

  // Efecto A: descarga y parsea el documento UNA SOLA VEZ por `url`/`workerSrc`.
  // Deliberadamente NO depende de `zoom`: cambiar el zoom nunca debe volver a
  // pedir el documento (getDocument) ni sus páginas (getPage) — eso sería un
  // re-fetch + re-parse completo por cada click de zoom. El resultado
  // (PDFPageProxy[] ya obtenidos) se cachea en `loadedDoc` y el efecto B lo
  // reutiliza para renderizar a distintas escalas.
  useEffect(() => {
    let cancelled = false;
    let doc: PDFDocumentProxy | null = null;
    setLoadedDoc(null);
    (async () => {
      try {
        // Dynamic import: pdfjs (~350KB) solo se descarga cuando se muestra un PDF.
        const pdfjs = await import('pdfjs-dist');
        const resolution = configureWorker(pdfjs, workerSrc);
        let pdf: PDFDocumentProxy;
        try {
          pdf = await pdfjs.getDocument({ url }).promise;
        } catch (err) {
          // La URL auto-resuelta puede construirse bien y aun así 404 en
          // runtime (Vite/esbuild no la reescribe al pre-empaquetar): un solo
          // reintento con el fallback de scan-assets/ antes de rendirse.
          if (resolution !== 'auto' || cancelled) throw err;
          pdfjs.GlobalWorkerOptions.workerSrc = FALLBACK_WORKER_SRC;
          pdf = await pdfjs.getDocument({ url }).promise;
        }
        if (cancelled) {
          pdf.destroy?.();
          return;
        }
        doc = pdf;

        const pdfPages: PDFPageProxy[] = [];
        const pagesPt: PagePt[] = [];
        let maxWidth = 0;
        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled) return;
          const page = await pdf.getPage(i);
          pdfPages.push(page);
          const vp = page.getViewport({ scale: 1 });
          pagesPt.push({ widthPt: vp.width, heightPt: vp.height });
          maxWidth = Math.max(maxWidth, vp.width);
        }
        if (cancelled) return;
        setLoadedDoc({ pdfPages, maxWidth, pagesPt });
      } catch (err) {
        console.error(err);
        if (!cancelled) setError('No fue posible cargar el documento PDF.');
      }
    })();
    return () => {
      cancelled = true;
      // El mock de pdfjs-dist usado en tests no implementa destroy(); en
      // producción libera los recursos del documento anterior al cambiar de url.
      doc?.destroy?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, workerSrc]);

  // Efecto B: renderiza los canvases a partir de los PDFPageProxy YA
  // CARGADOS por el efecto A. Depende de `zoom`, así que subir/bajar el zoom
  // solo recalcula la escala y vuelve a dibujar — nunca re-descarga el PDF.
  useEffect(() => {
    if (!loadedDoc || !pagesRef.current || !containerRef.current) return;
    let cancelled = false;
    (async () => {
      const container = containerRef.current;
      const pagesEl = pagesRef.current;
      if (!container || !pagesEl) return;

      // Preserva la posición relativa del scroll a través del re-render
      // (se dispara también cuando cambia el zoom, no solo al cargar un PDF
      // nuevo): captura la proporción ANTES de tocar el DOM.
      const scrollRatio = container.scrollHeight > 0
        ? container.scrollTop / container.scrollHeight
        : 0;

      // limpia solo los canvas que este componente agregó, nunca los
      // overlays de React (children) que pudieran compartir el contenedor.
      canvasesRef.current.forEach((c) => c.remove());
      canvasesRef.current = [];

      // Escala: ancho del contenedor / página más ancha, multiplicado por
      // el zoom del toolbar (1 si no hay toolbar).
      const { pdfPages, maxWidth, pagesPt } = loadedDoc;
      const scale = ((container.clientWidth || maxWidth) / maxWidth) * zoom;
      const dpr = Math.max(1.5, window.devicePixelRatio || 1);

      const rendered: PageInfo[] = [];
      for (const [idx, page] of pdfPages.entries()) {
        if (cancelled) return;
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
        // eslint-disable-next-line no-await-in-loop
        await page.render({ canvasContext: ctx, viewport }).promise;
        if (cancelled) return;
        pagesEl.appendChild(canvas);
        canvasesRef.current.push(canvas);
        const pt = pagesPt[idx];
        rendered.push({
          numPage,
          width: viewport.width / dpr,
          height: viewport.height / dpr,
          widthPt: pt?.widthPt ?? 0,
          heightPt: pt?.heightPt ?? 0,
        });
      }

      container.scrollTop = scrollRatio * container.scrollHeight;

      setPages(rendered);
      setCurrentPage((p) => Math.min(Math.max(1, p), rendered.length || 1));
      onPagesRenderedRef.current?.(rendered);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadedDoc, zoom]);

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
          <button type="button" aria-label={s.pdf.fitWidth} title={s.pdf.fitWidth} onClick={() => setZoom(1)}>
            <IconFitWidth />
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
            onFocus={() => { pageInputFocusedRef.current = true; }}
            onChange={(e) => setPageInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitPageInput();
            }}
            onBlur={() => {
              pageInputFocusedRef.current = false;
              commitPageInput();
            }}
          />
          <span>{s.pdf.pageOf(numPages)}</span>
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
