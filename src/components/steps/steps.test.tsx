import { useEffect, useRef } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StartStep } from './StartStep';
import { IdCaptureStep } from './IdCaptureStep';
import { SelfieStep } from './SelfieStep';
import { CreateSignStep } from './CreateSignStep';
import { PlaceSignaturesStep } from './PlaceSignaturesStep';
import { FlowContext, type FlowContextValue } from '../../core/FlowContext';
import { computeStepOrder } from '../../core/flowReducer';
import { es, I18nProvider } from '../../i18n';
import type { StartAutografaData } from '../../types/api';

vi.mock('../camera/GuidedCameraCapture', () => ({
  // Espía las props con las que cada paso monta la captura guiada (guide/detector)
  // sin necesidad de simular una cámara real ni los detectores on-device.
  GuidedCameraCapture: (props: { guide: string; detector: string; onCancel?: () => void }) => (
    <div
      data-testid="guided-camera-mock"
      data-guide={props.guide}
      data-detector={props.detector}
    >
      <button type="button" onClick={props.onCancel}>
        cerrar cámara mock
      </button>
    </div>
  ),
}));

vi.mock('../pdf/PdfViewer', () => ({
  // Invoca onPagesRendered una sola vez al montar (como el componente real,
  // que lo hace desde un efecto tras cargar el PDF). Llamarlo directo en el
  // cuerpo del render dispararía un setState del padre en cada re-render
  // (referencia de array nueva cada vez) y produciría un loop infinito.
  PdfViewer: ({ onPagesRendered, children, toolbar }: {
    onPagesRendered?: (p: unknown[]) => void; children?: React.ReactNode; toolbar?: boolean;
  }) => {
    const onPagesRenderedRef = useRef(onPagesRendered);
    onPagesRenderedRef.current = onPagesRendered;
    useEffect(() => {
      onPagesRenderedRef.current?.([{ numPage: 1, width: 612, height: 792, widthPt: 612, heightPt: 792 }]);
    }, []);
    return <div data-testid="pdf-mock" data-toolbar={String(!!toolbar)}>{children}</div>;
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
    state: { step: 'start', startData, order: computeStepOrder(startData.preferences), exitReason: null, error: null },
    dispatch: vi.fn(),
    asignado: { nombre: 'Ana López', status: 1, firma: { id: 3 },
      files: { idFront: null, idBack: null, sign: null, selfie: null } },
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
    await userEvent.click(screen.getByRole('checkbox', { name: /Aceptar/i }));
    await userEvent.click(btn);
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'NEXT' });
  });

  it('el checkbox de términos tiene nombre accesible aunque el enlace esté fuera del label', () => {
    const ctx = makeCtx();
    renderStep(<StartStep />, ctx);
    expect(screen.getByRole('checkbox', { name: es.start.accept })).toBeInTheDocument();
  });

  it('Salir sin firmar dispara EXIT', async () => {
    const ctx = makeCtx();
    renderStep(<StartStep />, ctx);
    await userEvent.click(screen.getByRole('button', { name: es.start.exit }));
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'EXIT', reason: 'user_exit' });
  });

  it('habilita el toolbar de zoom/navegación del PdfViewer en la vista de revisión', () => {
    const ctx = makeCtx();
    renderStep(<StartStep />, ctx);
    expect(screen.getByTestId('pdf-mock')).toHaveAttribute('data-toolbar', 'true');
  });

  describe('con Representante Legal', () => {
    function ctxWithRepre(overrides: Partial<FlowContextValue> = {}) {
      const repreStartData = {
        ...startData,
        repre: { firma: '/storage/files/5/signatories/7/firma.png' },
      } as StartAutografaData;
      return makeCtx({
        state: {
          step: 'start', startData: repreStartData,
          order: computeStepOrder(repreStartData.preferences), exitReason: null, error: null,
        },
        api: {
          fileUrl: (p: string) => p,
          validRepre: vi.fn().mockResolvedValue({ Success: true }),
          finishAutografa: vi.fn().mockResolvedValue({ Success: true }),
          forgotPwdRl: vi.fn().mockResolvedValue({ Success: true }),
        } as never,
        ...overrides,
      });
    }

    it('muestra la sección de RL con la imagen de firma y oculta el footer normal', () => {
      const ctx = ctxWithRepre();
      renderStep(<StartStep />, ctx);
      const img = screen.getByAltText(es.rl.signAlt);
      expect(img).toHaveAttribute('src', expect.stringContaining('/storage/files/5/signatories/7/firma.png'));
      expect(screen.queryByRole('button', { name: es.start.continue })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: es.start.exit })).not.toBeInTheDocument();
    });

    it('Continuar (RL) deshabilitado hasta escribir contraseña (>=3) y aceptar términos', async () => {
      const ctx = ctxWithRepre();
      renderStep(<StartStep />, ctx);
      const btn = screen.getByRole('button', { name: es.rl.continue });
      expect(btn).toBeDisabled();
      await userEvent.type(screen.getByPlaceholderText(es.rl.passwordPlaceholder), 'ab');
      expect(btn).toBeDisabled();
      await userEvent.click(screen.getByRole('checkbox'));
      expect(btn).toBeDisabled(); // pwd todavía < 3
      await userEvent.type(screen.getByPlaceholderText(es.rl.passwordPlaceholder), 'c');
      expect(btn).toBeEnabled();
    });

    it('éxito: valida contraseña, finaliza la firma y navega a completado', async () => {
      const ctx = ctxWithRepre();
      renderStep(<StartStep />, ctx);
      await userEvent.type(screen.getByPlaceholderText(es.rl.passwordPlaceholder), 'secreta');
      await userEvent.click(screen.getByRole('checkbox'));
      await userEvent.click(screen.getByRole('button', { name: es.rl.continue }));
      await vi.waitFor(() => expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'GOTO', step: 'completed' }));
      expect(ctx.api.validRepre).toHaveBeenCalledWith('secreta');
      expect(ctx.api.finishAutografa).toHaveBeenCalled();
    });

    it('contraseña incorrecta: notifica error específico y no llama finishAutografa ni navega', async () => {
      const { DigidError } = await import('../../types/api');
      const ctx = ctxWithRepre({
        api: {
          fileUrl: (p: string) => p,
          validRepre: vi.fn().mockRejectedValue(new DigidError('INVALID_TOKEN', 'rechazado')),
          finishAutografa: vi.fn().mockResolvedValue({ Success: true }),
          forgotPwdRl: vi.fn().mockResolvedValue({ Success: true }),
        } as never,
      });
      renderStep(<StartStep />, ctx);
      await userEvent.type(screen.getByPlaceholderText(es.rl.passwordPlaceholder), 'mala123');
      await userEvent.click(screen.getByRole('checkbox'));
      await userEvent.click(screen.getByRole('button', { name: es.rl.continue }));
      await vi.waitFor(() => expect(ctx.notify).toHaveBeenCalledWith('error', es.rl.wrongPassword));
      expect(ctx.api.finishAutografa).not.toHaveBeenCalled();
      expect(ctx.dispatch).not.toHaveBeenCalledWith({ type: 'GOTO', step: 'completed' });
    });

    it('error de red en validRepre: notifica el error genérico (no "contraseña incorrecta") y no continúa', async () => {
      const { DigidError } = await import('../../types/api');
      const ctx = ctxWithRepre({
        api: {
          fileUrl: (p: string) => p,
          validRepre: vi.fn().mockRejectedValue(new DigidError('NETWORK', 'sin conexión')),
          finishAutografa: vi.fn().mockResolvedValue({ Success: true }),
          forgotPwdRl: vi.fn().mockResolvedValue({ Success: true }),
        } as never,
      });
      renderStep(<StartStep />, ctx);
      await userEvent.type(screen.getByPlaceholderText(es.rl.passwordPlaceholder), 'secreta123');
      await userEvent.click(screen.getByRole('checkbox'));
      await userEvent.click(screen.getByRole('button', { name: es.rl.continue }));
      await vi.waitFor(() => expect(ctx.notify).toHaveBeenCalledWith('error', es.errors.generic));
      expect(ctx.notify).not.toHaveBeenCalledWith('error', es.rl.wrongPassword);
      expect(ctx.api.finishAutografa).not.toHaveBeenCalled();
      expect(ctx.dispatch).not.toHaveBeenCalledWith({ type: 'GOTO', step: 'completed' });
    });

    it('un doble click en Continuar durante una validación lenta no duplica el envío', async () => {
      const ctx = ctxWithRepre();
      let resolveValid!: (v: { Success: boolean }) => void;
      const pending = new Promise<{ Success: boolean }>((resolve) => { resolveValid = resolve; });
      (ctx.api.validRepre as ReturnType<typeof vi.fn>).mockReturnValue(pending);
      renderStep(<StartStep />, ctx);
      await userEvent.type(screen.getByPlaceholderText(es.rl.passwordPlaceholder), 'secreta');
      await userEvent.click(screen.getByRole('checkbox'));
      const btn = screen.getByRole('button', { name: es.rl.continue });
      await userEvent.click(btn);
      await userEvent.click(btn);
      await act(async () => { resolveValid({ Success: true }); });
      await vi.waitFor(() => expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'GOTO', step: 'completed' }));
      expect(ctx.api.validRepre).toHaveBeenCalledTimes(1);
    });

    it('el enlace de contraseña olvidada abre un modal que envía forgotPwdRl con el correo', async () => {
      const ctx = ctxWithRepre();
      renderStep(<StartStep />, ctx);
      await userEvent.click(screen.getByRole('button', { name: es.rl.forgot }));
      const sendBtn = screen.getByRole('button', { name: es.rl.resetSend });
      expect(sendBtn).toBeDisabled();
      await userEvent.type(screen.getByPlaceholderText(es.rl.resetPlaceholder), 'no-es-email');
      expect(sendBtn).toBeDisabled();
      await userEvent.clear(screen.getByPlaceholderText(es.rl.resetPlaceholder));
      await userEvent.type(screen.getByPlaceholderText(es.rl.resetPlaceholder), 'rl@example.com');
      expect(sendBtn).toBeEnabled();
      await userEvent.click(sendBtn);
      await vi.waitFor(() => expect(ctx.api.forgotPwdRl).toHaveBeenCalledWith('rl@example.com'));
      expect(ctx.notify).toHaveBeenCalledWith('success', es.rl.resetSent);
    });
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
        files: { idFront: 'QUJD', idBack: null, sign: null, selfie: null } },
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

  it('el frente monta GuidedCameraCapture con guide="id" y detector="face-small"', async () => {
    const ctx = makeCtx();
    renderStep(<IdCaptureStep side="front" />, ctx);
    await userEvent.click(screen.getByRole('button', { name: es.idCapture.openCamera }));
    const mock = screen.getByTestId('guided-camera-mock');
    expect(mock).toHaveAttribute('data-guide', 'id');
    expect(mock).toHaveAttribute('data-detector', 'face-small');
  });

  it('el reverso monta GuidedCameraCapture con guide="id" y detector="barcode"', async () => {
    const ctx = makeCtx();
    renderStep(<IdCaptureStep side="back" />, ctx);
    await userEvent.click(screen.getByRole('button', { name: es.idCapture.openCamera }));
    const mock = screen.getByTestId('guided-camera-mock');
    expect(mock).toHaveAttribute('data-guide', 'id');
    expect(mock).toHaveAttribute('data-detector', 'barcode');
  });
});

