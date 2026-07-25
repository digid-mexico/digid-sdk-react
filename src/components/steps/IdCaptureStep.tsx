import { useRef, useState } from 'react';
import { useFlow } from '../../core/FlowContext';
import { useStrings } from '../../i18n';
import { Button } from '../ui/Button';
import { Stepper } from '../ui/Stepper';
import { CameraCapture } from '../camera/CameraCapture';
import { validateImageFile, normalizeToJpeg } from '../../utils/image';
import { isMobileDevice } from '../../utils/device';

type Source =
  | { kind: 'none' }
  | { kind: 'existing'; base64: string }   // ya guardado en backend
  | { kind: 'file'; file: File; previewUrl: string }
  | { kind: 'camera'; dataUrl: string };

export function IdCaptureStep({ side }: { side: 'front' | 'back' }) {
  const s = useStrings();
  const { api, asignado, dispatch, notify, setBusy } = useFlow();
  const inputRef = useRef<HTMLInputElement>(null);
  const existing = side === 'front' ? asignado?.files.idFront : asignado?.files.idBack;
  const [source, setSource] = useState<Source>(
    existing ? { kind: 'existing', base64: existing } : { kind: 'none' },
  );
  const [cameraOpen, setCameraOpen] = useState(!existing && isMobileDevice());

  async function pickFile(file: File) {
    try {
      await validateImageFile(file);
      setSource({ kind: 'file', file, previewUrl: URL.createObjectURL(file) });
    } catch (e) {
      notify('error', e instanceof Error ? e.message : s.errors.generic);
    }
  }

  async function submit() {
    if (source.kind === 'none') {
      notify('warning', s.idCapture.needPhoto);
      return;
    }
    setBusy(true);
    try {
      if (source.kind !== 'existing') {
        const step = side === 'front' ? 'ine_frente' : 'ine_reverso';
        const idFirma = asignado?.firma?.id ?? 0;
        if (source.kind === 'file') {
          // normalizeToJpeg quita EXIF y limita dimensiones; fallback al archivo original
          const blob = await normalizeToJpeg(source.file).catch(() => source.file);
          await api.saveFile({ step, idFirma, file: blob });
        } else {
          await api.saveFile({ step, idFirma, webCameraDataUrl: source.dataUrl });
        }
      }
      dispatch({ type: 'NEXT' });
    } catch {
      notify('error', s.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  const previewSrc =
    source.kind === 'existing' ? `data:image/jpeg;base64,${source.base64}`
    : source.kind === 'file' ? source.previewUrl
    : source.kind === 'camera' ? source.dataUrl
    : null;

  return (
    <section aria-label={side === 'front' ? s.idCapture.frontTitle : s.idCapture.backTitle}>
      <h1>{side === 'front' ? s.idCapture.frontTitle : s.idCapture.backTitle}</h1>
      <Stepper steps={s.steps} active={0} />
      <p>{side === 'front' ? s.idCapture.frontHint : s.idCapture.backHint}</p>
      <p>{s.idCapture.legible}</p>

      {cameraOpen ? (
        <CameraCapture
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
          <img src={previewSrc} alt={`Identificación ${side === 'front' ? 'frontal' : 'reverso'}`} />
          <Button variant="secondary" aria-label="Cambiar foto"
            onClick={() => { setSource({ kind: 'none' }); if (isMobileDevice()) setCameraOpen(true); }}>
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
        <Button disabled={source.kind === 'none'} onClick={() => void submit()}>
          {s.idCapture.continue}
        </Button>
      </div>
    </section>
  );
}
