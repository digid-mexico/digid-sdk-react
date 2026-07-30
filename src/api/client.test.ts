// @vitest-environment node
//
// jsdom's global FormData/File/fetch don't interop with MSW's undici-based
// node interceptor: multipart bodies built with jsdom's FormData lose their
// boundary/Content-Type when sent through undici's fetch, so MSW (and any
// real server) sees a malformed request. Node 18+'s native fetch stack does
// not have this problem, so this file opts out of the project-wide jsdom
// environment.
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { ApiClient } from './client';
import { DigidError } from '../types/api';

const BASE = 'https://backend.test';
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const client = new ApiClient({ baseUrl: BASE, token: 'tok123' });

describe('ApiClient.startAutografa', () => {
  it('devuelve Data tipada en éxito', async () => {
    server.use(
      http.get(`${BASE}/api/archivofirma/start_autografa`, ({ request }) => {
        expect(new URL(request.url).searchParams.get('token')).toBe('tok123');
        return HttpResponse.json({ Success: true, Data: { document: { id: 1 } } });
      }),
    );
    const data = await client.startAutografa();
    expect(data.document.id).toBe(1);
  });

  it('lanza DigidError NETWORK en fallo de red', async () => {
    server.use(http.get(`${BASE}/api/archivofirma/start_autografa`, () => HttpResponse.error()));
    await expect(client.startAutografa()).rejects.toMatchObject({ code: 'NETWORK' });
  });

  it('lanza DigidError en 4xx', async () => {
    server.use(
      http.get(`${BASE}/api/archivofirma/start_autografa`, () =>
        HttpResponse.json({ Message: 'token invalido' }, { status: 400 }),
      ),
    );
    await expect(client.startAutografa()).rejects.toBeInstanceOf(DigidError);
  });
});

// El token en la query string queda escrito en logs de acceso, proxy, WAF y
// CDN. `tokenTransport` permite migrarlo a un header; 'both' es el escalón de
// transición que funciona contra el backend actual y contra uno ya migrado.
describe('ApiClient tokenTransport', () => {
  it("default 'both': manda el token en header Y en la query (compatible con el backend legacy)", async () => {
    server.use(
      http.get(`${BASE}/api/archivofirma/start_autografa`, ({ request }) => {
        expect(new URL(request.url).searchParams.get('token')).toBe('tok123');
        expect(request.headers.get('x-digid-token')).toBe('tok123');
        return HttpResponse.json({ Success: true, Data: { document: { id: 1 } } });
      }),
    );
    await new ApiClient({ baseUrl: BASE, token: 'tok123' }).startAutografa();
  });

  it("'header': el token NO aparece en la URL (deja de llegar a los logs)", async () => {
    server.use(
      http.get(`${BASE}/api/archivofirma/start_autografa`, ({ request }) => {
        expect(new URL(request.url).search).toBe('');
        expect(request.url).not.toContain('tok123');
        expect(request.headers.get('x-digid-token')).toBe('tok123');
        return HttpResponse.json({ Success: true, Data: { document: { id: 1 } } });
      }),
      http.get(`${BASE}/api/asignado/autografa`, ({ request }) => {
        expect(request.url).not.toContain('tok123');
        expect(request.headers.get('x-digid-token')).toBe('tok123');
        return HttpResponse.json({ Success: true, Data: { nombre: 'Juan' } });
      }),
    );
    const c = new ApiClient({ baseUrl: BASE, token: 'tok123', tokenTransport: 'header' });
    await c.startAutografa();
    await c.getAsignado();
  });

  it("'query': comportamiento histórico exacto, sin header (evita el preflight de CORS)", async () => {
    server.use(
      http.get(`${BASE}/api/archivofirma/start_autografa`, ({ request }) => {
        expect(new URL(request.url).searchParams.get('token')).toBe('tok123');
        expect(request.headers.get('x-digid-token')).toBeNull();
        return HttpResponse.json({ Success: true, Data: { document: { id: 1 } } });
      }),
    );
    await new ApiClient({ baseUrl: BASE, token: 'tok123', tokenTransport: 'query' }).startAutografa();
  });

  it('los POST también llevan el header, conservando el token en el body', async () => {
    server.use(
      http.post(`${BASE}/api/archivofirma/finish_autografa`, async ({ request }) => {
        expect(request.headers.get('x-digid-token')).toBe('tok123');
        expect((await request.formData()).get('token')).toBe('tok123');
        return HttpResponse.json({ Success: true });
      }),
    );
    await new ApiClient({ baseUrl: BASE, token: 'tok123' }).finishAutografa(null);
  });

  it('forgot_pwd_rl no recibe el token: no lo necesita y no debe cargarlo', async () => {
    server.use(
      http.post(`${BASE}/api/firmante/forgot_pwd_rl`, async ({ request }) => {
        expect(request.headers.get('x-digid-token')).toBeNull();
        expect(await request.json()).toEqual({ email: 'rl@example.com' });
        return HttpResponse.json({ Success: true });
      }),
    );
    await new ApiClient({ baseUrl: BASE, token: 'tok123' }).forgotPwdRl('rl@example.com');
  });
});

