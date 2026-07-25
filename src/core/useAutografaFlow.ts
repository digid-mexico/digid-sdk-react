import { useCallback, useEffect, useReducer, useState } from 'react';
import type { ApiClient } from '../api/client';
import { DigidError, type AsignadoData } from '../types/api';
import { flowReducer, initialFlowState } from './flowReducer';

export function useAutografaFlow(api: ApiClient) {
  const [state, dispatch] = useReducer(flowReducer, initialFlowState);
  const [asignado, setAsignado] = useState<AsignadoData | null>(null);

  const refreshAsignado = useCallback(async () => {
    setAsignado(await api.getAsignado());
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [start, asig] = await Promise.all([api.startAutografa(), api.getAsignado()]);
        if (cancelled) return;
        setAsignado(asig);
        // Redirecciones por estado (portado de start.js/ine_front.js del flujo legacy)
        if (start.document.estatus === 3 || start.assignament.status === 3 || asig.status === 3) {
          dispatch({ type: 'LOADED', data: start });
          dispatch({ type: 'GOTO', step: 'completed' });
          return;
        }
        if (start.document.estatus === 4) {
          dispatch({ type: 'EXIT', reason: 'document_cancelled' });
          return;
        }
        if (start.assignament.status === 2 || asig.status === 2) {
          dispatch({ type: 'EXIT', reason: 'already_signed' });
          return;
        }
        dispatch({ type: 'LOADED', data: start });
      } catch (e) {
        if (!cancelled)
          dispatch({
            type: 'FAIL',
            error: e instanceof Error ? e : new DigidError('UNEXPECTED', 'error desconocido'),
          });
      }
    })();
    return () => { cancelled = true; };
  }, [api]);

  // Refresca datos del asignado al entrar a pasos que dependen de archivos previos
  useEffect(() => {
    if (['ineFront', 'ineBack', 'createSign'].includes(state.step)) void refreshAsignado();
  }, [state.step, refreshAsignado]);

  return { state, dispatch, asignado, refreshAsignado };
}
