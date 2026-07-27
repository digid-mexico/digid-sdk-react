import type { StartAutografaData } from '../types/api';

export type FlowStep =
  | 'loading' | 'start' | 'ineFront' | 'ineBack' | 'selfie'
  | 'createSign' | 'placeSignatures' | 'completed'
  | 'exited' | 'error';

const DEFAULT_ORDER: readonly FlowStep[] = [
  'start', 'ineFront', 'ineBack', 'selfie', 'createSign', 'placeSignatures', 'completed',
];

/**
 * Replica la visibilidad condicional de pasos de AsignadoController (legacy):
 * cada pantalla se omite solo si existe un objeto `preferences`, el campo
 * correspondiente está presente (no null/undefined), y su valor cumple la
 * regla de omisión. Backends viejos que no mandan `preferences` (o que mandan
 * el objeto sin estos campos) muestran todo — default seguro.
 *
 * Las reglas NO son simétricas (se preserva el comportamiento legacy tal
 * cual): INE frontal se omite con `!= 1`, mientras que INE reverso y selfie
 * se omiten solo con `== 0`. Por ejemplo, un valor de `2` omite el frontal
 * pero NO omite el reverso ni la selfie.
 */
export function computeStepOrder(
  prefs: StartAutografaData['preferences'] | undefined,
): readonly FlowStep[] {
  const skipFront = !!prefs && prefs.required_id_frontal != null && Number(prefs.required_id_frontal) !== 1;
  const skipBack = !!prefs && prefs.required_id_reverso != null && Number(prefs.required_id_reverso) === 0;
  const skipSelfie = !!prefs && prefs.required_selfie != null && Number(prefs.required_selfie) === 0;
  return [
    'start',
    ...(skipFront ? [] : (['ineFront'] as const)),
    ...(skipBack ? [] : (['ineBack'] as const)),
    ...(skipSelfie ? [] : (['selfie'] as const)),
    'createSign', 'placeSignatures', 'completed',
  ];
}

export type ExitReason = 'user_exit' | 'already_signed' | 'document_cancelled';

export interface FlowState {
  step: FlowStep;
  startData: StartAutografaData | null;
  order: readonly FlowStep[];
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
  step: 'loading', startData: null, order: DEFAULT_ORDER, exitReason: null, error: null,
};

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case 'LOADED':
      return {
        ...state,
        step: 'start',
        startData: action.data,
        order: computeStepOrder(action.data.preferences),
        error: null,
        exitReason: null,
      };
    case 'NEXT': {
      const i = state.order.indexOf(state.step);
      if (i === -1 || i === state.order.length - 1) return state;
      return { ...state, step: state.order[i + 1]! };
    }
    case 'BACK': {
      const i = state.order.indexOf(state.step);
      if (i <= 0) return state;
      return { ...state, step: state.order[i - 1]! };
    }
    case 'GOTO':
      return { ...state, step: action.step, error: null, exitReason: null };
    case 'EXIT':
      return { ...state, step: 'exited', exitReason: action.reason };
    case 'FAIL':
      return { ...state, step: 'error', error: action.error };
  }
}
