import { useEffect, useMemo, useRef, useState } from 'react';
import { useFlow } from '../../core/FlowContext';
import { useStrings } from '../../i18n';
import { Button } from '../ui/Button';
import { Stepper } from '../ui/Stepper';
import { PdfViewer, type PageInfo } from '../pdf/PdfViewer';
import {
  computeOverlayRect, parseCoordinates, type OverlayRect,
} from './placeSignatures.logic';

export function PlaceSignaturesStep() {
  const s = useStrings();
  const { api, state, dispatch, notify, setBusy, pdfWorkerUrl } = useFlow();
  const data = state.startData!;
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [placed, setPlaced] = useState(0); // firmas confirmadas
  const [submitting, setSubmitting] = useState(false);
  const containerRef = useRef<HTMLElement | null>(null);
  const gpsRef = useRef<string | null>(null);

  const coords = useMemo(
    () => parseCoordinates(data.document.firmas, data.assignament.idfirmante),
    [data],
  );
  const signImgUrl = api.signatureImageUrl();

  // GPS solo si el cliente lo exige (preferencias del backend); gps null es aceptado
  useEffect(() => {
    if (data.preferences?.required_gps === 1 && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        gpsRef.current = `Latitude: ${pos.coords.latitude} Longitude: ${pos.coords.longitude}`;
      }, () => { /* opcional */ });
    }
  }, [data]);

  const overlays: (OverlayRect & { id: string })[] = useMemo(() => {
    if (pages.length === 0) return [];
    // Medir el mismo elemento que PdfViewer usa para escalar sus páginas
    // (.digid-pdf), no el <section> exterior: .digid-pdf pierde ancho frente
    // a su scrollbar vertical cuando el documento no cabe completo, y usar
    // el ancho del <section> desalinearía el margen de centrado de los
    // overlays respecto al de las páginas renderizadas.
    // `||` (no `??`): clientWidth 0 (jsdom, contenedor oculto) también debe
    // caer al fallback de pages[0].width.
    const width = containerRef.current?.querySelector('.digid-pdf')?.clientWidth
      || pages[0]!.width;
    return coords
      .slice(0, Math.min(placed + 1, coords.length)) // confirmadas + la actual en preview
      .map((c) => {
        const rect = computeOverlayRect(c, pages, width);
        return rect ? { ...rect, id: c.id } : null;
      })
      .filter((r): r is OverlayRect & { id: string } => r !== null);
  }, [coords, pages, placed]);

  // Auto-scroll a la firma activa (comportamiento de firmar.js)
  useEffect(() => {
    const current = overlays[overlays.length - 1];
    const scroller = containerRef.current?.querySelector('.digid-pdf');
    if (current && scroller) scroller.scrollTo({ top: current.y - 50, behavior: 'smooth' });
  }, [overlays]);

  async function confirmNext() {
    if (submitting) return;
    if (placed + 1 < coords.length) {
      setPlaced(placed + 1);
      return;
    }
    // Última firma confirmada → finalizar proceso (igual que firmar.js:sendData)
    setSubmitting(true);
    setBusy(true);
    try {
      const res = await api.finishAutografa(gpsRef.current);
      if (res.Success) dispatch({ type: 'NEXT' });
      else notify('error', s.errors.generic);
    } catch {
      notify('error', s.errors.generic);
    } finally {
      setBusy(false);
      setSubmitting(false);
    }
  }

  const label = coords.length > 0
    ? s.placeSignatures.signCount(Math.min(placed + 1, coords.length), coords.length)
    : s.placeSignatures.continue;

  return (
    <section aria-label={s.placeSignatures.title} ref={containerRef}>
      <h1>{s.placeSignatures.title}</h1>
      <Stepper steps={s.steps} active={2} />
      <ul>
        <li>{s.placeSignatures.instructions1}</li>
        <li>{s.placeSignatures.instructions2}</li>
      </ul>

      <PdfViewer
        url={api.documentPdfUrl()}
        onPagesRendered={setPages}
        workerSrc={pdfWorkerUrl}
      >
        {overlays.map((o) => (
          <div
            key={o.id}
            className="digid-sign-overlay"
            // Tamaño adaptativo: el backend estampa la imagen de firma a un
            // tamaño FIJO de 37×24mm físicos sobre el PDF final (FPDI/FPDF,
            // ver SignatureNotificationService). `computeOverlayRect` convierte
            // esos 37×24mm a css px usando las dimensiones físicas reales de
            // la página (PageInfo.widthPt/heightPt), así que este overlay
            // siempre coincide con lo que terminará impreso, sin importar el
            // tamaño de página, el zoom o el ancho del contenedor.
            style={{
              top: o.y, left: o.x, width: o.width, height: o.height,
              transform: o.rotation ? `rotate(${o.rotation}deg)` : undefined,
            }}
          >
            <img src={signImgUrl} alt="Firma" />
          </div>
        ))}
      </PdfViewer>

      <div className="digid-footer">
        <Button variant="secondary" onClick={() => dispatch({ type: 'BACK' })}>
          {s.idCapture.back}
        </Button>
        <Button onClick={() => void confirmNext()} disabled={pages.length === 0 || submitting}>
          {label}
        </Button>
      </div>
    </section>
  );
}
