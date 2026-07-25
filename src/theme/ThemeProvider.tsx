import { createContext, useContext, type CSSProperties, type ReactNode } from 'react';

export interface DigidTheme {
  primaryColor?: string; // botones/acento
  buttonTextColor?: string;
  logoUrl?: string; // logo del cliente (estilos del backend)
}

const ThemeContext = createContext<DigidTheme>({});
export const useTheme = () => useContext(ThemeContext);

/** Solo hex #rgb/#rrggbb: los colores vienen del backend (estilos por cliente)
 *  y se inyectan en style — un valor libre permitiría inyección CSS. */
export function sanitizeColor(value: string | undefined): string | null {
  if (!value) return null;
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value) ? value : null;
}

export function ThemeProvider({ theme, children }: { theme?: DigidTheme; children: ReactNode }) {
  const style: CSSProperties & Record<string, string> = {};
  const primary = sanitizeColor(theme?.primaryColor);
  const btnText = sanitizeColor(theme?.buttonTextColor);
  if (primary) style['--digid-primary'] = primary;
  if (btnText) style['--digid-btn-text'] = btnText;
  return (
    <ThemeContext.Provider value={theme ?? {}}>
      <div className="digid-root" style={style}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}
