import { describe, it, expect } from 'vitest';
import {
  quadArea,
  quadSize,
  quadAspect,
  cornerMovement,
  scaleCorners,
  mapCornersToDisplay,
  qualityVerdict,
  isWashOnlyReject,
  WASH_VALVE_CAP,
  planStillDetectAttempts,
  portraitToLandscape,
  orientationFlipNeeded,
  frameGuidance,
  createDetectionConfirmer,
  extremeBlur
} from './docscan';
import type { Corners, QualityMetrics } from './types';

type Pt = [number, number];

function corners(tl: Pt, tr: Pt, bl: Pt, br: Pt): Corners {
  return {
    topLeftCorner: { x: tl[0], y: tl[1] },
    topRightCorner: { x: tr[0], y: tr[1] },
    bottomLeftCorner: { x: bl[0], y: bl[1] },
    bottomRightCorner: { x: br[0], y: br[1] }
  };
}

const RECT_200x100 = corners([0, 0], [200, 0], [0, 100], [200, 100]);

describe('quadArea', () => {
  it('rectangulo 200x100 da 20000', () => {
    expect(quadArea(RECT_200x100)).toBe(20000);
  });
  it('es invariante al orden de recorrido (valor absoluto)', () => {
    const flipped = corners([0, 100], [200, 100], [0, 0], [200, 0]);
    expect(quadArea(flipped)).toBe(20000);
  });
});

describe('quadSize / quadAspect', () => {
  it('mide lados promediados', () => {
    expect(quadSize(RECT_200x100)).toEqual({ width: 200, height: 100 });
    expect(quadAspect(RECT_200x100)).toBe(2);
  });
  it('promedia trapecios de perspectiva', () => {
    const trapezoid = corners([0, 0], [200, 0], [20, 100], [180, 100]);
    expect(quadSize(trapezoid).width).toBe(180);
    expect(quadAspect(trapezoid)).toBeCloseTo(180 / quadSize(trapezoid).height, 5);
  });
  it('altura cero da aspecto 0', () => {
    const flat = corners([0, 0], [200, 0], [0, 0], [200, 0]);
    expect(quadAspect(flat)).toBe(0);
  });
});

describe('scaleCorners', () => {
  it('multiplica cada esquina por el factor', () => {
    const scaled = scaleCorners(RECT_200x100, 4);
    expect(scaled.topRightCorner).toEqual({ x: 800, y: 0 });
    expect(scaled.bottomRightCorner).toEqual({ x: 800, y: 400 });
  });
});

describe('mapCornersToDisplay', () => {
  it('sin recorte (aspectos iguales) solo escala', () => {
    // frame 400x300 -> display 800x600: scale 2, sin offset
    const pts = mapCornersToDisplay(RECT_200x100, 400, 300, 800, 600);
    expect(pts[0]).toEqual({ x: 0, y: 0 });       // TL
    expect(pts[1]).toEqual({ x: 400, y: 0 });     // TR
    expect(pts[2]).toEqual({ x: 400, y: 200 });   // BR
    expect(pts[3]).toEqual({ x: 0, y: 200 });     // BL
  });

  it('object-fit cover: video horizontal en display vertical centra con offset negativo', () => {
    // frame 400x300 en display 300x600 -> scale = max(0.75, 2) = 2,
    // renderizado 800x600, offsetX = (300-800)/2 = -250
    const pts = mapCornersToDisplay(RECT_200x100, 400, 300, 300, 600);
    expect(pts[0]).toEqual({ x: -250, y: 0 });
    expect(pts[1]).toEqual({ x: 150, y: 0 });
    expect(pts[2]).toEqual({ x: 150, y: 200 });
  });

  it('orden de salida es TL, TR, BR, BL (para polygon)', () => {
    const pts = mapCornersToDisplay(RECT_200x100, 200, 100, 200, 100);
    expect(pts).toEqual([
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 100 },
      { x: 0, y: 100 }
    ]);
  });
});

