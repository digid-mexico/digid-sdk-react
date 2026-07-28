import { useEffect, useRef, useState } from 'react';
import { useFlow } from '../../core/FlowContext';
import { useStrings } from '../../i18n';
import { Button } from '../ui/Button';
import { ScanInstruction } from '../scan/ScanInstruction';
import { DocScanCapture } from '../scan/DocScanCapture';
import { ScanPreviewLayout } from '../scan/ScanPreviewLayout';
import { IconRetake } from '../scan/icons';
import { validateImageFile, normalizeToJpeg } from '../../utils/image';

type Source =
  | { kind: 'none' }
  | { kind: 'existing'; base64: string }   // ya guardado en backend
  | { kind: 'file'; file: File; previewUrl: string }
  | { kind: 'camera'; dataUrl: string };

// 'instruction': pantalla previa (Task 23) con recomendaciones + alternativa
// de subir archivo; 'camera': escáner de marco guiado (DocScanCapture,
// full-bleed); 'preview': imagen ya lista (existente, subida o escaneada) con
// el resumen del paso y el footer Regresar/Continuar del SDK.
type View = 'instruction' | 'camera' | 'preview';

export function IdCaptureStep({ side }: { side: 'front' | 'back' }) {
  const s = useStrings();
  const { api, asignado, dispatch, notify, setBusy } = useFlow();
  const inputRef = useRef<HTMLInputElement>(null);
  const existing = side === 'front' ? asignado?.files.idFront : asignado?.files.idBack;
  const [source, setSource] = useState<Source>(
    existing ? { kind: 'existing', base64: existing } : { kind: 'none' },
  );
  // Fast path: si el backend ya tiene el archivo, se salta la instrucción y
  // se va directo a la vista de resumen (igual que antes de Task 23).
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
        const step = side === 'front' ? 'ine_frente' : 'ine_reverso';
        const idFirma = asignado?.firma?.id ?? 0;
        if (src.kind === 'file') {
          // normalizeToJpeg quita EXIF y limita dimensiones; si falla (p.ej.
          // jsdom o un formato no soportado por createImageBitmap) se sube el
          // archivo original sin bloquear al usuario, pero se deja constancia
          // de que no se pudo re-codificar (EXIF, incl. GPS, no removido).
          const blob = await normalizeToJpeg(src.file).catch((err) => {
            console.warn(
              '[IdCaptureStep] No fue posible re-codificar la imagen; se sube el archivo ' +
                'original sin remover metadatos EXIF.',
              err,
            );
            return src.file;
          });
          await api.saveFile({ step, idFirma, file: blob });
        } else {
          await api.saveFile({ step, idFirma, webCameraDataUrl: src.dataUrl });
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

  // Restaura la imagen ya guardada en el backend y vuelve al preview: usado
  // por el cancelar de la cámara y el "Regresar" de la instrucción cuando el
  // paso ya tenía una imagen (Task 26) — así un intento de captura fallido o
  // cancelado no deja al firmante sin poder continuar con la que ya tenía.
  function goToSavedPreview() {
    setSource({ kind: 'existing', base64: existing! });
    setView('preview');
  }

  // El escáner ocupa toda la sección (full-bleed, chrome navy propio con su
  // botón de cerrar): sin encabezado del SDK alrededor mientras está activo,
  // igual que ocurría con GuidedCameraCapture antes de Task 23.
  if (view === 'camera') {
    return (
      <DocScanCapture
        side={side}
        onCancel={() => (existing ? goToSavedPreview() : setView('instruction'))}
        onCapture={(dataUrl) => {
          revokeCurrentObjectUrl();
          const captured: Source = { kind: 'camera', dataUrl };
          setSource(captured);
          notify('success', s.idCapture.captured);
          // Un solo "Continuar": el preview de DocScanCapture ya fue la
          // revisión (checklist/calidad); aquí se envía directo.
          void submitSource(captured);
        }}
      />
    );
  }

  return (
    <section aria-label={side === 'front' ? s.idCapture.frontTitle : s.idCapture.backTitle}>
      {view === 'instruction' ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) void pickFile(f);
          }}
        >
          <ScanInstruction
            side={side}
            onStart={() => setView('camera')}
            onBack={() => (existing ? goToSavedPreview() : dispatch({ type: 'BACK' }))}
            onUploadClick={() => inputRef.current?.click()}
          />
        </div>
      ) : (
        // Preview unificado (Task 25/26): mismo layout/clases que el preview
        // de captura fresca de DocScanCapture para las tres fuentes de
        // imagen (backend, archivo subido, escaneada) — sin inventar
        // métricas de calidad fuera del preview propio de DocScanCapture;
        // aquí solo un check informativo según el origen. "Repetir captura"
        // flota sobre la imagen; Continuar/Regresar viven en el footer
        // estándar del paso.
        <>
          <ScanPreviewLayout
            eyebrow={s.scanUi.eyebrow}
            title={side === 'back' ? s.scanUi.preview.backTitle : s.scanUi.preview.frontTitle}
            subtitle={source.kind === 'existing' ? s.scanUi.preview.savedSubtitle : s.scanUi.preview.subcopy}
            imageSrc={previewSrc!}
            imageAlt={`Identificación ${side === 'front' ? 'frontal' : 'reverso'}`}
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
