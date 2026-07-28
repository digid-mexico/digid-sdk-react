import { describe, it, expect } from 'vitest';
import {
  marcoDisplayRect,
  displayRectToFrame,
  roiFromMarco,
  rectToRoiCanvas,
  roiCornersToFrame,
  scaleRect,
  validateQuadInMarco,
  marcoGuidance,
  MARCO_ASPECT,
  ROI_MARGIN_FRAC,
  MARCO_WIDTH_FRAC,
  MARCO_WIDTH_FRAC_DESKTOP,
  marcoFrameRect,
  frameRectToDisplay
} from './marco';
import type { Corners, Rect } from './types';

const quadFromRect = (r: Rect): Corners => ({
  topLeftCorner: { x: r.x, y: r.y },
  topRightCorner: { x: r.x + r.width, y: r.y },
  bottomLeftCorner: { x: r.x, y: r.y + r.height },
  bottomRightCorner: { x: r.x + r.width, y: r.y + r.height }
});

describe('marcoDisplayRect', () => {
  it('centra un marco ID-1 al 80% del ancho', () => {
    const r = marcoDisplayRect(1000, 800);
    expect(r.width).toBeCloseTo(800, 5);
    expect(r.height).toBeCloseTo(800 / MARCO_ASPECT, 1);
    expect(r.x).toBeCloseTo(100, 5);
    expect(r.y).toBeCloseTo((800 - r.height) / 2, 5);
  });

  it('acota por alto en viewports anchos y bajos', () => {
    const r = marcoDisplayRect(2000, 500);
    expect(r.height).toBeCloseTo(400, 5);
    expect(r.width).toBeCloseTo(400 * MARCO_ASPECT, 1);
  });
});

describe('displayRectToFrame', () => {
  it('es la inversa del mapeo cover cuando frame y display comparten aspecto', () => {
    // frame 1920x1080 mostrado en 960x540: escala 0.5 sin offset
    const r = displayRectToFrame({ x: 96, y: 54, width: 480, height: 270 }, 1920, 1080, 960, 540);
    expect(r).toEqual({ x: 192, y: 108, width: 960, height: 540 });
  });

  it('compensa el offset del cover cuando el display es mas angosto que el frame', () => {
    // frame 2000x1000 en display 500x500: escala 0.5, sobra 500px de frame a lo ancho
    const r = displayRectToFrame({ x: 0, y: 0, width: 500, height: 500 }, 2000, 1000, 500, 500);
    expect(r.x).toBeCloseTo(500, 5);
    expect(r.y).toBeCloseTo(0, 5);
    expect(r.width).toBeCloseTo(1000, 5);
    expect(r.height).toBeCloseTo(1000, 5);
  });
});

describe('roiFromMarco', () => {
  it('expande el marco 15% por lado', () => {
    const roi = roiFromMarco({ x: 200, y: 200, width: 1000, height: 630 }, 1920, 1080);
    expect(roi.x).toBeCloseTo(200 - 150, 5);
    expect(roi.y).toBeCloseTo(200 - 94.5, 5);
    expect(roi.width).toBeCloseTo(1300, 5);
    expect(roi.height).toBeCloseTo(819, 5);
  });

  it('se acota a los limites del frame', () => {
    const roi = roiFromMarco({ x: 10, y: 10, width: 1900, height: 1060 }, 1920, 1080);
    expect(roi.x).toBe(0);
    expect(roi.y).toBe(0);
    expect(roi.width).toBeLessThanOrEqual(1920);
    expect(roi.height).toBeLessThanOrEqual(1080);
  });
});

describe('conversiones frame <-> canvas del ROI', () => {
  const roi = { x: 100, y: 50, width: 1440, height: 900 };
  it('rectToRoiCanvas escala al ancho del canvas', () => {
    const r = rectToRoiCanvas({ x: 100, y: 50, width: 720, height: 450 }, roi, 720);
    expect(r).toEqual({ x: 0, y: 0, width: 360, height: 225 });
  });
  it('roiCornersToFrame invierte rectToRoiCanvas', () => {
    const corners = quadFromRect({ x: 10, y: 20, width: 300, height: 200 });
    const back = roiCornersToFrame(corners, roi, 720);
    expect(back.topLeftCorner.x).toBeCloseTo(10 * 2 + 100, 5);
    expect(back.topLeftCorner.y).toBeCloseTo(20 * 2 + 50, 5);
    expect(back.bottomRightCorner.x).toBeCloseTo(310 * 2 + 100, 5);
  });
  it('scaleRect multiplica todo por el factor', () => {
    expect(scaleRect({ x: 1, y: 2, width: 3, height: 4 }, 2)).toEqual({ x: 2, y: 4, width: 6, height: 8 });
  });
});

