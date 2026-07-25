import type { StartAutografaData } from '../types/api';

export type FlowStep =
  | 'loading' | 'start' | 'ineFront' | 'ineBack'
  | 'createSign' | 'placeSignatures' | 'completed'
  | 'exited' | 'error';

// El hueco para 'selfie' (v2) se inserta aquí entre ineBack y createSign.
const ORDER: FlowStep[] = [
  'start', 'ineFront', 'ineBack', 'createSign', 'placeSignatures', 'completed',
];

export type ExitReason = 'user_exit' | 'already_signed' | 'document_cancelled';

export interface FlowState {
  step: FlowStep;
  startData: StartAutografaData | null;
  exitReason: ExitReason | null;
  error: Error | null;
}

export type FlowAction =
  | { type: 'LOADED'; data: StartAutografaData }
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'GOTO'; step: FlowStep }
  | { type: 'EXIT'; reason: ExitReason }
  | { type: 'FAIL'; error: Error };

export const initialFlowState: FlowState = {
  step: 'loading', startData: null, exitReason: null, error: null,
};

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case 'LOADED':
      return { ...state, step: 'start', startData: action.data };
    case 'NEXT': {
      const i = ORDER.indexOf(state.step);
      if (i === -1 || i === ORDER.length - 1) return state;
      return { ...state, step: ORDER[i + 1]! };
    }
    case 'BACK': {
      const i = ORDER.indexOf(state.step);
      if (i <= 0) return state;
      return { ...state, step: ORDER[i - 1]! };
    }
    case 'GOTO':
      return { ...state, step: action.step };
    case 'EXIT':
      return { ...state, step: 'exited', exitReason: action.reason };
    case 'FAIL':
      return { ...state, step: 'error', error: action.error };
  }
}
