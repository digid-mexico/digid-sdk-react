export interface StartAutografaData {
  document: {
    id: number;
    nombre: string;
    archivo: string;
    estatus: number;
    firmas: string | null; // JSON de SignatureCoordinate[]
    client: number;
  };
  client: { id: number; razonsocial: string };
  subAccount: { correo: string } | null;
  signatory: { id: number; nombre: string; representantelegal: number };
  assignament: {
    status: number;
    idfirmante: number;
    verifiacion_rostro: number; // sic: typo del backend, se respeta
    verificacion_identificacion: number;
  };
  style: { logofirmas: string; btnbackground_color: string; btn_color: string } | null;
  repre: { firma: string } | null;
  preferences: { required_gps: number } | null;
  diff_documents: string | null;
}

export interface AsignadoData {
  nombre: string;
  status: number;
  firma: { id: number } | null;
  files: { idFront: string | null; idBack: string | null; sign: string | null };
}

export interface SignatureCoordinate {
  id: string;
  firmante: number | string;
  pagina: number | string;
  xDoc: number;
  ydoc: number;
  AnchoPagina: number;
  altoPagina: number;
  position: number; // rotación en grados
  nombre: string;
}

export type SaveFileStep = 'ine_frente' | 'ine_reverso' | 'selfie' | 'firma';

export type DigidErrorCode =
  | 'NETWORK'
  | 'INVALID_TOKEN'
  | 'DOCUMENT_ALREADY_SIGNED'
  | 'DOCUMENT_CANCELLED'
  | 'UPLOAD_REJECTED'
  | 'FINISH_FAILED'
  | 'UNEXPECTED';

export class DigidError extends Error {
  constructor(
    public code: DigidErrorCode,
    message: string,
    public detail?: unknown,
  ) {
    super(message);
    this.name = 'DigidError';
  }
}
