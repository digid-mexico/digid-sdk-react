import { describe, it, expect } from 'vitest';
import { flowReducer, initialFlowState, computeStepOrder, type FlowState } from './flowReducer';
import type { StartAutografaData } from '../types/api';

const startData = { signatory: { nombre: 'Ana' } } as unknown as StartAutografaData;

function loaded(data: StartAutografaData = startData): FlowState {
  return flowReducer(initialFlowState, { type: 'LOADED', data });
}

function withPrefs(prefs: StartAutografaData['preferences']): StartAutografaData {
  return { ...startData, preferences: prefs };
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

  it('avanza en orden start → ineFront → ineBack → selfie → createSign → placeSignatures → completed', () => {
    let s = loaded();
    for (const expected of ['ineFront', 'ineBack', 'selfie', 'createSign', 'placeSignatures', 'completed'] as const) {
      s = flowReducer(s, { type: 'NEXT' });
      expect(s.step).toBe(expected);
    }
  });

  it('NEXT en completed es no-op', () => {
    let s = loaded();
    for (let i = 0; i < 7; i++) s = flowReducer(s, { type: 'NEXT' });
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

describe('computeStepOrder', () => {
  const full = ['start', 'ineFront', 'ineBack', 'selfie', 'createSign', 'placeSignatures', 'completed'];

  it('sin preferences (null) muestra todos los pasos', () => {
    expect(computeStepOrder(null)).toEqual(full);
  });

  it('con preferences pero sin los campos de INE/selfie muestra todos los pasos', () => {
    expect(computeStepOrder({ required_gps: 0 })).toEqual(full);
  });

  it('required_id_frontal !== 1 omite ineFront', () => {
    expect(computeStepOrder({ required_gps: 0, required_id_frontal: 0 })).toEqual(
      full.filter((s) => s !== 'ineFront'),
    );
  });

  it('required_id_frontal === 1 muestra ineFront', () => {
    expect(computeStepOrder({ required_gps: 0, required_id_frontal: 1 })).toEqual(full);
  });

  it('required_id_reverso === 0 omite ineBack', () => {
    expect(computeStepOrder({ required_gps: 0, required_id_reverso: 0 })).toEqual(
      full.filter((s) => s !== 'ineBack'),
    );
  });

  it('required_selfie === 0 omite selfie', () => {
    expect(computeStepOrder({ required_gps: 0, required_selfie: 0 })).toEqual(
      full.filter((s) => s !== 'selfie'),
    );
  });

  it('asimetría legacy: required_id_frontal=2 omite frontal (regla !==1) pero required_id_reverso=2 NO omite reverso (regla ===0)', () => {
    expect(computeStepOrder({ required_gps: 0, required_id_frontal: 2, required_id_reverso: 2 })).toEqual(
      full.filter((s) => s !== 'ineFront'),
    );
  });

  it('las tres banderas en 0/no-1 según su regla → solo quedan start, createSign, placeSignatures, completed', () => {
    expect(
      computeStepOrder({
        required_gps: 0, required_id_frontal: 0, required_id_reverso: 0, required_selfie: 0,
      }),
    ).toEqual(['start', 'createSign', 'placeSignatures', 'completed']);
  });
});

describe('flowReducer — orden dinámico según preferences', () => {
  it('LOADED calcula state.order a partir de las preferences', () => {
    const s = loaded(withPrefs({ required_gps: 0, required_id_frontal: 0 }));
    expect(s.order).toEqual(['start', 'ineBack', 'selfie', 'createSign', 'placeSignatures', 'completed']);
  });

  it('NEXT recorre un order reducido: con las tres banderas apagadas, start → createSign directo', () => {
    let s = loaded(
      withPrefs({
        required_gps: 0, required_id_frontal: 0, required_id_reverso: 0, required_selfie: 0,
      }),
    );
    s = flowReducer(s, { type: 'NEXT' });
    expect(s.step).toBe('createSign');
  });

  it('BACK respeta el order reducido', () => {
    let s = loaded(
      withPrefs({
        required_gps: 0, required_id_frontal: 0, required_id_reverso: 0, required_selfie: 0,
      }),
    );
    s = flowReducer(s, { type: 'NEXT' }); // createSign
    s = flowReducer(s, { type: 'BACK' });
    expect(s.step).toBe('start');
  });
});
