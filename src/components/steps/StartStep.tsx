import { useState } from 'react';
import { useFlow } from '../../core/FlowContext';
import { useStrings } from '../../i18n';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { PdfViewer } from '../pdf/PdfViewer';

export function StartStep() {
  const s = useStrings();
  const { state, dispatch, termsUrl, api } = useFlow();
  const data = state.startData!;
  const [accepted, setAccepted] = useState(false);
  const needsKyc =
    data.assignament.verifiacion_rostro === 1 ||
    data.assignament.verificacion_identificacion === 1;
  const [kycOpen, setKycOpen] = useState(needsKyc);

  const pdfUrl = api.fileUrl(`/storage/files/${data.client.id}/${data.document.archivo}`);
  const clientName = data.subAccount?.correo ?? data.client.razonsocial;

  return (
    <section aria-label={s.start.title}>
      <h1>{s.start.title}</h1>
      {/* React escapa estos strings: sin riesgo XSS aunque vengan del backend */}
      <p>{s.start.greeting(data.signatory.nombre, clientName, data.document.nombre)}</p>
      {data.diff_documents && <p role="alert">{data.diff_documents}</p>}

      <PdfViewer url={pdfUrl} />
      <a href={api.fileUrl(`/docments/verarchivo/${data.document.id}`)} target="_blank" rel="noopener noreferrer">
        {s.start.download}
      </a>

      <label>
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
        />{' '}
        <a href={termsUrl} target="_blank" rel="noopener noreferrer">{s.start.accept}</a>
      </label>

      <div className="digid-footer">
        <Button variant="secondary" onClick={() => dispatch({ type: 'EXIT', reason: 'user_exit' })}>
          {s.start.exit}
        </Button>
        <Button disabled={!accepted} onClick={() => dispatch({ type: 'NEXT' })}>
          {s.start.continue}
        </Button>
      </div>

      {kycOpen && (
        <Modal onClose={() => setKycOpen(false)} ariaLabel={s.start.kycNotice}>
          <p>{s.start.kycNotice}</p>
          <div className="digid-footer">
            <Button variant="secondary" onClick={() => dispatch({ type: 'EXIT', reason: 'user_exit' })}>
              {s.start.exit}
            </Button>
            <Button onClick={() => setKycOpen(false)}>{s.idCapture.continue}</Button>
          </div>
        </Modal>
      )}
    </section>
  );
}
