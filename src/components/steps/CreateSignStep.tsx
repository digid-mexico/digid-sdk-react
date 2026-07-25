import { useRef, useState } from 'react';
import { useFlow } from '../../core/FlowContext';
import { useStrings } from '../../i18n';
import { Button } from '../ui/Button';
import { Stepper } from '../ui/Stepper';
import { SignaturePad, type SignaturePadHandle } from '../signature/SignaturePad';

export function CreateSignStep() {
  const s = useStrings();
  const { api, asignado, dispatch, notify, setBusy } = useFlow();
  const padRef = useRef<SignaturePadHandle | null>(null);
  const existing = asignado?.files.sign ?? null;
  const [dirty, setDirty] = useState(false);
  const [useExisting, setUseExisting] = useState(existing != null);
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [strokeColor, setStrokeColor] = useState('#000000');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (submitting) return; // guarda contra doble click durante un envío en curso
    if (!dirty && !useExisting) {
      notify('warning', s.createSign.needSign);
      return;
    }
    setSubmitting(true);
    setBusy(true);
    try {
      if (!useExisting) {
        await api.saveFile({
          step: 'firma',
          idFirma: asignado?.firma?.id ?? 0,
          webCameraDataUrl: padRef.current!.toDataURL(),
        });
      }
      dispatch({ type: 'NEXT' });
    } catch {
      notify('error', s.errors.generic);
    } finally {
      setBusy(false);
      setSubmitting(false);
    }
  }

  return (
    <section aria-label={s.createSign.title}>
      <h1>{s.createSign.title}</h1>
      <Stepper steps={s.steps} active={1} />
      <p>{s.createSign.heading}</p>
      <p>{s.createSign.hint}</p>

      {useExisting && existing ? (
        <img src={`data:image/jpeg;base64,${existing}`} alt="Mi firma" />
      ) : (
        <SignaturePad
          padRef={padRef}
          strokeColor={strokeColor}
          strokeWidth={strokeWidth}
          onDirtyChange={setDirty}
        />
      )}

      <div className="digid-footer">
        <Button variant="secondary" disabled={!dirty && !useExisting}
          onClick={() => { padRef.current?.clear(); setUseExisting(false); }}>
          {s.createSign.clear}
        </Button>
        <label>
          {s.createSign.stroke}
          <input type="range" min={1} max={5} value={strokeWidth}
            onChange={(e) => setStrokeWidth(Number(e.target.value))} />
        </label>
        <input type="color" value={strokeColor} aria-label="Color de firma"
          onChange={(e) => setStrokeColor(e.target.value)} />
      </div>

      <div className="digid-footer">
        <Button variant="secondary" onClick={() => dispatch({ type: 'BACK' })}>
          {s.idCapture.back}
        </Button>
        <Button disabled={(!dirty && !useExisting) || submitting} onClick={() => void submit()}>
          {s.idCapture.continue}
        </Button>
      </div>
    </section>
  );
}
