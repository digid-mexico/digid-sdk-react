import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, sanitizeColor } from './ThemeProvider';

describe('sanitizeColor', () => {
  it('acepta hex de 6 y 3 dígitos', () => {
    expect(sanitizeColor('#6AC1B4')).toBe('#6AC1B4');
    expect(sanitizeColor('#fff')).toBe('#fff');
  });
  it('rechaza cualquier otra cosa (previene inyección CSS)', () => {
    expect(sanitizeColor('red; background:url(evil)')).toBeNull();
    expect(sanitizeColor('url(x)')).toBeNull();
    expect(sanitizeColor(undefined)).toBeNull();
  });
});

describe('ThemeProvider', () => {
  it('aplica el color primario como CSS variable en el contenedor', () => {
    render(
      <ThemeProvider theme={{ primaryColor: '#123456' }}>
        <span>hijo</span>
      </ThemeProvider>,
    );
    const root = screen.getByText('hijo').closest('.digid-root') as HTMLElement;
    expect(root.style.getPropertyValue('--digid-primary')).toBe('#123456');
  });

  it('ignora colores maliciosos del backend', () => {
    render(
      <ThemeProvider theme={{ primaryColor: 'evil;}' }}>
        <span>hijo</span>
      </ThemeProvider>,
    );
    const root = screen.getByText('hijo').closest('.digid-root') as HTMLElement;
    expect(root.style.getPropertyValue('--digid-primary')).toBe('');
  });

  it('aplica el color de texto de botón como CSS variable en el contenedor', () => {
    render(
      <ThemeProvider theme={{ buttonTextColor: '#abcdef' }}>
        <span>hijo</span>
      </ThemeProvider>,
    );
    const root = screen.getByText('hijo').closest('.digid-root') as HTMLElement;
    expect(root.style.getPropertyValue('--digid-btn-text')).toBe('#abcdef');
  });

  it('ignora colores de texto de botón maliciosos del backend', () => {
    render(
      <ThemeProvider theme={{ buttonTextColor: 'evil;}' }}>
        <span>hijo</span>
      </ThemeProvider>,
    );
    const root = screen.getByText('hijo').closest('.digid-root') as HTMLElement;
    expect(root.style.getPropertyValue('--digid-btn-text')).toBe('');
  });
});
