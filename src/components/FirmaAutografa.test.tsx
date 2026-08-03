import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { FirmaAutografa } from './FirmaAutografa';
import { es } from '../i18n';

vi.mock('../detection/faceDetector', () => ({
  createFaceFrameDetector: vi.fn(),
  disposeFaceDetector: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../detection/barcodeDetector', () => ({
  createBarcodeFrameDetector: vi.fn(),
  disposeBarcodeDetector: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./pdf/PdfViewer', () => {
  const { useEffect, useRef } = require('react');
  return {
    PdfViewer: ({ onPagesRendered, children, workerSrc }: {
      onPagesRendered?: (p: unknown[]) => void; children?: React.ReactNode; workerSrc?: string;
    }) => {
      const cbRef = useRef(onPagesRendered);
      cbRef.current = onPagesRendered;
      useEffect(() => {
        cbRef.current?.([{ numPage: 1, width: 612, height: 792, widthPt: 612, heightPt: 792 }]);
      }, []);
      return <div data-testid="pdf-mock" data-worker-src={workerSrc}>{children}</div>;
    },
  };
});

vi.mock('./camera/GuidedCameraCapture', () => ({
  // La selfie ahora abre la cámara directo (Task 27): se mockea para
  // simular la confirmación de una captura sin cámara real en jsdom.
  GuidedCameraCapture: (props: { onCapture?: (dataUrl: string) => void; onCancel?: () => void }) => (
    <div data-testid="guided-camera-mock">
      <button type="button" onClick={props.onCancel}>cerrar cámara mock</button>
      <button type="button" onClick={() => props.onCapture?.('data:image/jpeg;base64,selfiecam')}>
        confirmar selfie mock
      </button>
    </div>
  ),
}));

const BASE = 'https://backend.test';
const server = setupServer(
  http.get(`${BASE}/api/archivofirma/start_autografa`, () =>
    HttpResponse.json({
      Success: true,
      Data: {
        document: { id: 9, nombre: 'contrato.pdf', archivo: 'a.pdf', estatus: 1, client: 5,
          firmas: JSON.stringify([{ id: 'f1', firmante: 7, pagina: 1, xDoc: 100, ydoc: 100,
            AnchoPagina: 612, altoPagina: 792, position: 0, nombre: 'Ana' }]) },
        client: { id: 5, razonsocial: 'ACME' },
        subAccount: null,
        signatory: { id: 7, nombre: 'Ana', representantelegal: 0 },
        assignament: { status: 1, idfirmante: 7, verifiacion_rostro: 0, verificacion_identificacion: 0 },
        style: null, repre: null, preferences: null, diff_documents: null,
      },
    }),
  ),
  http.get(`${BASE}/api/asignado/autografa`, () =>
    HttpResponse.json({
      Data: { nombre: 'Ana', status: 1, firma: { id: 3 },
        files: { idFront: null, idBack: null, sign: null, selfie: null } },
    }),
  ),
  http.post(`${BASE}/api/asignado/autografa/save_file`, () =>
    HttpResponse.json({ Success: true, Step: 0 }),
  ),
  http.post(`${BASE}/api/archivofirma/finish_autografa`, () =>
    HttpResponse.json({ Success: true }),
  ),
  http.post(`${BASE}/api/archivofirma/valid_repre`, () =>
    HttpResponse.json({ Success: true, Data: '' }),
  ),
);
beforeAll(() => server.listen());
afterEach(() => {
  // Desmonta explícitamente ANTES de limpiar los mocks: los afterEach
  // definidos en el archivo corren antes que el cleanup automático interno
  // de @testing-library/react (registrado al importarlo), así que sin este
  // cleanup() manual el desmontaje real (y su llamada a dispose*Detector)
  // ocurriría después de vi.clearAllMocks() y se filtraría al siguiente test.
  cleanup();
  server.resetHandlers();
  vi.clearAllMocks();
});
afterAll(() => server.close());

describe('FirmaAutografa — flujo completo', () => {
  it('recorre start → INE frontal → INE reverso → firma → colocación → completado', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error('sin cámara')) },
    });
    const onComplete = vi.fn();
    render(<FirmaAutografa token="tok" baseUrl={BASE} onComplete={onComplete} />);

    // Paso 1: start
    await screen.findByText(es.start.title);
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: es.start.continue }));

    // Paso 2: INE frontal — pantalla de instrucción (Task 23), con la
    // alternativa de subir archivo siempre disponible sin pasar por la cámara.
    await screen.findByText(es.scanUi.instruction.frontTitle);
    const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'i.jpg', { type: 'image/jpeg' });
    await userEvent.upload(screen.getByTestId('digid-file-input'), jpeg);
    await userEvent.click(screen.getByRole('button', { name: es.idCapture.continue }));

    // Paso 3: INE reverso
    await screen.findByText(es.scanUi.instruction.backTitle);
    await userEvent.upload(screen.getByTestId('digid-file-input'), jpeg);
    await userEvent.click(screen.getByRole('button', { name: es.idCapture.continue }));

    // Paso 4: selfie — cámara obligatoria, abre directo sin instrucción ni
    // alternativa de archivo (Task 27); GuidedCameraCapture está mockeada.
    await userEvent.click(await screen.findByRole('button', { name: 'confirmar selfie mock' }));

    // Paso 5: crear firma (dibujar)
    await screen.findByText(es.createSign.heading);
    const canvas = screen.getByTestId('digid-signature-canvas');
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 5, clientY: 5 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });
    await userEvent.click(screen.getByRole('button', { name: es.idCapture.continue }));

    // Paso 6: colocación (1 firma) → finish
    await screen.findByText(es.placeSignatures.title);
    await userEvent.click(await screen.findByRole('button', { name: /Firma 1\/1/ }));

    // Paso 7: completado
    await screen.findByText(es.completed.title);
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
  });

  it('con preferences que desactivan INE/selfie, va directo a la creación de firma y completa el flujo', async () => {
    server.use(
      http.get(`${BASE}/api/archivofirma/start_autografa`, () =>
        HttpResponse.json({
          Success: true,
          Data: {
            document: { id: 9, nombre: 'contrato.pdf', archivo: 'a.pdf', estatus: 1, client: 5,
              firmas: JSON.stringify([{ id: 'f1', firmante: 7, pagina: 1, xDoc: 100, ydoc: 100,
                AnchoPagina: 612, altoPagina: 792, position: 0, nombre: 'Ana' }]) },
            client: { id: 5, razonsocial: 'ACME' },
            subAccount: null,
            signatory: { id: 7, nombre: 'Ana', representantelegal: 0 },
            assignament: { status: 1, idfirmante: 7, verifiacion_rostro: 0, verificacion_identificacion: 0 },
            style: null, repre: null,
            preferences: {
              required_gps: 0, required_id_frontal: 0, required_id_reverso: 0, required_selfie: 0,
            },
            diff_documents: null,
          },
        }),
      ),
    );
    const onComplete = vi.fn();
    render(<FirmaAutografa token="tok" baseUrl={BASE} onComplete={onComplete} />);

    // Paso 1: start
    await screen.findByText(es.start.title);
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: es.start.continue }));

    // Sin pantallas de INE/selfie: va directo a crear firma
    await screen.findByText(es.createSign.heading);
    const canvas = screen.getByTestId('digid-signature-canvas');
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 5, clientY: 5 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });
    await userEvent.click(screen.getByRole('button', { name: es.idCapture.continue }));

    // Colocación (1 firma) → finish
    await screen.findByText(es.placeSignatures.title);
    await userEvent.click(await screen.findByRole('button', { name: /Firma 1\/1/ }));

    // Completado
    await screen.findByText(es.completed.title);
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
  });

  it('va directo a completado si el asignado ya terminó (status 3)', async () => {
    server.use(
      http.get(`${BASE}/api/asignado/autografa`, () =>
        HttpResponse.json({ Data: { nombre: 'Ana', status: 3, firma: null,
          files: { idFront: null, idBack: null, sign: null, selfie: null } } }),
      ),
    );
    render(<FirmaAutografa token="tok" baseUrl={BASE} />);
    await screen.findByText(es.completed.title);
  });

  it('va directo a completado si el asignado ya terminó (status 2, portado de ine_front.js)', async () => {
    server.use(
      http.get(`${BASE}/api/asignado/autografa`, () =>
        HttpResponse.json({ Data: { nombre: 'Ana', status: 2, firma: null,
          files: { idFront: null, idBack: null, sign: null, selfie: null } } }),
      ),
    );
    render(<FirmaAutografa token="tok" baseUrl={BASE} />);
    await screen.findByText(es.completed.title);
  });

  it('firmante Representante Legal: valida contraseña y completa desde la pantalla de revisión', async () => {
    server.use(
      http.get(`${BASE}/api/archivofirma/start_autografa`, () =>
        HttpResponse.json({
          Success: true,
          Data: {
            document: { id: 9, nombre: 'contrato.pdf', archivo: 'a.pdf', estatus: 1, client: 5,
              firmas: null },
            client: { id: 5, razonsocial: 'ACME' },
            subAccount: null,
            signatory: { id: 7, nombre: 'Ana', representantelegal: 1 },
            assignament: { status: 1, idfirmante: 7, verifiacion_rostro: 0, verificacion_identificacion: 0 },
            style: null,
            repre: { firma: '/storage/files/5/signatories/7/firma_9.png' },
            preferences: null,
            diff_documents: null,
          },
        }),
      ),
    );
    const onComplete = vi.fn();
    render(<FirmaAutografa token="tok" baseUrl={BASE} onComplete={onComplete} />);

    await screen.findByText(es.start.title);
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.type(screen.getByPlaceholderText(es.rl.passwordPlaceholder), 'secreta123');
    await userEvent.click(screen.getByRole('button', { name: es.rl.continue }));

    await screen.findByText(es.completed.title);
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
  });

  it('reenvía pdfWorkerUrl al PdfViewer como workerSrc (Task 27)', async () => {
    render(<FirmaAutografa token="tok" baseUrl={BASE} pdfWorkerUrl="/mi-worker/pdf.worker.min.mjs" />);
    await screen.findByText(es.start.title);
    expect(screen.getByTestId('pdf-mock')).toHaveAttribute('data-worker-src', '/mi-worker/pdf.worker.min.mjs');
  });

  it('libera los detectores on-device cacheados al desmontar la raíz', async () => {
    const { disposeFaceDetector } = await import('../detection/faceDetector');
    const { disposeBarcodeDetector } = await import('../detection/barcodeDetector');
    const { unmount } = render(<FirmaAutografa token="tok" baseUrl={BASE} />);
    await screen.findByText(es.start.title);

    expect(disposeFaceDetector).not.toHaveBeenCalled();
    unmount();
    expect(disposeFaceDetector).toHaveBeenCalledTimes(1);
    expect(disposeBarcodeDetector).toHaveBeenCalledTimes(1);
  });
});
