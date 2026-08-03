import { createContext, useContext, type Dispatch } from 'react';
import type { ApiClient } from '../api/client';
import type { FlowAction, FlowState } from './flowReducer';
import type { AsignadoData } from '../types/api';
import type { DetectionAssets } from '../detection/types';
import type { ScanAssets } from '../scan/types';

export interface FlowContextValue {
  api: ApiClient;
  state: FlowState;
  dispatch: Dispatch<FlowAction>;
  asignado: AsignadoData | null;
  refreshAsignado: () => Promise<void>;
  notify: (kind: 'success' | 'error' | 'warning', message: string) => void;
  setBusy: (busy: boolean) => void;
  termsUrl: string;
  /** URL del worker de pdfjs-dist; ver prop `pdfWorkerUrl` de <FirmaAutografa> (Task 27). */
  pdfWorkerUrl?: string;
  /** URLs configurables para los detectores on-device (MediaPipe/zxing); ver Task 21. */
  detectionAssets?: DetectionAssets;
  /** URL configurable del worker de escaneo OpenCV (núcleo portado en Task 22; aún sin consumir desde los steps). */
  scanAssets?: ScanAssets;
}

export const FlowContext = createContext<FlowContextValue | null>(null);
export function useFlow(): FlowContextValue {
  const ctx = useContext(FlowContext);
  if (!ctx) throw new Error('useFlow debe usarse dentro de <FirmaAutografa>');
  return ctx;
}