describe('validateQuadInMarco', () => {
  const marco = { x: 100, y: 100, width: 500, height: 315 };

  it('acepta un quad que cubre el marco completo', () => {
    const v = validateQuadInMarco(quadFromRect(marco), marco);
    expect(v.ok).toBe(true);
    expect(v.coverage).toBeCloseTo(1, 2);
  });

  it('rechaza cobertura < 70% (la clase del recorte mutilado IMG_0352)', () => {
    const small = quadFromRect({ x: 200, y: 150, width: 250, height: 160 });
    const v = validateQuadInMarco(small, marco);
    expect(v.ok).toBe(false);
    expect(v.reason).toBe('coverage');
  });

  it('rechaza un lado muy adentro aunque el area alcance (modo contenido apagado)', () => {
    // area = 80% del marco, pero el lado derecho queda 100px adentro (> tol 75px)
    const inset = quadFromRect({ x: 100, y: 100, width: 400, height: 315 });
    const v = validateQuadInMarco(inset, marco, { containedCoverage: 1 });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe('inside-right');
  });

  it('lado muy adentro pero cobertura >= piso: captura contenida (2026-07-22)', () => {
    const inset = quadFromRect({ x: 100, y: 100, width: 400, height: 315 });
    const v = validateQuadInMarco(inset, marco);
    expect(v.ok).toBe(true);
    expect(v.contained).toBe(true);
  });

  it('tolera lados dentro de la banda del margen', () => {
    const tol = 500 * ROI_MARGIN_FRAC; // 75px
    const nearEdge = quadFromRect({ x: 100 + tol - 5, y: 100, width: 500 - (tol - 5), height: 315 });
    expect(validateQuadInMarco(nearEdge, marco).ok).toBe(true);
  });
});

describe('marcoGuidance', () => {
  it('sin esquinas y con foco en cuadro avisa del deslumbramiento', () => {
    const g = marcoGuidance({ corners: null, frame: { glareRatio: 0.004, brightness: 120 } });
    expect(g!.message).toMatch(/deslumbra/);
    expect(g!.tone).toBe('warn');
  });

  it('sin esquinas y oscuro pide luz', () => {
    const g = marcoGuidance({ corners: null, frame: { glareRatio: 0, brightness: 40 } });
    expect(g!.message).toMatch(/oscuro/);
  });

  it('sin esquinas con frame normal pide colocar la credencial', () => {
    const g = marcoGuidance({ corners: null, frame: { glareRatio: 0, brightness: 120 } });
    expect(g!.tone).toBe('idle');
    expect(g!.message).toMatch(/dentro del marco/);
  });

  it('racha larga sin quad sugiere fondo oscuro', () => {
    const g = marcoGuidance({ corners: null, frame: { glareRatio: 0, brightness: 120 }, noQuadStreak: 20 });
    expect(g!.tone).toBe('warn');
    expect(g!.message).toMatch(/fondo oscuro/);
  });

  it('racha corta sin quad conserva el mensaje idle', () => {
    const g = marcoGuidance({ corners: null, frame: { glareRatio: 0, brightness: 120 }, noQuadStreak: 19 });
    expect(g!.tone).toBe('idle');
  });

  it('el deslumbramiento gana sobre el consejo de fondo', () => {
    const g = marcoGuidance({ corners: null, frame: { glareRatio: 0.004, brightness: 120 }, noQuadStreak: 30 });
    expect(g!.message).toMatch(/deslumbra/);
  });

  it('validacion fallida por cobertura pide acercarla', () => {
    const g = marcoGuidance({
      corners: quadFromRect({ x: 0, y: 0, width: 10, height: 6 }),
      validation: { ok: false, reason: 'coverage', coverage: 0.4 }
    });
    expect(g!.message).toMatch(/llenar el marco/);
  });

  it('validacion fallida por lado adentro pide cubrir el marco', () => {
    const g = marcoGuidance({
      corners: quadFromRect({ x: 0, y: 0, width: 10, height: 6 }),
      validation: { ok: false, reason: 'inside-right', coverage: 0.8 }
    });
    expect(g!.message).toMatch(/cubrir todo el marco/);
  });

  it('quad valido pero inclinado pide enderezar', () => {
    const tilted = {
      topLeftCorner: { x: 0, y: 0 },
      topRightCorner: { x: 100, y: 30 },
      bottomLeftCorner: { x: -30, y: 60 },
      bottomRightCorner: { x: 70, y: 90 }
    };
    const g = marcoGuidance({ corners: tilted, validation: { ok: true, coverage: 0.9 } });
    expect(g!.message).toMatch(/Endereza/);
  });

  it('quad valido y derecho no da guia (null)', () => {
    const g = marcoGuidance({
      corners: quadFromRect({ x: 0, y: 0, width: 100, height: 63 }),
      validation: { ok: true, coverage: 0.95 }
    });
    expect(g).toBeNull();
  });
});