describe('ApiClient.saveFile', () => {
  it('envía multipart con token, step e idFirma', async () => {
    server.use(
      http.post(`${BASE}/api/asignado/autografa/save_file`, async ({ request }) => {
        const form = await request.formData();
        expect(form.get('token')).toBe('tok123');
        expect(form.get('step')).toBe('ine_frente');
        expect(form.get('idFirma')).toBe('0');
        expect(form.get('file')).toBeInstanceOf(File);
        return HttpResponse.json({ Success: true, Step: 0 });
      }),
    );
    const res = await client.saveFile({
      step: 'ine_frente',
      idFirma: 0,
      file: new File([new Uint8Array([0xff, 0xd8, 0xff])], 'ine.jpg', { type: 'image/jpeg' }),
    });
    expect(res.Success).toBe(true);
  });

  it('envía webCameraDataUrl como campo webCamera, sin file, para step ine_frente', async () => {
    server.use(
      http.post(`${BASE}/api/asignado/autografa/save_file`, async ({ request }) => {
        const form = await request.formData();
        expect(form.get('token')).toBe('tok123');
        expect(form.get('step')).toBe('ine_frente');
        expect(form.get('idFirma')).toBe('7');
        expect(form.get('webCamera')).toBe('data:image/png;base64,AAAA');
        expect(form.get('file')).toBeNull();
        return HttpResponse.json({ Success: true, Step: 1 });
      }),
    );
    const res = await client.saveFile({
      step: 'ine_frente',
      idFirma: 7,
      webCameraDataUrl: 'data:image/png;base64,AAAA',
    });
    expect(res.Success).toBe(true);
  });

  it('para step firma envía el dataURL como string en el campo file, sin webCamera', async () => {
    server.use(
      http.post(`${BASE}/api/asignado/autografa/save_file`, async ({ request }) => {
        const form = await request.formData();
        expect(form.get('token')).toBe('tok123');
        expect(form.get('step')).toBe('firma');
        expect(form.get('idFirma')).toBe('7');
        const file = form.get('file');
        expect(typeof file).toBe('string');
        expect(file as string).toMatch(/^data:image\//);
        expect(form.get('webCamera')).toBeNull();
        return HttpResponse.json({ Success: true, Step: 1 });
      }),
    );
    const res = await client.saveFile({
      step: 'firma',
      idFirma: 7,
      webCameraDataUrl: 'data:image/png;base64,AAAA',
    });
    expect(res.Success).toBe(true);
  });
});

describe('ApiClient.getAsignado', () => {
  it('devuelve Data tipada en éxito', async () => {
    server.use(
      http.get(`${BASE}/api/asignado/autografa`, ({ request }) => {
        expect(new URL(request.url).searchParams.get('token')).toBe('tok123');
        return HttpResponse.json({ Success: true, Data: { nombre: 'Juan' } });
      }),
    );
    const data = await client.getAsignado();
    expect(data.nombre).toBe('Juan');
  });
});

describe('ApiClient.validRepre', () => {
  it('postea JSON con token y pwd', async () => {
    server.use(
      http.post(`${BASE}/api/archivofirma/valid_repre`, async ({ request }) => {
        expect(request.headers.get('content-type')).toContain('application/json');
        const body = await request.json();
        expect(body).toEqual({ token: 'tok123', pwd: 'secreta' });
        return HttpResponse.json({ Success: true, Data: '' });
      }),
    );
    await expect(client.validRepre('secreta')).resolves.toMatchObject({ Success: true });
  });

  it('lanza DigidError cuando la contraseña es inválida (4xx)', async () => {
    server.use(
      http.post(`${BASE}/api/archivofirma/valid_repre`, () =>
        HttpResponse.json({ Message: 'contraseña incorrecta' }, { status: 400 }),
      ),
    );
    await expect(client.validRepre('mala')).rejects.toBeInstanceOf(DigidError);
  });
});

describe('ApiClient.forgotPwdRl', () => {
  it('postea JSON con email', async () => {
    server.use(
      http.post(`${BASE}/api/firmante/forgot_pwd_rl`, async ({ request }) => {
        expect(request.headers.get('content-type')).toContain('application/json');
        const body = await request.json();
        expect(body).toEqual({ email: 'rl@example.com' });
        return HttpResponse.json({ Success: true });
      }),
    );
    await expect(client.forgotPwdRl('rl@example.com')).resolves.toMatchObject({ Success: true });
  });

  it('lanza DigidError en 4xx', async () => {
    server.use(
      http.post(`${BASE}/api/firmante/forgot_pwd_rl`, () =>
        HttpResponse.json({ Message: 'correo inválido' }, { status: 400 }),
      ),
    );
    await expect(client.forgotPwdRl('mal@correo')).rejects.toBeInstanceOf(DigidError);
  });
});

describe('ApiClient.finishAutografa', () => {
  it('postea token, browser y gps', async () => {
    server.use(
      http.post(`${BASE}/api/archivofirma/finish_autografa`, async ({ request }) => {
        const form = await request.formData();
        expect(form.get('token')).toBe('tok123');
        expect(String(form.get('browser'))).toContain('/');
        return HttpResponse.json({ Success: true });
      }),
    );
    await expect(client.finishAutografa(null)).resolves.toMatchObject({ Success: true });
  });

  it('incluye gps en el form cuando se provee', async () => {
    server.use(
      http.post(`${BASE}/api/archivofirma/finish_autografa`, async ({ request }) => {
        const form = await request.formData();
        expect(form.get('gps')).toBe('19.4326,-99.1332');
        return HttpResponse.json({ Success: true });
      }),
    );
    await expect(client.finishAutografa('19.4326,-99.1332')).resolves.toMatchObject({
      Success: true,
    });
  });
});