describe('cornerMovement', () => {
  it('sin frame previo devuelve 1 (inestable)', () => {
    expect(cornerMovement(null, RECT_200x100, 300, 400)).toBe(1);
  });
  it('esquinas identicas devuelven 0', () => {
    expect(cornerMovement(RECT_200x100, RECT_200x100, 300, 400)).toBe(0);
  });
  it('normaliza el desplazamiento maximo a la diagonal', () => {
    const moved = corners([30, 40], [200, 0], [0, 100], [200, 100]);
    // desplazamiento (30,40) = 50px sobre diagonal 500px (canvas 300x400)
    expect(cornerMovement(RECT_200x100, moved, 300, 400)).toBeCloseTo(0.1, 8);
  });
});

describe('qualityVerdict', () => {
  const GOOD = { sharpness: 220, sharpRatio: 3.5, brightness: 140, contrast: 50, glareRatio: 0.01, darkRatio: 0.02, washedRatio: 0.01, lowLightRatio: 0.05 };

  it('captura nitida y bien expuesta pasa con score alto', () => {
    const v = qualityVerdict(GOOD);
    expect(v.ok).toBe(true);
    expect(v.hint).toBe('');
    expect(v.score).toBeGreaterThanOrEqual(85);
  });

  it('borrosa (laplaciano bajo) se rechaza con hint de firmeza', () => {
    const v = qualityVerdict({ ...GOOD, sharpness: 18 });
    expect(v.ok).toBe(false);
    expect(v.hint).toMatch(/borrosa/i);
  });

  it('oscura se rechaza con hint de luz', () => {
    const v = qualityVerdict({ ...GOOD, brightness: 35 });
    expect(v.ok).toBe(false);
    expect(v.hint).toMatch(/Falta luz/);
  });

  it('sobreexpuesta se rechaza', () => {
    const v = qualityVerdict({ ...GOOD, brightness: 240 });
    expect(v.ok).toBe(false);
    expect(v.hint).toMatch(/Demasiada luz/);
  });

  it('con mucho glare se rechaza', () => {
    const v = qualityVerdict({ ...GOOD, glareRatio: 0.15 });
    expect(v.ok).toBe(false);
    expect(v.hint).toMatch(/reflejos/i);
  });

  it('recorte plano sin contenido (contraste bajo) se rechaza', () => {
    const v = qualityVerdict({ ...GOOD, contrast: 10 });
    expect(v.ok).toBe(false);
    expect(v.hint).toMatch(/Enfoca/);
  });

  it('metrics null no truena', () => {
    const v = qualityVerdict(null);
    expect(v.ok).toBe(false);
    expect(v.score).toBe(0);
  });

  it('el primer problema define el hint (borrosa antes que glare)', () => {
    const v = qualityVerdict({ ...GOOD, sharpness: 10, glareRatio: 0.2 });
    expect(v.hint).toMatch(/borrosa/i);
  });

  it('QR borroso: varianza absoluta alta pero ratio bajo se rechaza', () => {
    // textura densa movida: sharpness enorme por el patron, ratio ~1.4
    const v = qualityVerdict({ ...GOOD, sharpness: 900, sharpRatio: 1.4 });
    expect(v.ok).toBe(false);
    expect(v.hint).toMatch(/borrosa/i);
  });

  it('sin sharpRatio (metrics viejas) no aplica el check de ratio', () => {
    const { sharpRatio, ...legacy } = GOOD;
    const v = qualityVerdict(legacy);
    expect(v.ok).toBe(true);
  });

  it('webcam suave pero legible (varianza baja, ratio alto) pasa', () => {
    // corpus 2026-07-14: capturas de FaceTime HD legibles daban sharpness
    // 35-37 con sharpRatio > 3; el umbral absoluto de 45 las rechazaba mal
    const v = qualityVerdict({ ...GOOD, sharpness: 37, sharpRatio: 3.3 });
    expect(v.ok).toBe(true);
  });

  it('varianza baja CON ratio debil sigue siendo borrosa', () => {
    const v = qualityVerdict({ ...GOOD, sharpness: 37, sharpRatio: 2.2 });
    expect(v.ok).toBe(false);
    expect(v.hint).toMatch(/borrosa/i);
  });

  it('reflejo que lava un bloque de datos se rechaza aunque todo lo demas pase', () => {
    // corpus telefono 2026-07-15: por encima del umbral 0.10 (subido desde
    // 0.05 tras medir capturas legibles con laminado en 0.056-0.111) el
    // reflejo difuso ya tapa datos de forma consistente
    const v = qualityVerdict({ ...GOOD, washedRatio: 0.12 });
    expect(v.ok).toBe(false);
    expect(v.hint).toMatch(/reflejo tapa/i);
  });

  it('sin washedRatio (metrics viejas) no aplica el check de lavado', () => {
    const { washedRatio, ...legacy } = GOOD;
    const v = qualityVerdict(legacy);
    expect(v.ok).toBe(true);
  });

  it('recorte dominado por fondo oscuro (quad falso) se rechaza', () => {
    // corpus: quad de escritorio+tarjeta dio lowLightRatio 34% con nitidez
    // y exposicion normales; un recorte legitimo quedo <= 21%
    const v = qualityVerdict({ ...GOOD, lowLightRatio: 0.34 });
    expect(v.ok).toBe(false);
    expect(v.hint).toMatch(/no se aprecia/i);
  });

  // Corpus telefono 2026-07-15 (capturas reales de iPhone): el umbral viejo
  // (0.05) rechazaba en bucle tomas nitidas y legibles cuyo laminado
  // reflejaba luz de techo (wash 0.056-0.111). El umbral subio a 0.10; la
  // zona 0.10-0.15 la rescata la valvula de Camera.jsx (isWashOnlyReject)
  // tras varios intentos. Un wash extremo como una INE mostrada en la
  // pantalla de una laptop (0.226 medido) sigue bloqueado siempre.
  it('wash 0.079 (laminado de telefono, resto de metricas buenas) pasa con el umbral nuevo', () => {
    const v = qualityVerdict({ ...GOOD, washedRatio: 0.079 });
    expect(v.ok).toBe(true);
  });

  it('wash 0.107 se rechaza y codes trae solo washed', () => {
    const v = qualityVerdict({ ...GOOD, washedRatio: 0.107 });
    expect(v.ok).toBe(false);
    expect(v.codes).toEqual(['washed']);
  });

  it('wash 0.226 (INE mostrada en pantalla de laptop) se rechaza', () => {
    const v = qualityVerdict({ ...GOOD, washedRatio: 0.226 });
    expect(v.ok).toBe(false);
  });

  it('frontera del umbral: 0.10 exacto pasa, 0.101 rechaza', () => {
    expect(qualityVerdict({ ...GOOD, washedRatio: 0.10 }).ok).toBe(true);
    expect(qualityVerdict({ ...GOOD, washedRatio: 0.101 }).ok).toBe(false);
  });

  it('codes acumula varios problemas en el orden real de los pushes', () => {
    const v = qualityVerdict({ ...GOOD, washedRatio: 0.15, sharpness: 10 });
    expect(v.ok).toBe(false);
    expect(v.codes).toEqual(['washed', 'blurry']);
  });
});

