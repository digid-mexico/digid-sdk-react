import { useState } from 'react';
import { useFlow } from '../../core/FlowContext';
import { useStrings } from '../../i18n';
import { Button } from '../ui/Button';
import { Stepper } from '../ui/Stepper';
import { GuidedCameraCapture } from '../camera/GuidedCameraCapture';
import { ScanPreviewLayout } from '../scan/ScanPreviewLayout';
import { IconRetake } from '../scan/icons';
import { isMobileDevice } from '../../utils/device';

type Source =
  | { kind: 'none' }
  | { kind: 'existing'; base64: string }   // ya guardado en backend
  | { kind: 'camera'; dataUrl: string };

// La selfie es obligatoria por cámara (Task 27, sin alternativa de archivo):
// 'camera' abre directo, sin pantalla de instrucción previa; 'preview' es la
// imagen ya lista (existente o recién capturada) con el resumen del paso y
// el footer Regresar/Continuar del SDK.
type View = 'camera' | 'preview';

export function SelfieStep() {
  const s = useStrings();
  const { api, asignado, dispatch, notify, setBusy } = useFlow();
  const existing = asignado?.files.selfie;
  const [source, setSource] = useState<Source>(
    existing ? { kind: 'existing', base64: existing } : { kind: 'none' },
  );
  // Fast path: si el backend ya tiene el archivo, se salta la cámara y se va
  // directo a la vista de resumen; si no, la cámara abre de inmediato (sin
  // instrucción intermedia).
  const [view, setView] = useState<View>(existing ? 'preview' : 'camera');
  const [submitting, setSubmitting] = useState(false);

  // Envía la fuente indicada (o la actual del estado, vía submit()): recibe
  // la fuente explícita porque justo tras una captura de cámara el estado
  // `source` todavía no se actualizó (setState es asíncrono) y leerlo aquí
  // sería una clausura obsoleta (Task 26: un solo "Continuar" — la cámara
  // auto-confirma en vez de esperar un segundo click en este preview).
  async function submitSource(src: Source) {
    if (submitting) return; // guarda contra doble click/doble auto-envío
    if (src.kind === 'none') {
      notify('warning', s.idCapture.needPhoto);
      return;
    }
    setSubmitting(true);
    setBusy(true);
    try {
      if (src.kind === 'camera') {
        const idFirma = asignado?.firma?.id ?? 0;
        await api.saveFile({ step: 'selfie', idFirma, webCameraDataUrl: src.dataUrl });
      }
      dispatch({ type: 'NEXT' });
    } catch {
      notify('error', s.errors.generic);
      // Aterriza en el preview del paso (imagen conservada) para poder
      // reintentar con el botón Continuar, en vez de quedarse en la cámara.
      setView('preview');
    } finally {
      setBusy(false);
      setSubmitting(false);
    }
  }

  function submit() {
    return submitSource(source);
  }

  const previewSrc =
    source.kind === 'existing' ? `data:image/jpeg;base64,${source.base64}`
    : source.kind === 'camera' ? source.dataUrl
    : null;

  // Restaura la selfie ya guardada en el backend y vuelve al preview: usado
  // por el cancelar de la cámara cuando el paso ya tenía una imagen (Task
  // 26) — así un intento de captura fallido o cancelado no deja al firmante
  // sin poder continuar con la que ya tenía.
  function goToSavedPreview() {
    setSource({ kind: 'existing', base64: existing! });
    setView('preview');
  }

  // La cámara ocupa toda la sección (full-bleed, chrome navy propio con su
  // botón de cerrar): sin encabezado del SDK alrededor mientras está activa,
  // igual que DocScanCapture en IdCaptureStep (Task 23).
  if (view === 'camera') {
    return (
      <GuidedCameraCapture
        guide="face"
        detector="face-selfie"
        facingMode="user"
        chrome="scan"
        // mirror voltea horizontalmente el frame CAPTURADO (no solo el
        // preview), así que debe ser condicional al dispositivo, igual que
        // en IdCaptureStep: en desktop la webcam frontal se ve espejada por
        // convención (IsComputer() en el flujo legacy); en móvil la cámara
        // frontal ya se captura en la orientación correcta y no debe voltearse.
        mirror={!isMobileDevice()}
        // Sin pantalla de instrucción a la que volver (Task 27): con selfie
        // guardada, cancelar restaura ese preview; sin ella, retrocede al
        // paso anterior del flujo.
        onCancel={() => (existing ? goToSavedPreview() : dispatch({ type: 'BACK' }))}
        onCapture={(dataUrl) => {
          const captured: Source = { kind: 'camera', dataUrl };
          setSource(captured);
          notify('success', s.idCapture.captured);
          // Un solo "Continuar": el preview propio de la cámara ya fue la
          // revisión; aquí se envía directo.
          void submitSource(captured);
        }}
      />
    );
  }

  return (
    <section aria-label={s.selfie.title}>
      {/* Visible solo en escritorio (CSS lo oculta en móvil) */}
      <Stepper steps={s.steps} active={0} />
      {/* Preview unificado (Task 25/26): mismo layout/clases que el preview
          de captura fresca de DocScanCapture para las dos fuentes de imagen
          posibles (backend o cámara) — sin inventar métricas de calidad;
          aquí solo un check informativo según el origen. "Repetir captura"
          flota sobre la imagen y va directo a la cámara (sin instrucción);
          Continuar/Regresar viven en el footer estándar del paso. */}
      <ScanPreviewLayout
        eyebrow={s.scanUi.eyebrow}
        title={s.scanUi.preview.selfieTitle}
        subtitle={source.kind === 'existing' ? s.scanUi.preview.savedSubtitle : s.scanUi.preview.subcopy}
        imageSrc={previewSrc!}
        imageAlt="Selfie"
        imageOverlay={
          <button
            type="button"
            className="digid-scan__retake-btn"
            aria-label={s.scanUi.preview.repeat}
            onClick={() => setView('camera')}
          >
            <IconRetake />
          </button>
        }
        checklist={[
          {
            key: 'status',
            label: source.kind === 'existing' ? s.scanUi.preview.savedCheck : s.scanUi.preview.uploadedCheck,
          },
        ]}
      />

      <p>{s.idCapture.signatory}: {asignado?.nombre}</p>

      <div className="digid-footer">
        <Button variant="secondary" onClick={() => dispatch({ type: 'BACK' })}>
          {s.idCapture.back}
        </Button>
        <Button disabled={source.kind === 'none' || submitting} onClick={() => void submit()}>
          {s.idCapture.continue}
        </Button>
      </div>
    </section>
  );
}
