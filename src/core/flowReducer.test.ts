import { describe, it, expect } from 'vitest';
import { flowReducer, initialFlowState, type FlowState } from './flowReducer';
import type { StartAutografaData } from '../types/api';

const startData = { signatory: { nombre: 'Ana' } } as unknown as StartAutografaData;

function loaded(): FlowState {
  return flowReducer(initialFlowState, { type: 'LOADED', data: startData });
}

describe('flowReducer', () => {
  it('inicia en loading', () => {
    expect(initialFlowState.step).toBe('loading');
  });

  it('LOADED → start con datos', () => {
    const s = loaded();
    expect(s.step).toBe('start');
    expect(s.startData).toBe(startData);
  });

  it('avanza en orden start → ineFront → ineBack → createSign → placeSignatures → completed', () => {
    let s = loaded();
    for (const expected of ['ineFront', 'ineBack', 'createSign', 'placeSignatures', 'completed'] as const) {
      s = flowReducer(s, { type: 'NEXT' });
      expect(s.step).toBe(expected);
    }
  });

  it('NEXT en completed es no-op', () => {
    let s = loaded();
    for (let i = 0; i < 6; i++) s = flowReducer(s, { type: 'NEXT' });
    expect(s.step).toBe('completed');
  });

  it('BACK retrocede y en start es no-op', () => {
    let s = loaded();
    s = flowReducer(s, { type: 'NEXT' }); // ineFront
    s = flowReducer(s, { type: 'BACK' });
    expect(s.step).toBe('start');
    expect(flowReducer(s, { type: 'BACK' }).step).toBe('start');
  });

  it('EXIT y FAIL son terminales desde cualquier paso', () => {
    const s = flowReducer(loaded(), { type: 'EXIT', reason: 'user_exit' });
    expect(s.step).toBe('exited');
    const f = flowReducer(loaded(), { type: 'FAIL', error: new Error('x') });
    expect(f.step).toBe('error');
  });

  it('GOTO permite saltos directos (redirecciones por status del backend)', () => {
    const s = flowReducer(loaded(), { type: 'GOTO', step: 'completed' });
    expect(s.step).toBe('completed');
  });

  it('NEXT en loading es no-op', () => {
    const s = flowReducer(initialFlowState, { type: 'NEXT' });
    expect(s.step).toBe('loading');
  });

  it('NEXT y BACK en exited/error son no-op', () => {
    const exited = flowReducer(loaded(), { type: 'EXIT', reason: 'user_exit' });
    expect(flowReducer(exited, { type: 'NEXT' }).step).toBe('exited');
    expect(flowReducer(exited, { type: 'BACK' }).step).toBe('exited');

    const errored = flowReducer(loaded(), { type: 'FAIL', error: new Error('x') });
    expect(flowReducer(errored, { type: 'NEXT' }).step).toBe('error');
    expect(flowReducer(errored, { type: 'BACK' }).step).toBe('error');
  });

  it('GOTO a exited funciona', () => {
    const s = flowReducer(loaded(), { type: 'GOTO', step: 'exited' });
    expect(s.step).toBe('exited');
  });

  it('tras FAIL, LOADED limpia error y exitReason', () => {
    const errored = flowReducer(loaded(), { type: 'FAIL', error: new Error('x') });
    expect(errored.error).not.toBeNull();
    const s = flowReducer(errored, { type: 'LOADED', data: startData });
    expect(s.error).toBeNull();
    expect(s.exitReason).toBeNull();
    expect(s.step).toBe('start');
  });
});