describe('isWashOnlyReject', () => {
  const GOOD = { sharpness: 220, sharpRatio: 3.5, brightness: 140, contrast: 50, glareRatio: 0.01, darkRatio: 0.02, washedRatio: 0.01, lowLightRatio: 0.05 };
  // Reconstruye la forma que produce assessDocQuality: { ...qualityVerdict(metrics), metrics }
  const verdictFor = (metrics: QualityMetrics) => ({ ...qualityVerdict(metrics), metrics });

  it('wash-only por debajo del tope de la valvula: rescatable', () => {
    expect(isWashOnlyReject(verdictFor({ ...GOOD, washedRatio: 0.12 }))).toBe(true);
  });

  it('verdict ok (no fue rechazo): false', () => {
    expect(isWashOnlyReject(verdictFor({ ...GOOD, washedRatio: 0.079 }))).toBe(false);
  });

  it(`wash en el tope o por encima (>= ${WASH_VALVE_CAP}): no se rescata`, () => {
    expect(isWashOnlyReject(verdictFor({ ...GOOD, washedRatio: 0.16 }))).toBe(false);
    expect(isWashOnlyReject(verdictFor({ ...GOOD, washedRatio: WASH_VALVE_CAP }))).toBe(false);
  });

  it('wash mas otro problema: no es wash-only', () => {
    expect(isWashOnlyReject(verdictFor({ ...GOOD, washedRatio: 0.12, sharpness: 10 }))).toBe(false);
  });

  it('verdict null: false', () => {
    expect(isWashOnlyReject(null)).toBe(false);
  });

  it('metrics ausente en el verdict: false', () => {
    expect(isWashOnlyReject({ ok: false, score: 0, hint: '', codes: ['washed'] })).toBe(false);
  });
});

