// Bottom sheet de consejos de captura, invocado por el botón "?" de
// DocScanCapture. Port de .tips-sheet/.sheet-veil (Camera.jsx, prototipo
// KYC), renombrado digid-scan__*.
import { useStrings } from '../../i18n';
import { IconSun, IconSurface, IconFrame, IconSteady } from './icons';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ScanTipsSheet({ open, onClose }: Props) {
  const s = useStrings().scanUi.camera;
  const tips = [
    { Icon: IconSun, title: s.tipSun.title, text: s.tipSun.text },
    { Icon: IconSurface, title: s.tipSurface.title, text: s.tipSurface.text },
    { Icon: IconFrame, title: s.tipFrame.title, text: s.tipFrame.text },
    { Icon: IconSteady, title: s.tipSteady.title, text: s.tipSteady.text },
  ];

  return (
    <>
      <button
        type="button"
        className={`digid-scan__sheet-veil${open ? ' digid-scan__sheet-veil--open' : ''}`}
        onClick={onClose}
        aria-label={s.tipsClose}
        tabIndex={open ? 0 : -1}
      />
      <aside
        className={`digid-scan__tips-sheet${open ? ' digid-scan__tips-sheet--open' : ''}`}
        role="dialog"
        aria-label={s.tipsSheetTitle}
        aria-hidden={!open}
      >
        <div className="digid-scan__tips-sheet-head">
          <p className="digid-scan__tips-sheet-title">{s.tipsSheetTitle}</p>
          <button
            type="button"
            className="digid-scan__tips-close"
            onClick={onClose}
            aria-label={s.tipsClose}
            tabIndex={open ? 0 : -1}
          >
            ×
          </button>
        </div>
        <ul className="digid-scan__tips-list">
          {tips.map(({ Icon, title, text }) => (
            <li key={title}>
              <span className="digid-scan__tips-icon">
                <Icon />
              </span>
              <span className="digid-scan__tips-copy">
                <strong>{title}</strong>
                <span>{text}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="digid-scan__tips-foot">{s.tipsFoot}</p>
      </aside>
    </>
  );
}