describe('SelfieStep', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error('no cam in jsdom')) },
    });
  });

  it('sube el archivo con step=selfie y avanza', async () => {
    const ctx = makeCtx();
    renderStep(<SelfieStep />, ctx);
    const input = screen.getByTestId('digid-file-input') as HTMLInputElement;
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'selfie.jpg', {
      type: 'image/jpeg',
    });
    await userEvent.upload(input, file);
    await userEvent.click(screen.getByRole('button', { name: es.idCapture.continue }));
    await vi.waitFor(() =>
      expect(ctx.api.saveFile).toHaveBeenCalledWith(
        expect.objectContaining({ step: 'selfie', idFirma: 3 }),
      ),
    );
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'NEXT' });
  });

  it('muestra la selfie previa si el backend ya la tiene guardada', () => {
    const ctx = makeCtx({
      asignado: { nombre: 'Ana', status: 1, firma: { id: 3 },
        files: { idFront: null, idBack: null, sign: null, selfie: 'QUJD' } },
    });
    renderStep(<SelfieStep />, ctx);
    expect(screen.getByAltText('Selfie')).toHaveAttribute(
      'src', expect.stringContaining('data:image/jpeg;base64,QUJD'),
    );
  });

  it('monta GuidedCameraCapture con guide="face" y detector="face-selfie"', async () => {
    const ctx = makeCtx();
    renderStep(<SelfieStep />, ctx);
    await userEvent.click(screen.getByRole('button', { name: es.idCapture.openCamera }));
    const mock = screen.getByTestId('guided-camera-mock');
    expect(mock).toHaveAttribute('data-guide', 'face');
    expect(mock).toHaveAttribute('data-detector', 'face-selfie');
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
        order: computeStepOrder(startData.preferences),
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

  it('el tamaño del overlay es adaptativo: 37x24mm convertidos a css px según widthPt de la página', async () => {
    // Página carta (widthPt 612) renderizada a su ancho físico (612 css px,
    // ver mock de PdfViewer): 37mm ≈ 104.88px, 24mm ≈ 68.03px.
    const { ctx } = ctxWithFirmas();
    const { container } = renderStep(<PlaceSignaturesStep />, ctx);
    await screen.findByRole('button', { name: /Firma 1\/2/ });
    const overlay = container.querySelector<HTMLDivElement>('.digid-sign-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay!.style.width).toMatch(/^104\.8/);
    expect(overlay!.style.height).toMatch(/^68\.0/);
  });

  it('NO habilita el toolbar de zoom (el zoom desalinearía el cálculo de overlays)', async () => {
    const { ctx } = ctxWithFirmas();
    renderStep(<PlaceSignaturesStep />, ctx);
    await screen.findByRole('button', { name: /Firma 1\/2/ });
    expect(screen.getByTestId('pdf-mock')).toHaveAttribute('data-toolbar', 'false');
  });
});
