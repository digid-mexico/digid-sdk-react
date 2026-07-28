import { useEffect, useRef, useState } from 'react';
import { useFlow } from '../../core/FlowContext';
import { useStrings } from '../../i18n';
import { Button } from '../ui/Button';
import { Stepper } from '../ui/Stepper';
import { GuidedCameraCapture } from '../camera/GuidedCameraCapture';
import { SelfieInstruction } from '../scan/SelfieInstruction';
import { ScanPreviewLayout } from '../scan/ScanPreviewLayout';
import { IconRetake } from '../scan/icons';
import { validateImageFile, normalizeToJpeg } from '../../utils/image';
import { isMobileDevice } from '../../utils/device';

type Source =
  | { kind: 'none' }
  | { kind: 'existing'; base64: string }   // ya guardado en backend
  | { kind: 'file'; file: File; previewUrl: string }
  | { kind: 'camera'; dataUrl: string };

// 'instruction': pantalla previa (Task 24, unifica con IdCaptureStep/Task 23)
// con recomendaciones + alternativa de subir archivo; 'camera': captura
// guiada full-bleed con el chrome del escáner (óvalo + obturador aqua);
// 'preview': imagen ya lista (existente, subida o de cámara) con el resumen
// del paso y el footer Regresar/Continuar del SDK.
type View = 'instruction' | 'camera' | 'preview';

export function SelfieStep() {
  const s = useStrings();
  const { api, asignado, dispatch, notify, setBusy } = useFlow();
  const inputRef = useRef<HTMLInputElement>(null);
  const existing = asignado?.files.selfie;
  const [source, setSource] = useState<Source>(
    existing ? { kind: 'existing', base64: existing } : { kind: 'none' },
  );
  // Fast path: si el backend ya tiene el archivo, se salta la instrucción y
  // se va directo a la vista de resumen (igual que IdCaptureStep tras Task 23).
  const [view, setView] = useState<View>(existing ? 'preview' : 'instruction');
  const [submitting, setSubmitting] = useState(false);
  // rastrea el object URL vigente (si lo hay) para poder revocarlo cuando se
  // reemplaza o descarta la selección, y también al desmontar.
  const objectUrlRef = useRef<string | null>(null);

  function revokeCurrentObjectUrl() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }

  useEffect(() => () => revokeCurrentObjectUrl(), []);

  async function pickFile(file: File) {
    try {
      await validateImageFile(file);
      revokeCurrentObjectUrl();
      const previewUrl = URL.createObjectURL(file);
      objectUrlRef.current = previewUrl;
      setSource({ kind: 'file', file, previewUrl });
      setView('preview');
    } catch (e) {
      notify('error', e instanceof Error ? e.message : s.errors.generic);
    }
  }

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
      if (src.kind !== 'existing') {
        const idFirma = asignado?.firma?.id ?? 0;
        if (src.kind === 'file') {
          // normalizeToJpeg quita EXIF y limita dimensiones; si falla (p.ej.
          // jsdom o un formato no soportado por createImageBitmap) se sube el
          // archivo original sin bloquear al usuario, pero se deja constancia
          // de que no se pudo re-codificar (EXIF, incl. GPS, no removido).
          const blob = await normalizeToJpeg(src.file).catch((err) => {
            console.warn(
              '[SelfieStep] No fue posible re-codificar la imagen; se sube el archivo ' +
                'original sin remover metadatos EXIF.',
              err,
            );
            return src.file;
          });
          await api.saveFile({ step: 'selfie', idFirma, file: blob });
        } else {
          await api.saveFile({ step: 'selfie', idFirma, webCameraDataUrl: src.dataUrl });
        }
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
    : source.kind === 'file' ? source.previewUrl
    : source.kind === 'camera' ? source.dataUrl
    : null;

  // Restaura la selfie ya guardada en el backend y vuelve al preview: usado
  // por el cancelar de la cámara y el "Regresar" de la instrucción cuando el
  // paso ya tenía una imagen (Task 26) — así un intento de captura fallido o
  // cancelado no deja al firmante sin poder continuar con la que ya tenía.
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
        onCancel={() => (existing ? goToSavedPreview() : setView('instruction'))}
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
      {view === 'instruction' ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) void pickFile(f);
          }}
        >
          <SelfieInstruction
            onStart={() => setView('camera')}
            onBack={() => (existing ? goToSavedPreview() : dispatch({ type: 'BACK' }))}
            onUploadClick={() => inputRef.current?.click()}
          />
        </div>
      ) : (
        // Preview unificado (Task 25/26): mismo layout/clases que el preview
        // de captura fresca de DocScanCapture para las tres fuentes de
        // imagen (backend, archivo subido, cámara) — sin inventar métricas
        // de calidad; aquí solo un check informativo según el origen.
        // "Repetir captura" flota sobre la imagen; Continuar/Regresar viven
        // en el footer estándar del paso.
        <>
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
                onClick={() => {
                  revokeCurrentObjectUrl();
                  setSource({ kind: 'none' });
                  setView('instruction');
                }}
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
        </>
      )}

      <input
        ref={inputRef}
        data-testid="digid-file-input"
        type="file"
        accept="image/png,image/jpeg"
        hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickFile(f); e.target.value = ''; }}
      />
    </section>
  );
}