describe('portraitToLandscape', () => {
  it('reetiqueta un quad vertical para que el warp lo acueste (tope fisico a la izquierda)', () => {
    // tarjeta parada: rect 100x158 con esquinas de imagen nombradas por posicion
    const vertical = corners([0, 0], [100, 0], [0, 158], [100, 158]);
    const relabeled = portraitToLandscape(vertical);
    // el tope fisico (borde izquierdo de la imagen) pasa a ser el lado top
    expect(relabeled.topLeftCorner).toEqual({ x: 0, y: 158 });     // imagen BL
    expect(relabeled.topRightCorner).toEqual({ x: 0, y: 0 });      // imagen TL
    expect(relabeled.bottomLeftCorner).toEqual({ x: 100, y: 158 }); // imagen BR
    expect(relabeled.bottomRightCorner).toEqual({ x: 100, y: 0 }); // imagen TR
    // el quad reetiquetado mide acostado: ancho = lado largo fisico
    expect(quadAspect(relabeled)).toBeCloseTo(1.58, 2);
  });
});

describe('orientationFlipNeeded', () => {
  it('frente: la franja gris del encabezado debe quedar arriba', () => {
    // top mas claro que bottom = encabezado abajo = de cabeza
    expect(orientationFlipNeeded(220, 160, 'front')).toBe(true);
    expect(orientationFlipNeeded(160, 220, 'front')).toBe(false);
  });
  it('reverso: la zona de lectura mecanica (oscura) debe quedar abajo', () => {
    expect(orientationFlipNeeded(160, 220, 'back')).toBe(true);
    expect(orientationFlipNeeded(220, 160, 'back')).toBe(false);
  });
  it('diferencia chica (gradiente de luz) no voltea', () => {
    expect(orientationFlipNeeded(182, 180, 'front')).toBe(false);
    expect(orientationFlipNeeded(180, 182, 'back')).toBe(false);
  });
});

