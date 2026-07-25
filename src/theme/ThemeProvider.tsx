import { createContext, useContext, useMemo, type CSSProperties, type ReactNode } from 'react';

export interface DigidTheme {
  primaryColor?: string; // botones/acento
  buttonTextColor?: string;
  logoUrl?: string; // logo del cliente (estilos del backend)
}

const EMPTY_THEME: DigidTheme = Object.freeze({});

const ThemeContext = createContext<DigidTheme>(EMPTY_THEME);

/** Los valores expuestos aquí son RAW (sin sanear): vienen tal cual del backend.
 *  No los inyectes directamente en `style`/CSS — usa las variables --digid-*
 *  ya aplicadas por ThemeProvider, o pásalos por sanitizeColor primero. */
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
  const contextValue = useMemo(() => theme ?? EMPTY_THEME, [theme]);
  return (
    <ThemeContext.Provider value={contextValue}>
      <div className="digid-root" style={style}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}
