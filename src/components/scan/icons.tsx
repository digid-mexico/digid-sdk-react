// Iconos de línea (24x24, trazo currentColor) y las ilustraciones de INE
// frente/reverso, portados del prototipo KYC (Camera.jsx e IdIcon.jsx /
// public/ine-frontal-icon.svg / public/ine-reverso-icon.svg) como componentes
// React inline (sin depender de assets estáticos externos). Colores mapeados
// a los tokens del SDK (--digid-primary, --digid-dark) en vez de los
// hardcodeados del prototipo (--aqua, --navy).

interface IconProps {
  size?: number;
  strokeWidth?: number;
  join?: 'round' | 'miter' | 'bevel';
}

function Icon({ size = 16, strokeWidth = 1.8, join, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin={join}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function IconSun() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="3.6" />
      <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6L18 18M18 6l-1.4 1.4M7.4 16.6L6 18" />
    </Icon>
  );
}

export function IconSurface() {
  return (
    <Icon>
      <rect x="5" y="5" width="14" height="9.5" rx="2" />
      <path d="M3.5 18.5h17" />
    </Icon>
  );
}

export function IconFrame() {
  return (
    <Icon join="round">
      <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
    </Icon>
  );
}

export function IconSteady() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="6.5" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
    </Icon>
  );
}

export function IconGallery() {
  return (
    <Icon size={20} strokeWidth={1.7} join="round">
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <circle cx="9" cy="10" r="1.7" />
      <path d="M4.5 17l4.3-4.3 3 3 3.6-3.6 4.1 4.1" />
    </Icon>
  );
}

export function IconId() {
  return (
    <Icon size={14}>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <circle cx="8.5" cy="11" r="1.8" />
      <path d="M6.2 15.5c.5-1.6 4.1-1.6 4.6 0M13.5 10h5M13.5 13.5h4" />
    </Icon>
  );
}

/** Ilustración de INE frontal (port de public/ine-frontal-icon.svg). */
export function IneFrontIcon() {
  return (
    <svg
      className="digid-scan__id-icon"
      viewBox="0 0 128 84"
      width="128"
      height="84"
      role="img"
      aria-label="Identificación frontal"
    >
      <rect x="2" y="2" width="124" height="80" rx="10" fill="var(--digid-scan-icon-bg, #dff5f1)" stroke="var(--digid-primary)" strokeWidth="3" />
      <rect x="12" y="20" width="36" height="44" rx="6" fill="#fff" stroke="var(--digid-dark)" strokeWidth="2.5" />
      <circle cx="30" cy="36" r="8" fill="var(--digid-primary)" />
      <path d="M18 60 C22 50 38 50 42 60 Z" fill="var(--digid-primary)" />
      <rect x="58" y="22" width="56" height="6" rx="3" fill="var(--digid-dark)" />
      <rect x="58" y="36" width="48" height="6" rx="3" fill="var(--digid-gray)" />
      <rect x="58" y="50" width="52" height="6" rx="3" fill="var(--digid-gray)" />
    </svg>
  );
}

/**
 * Óvalo biométrico animado (port de .bio-target/LivenessIntro.jsx del
 * prototipo KYC): anillo que orbita + silueta de rostro tenue, recoloreado a
 * los tokens del SDK (--digid-primary en vez de --aqua) para la pantalla de
 * instrucción de la selfie. Puramente decorativo (aria-hidden): el título y
 * el copy ya comunican el propósito de la pantalla.
 */
export function BioOvalIcon() {
  return (
    <div className="digid-scan__bio-icon" aria-hidden="true">
      <svg viewBox="0 0 132 162">
        <ellipse className="digid-scan__bio-ring-track" cx="66" cy="81" rx="46" ry="60" />
        <ellipse className="digid-scan__bio-ring" cx="66" cy="81" rx="46" ry="60" />
      </svg>
      <svg className="digid-scan__bio-face" viewBox="0 0 132 162">
        <circle cx="66" cy="66" r="20" />
        <path d="M38 122c0-18 12.5-30 28-30s28 12 28 30" />
      </svg>
      <span className="digid-scan__bio-scanline" />
    </div>
  );
}

/** Ilustración de INE reverso (port de public/ine-reverso-icon.svg). */
export function IneBackIcon() {
  return (
    <svg
      className="digid-scan__id-icon"
      viewBox="0 0 128 84"
      width="128"
      height="84"
      role="img"
      aria-label="Identificación reverso"
    >
      <rect x="2" y="2" width="124" height="80" rx="10" fill="var(--digid-scan-icon-bg, #dff5f1)" stroke="var(--digid-primary)" strokeWidth="3" />
      <rect x="12" y="14" width="104" height="10" rx="3" fill="var(--digid-dark)" />
      <rect x="12" y="34" width="70" height="5" rx="2.5" fill="var(--digid-gray)" />
      <rect x="12" y="46" width="80" height="5" rx="2.5" fill="var(--digid-gray)" />
      <g fill="var(--digid-dark)">
        <rect x="12" y="60" width="3" height="14" />
        <rect x="18" y="60" width="2" height="14" />
        <rect x="23" y="60" width="4" height="14" />
        <rect x="30" y="60" width="2" height="14" />
        <rect x="35" y="60" width="3" height="14" />
        <rect x="41" y="60" width="5" height="14" />
        <rect x="49" y="60" width="2" height="14" />
        <rect x="54" y="60" width="3" height="14" />
      </g>
      <path d="M92 70 C98 62 104 76 112 66" stroke="var(--digid-dark)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}