describe('frameGuidance', () => {
  const FRAME_OK = { brightness: 140, contrast: 60, glareRatio: 0.0002 };
  const centered = (w: number, h: number, scale = 0.5) => {
    // quad ID-1 centrado ocupando `scale` del ancho
    const cw = w * scale, ch = cw / 1.586;
    const x1 = (w - cw) / 2, y1 = (h - ch) / 2;
    return corners([x1, y1], [x1 + cw, y1], [x1, y1 + ch], [x1 + cw, y1 + ch]);
  };

  it('sin deteccion y con luz deslumbrando: pide mover el foco', () => {
    const g = frameGuidance({ corners: null, frame: { ...FRAME_OK, glareRatio: 0.004 }, width: 480, height: 320 });
    expect(g!.message).toMatch(/deslumbra/i);
  });

  it('sin deteccion y oscuro: pide luz', () => {
    const g = frameGuidance({ corners: null, frame: { ...FRAME_OK, brightness: 40 }, width: 480, height: 320 });
    expect(g!.message).toMatch(/oscuro/i);
  });

  it('sin deteccion con frame normal: pide colocar el documento en el marco', () => {
    const g = frameGuidance({ corners: null, frame: FRAME_OK, width: 480, height: 320 });
    expect(g!.message).toMatch(/dentro del marco/i);
  });

  it('deteccion chica: pide acercar', () => {
    const c = centered(480, 320, 0.25);
    const g = frameGuidance({ corners: c, areaRatio: 0.05, frame: FRAME_OK, width: 480, height: 320 });
    expect(g!.message).toMatch(/acerca/i);
  });

  it('deteccion enorme: pide alejar', () => {
    const c = centered(480, 320, 0.98);
    const g = frameGuidance({ corners: c, areaRatio: 0.75, frame: FRAME_OK, width: 480, height: 320 });
    expect(g!.message).toMatch(/aleja/i);
  });

  it('cargada a la derecha: pide centrar', () => {
    const c = corners([340, 100], [470, 100], [340, 182], [470, 182]);
    const g = frameGuidance({ corners: c, areaRatio: 0.2, frame: FRAME_OK, width: 480, height: 320 });
    expect(g!.message).toMatch(/derecha/i);
  });

  it('cargada a la izquierda: pide centrar', () => {
    const c = corners([5, 100], [135, 100], [5, 182], [135, 182]);
    const g = frameGuidance({ corners: c, areaRatio: 0.2, frame: FRAME_OK, width: 480, height: 320 });
    expect(g!.message).toMatch(/izquierda/i);
  });

  it('vista en espejo: izquierda/derecha se invierten para coincidir con la pantalla', () => {
    // tarjeta a la DERECHA del frame crudo: en el espejo se VE a la izquierda
    const c = corners([340, 100], [470, 100], [340, 182], [470, 182]);
    const g = frameGuidance({ corners: c, areaRatio: 0.2, frame: FRAME_OK, width: 480, height: 320, mirrored: true });
    expect(g!.message).toMatch(/izquierda/i);
  });

  it('muy inclinada: pide enderezar', () => {
    // top edge con ~17 grados de inclinacion, centrada
    const c = corners([140, 120], [340, 180], [110, 220], [310, 280]);
    const g = frameGuidance({ corners: c, areaRatio: 0.2, frame: FRAME_OK, width: 480, height: 320 });
    expect(g!.message).toMatch(/endereza/i);
  });

  it('bien encuadrada: no hay correccion (null)', () => {
    const c = centered(480, 320, 0.6);
    const g = frameGuidance({ corners: c, areaRatio: 0.3, frame: FRAME_OK, width: 480, height: 320 });
    expect(g).toBe(null);
  });
});

