// Pantalla de instrucción previa a la cámara de selfie (Task 24). Mismo
// esqueleto que ScanInstruction.tsx (Task 23: eyebrow + título + subcopy +
// tarjeta de recomendaciones + aviso de privacidad + footer Regresar/Iniciar
// + enlace de subir archivo), pero con el óvalo biométrico animado
// (BioOvalIcon, port de LivenessIntro.jsx del prototipo KYC) en vez de la
// ilustración de INE, y SIN el copy de "prueba de vida"/AWS Face Liveness:
// el SDK solo hace detección de rostro en el dispositivo para encuadrar la
// captura (una foto), no una verificación de vida en servidor — ver nota en
// GUIA-INTEGRACION.md sección 1.1.
import { useStrings } from '../../i18n';
import { Button } from '../ui/Button';
import { BioOvalIcon } from './icons';

interface Props {
  onStart: () => void;
  onBack: () => void;
  onUploadClick: () => void;
}

export function SelfieInstruction({ onStart, onBack, onUploadClick }: Props) {
  const s = useStrings();
  const t = s.scanUi.selfie;

  return (
    <div className="digid-scan__instruction">
      <BioOvalIcon />
      <p className="digid-scan__eyebrow">{s.scanUi.eyebrow}</p>
      <h1>{t.title}</h1>
      <p className="digid-scan__subcopy">{t.hint}</p>
      <ul className="digid-scan__tips-card">
        <li className="digid-scan__tips-card-title">{t.tipsTitle}</li>
        <li>
          <span className="digid-scan__mini-check" aria-hidden="true">☼</span>
          <span>{t.tipLight}</span>
        </li>
        <li>
          <span className="digid-scan__mini-check" aria-hidden="true">◌</span>
          <span>{t.tipUncovered}</span>
        </li>
        <li>
          <span className="digid-scan__mini-check" aria-hidden="true">◎</span>
          <span>{t.tipCenter}</span>
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
