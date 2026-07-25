import { useEffect, useRef } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StartStep } from './StartStep';
import { IdCaptureStep } from './IdCaptureStep';
import { CreateSignStep } from './CreateSignStep';
import { PlaceSignaturesStep } from './PlaceSignaturesStep';
import { FlowContext, type FlowContextValue } from '../../core/FlowContext';
import { es, I18nProvider } from '../../i18n';
import type { StartAutografaData } from '../../types/api';

vi.mock('../pdf/PdfViewer', () => ({
  // Invoca onPagesRendered una sola vez al montar (como el componente real,
  // que lo hace desde un efecto tras cargar el PDF). Llamarlo directo en el
  // cuerpo del render dispararía un setState del padre en cada re-render
  // (referencia de array nueva cada vez) y produciría un loop infinito.
  PdfViewer: ({ onPagesRendered, children }: {
    onPagesRendered?: (p: unknown[]) => void; children?: React.ReactNode;
  }) => {
    const onPagesRenderedRef = useRef(onPagesRendered);
    onPagesRenderedRef.current = onPagesRendered;
    useEffect(() => {
      onPagesRenderedRef.current?.([{ numPage: 1, width: 612, height: 792 }]);
    }, []);
    return <div data-testid="pdf-mock">{children}</div>;
  },
}));

const startData = {
  document: { id: 9, nombre: 'contrato.pdf', archivo: 'a.pdf', estatus: 1, firmas: null, client: 5 },
  client: { id: 5, razonsocial: 'ACME SA' },
  subAccount: null,
  signatory: { id: 7, nombre: 'Ana López', representantelegal: 0 },
  assignament: { status: 1, idfirmante: 7, verifiacion_rostro: 0, verificacion_identificacion: 0 },
  style: null, repre: null, preferences: null, diff_documents: null,
} as StartAutografaData;

function makeCtx(overrides: Partial<FlowContextValue> = {}): FlowContextValue {
  return {
    api: {
      fileUrl: (p: string) => p,
      saveFile: vi.fn().mockResolvedValue({ Success: true, Step: 0 }),
    } as never,
    state: { step: 'start', startData, exitReason: null, error: null },
    dispatch: vi.fn(),
    asignado: { nombre: 'Ana López', status: 1, firma: { id: 3 },
      files: { idFront: null, idBack: null, sign: null } },
    refreshAsignado: vi.fn().mockResolvedValue(undefined),
    notify: vi.fn(),
    setBusy: vi.fn(),
    termsUrl: 'https://digid.test/tyc',
    ...overrides,
  };
}

function renderStep(ui: React.ReactElement, ctx: FlowContextValue) {
  return render(
    <I18nProvider value={es}>
      <FlowContext.Provider value={ctx}>{ui}</FlowContext.Provider>
    </I18nProvider>,
  );
}

describe('StartStep', () => {
  it('muestra saludo con datos del firmante (escapados por React)', () => {
    const ctx = makeCtx();
    renderStep(<StartStep />, ctx);
    expect(screen.getByText(/Ana López/)).toBeInTheDocument();
    expect(screen.getByText(/contrato\.pdf/)).toBeInTheDocument();
  });

  it('bloquea Continuar hasta aceptar términos y luego avanza', async () => {
    const ctx = makeCtx();
    renderStep(<StartStep />, ctx);
    const btn = screen.getByRole('button', { name: es.start.continue });
    expect(btn).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(btn);
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'NEXT' });
  });

  it('Salir sin firmar dispara EXIT', async () => {
    const ctx = makeCtx();
    renderStep(<StartStep />, ctx);
    await userEvent.click(screen.getByRole('button', { name: es.start.exit }));
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'EXIT', reason: 'user_exit' });
  });
});

