import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScanPreviewLayout } from './ScanPreviewLayout';

describe('ScanPreviewLayout', () => {
  it('renderiza eyebrow, título, subtítulo, imagen, checklist y acciones', () => {
    render(
      <ScanPreviewLayout
        eyebrow="Verificación de identidad"
        title="Reverso capturado"
        subtitle="Revisa que la imagen se vea clara."
        imageSrc="data:image/jpeg;base64,abc"
        imageAlt="Documento capturado"
        checklist={[
          { key: 'a', label: 'Códigos y datos visibles' },
          { key: 'b', label: 'Documento completo' },
        ]}
        actions={<button type="button">Continuar</button>}
      />,
    );
    expect(screen.getByText('Verificación de identidad')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Reverso capturado' })).toBeInTheDocument();
    expect(screen.getByText('Revisa que la imagen se vea clara.')).toBeInTheDocument();
    expect(screen.getByAltText('Documento capturado')).toHaveAttribute(
      'src',
      'data:image/jpeg;base64,abc',
    );
    expect(screen.getByText('Códigos y datos visibles')).toBeInTheDocument();
    expect(screen.getByText('Documento completo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeInTheDocument();
  });

  it('muestra el hint solo cuando se provee', () => {
    const { rerender } = render(
      <ScanPreviewLayout
        eyebrow="e"
        title="t"
        subtitle="s"
        imageSrc="x"
        imageAlt="a"
        checklist={[{ key: 'a', label: 'ok' }]}
      />,
    );
    expect(screen.queryByText('cuidado')).not.toBeInTheDocument();

    rerender(
      <ScanPreviewLayout
        eyebrow="e"
        title="t"
        subtitle="s"
        imageSrc="x"
        imageAlt="a"
        checklist={[{ key: 'a', label: 'ok' }]}
        hint="cuidado"
      />,
    );
    expect(screen.getByText('cuidado')).toBeInTheDocument();
  });

  it('renderiza el overlay flotante dentro del wrapper de la imagen (digid-scan__preview-media)', () => {
    const { container } = render(
      <ScanPreviewLayout
        eyebrow="e"
        title="t"
        subtitle="s"
        imageSrc="x"
        imageAlt="a"
        checklist={[{ key: 'a', label: 'ok' }]}
        imageOverlay={
          <button type="button" aria-label="Repetir captura">
            ↺
          </button>
        }
      />,
    );
    const media = container.querySelector('.digid-scan__preview-media');
    expect(media).not.toBeNull();
    const retakeBtn = screen.getByRole('button', { name: 'Repetir captura' });
    expect(media!.contains(retakeBtn)).toBe(true);
  });

  it('no renderiza el footer (digid-footer) cuando no se provee `actions`', () => {
    const { container } = render(
      <ScanPreviewLayout
        eyebrow="e"
        title="t"
        subtitle="s"
        imageSrc="x"
        imageAlt="a"
        checklist={[{ key: 'a', label: 'ok' }]}
      />,
    );
    expect(container.querySelector('.digid-footer')).not.toBeInTheDocument();
  });
});
