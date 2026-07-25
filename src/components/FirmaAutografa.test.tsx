import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { FirmaAutografa } from './FirmaAutografa';
import { es } from '../i18n';

vi.mock('./pdf/PdfViewer', () => {
  const { useEffect, useRef } = require('react');
  return {
    PdfViewer: ({ onPagesRendered, children }: {
      onPagesRendered?: (p: unknown[]) => void; children?: React.ReactNode;
    }) => {
      const cbRef = useRef(onPagesRendered);
      cbRef.current = onPagesRendered;
      useEffect(() => { cbRef.current?.([{ numPage: 1, width: 612, height: 792 }]); }, []);
      return <div data-testid="pdf-mock">{children}</div>;
    },
  };
});

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
        files: { idFront: null, idBack: null, sign: null } },
    }),
  ),
  http.post(`${BASE}/api/asignado/autografa/save_file`, () =>
    HttpResponse.json({ Success: true, Step: 0 }),
  ),
  http.post(`${BASE}/api/archivofirma/finish_autografa`, () =>
    HttpResponse.json({ Success: true }),
  ),
);
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
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

    // Paso 2: INE frontal (upload)
    await screen.findByText(es.idCapture.frontTitle);
    const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'i.jpg', { type: 'image/jpeg' });
    await userEvent.upload(screen.getByTestId('digid-file-input'), jpeg);
    await userEvent.click(screen.getByRole('button', { name: es.idCapture.continue }));

    // Paso 3: INE reverso
    await screen.findByText(es.idCapture.backTitle);
    await userEvent.upload(screen.getByTestId('digid-file-input'), jpeg);
    await userEvent.click(screen.getByRole('button', { name: es.idCapture.continue }));

    // Paso 4: crear firma (dibujar)
    await screen.findByText(es.createSign.heading);
    const canvas = screen.getByTestId('digid-signature-canvas');
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 5, clientY: 5 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });
    await userEvent.click(screen.getByRole('button', { name: es.idCapture.continue }));

    // Paso 5: colocación (1 firma) → finish
    await screen.findByText(es.placeSignatures.title);
    await userEvent.click(await screen.findByRole('button', { name: /Firma 1\/1/ }));

    // Paso 6: completado
    await screen.findByText(es.completed.title);
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
  });

  it('va directo a completado si el asignado ya terminó (status 3)', async () => {
    server.use(
      http.get(`${BASE}/api/asignado/autografa`, () =>
        HttpResponse.json({ Data: { nombre: 'Ana', status: 3, firma: null,
          files: { idFront: null, idBack: null, sign: null } } }),
      ),
    );
    render(<FirmaAutografa token="tok" baseUrl={BASE} />);
    await screen.findByText(es.completed.title);
  });
});
