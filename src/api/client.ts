import {
  AsignadoData, DigidError, SaveFileStep, StartAutografaData,
} from '../types/api';
import { browserString } from '../utils/device';

export interface ApiClientOptions {
  baseUrl?: string; // '' = mismo origen
  token: string;
}

interface Envelope<T> { Success?: boolean; Data: T; Message?: string }

export class ApiClient {
  private baseUrl: string;
  private token: string;

  constructor(opts: ApiClientOptions) {
    this.baseUrl = (opts.baseUrl ?? '').replace(/\/$/, '');
    this.token = opts.token;
  }

  /** URL absoluta de un recurso estático del backend (PDF, firma png, QR). */
  fileUrl(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  async startAutografa(): Promise<StartAutografaData> {
    const res = await this.request(
      `/api/archivofirma/start_autografa?token=${encodeURIComponent(this.token)}`,
    );
    return (await this.parse<Envelope<StartAutografaData>>(res)).Data;
  }

  async getAsignado(): Promise<AsignadoData> {
    const res = await this.request(
      `/api/asignado/autografa?token=${encodeURIComponent(this.token)}`,
    );
    return (await this.parse<Envelope<AsignadoData>>(res)).Data;
  }

  async saveFile(params: {
    step: SaveFileStep;
    idFirma: number;
    file?: Blob;               // upload de archivo (campo 'file')
    webCameraDataUrl?: string; // captura de cámara/canvas (campo 'webCamera', dataURL)
  }): Promise<{ Success: boolean; Step: number }> {
    const form = new FormData();
    if (params.file) form.append('file', params.file, 'capture.jpg');
    if (params.webCameraDataUrl) form.append('webCamera', params.webCameraDataUrl);
    form.append('token', this.token);
    form.append('step', params.step);
    form.append('idFirma', String(params.idFirma));
    const res = await this.request('/api/asignado/autografa/save_file', {
      method: 'POST',
      body: form,
    });
    return this.parse(res);
  }

  async finishAutografa(gps: string | null): Promise<{ Success: boolean }> {
    const form = new FormData();
    form.append('token', this.token);
    form.append('browser', browserString());
    if (gps) form.append('gps', gps);
    const res = await this.request('/api/archivofirma/finish_autografa', {
      method: 'POST',
      body: form,
    });
    return this.parse(res);
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: { Accept: 'application/json', ...init?.headers },
      });
    } catch (e) {
      throw new DigidError('NETWORK', 'No fue posible conectar con el servidor.', e);
    }
    if (!res.ok) {
      let detail: unknown;
      try { detail = await res.json(); } catch { /* cuerpo no-JSON */ }
      const code = res.status >= 500 ? 'UNEXPECTED' : 'INVALID_TOKEN';
      throw new DigidError(code, 'La solicitud fue rechazada por el servidor.', detail);
    }
    return res;
  }

  private async parse<T>(res: Response): Promise<T> {
    try {
      return (await res.json()) as T;
    } catch (e) {
      throw new DigidError('UNEXPECTED', 'Respuesta inválida del servidor.', e);
    }
  }
}
