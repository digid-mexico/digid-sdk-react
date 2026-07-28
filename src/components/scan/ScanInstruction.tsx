// Pantalla de instrucción previa al escaneo (una por lado). Port de
// Instruction.jsx (prototipo KYC) SIN el checkbox de términos y condiciones:
// el SDK ya los gates en la revisión del documento (StartStep), así que
// pedirlos de nuevo aquí sería redundante. Mantiene la alternativa de subir
// archivo (onUploadClick), que IdCaptureStep conecta a su <input type=file>
// existente para no duplicar la validación/normalización de imagen.
import { useStrings } from '../../i18n';
import { Button } from '../ui/Button';
import { IneFrontIcon, IneBackIcon } from './icons';

interface Props {
  side: 'front' | 'back';
  onStart: () => void;
  onBack: () => void;
  onUploadClick: () => void;
}

export function ScanInstruction({ side, onStart, onBack, onUploadClick }: Props) {
  const s = useStrings();
  const t = s.scanUi.instruction;
  const isBack = side === 'back';

  return (
    <div className="digid-scan__instruction">
      {isBack ? <IneBackIcon /> : <IneFrontIcon />}
      <p className="digid-scan__eyebrow">{s.scanUi.eyebrow}</p>
      <h1>{isBack ? t.backTitle : t.frontTitle}</h1>
      <p className="digid-scan__subcopy">{isBack ? t.backHint : t.frontHint}</p>
      <ul className="digid-scan__tips-card">
        <li className="digid-scan__tips-card-title">{t.tipsTitle}</li>
        <li>
          <span className="digid-scan__mini-check" aria-hidden="true">☼</span>
          <span>{t.tipLight}</span>
        </li>
        <li>
          <span className="digid-scan__mini-check" aria-hidden="true">◌</span>
          <span>{t.tipGlare}</span>
        </li>
        <li>
          <span className="digid-scan__mini-check" aria-hidden="true">▱</span>
          <span>{t.tipComplete}</span>
        </li>
      </ul>
      <div className="digid-scan__privacy">
        <span className="digid-scan__mini-check" aria-hidden="true">⌂</span>
        <span>{t.privacy}</span>
      </div>
      <div className="digid-footer">
        <Button variant="secondary" onClick={onBack}>
          {t.back}
        </Button>
        <Button onClick={onStart}>{t.start}</Button>
      </div>
      <button type="button" className="digid-scan__upload-link" onClick={onUploadClick}>
        {t.uploadLink}
      </button>
    </div>
  );
}
