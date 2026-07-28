import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SelfieInstruction } from './SelfieInstruction';
import { I18nProvider, es } from '../../i18n';

function renderInstruction(props: Partial<React.ComponentProps<typeof SelfieInstruction>> = {}) {
  const merged = {
    onStart: vi.fn(),
    onBack: vi.fn(),
    onUploadClick: vi.fn(),
    ...props,
  };
  render(
    <I18nProvider value={es}>
      <SelfieInstruction {...merged} />
    </I18nProvider>,
  );
  return merged;
}

describe('SelfieInstruction', () => {
  it('muestra el título y el copy de la selfie', () => {
    renderInstruction();
    expect(screen.getByRole('heading', { name: es.scanUi.selfie.title })).toBeInTheDocument();
    expect(screen.getByText(es.scanUi.selfie.hint)).toBeInTheDocument();
    expect(screen.getByText(es.scanUi.eyebrow)).toBeInTheDocument();
  });

  it('no incluye ningún checkbox de términos y condiciones (ya se gatean en StartStep)', () => {
    renderInstruction();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/términos y condiciones/i)).not.toBeInTheDocument();
  });

  it('no incluye lenguaje de AWS Face Liveness / prueba de vida (el SDK solo detecta el rostro en el dispositivo para encuadrar la foto)', () => {
    renderInstruction();
    expect(screen.queryByText(/prueba de vida/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/iniciar verificaci[oó]n/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/liveness/i)).not.toBeInTheDocument();
  });

  it('el botón Iniciar llama a onStart', async () => {
    const props = renderInstruction();
    await userEvent.click(screen.getByRole('button', { name: es.scanUi.selfie.start }));
    expect(props.onStart).toHaveBeenCalledTimes(1);
  });

  it('el botón Regresar llama a onBack', async () => {
    const props = renderInstruction();
    await userEvent.click(screen.getByRole('button', { name: es.scanUi.selfie.back }));
    expect(props.onBack).toHaveBeenCalledTimes(1);
  });

  it('el enlace de subir archivo llama a onUploadClick', async () => {
    const props = renderInstruction();
    await userEvent.click(screen.getByRole('button', { name: es.scanUi.selfie.uploadLink }));
    expect(props.onUploadClick).toHaveBeenCalledTimes(1);
  });
});
