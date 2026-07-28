import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScanInstruction } from './ScanInstruction';
import { I18nProvider, es } from '../../i18n';

function renderInstruction(props: Partial<React.ComponentProps<typeof ScanInstruction>> = {}) {
  const merged = {
    side: 'front' as const,
    onStart: vi.fn(),
    onBack: vi.fn(),
    onUploadClick: vi.fn(),
    ...props,
  };
  render(
    <I18nProvider value={es}>
      <ScanInstruction {...merged} />
    </I18nProvider>,
  );
  return merged;
}

describe('ScanInstruction', () => {
  it('muestra el copy del lado frontal', () => {
    renderInstruction({ side: 'front' });
    expect(screen.getByRole('heading', { name: es.scanUi.instruction.frontTitle })).toBeInTheDocument();
    expect(screen.getByText(es.scanUi.instruction.frontHint)).toBeInTheDocument();
  });

  it('muestra el copy del lado reverso', () => {
    renderInstruction({ side: 'back' });
    expect(screen.getByRole('heading', { name: es.scanUi.instruction.backTitle })).toBeInTheDocument();
    expect(screen.getByText(es.scanUi.instruction.backHint)).toBeInTheDocument();
  });

  it('no incluye ningún checkbox de términos y condiciones (ya se gatean en StartStep)', () => {
    renderInstruction();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/términos y condiciones/i)).not.toBeInTheDocument();
  });

  it('el botón Iniciar llama a onStart', async () => {
    const props = renderInstruction();
    await userEvent.click(screen.getByRole('button', { name: es.scanUi.instruction.start }));
    expect(props.onStart).toHaveBeenCalledTimes(1);
  });

  it('el botón Regresar llama a onBack', async () => {
    const props = renderInstruction();
    await userEvent.click(screen.getByRole('button', { name: es.scanUi.instruction.back }));
    expect(props.onBack).toHaveBeenCalledTimes(1);
  });

  it('el enlace de subir archivo llama a onUploadClick', async () => {
    const props = renderInstruction();
    await userEvent.click(screen.getByRole('button', { name: es.scanUi.instruction.uploadLink }));
    expect(props.onUploadClick).toHaveBeenCalledTimes(1);
  });
});
