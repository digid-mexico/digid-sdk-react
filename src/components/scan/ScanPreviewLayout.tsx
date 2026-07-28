// Layout de preview reutilizable para las capturas guiadas (INE, selfie): la
// tarjeta con eyebrow + título + subcopy + imagen + checklist informativo +
// acciones (Task 23: preview de captura fresca en DocScanCapture). Extraído
// en Task 25 para que el fast-path de imagen ya guardada en el backend
// (IdCaptureStep/SelfieStep) reutilice exactamente el mismo layout/clases en
// vez de duplicar el markup con un diseño distinto (y más pobre).
import type { ReactNode } from 'react';

export interface ScanPreviewCheckItem {
  /** Clave de React estable; no se muestra. */
  key: string;
  label: ReactNode;
}

export interface ScanPreviewLayoutProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  imageSrc: string;
  imageAlt: string;
  /** Filas del checklist informativo (con un check ✓ genérico a la izquierda). */
  checklist: ScanPreviewCheckItem[];
  /** Aviso opcional (p.ej. calidad insuficiente); solo aplica al preview de captura fresca. */
  hint?: string;
  /** Botonera del footer (digid-footer), p.ej. "Repetir captura" + "Continuar". */
  actions: ReactNode;
}

export function ScanPreviewLayout({
  eyebrow,
  title,
  subtitle,
  imageSrc,
  imageAlt,
  checklist,
  hint,
  actions,
}: ScanPreviewLayoutProps) {
  return (
    <div className="digid-scan" data-phase="preview">
      <div className="digid-scan__preview">
        <p className="digid-scan__eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p className="digid-scan__subcopy">{subtitle}</p>
        <img className="digid-scan__preview-img" src={imageSrc} alt={imageAlt} />
        <ul className="digid-scan__checklist">
          {checklist.map((item) => (
            <li key={item.key}>
              <span className="digid-scan__mini-check" aria-hidden="true">✓</span>
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
        {hint && <p className="digid-scan__hint">{hint}</p>}
        <div className="digid-footer">{actions}</div>
      </div>
    </div>
  );
}