describe('marco segun dispositivo (calibracion webcam 2026-07-17)', () => {
  it('el marco de escritorio es mas chico que el de movil', () => {
    expect(MARCO_WIDTH_FRAC_DESKTOP).toBeLessThan(MARCO_WIDTH_FRAC);
  });

  it('marcoDisplayRect honra el widthFrac de escritorio (marco mas chico)', () => {
    const movil = marcoDisplayRect(1000, 800, { widthFrac: MARCO_WIDTH_FRAC });
    const escritorio = marcoDisplayRect(1000, 800, { widthFrac: MARCO_WIDTH_FRAC_DESKTOP });
    expect(escritorio.width).toBeCloseTo(1000 * MARCO_WIDTH_FRAC_DESKTOP, 5);
    expect(escritorio.width).toBeLessThan(movil.width);
  });
});

describe('validateQuadInMarco con overrides', () => {
  const marco = { x: 0, y: 0, width: 100, height: 63 };
  // Quad que cubre ~55% del marco: rechazado con el default 0.70,
  // aceptado si minCoverage baja a 0.50.
  const smallQuad = {
    topLeftCorner: { x: 13, y: 8 },
    topRightCorner: { x: 88, y: 8 },
    bottomRightCorner: { x: 88, y: 55 },
    bottomLeftCorner: { x: 13, y: 55 }
  };

  it('sin opts el quad chico (0.56) captura en modo contenido (2026-07-22)', () => {
    const v = validateQuadInMarco(smallQuad, marco);
    expect(v.ok).toBe(true);
    expect(v.contained).toBe(true);
  });

  it('minCoverage inyectado cambia el veredicto', () => {
    const v = validateQuadInMarco(smallQuad, marco, { minCoverage: 0.5, marginFrac: 0.15 });
    expect(v.ok).toBe(true);
    expect(v.contained).toBeUndefined();
  });

  it('marginFrac inyectado ensancha la banda de tolerancia (modo contenido apagado)', () => {
    const v = validateQuadInMarco(smallQuad, marco, { minCoverage: 0.5, marginFrac: 0.05, containedCoverage: 1 });
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/^inside-/);
  });
});

describe('modo contenido (2026-07-22: captura sin llenar el marco)', () => {
  const marco = { x: 0, y: 0, width: 100, height: 63 };
  // ~56% del marco: bajo el umbral alineado (0.70), sobre el piso (0.55).
  const mediano = {
    topLeftCorner: { x: 13, y: 8 },
    topRightCorner: { x: 88, y: 8 },
    bottomRightCorner: { x: 88, y: 55 },
    bottomLeftCorner: { x: 13, y: 55 }
  };
  // ~30% del marco: bajo el piso de legibilidad — sigue pidiendo acercarla.
  const chico = {
    topLeftCorner: { x: 25, y: 15 },
    topRightCorner: { x: 80, y: 15 },
    bottomRightCorner: { x: 80, y: 50 },
    bottomLeftCorner: { x: 25, y: 50 }
  };

  it('detectada dentro del marco sin llenarlo: captura (contained)', () => {
    const v = validateQuadInMarco(mediano, marco);
    expect(v.ok).toBe(true);
    expect(v.contained).toBe(true);
  });

  it('bajo el piso de legibilidad sigue rechazando con coverage', () => {
    const v = validateQuadInMarco(chico, marco);
    expect(v.ok).toBe(false);
    expect(v.reason).toBe('coverage');
  });

  it('containedCoverage: 1 restaura el comportamiento estricto', () => {
    const v = validateQuadInMarco(mediano, marco, { containedCoverage: 1 });
    expect(v.ok).toBe(false);
  });
});

describe('marcoFrameRect + frameRectToDisplay (marco en espacio del frame, 2026-07-23)', () => {
  it('fraccion del ancho del FRAME, aspecto ID-1, centrado', () => {
    const r = marcoFrameRect(1280, 720, { widthFrac: 0.42 });
    expect(r.width).toBeCloseTo(537.6, 1);
    expect(r.height).toBeCloseTo(537.6 / 1.586, 1);
    expect(r.x).toBeCloseTo((1280 - r.width) / 2, 5);
    expect(r.y).toBeCloseTo((720 - r.height) / 2, 5);
  });

  it('clampa a maxW y recalcula por maxH', () => {
    const r = marcoFrameRect(1280, 720, { widthFrac: 0.42, maxW: 400 });
    expect(r.width).toBe(400);
    const r2 = marcoFrameRect(1280, 720, { widthFrac: 0.8, maxH: 200 });
    expect(r2.height).toBe(200);
    expect(r2.width).toBeCloseTo(200 * 1.586, 5);
  });

  it('frameRectToDisplay invierte displayRectToFrame (roundtrip)', () => {
    const disp = { x: 100, y: 50, width: 300, height: 189 };
    const frame = displayRectToFrame(disp, 1280, 720, 650, 700);
    const back = frameRectToDisplay(frame, 1280, 720, 650, 700);
    expect(back.x).toBeCloseTo(disp.x, 6);
    expect(back.y).toBeCloseTo(disp.y, 6);
    expect(back.width).toBeCloseTo(disp.width, 6);
    expect(back.height).toBeCloseTo(disp.height, 6);
  });
});
