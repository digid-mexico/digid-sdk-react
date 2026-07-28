import { useEffect, useRef, useState } from 'react';
import { useFlow } from '../../core/FlowContext';
import { useStrings } from '../../i18n';
import { Button } from '../ui/Button';
import { Stepper } from '../ui/Stepper';
import { GuidedCameraCapture } from '../camera/GuidedCameraCapture';
import { validateImageFile, normalizeToJpeg } from '../../utils/image';
import { isMobileDevice } from '../../utils/device';

type Source =
  | { kind: 'none' }
  | { kind: 'existing'; base64: string }   // ya guardado en backend
  | { kind: 'file'; file: File; previewUrl: string }
  | { kind: 'camera'; dataUrl: string };

export function SelfieStep() {
  const s = useStrings();
  const { api, asignado, dispatch, notify, setBusy } = useFlow();
  const inputRef = useRef<HTMLInputElement>(null);
  const existing = asignado?.files.selfie;
  const [source, setSource] = useState<Source>(
    existing ? { kind: 'existing', base64: existing } : { kind: 'none' },
  );
  const [cameraOpen, setCameraOpen] = useState(!existing && isMobileDevice());
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
    } catch (e) {
      notify('error', e instanceof Error ? e.message : s.errors.generic);
    }
  }

  async function submit() {
    if (submitting) return; // guarda contra doble click durante un envío en curso
    if (source.kind === 'none') {
      notify('warning', s.idCapture.needPhoto);
      return;
    }
    setSubmitting(true);
    setBusy(true);
    try {
      if (source.kind !== 'existing') {
        const idFirma = asignado?.firma?.id ?? 0;
        if (source.kind === 'file') {
          // normalizeToJpeg quita EXIF y limita dimensiones; si falla (p.ej.
          // jsdom o un formato no soportado por createImageBitmap) se sube el
          // archivo original sin bloquear al usuario, pero se deja constancia
          // de que no se pudo re-codificar (EXIF, incl. GPS, no removido).
          const blob = await normalizeToJpeg(source.file).catch((err) => {
            console.warn(
              '[SelfieStep] No fue posible re-codificar la imagen; se sube el archivo ' +
                'original sin remover metadatos EXIF.',
              err,
            );
            return source.file;
          });
          await api.saveFile({ step: 'selfie', idFirma, file: blob });
        } else {
          await api.saveFile({ step: 'selfie', idFirma, webCameraDataUrl: source.dataUrl });
        }
      }
      dispatch({ type: 'NEXT' });
    } catch {
      notify('error', s.errors.generic);
    } finally {
      setBusy(false);
      setSubmitting(false);
    }
  }

  const previewSrc =
    source.kind === 'existing' ? `data:image/jpeg;base64,${source.base64}`
    : source.kind === 'file' ? source.previewUrl
    : source.kind === 'camera' ? source.dataUrl
    : null;

  return (
    <section aria-label={s.selfie.title}>
      <h1>{s.selfie.title}</h1>
      <Stepper steps={s.steps} active={0} />
      <p>{s.selfie.hint}</p>
      <p>{s.selfie.legible}</p>

      {cameraOpen ? (
        <GuidedCameraCapture
          guide="face"
          detector="face-selfie"
          facingMode="user"
          // mirror voltea horizontalmente el frame CAPTURADO (no solo el
          // preview), así que debe ser condicional al dispositivo, igual que
          // en IdCaptureStep: en desktop la webcam frontal se ve espejada por
          // convención (IsComputer() en el flujo legacy); en móvil la cámara
          // frontal ya se captura en la orientación correcta y no debe voltearse.
          mirror={!isMobileDevice()}
          onCancel={() => setCameraOpen(false)}
          onCapture={(dataUrl) => {
            setSource({ kind: 'camera', dataUrl });
            setCameraOpen(false);
            notify('success', s.idCapture.captured);
          }}
        />
      ) : previewSrc ? (
        <div>
          <img src={previewSrc} alt="Selfie" />
          <Button variant="secondary" aria-label="Cambiar foto"
            onClick={() => {
              revokeCurrentObjectUrl();
              setSource({ kind: 'none' });
              if (isMobileDevice()) setCameraOpen(true);
            }}>
            ✕
          </Button>
        </div>
      ) : (
        <div
          className="digid-upload"
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) void pickFile(f);
          }}
        >
          <p>{s.idCapture.dropHere}</p>
          <p>{s.idCapture.formats}</p>
          <button type="button" onClick={(e) => { e.stopPropagation(); setCameraOpen(true); }}>
            {s.idCapture.openCamera}
          </button>
        </div>
      )}
      <input
        ref={inputRef}
        data-testid="digid-file-input"
        type="file"
        accept="image/png,image/jpeg"
        hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickFile(f); e.target.value = ''; }}
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
