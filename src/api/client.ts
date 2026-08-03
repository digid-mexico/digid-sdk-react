import {
  AsignadoData, DigidError, SaveFileStep, StartAutografaData,
} from '../types/api';
import { browserString } from '../utils/device';

/**
 * Cómo viaja el token del firmante hacia el backend.
 *
 * Un token en la query string queda escrito en los logs de acceso del
 * servidor web, del proxy inverso, del WAF y del CDN, y en las trazas de
 * APM — justo lo que la guía de integración prohíbe ("no lo registres en
 * logs"). En un header no aparece en ninguno de esos registros.
 *
 * - `'both'`   (default): header + query en los dos GET legacy. Es el modo de
 *              transición: funciona contra el backend actual (que solo lee
 *              `$_GET['token']`) y contra uno ya migrado. NO reduce todavía la
 *              exposición en logs — es solo el escalón para poder migrar.
 * - `'header'` estado objetivo: solo `X-Digid-Token`. Cámbiate a este en
 *              cuanto el backend lea el header; ahí desaparece el token de
 *              los logs.
 * - `'query'`  comportamiento histórico exacto, sin header. Útil si el CORS
 *              del backend todavía no permite el header (ver abajo).
 *
 * Se usa `X-Digid-Token` y NO `Authorization: Bearer` a propósito: en el
 * backend de Digid ese header ya identifica un token de Acceso (middleware
 * CheckToken de la API administrativa), que es otra credencial distinta. Un
 * header propio evita que ambas se confundan.
 *
 * CORS: mandar un header propio convierte cada llamada cross-origin en una
 * petición con preflight. Si `baseUrl` apunta a otro origen, el backend debe
 * responder al `OPTIONS` e incluir `X-Digid-Token` en
 * `Access-Control-Allow-Headers` ANTES de usar `'both'` o `'header'`, o todas
 * las llamadas fallarán. Con `baseUrl: ''` (mismo origen) no aplica.
 */
export type TokenTransport = 'header' | 'query' | 'both';

export interface ApiClientOptions {
  baseUrl?: string; // '' = mismo origen
  token: string;
  /** Ver TokenTransport. Default `'both'` (compatible con el backend actual). */
  tokenTransport?: TokenTransport;
}

interface Envelope<T> { Success?: boolean; Data: T; Message?: string }

export class ApiClient {
  private baseUrl: string;
  private token: string;
  private tokenTransport: TokenTransport;

  constructor(opts: ApiClientOptions) {
    this.baseUrl = (opts.baseUrl ?? '').replace(/\/$/, '');
    this.token = opts.token;
    this.tokenTransport = opts.tokenTransport ?? 'both';
  }

  /** Sufijo `?token=...` para los GET legacy; vacío cuando el token va solo en el header. */
  private tokenQuery(): string {
    return this.tokenTransport === 'header'
      ? ''
      : `?token=${encodeURIComponent(this.token)}`;
  }

  /** URL absoluta de un recurso estático del backend (QR, imágenes del backend). */
  fileUrl(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  /** PDF del documento, autorizado por token (reemplaza el antiguo /storage). */
  documentPdfUrl(): string {
    return `${this.baseUrl}/api/archivofirma/document_pdf?token=${encodeURIComponent(this.token)}`;
  }

  /** PNG de la firma del firmante, autorizado por token. */
  signatureImageUrl(): string {
    return `${this.baseUrl}/api/archivofirma/signature_image?token=${encodeURIComponent(this.token)}`;
  }

  async startAutografa(): Promise<StartAutografaData> {
    const res = await this.request(`/api/archivofirma/start_autografa${this.tokenQuery()}`);
    return (await this.parse<Envelope<StartAutografaData>>(res)).Data;
  }

  async getAsignado(): Promise<AsignadoData> {
    const res = await this.request(`/api/asignado/autografa${this.tokenQuery()}`);
    return (await this.parse<Envelope<AsignadoData>>(res)).Data;
  }

  async saveFile(params: {
    step: SaveFileStep;
    idFirma: number;
    file?: Blob;               // upload de archivo (campo 'file')
    webCameraDataUrl?: string; // captura de cámara/canvas; campo 'webCamera' en INE,
                                // campo 'file' (como string) cuando step === 'firma'
  }): Promise<{ Success: boolean; Step: number }> {
    const form = new FormData();
    if (params.file) form.append('file', params.file, 'capture.jpg');
    if (params.webCameraDataUrl) {
      // El backend (AsignadoController::saveSignatoryFile) solo lee el dataURL
      // de la firma autógrafa desde el campo 'file' como string cuando
      // step === 'firma'; para los pasos de INE lee el campo 'webCamera'.
      if (params.step === 'firma') {
        form.append('file', params.webCameraDataUrl);
      } else {
        form.append('webCamera', params.webCameraDataUrl);
      }
    }
    form.append('token', this.token);
    form.append('step', params.step);
    form.append('idFirma', String(params.idFirma));
    const res = await this.request('/api/asignado/autografa/save_file', {
      method: 'POST',
      body: form,
    });
    return this.parse(res);
  }

  async validRepre(pwd: string): Promise<{ Success: boolean }> {
    const res = await this.request('/api/archivofirma/valid_repre', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: this.token, pwd }),
    });
    return this.parse(res);
  }

  async forgotPwdRl(email: string): Promise<{ Success: boolean }> {
    const res = await this.request(
      '/api/firmante/forgot_pwd_rl',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      },
      { auth: false },
    );
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

  /**
   * @param opts.auth `false` para no mandar el token en este request. Solo lo
   *   usa forgot_pwd_rl, que hoy no lleva token en ningún lado: es un endpoint
   *   de recuperación por correo y no hay razón para entregarle la credencial.
   */
  private async request(
    path: string,
    init?: RequestInit,
    opts: { auth?: boolean } = {},
  ): Promise<Response> {
    const sendToken = (opts.auth ?? true) && this.tokenTransport !== 'query';
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          Accept: 'application/json',
          ...(sendToken ? { 'X-Digid-Token': this.token } : {}),
          ...init?.headers,
        },
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