describe('planStillDetectAttempts', () => {
  // Escalera para captura manual / archivo de galeria: la deteccion corre a
  // escala calibrada (~480-960px), nunca a resolucion nativa de la foto.
  it('fuente grande: 720 conservador, 960 fino, 480 ultimo recurso', () => {
    const plan = planStillDetectAttempts(4000);
    expect(plan.map(a => a.width)).toEqual([720, 960, 480]);
    expect(plan[0]!.minAreaRatio).toBe(0.10);
    expect(plan[1]!.minAreaRatio).toBe(0.05);
    expect(plan.every(a => a.maxAreaRatio >= 0.90)).toBe(true);
  });

  it('fuente chica: los anchos se acotan al de la fuente sin duplicar intentos identicos', () => {
    const plan = planStillDetectAttempts(600);
    expect(plan.map(a => a.width)).toEqual([600, 600, 480]);
    // el 720 y el 960 colapsan a 600 pero con params distintos: ambos aportan
    expect(plan[0]!.minAreaRatio).not.toBe(plan[1]!.minAreaRatio);
  });

  it('fuente igual a un escalon: no repite el mismo intento', () => {
    const plan = planStillDetectAttempts(480);
    const keys = plan.map(a => `${a.width}/${a.minAreaRatio}/${a.maxAreaRatio}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(plan.every(a => a.width === 480)).toBe(true);
  });
});

const CONFIRM_QUAD: Corners = {
  topLeftCorner: { x: 100, y: 100 },
  topRightCorner: { x: 400, y: 100 },
  bottomLeftCorner: { x: 100, y: 290 },
  bottomRightCorner: { x: 400, y: 290 }
};
const movedQuad = (q: Corners, dx: number): Corners => Object.fromEntries(
  Object.entries(q).map(([k, p]) => [k, { x: p.x + dx, y: p.y }])
) as unknown as Corners;

describe('createDetectionConfirmer', () => {
  it('no confirma con un solo frame', () => {
    const c = createDetectionConfirmer();
    expect(c.push(CONFIRM_QUAD, 960, 600)).toBe(false);
  });

  it('confirma al segundo frame coincidente y se mantiene', () => {
    const c = createDetectionConfirmer();
    c.push(CONFIRM_QUAD, 960, 600);
    expect(c.push(movedQuad(CONFIRM_QUAD, 5), 960, 600)).toBe(true);
    expect(c.push(movedQuad(CONFIRM_QUAD, 8), 960, 600)).toBe(true);
  });

  it('un salto grande reinicia la racha', () => {
    const c = createDetectionConfirmer();
    c.push(CONFIRM_QUAD, 960, 600);
    expect(c.push(movedQuad(CONFIRM_QUAD, 300), 960, 600)).toBe(false);
    expect(c.push(movedQuad(CONFIRM_QUAD, 300), 960, 600)).toBe(true);
  });

  it('perder la deteccion (null) reinicia', () => {
    const c = createDetectionConfirmer();
    c.push(CONFIRM_QUAD, 960, 600);
    c.push(CONFIRM_QUAD, 960, 600);
    expect(c.push(null, 960, 600)).toBe(false);
    expect(c.push(CONFIRM_QUAD, 960, 600)).toBe(false);
  });

  it('reset() reinicia la racha', () => {
    const c = createDetectionConfirmer();
    c.push(CONFIRM_QUAD, 960, 600);
    c.reset();
    expect(c.push(CONFIRM_QUAD, 960, 600)).toBe(false);
  });
});

describe('extremeBlur (freno minimo de auto-captura, spec 2026-07-17)', () => {
  it('NO se dispara con una webcam suave pero legible (piso viejo de qualityVerdict)', () => {
    expect(extremeBlur({ sharpness: 26, sharpRatio: 2.7 })).toBe(false);
  });

  it('NO se dispara con la foto mas floja del corpus aceptado (sharp ~25, ratio ~1.9)', () => {
    expect(extremeBlur({ sharpness: 25, sharpRatio: 1.9 })).toBe(false);
  });

  it('se dispara con un frame en pleno movimiento (sharp y ratio por el suelo)', () => {
    expect(extremeBlur({ sharpness: 8, sharpRatio: 1.1 })).toBe(true);
  });

  it('se dispara por ratio extremo aunque la varianza absoluta enganche (QR movido)', () => {
    expect(extremeBlur({ sharpness: 120, sharpRatio: 1.2 })).toBe(true);
  });

  it('sin metricas no bloquea (el worker fallo: mejor capturar que colgarse)', () => {
    expect(extremeBlur(null)).toBe(false);
    expect(extremeBlur(undefined)).toBe(false);
  });

  it('sin sharpRatio decide solo por la varianza', () => {
    expect(extremeBlur({ sharpness: 10 })).toBe(true);
    expect(extremeBlur({ sharpness: 30 })).toBe(false);
  });
});

describe('extremeBlur con overrides', () => {
  it('sin opts usa los umbrales exportados', () => {
    expect(extremeBlur({ sharpness: 14, sharpRatio: 2 })).toBe(true);
    expect(extremeBlur({ sharpness: 30, sharpRatio: 2 })).toBe(false);
  });

  it('umbrales inyectados cambian el veredicto', () => {
    expect(extremeBlur({ sharpness: 30, sharpRatio: 2 }, { sharpness: 35, ratio: 1.35 })).toBe(true);
    expect(extremeBlur({ sharpness: 14, sharpRatio: 2 }, { sharpness: 10, ratio: 1.35 })).toBe(false);
  });
});
