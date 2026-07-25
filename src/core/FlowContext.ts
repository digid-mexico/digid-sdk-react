import { createContext, useContext, type Dispatch } from 'react';
import type { ApiClient } from '../api/client';
import type { FlowAction, FlowState } from './flowReducer';
import type { AsignadoData } from '../types/api';

export interface FlowContextValue {
  api: ApiClient;
  state: FlowState;
  dispatch: Dispatch<FlowAction>;
  asignado: AsignadoData | null;
  refreshAsignado: () => Promise<void>;
  notify: (kind: 'success' | 'error' | 'warning', message: string) => void;
  setBusy: (busy: boolean) => void;
  termsUrl: string;
}

export const FlowContext = createContext<FlowContextValue | null>(null);
export function useFlow(): FlowContextValue {
  const ctx = useContext(FlowContext);
  if (!ctx) throw new Error('useFlow debe usarse dentro de <FirmaAutografa>');
  return ctx;
}