describe('IdCaptureStep', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error('no cam in jsdom')) },
    });
  });

  it('sube el archivo con step=ine_frente y avanza', async () => {
    const ctx = makeCtx();
    renderStep(<IdCaptureStep side="front" />, ctx);
    const input = screen.getByTestId('digid-file-input') as HTMLInputElement;
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'ine.jpg', {
      type: 'image/jpeg',
    });
    await userEvent.upload(input, file);
    await userEvent.click(screen.getByRole('button', { name: es.idCapture.continue }));
    await vi.waitFor(() =>
      expect(ctx.api.saveFile).toHaveBeenCalledWith(
        expect.objectContaining({ step: 'ine_frente', idFirma: 3 }),
      ),
    );
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'NEXT' });
  });

  it('usa step=ine_reverso para el lado trasero', async () => {
    const ctx = makeCtx();
    renderStep(<IdCaptureStep side="back" />, ctx);
    const input = screen.getByTestId('digid-file-input') as HTMLInputElement;
    await userEvent.upload(input, new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'r.jpg', { type: 'image/jpeg' }));
    await userEvent.click(screen.getByRole('button', { name: es.idCapture.continue }));
    await vi.waitFor(() =>
      expect(ctx.api.saveFile).toHaveBeenCalledWith(
        expect.objectContaining({ step: 'ine_reverso' }),
      ),
    );
  });

  it('muestra la imagen previa si el backend ya tiene el archivo', () => {
    const ctx = makeCtx({
      asignado: { nombre: 'Ana', status: 1, firma: { id: 3 },
        files: { idFront: 'QUJD', idBack: null, sign: null } },
    });
    renderStep(<IdCaptureStep side="front" />, ctx);
    expect(screen.getByAltText(/identificación/i)).toHaveAttribute(
      'src', expect.stringContaining('data:image/jpeg;base64,QUJD'),
    );
  });

  it('un doble click en Continuar durante un guardado lento no duplica el envío', async () => {
    const ctx = makeCtx();
    let resolveSave!: (v: { Success: boolean; Step: number }) => void;
    const pending = new Promise<{ Success: boolean; Step: number }>((resolve) => {
      resolveSave = resolve;
    });
    (ctx.api.saveFile as ReturnType<typeof vi.fn>).mockReturnValue(pending);
    renderStep(<IdCaptureStep side="front" />, ctx);
    const input = screen.getByTestId('digid-file-input') as HTMLInputElement;
    await userEvent.upload(input, new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'ine.jpg', { type: 'image/jpeg' }));
    const btn = screen.getByRole('button', { name: es.idCapture.continue });
    await userEvent.click(btn);
    await userEvent.click(btn);
    await act(async () => {
      resolveSave({ Success: true, Step: 0 });
    });
    await vi.waitFor(() => expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'NEXT' }));
    expect(ctx.api.saveFile).toHaveBeenCalledTimes(1);
    expect(ctx.dispatch).toHaveBeenCalledTimes(1);
  });
});

describe('CreateSignStep', () => {
  it('Continuar deshabilitado hasta dibujar', () => {
    const ctx = makeCtx();
    renderStep(<CreateSignStep />, ctx);
    expect(screen.getByRole('button', { name: es.idCapture.continue })).toBeDisabled();
  });
});

describe('PlaceSignaturesStep', () => {
  const firmas = JSON.stringify([
    { id: 'f1', firmante: 7, pagina: 1, xDoc: 100, ydoc: 100, AnchoPagina: 612, altoPagina: 792, position: 0, nombre: 'Ana' },
    { id: 'f2', firmante: 7, pagina: 1, xDoc: 200, ydoc: 300, AnchoPagina: 612, altoPagina: 792, position: 0, nombre: 'Ana' },
  ]);

  function ctxWithFirmas(finishMock = vi.fn().mockResolvedValue({ Success: true })) {
    const ctx = makeCtx({
      state: {
        step: 'placeSignatures',
        startData: { ...startData, document: { ...startData.document, firmas } },
        exitReason: null, error: null,
      },
    });
    (ctx.api as { finishAutografa?: unknown }).finishAutografa = finishMock;
    return { ctx, finishMock };
  }

  it('muestra el contador y avanza firma por firma hasta finish', async () => {
    const { ctx, finishMock } = ctxWithFirmas();
    renderStep(<PlaceSignaturesStep />, ctx);
    const btn = await screen.findByRole('button', { name: /Firma 1\/2/ });
    await userEvent.click(btn); // confirma 1 → pasa a 2
    await screen.findByRole('button', { name: /Firma 2\/2/ });
    expect(finishMock).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /Firma 2\/2/ }));
    await vi.waitFor(() => expect(finishMock).toHaveBeenCalledOnce());
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'NEXT' });
  });

  it('renderiza overlays de firma sobre el PDF', async () => {
    const { ctx } = ctxWithFirmas();
    const { container } = renderStep(<PlaceSignaturesStep />, ctx);
    await screen.findByRole('button', { name: /Firma 1\/2/ });
    expect(container.querySelectorAll('.digid-sign-overlay').length).toBeGreaterThan(0);
  });
});
