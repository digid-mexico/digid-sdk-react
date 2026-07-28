/*
 * Worker de escaneo de documentos: corre OpenCV fuera del hilo principal
 * (el build wasm de opencv.js congela la UI si se carga en la pagina).
 * Algoritmo de contorno/esquinas/warp adaptado de jscanify v1.4
 * (c) ColonelParrot and contributors, MIT License — https://github.com/puffinsoft/jscanify
 *
 * Protocolo:
 *   -> { id, type: 'detect',  imageData }
 *   <- { id, corners, imageArea } | { id, corners: null }
 *   -> { id, type: 'extract', imageData, corners, outputWidth, outputHeight }
 *   <- { id, output: ImageData } | { id, output: null, error }
 *   -> { id, type: 'quality', imageData }
 *   <- { id, metrics: { sharpness, brightness, contrast, glareRatio, darkRatio } }
 *   <- { type: 'ready' } | { type: 'init-error', error }
 */

'use strict';

let cvReady = false;

// Senal de listo multi-build. CUIDADO con dos trampas de emscripten:
// 1) El "thenable" legacy (opencv 4.7.0) se resuelve a si mismo: si una
//    Promise real lo adopta (Promise.resolve/await) entra en bucle infinito
//    de unwrap y congela el hilo. Solo callback directo, jamas await.
// 2) Ese then() ademas dispara ANTES de que el runtime wasm termine. La
//    unica senal confiable es que exista la clase embind cv.Mat.
function finishInit(mod) {
  if (cvReady || !mod || typeof mod.Mat !== 'function') return;
  cvReady = true;
  self.cv = mod;
  postMessage({ type: 'ready' });
}

self.Module = {
  onRuntimeInitialized: function () { finishInit(self.cv); }
};

try {
  // Único cambio respecto al prototipo original (que usaba la ruta absoluta
  // '/opencv.js'): resolución relativa a la propia URL del worker, para que
  // funcione sin importar en qué path del consumidor se sirva scan-assets/.
  importScripts('./opencv.js');
  if (self.cv && typeof self.cv.then === 'function') {
    self.cv.then(function (mod) {
      try { delete mod.then; } catch (e) { /* module sellado */ }
      finishInit(mod);
    });
  }
  finishInit(self.cv);
  // Respaldo por si ningun hook dispara (20s max)
  let polls = 0;
  const poll = setInterval(function () {
    finishInit(self.cv);
    polls += 1;
    if (cvReady || polls > 400) {
      clearInterval(poll);
      if (!cvReady) postMessage({ type: 'init-error', error: 'cv.Mat no aparecio en 20s' });
    }
  }, 50);
} catch (error) {
  postMessage({ type: 'init-error', error: String(error) });
}

function distance(p1, p2) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

// Ordena 4 puntos como TL/TR/BL/BR (regla suma/diferencia; robusta hasta
// ~45 grados de rotacion; una tarjeta mas rotada se rechaza en validacion).
function orderCorners(points) {
  let tl = null, tr = null, bl = null, br = null;
  let minSum = Infinity, maxSum = -Infinity, minDiff = Infinity, maxDiff = -Infinity;
  for (const p of points) {
    const sum = p.x + p.y;
    const diff = p.x - p.y;
    if (sum < minSum) { minSum = sum; tl = p; }
    if (sum > maxSum) { maxSum = sum; br = p; }
    if (diff > maxDiff) { maxDiff = diff; tr = p; }
    if (diff < minDiff) { minDiff = diff; bl = p; }
  }
  return { topLeftCorner: tl, topRightCorner: tr, bottomLeftCorner: bl, bottomRightCorner: br };
}

function shoelaceArea(c) {
  const pts = [c.topLeftCorner, c.topRightCorner, c.bottomRightCorner, c.bottomLeftCorner];
  let doubled = 0;
  for (let i = 0; i < 4; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    doubled += a.x * b.y - b.x * a.y;
  }
  return Math.abs(doubled) / 2;
}

// Coseno del angulo en p1 formado por p0 y p2 (0 = angulo recto perfecto).
function angleCosine(p0, p1, p2) {
  const dx1 = p0.x - p1.x, dy1 = p0.y - p1.y;
  const dx2 = p2.x - p1.x, dy2 = p2.y - p1.y;
  const denom = Math.sqrt((dx1 * dx1 + dy1 * dy1) * (dx2 * dx2 + dy2 * dy2)) + 1e-10;
  return Math.abs((dx1 * dx2 + dy1 * dy2) / denom);
}

// Geometria de tarjeta ID-1: rechaza cuadrilateros que no puedan ser una
// credencial (esquinas fuera de imagen, aspecto fuera de rango, lados
// opuestos incoherentes, angulos lejos de 90, area absurda).
// allowPortrait acepta ademas la tarjeta rotada 90 grados (aspecto ~1/1.586,
// foto de galeria con la credencial "parada"); el enderezado lo hace docscan.
function validateQuad(corners, width, height, allowPortrait) {
  const { topLeftCorner: tl, topRightCorner: tr, bottomLeftCorner: bl, bottomRightCorner: br } = corners;
  if (!tl || !tr || !bl || !br) return null;

  const margin = Math.max(2, Math.round(Math.min(width, height) * 0.01));
  for (const p of [tl, tr, bl, br]) {
    if (p.x < margin || p.x > width - margin || p.y < margin || p.y > height - margin) return null;
  }

  const top = distance(tl, tr);
  const bottom = distance(bl, br);
  const left = distance(tl, bl);
  const right = distance(tr, br);
  const minSide = Math.min(width, height) * 0.05;
  if (Math.min(top, bottom, left, right) < minSide) return null;

  if (Math.min(top, bottom) / Math.max(top, bottom) < 0.5) return null;
  if (Math.min(left, right) / Math.max(left, right) < 0.5) return null;

  const aspect = ((top + bottom) / 2) / ((left + right) / 2);
  const landscapeOk = aspect >= 1.2 && aspect <= 2.1;
  const portraitOk = allowPortrait && aspect >= 1 / 2.1 && aspect <= 1 / 1.2;
  if (!landscapeOk && !portraitOk) return null;

  const maxCos = Math.max(
    angleCosine(bl, tl, tr),
    angleCosine(tl, tr, br),
    angleCosine(tr, br, bl),
    angleCosine(br, bl, tl)
  );
  if (maxCos > 0.5) return null;

  return { aspect: aspect, quadArea: shoelaceArea(corners) };
}

const ID1_ASPECT = 1.586;

// Luma minima de pixel "quemado" (glare especular). Se usa igual para las
// stats de frame (handleDetect) y las metricas del recorte (handleQuality);
// los UMBRALES de decision sobre el ratio resultante viven en docscan.js y
// difieren porque miden contenido distinto (encuadre completo vs recorte).
const GLARE_LUMA = 250;

function makeCandidate(corners, valid, solidity, imgArea, penalty) {
  // Aspecto efectivo: una tarjeta vertical (0.63) puntua igual que una
  // horizontal (1.586); ambas son la misma credencial.
  const effAspect = valid.aspect < 1 ? 1 / valid.aspect : valid.aspect;
  const aspectScore = Math.max(0, 1 - Math.abs(effAspect - ID1_ASPECT) / 0.6);
  return {
    corners: corners,
    aspect: valid.aspect,
    areaRatio: valid.quadArea / imgArea,
    score: Math.min(1, solidity) * (0.4 + 0.6 * aspectScore) * Math.sqrt(valid.quadArea / imgArea) * penalty
  };
}

// Refinamiento de bordes exteriores. El detector puede engancharse a un
// rectangulo INTERIOR del documento con geometria de tarjeta valida: en el
// frente de la INE, el limite franja-de-encabezado/cuerpo-blanco forma un
// cuadrilatero convexo de aspecto ~1.9 que pasa validateQuad, y gana cuando
// el contorno exterior se corrompe (dedos fusionados, margen). El refinado
// expande cada lado del quad ganador hacia lineas de borde PARALELAS halladas
// afuera, y elige la combinacion cuyo aspecto quede mas cerca del ID-1
// fisico. Una tarjeta ya bien detectada no tiene lineas paralelas afuera de
// sus lados y queda intacta.
const SNAP_COVERAGE = 0.50;  // cobertura minima de pixeles de borde en la linea
const SNAP_MIN_OFFSET = 6;   // px: salta la propia linea dilatada + tolerancia
const SNAP_RANGE_TB = 0.32;  // banda de busqueda arriba/abajo (fraccion de altura)
const SNAP_RANGE_LR = 0.14;  // banda izquierda/derecha (fraccion de ancho)
const SNAP_MAX_RUNS = 5;     // max lineas candidatas por lado

// Filtro de soporte de bordes: el quad ganador solo es valido si sus lados
// descansan sobre pixeles de borde reales (union V1|V2). Mata los falsos
// positivos de blobs convexos (cabeza, hombro) que pasan la geometria ID-1
// via minAreaRect o diamante approxPolyDP pero cuyos lados son inventados
// (solo tocan el contorno curvo en 4 tangentes). Se exige cobertura alta en
// 3 de 4 lados (no 4: una mano que muerde un lado legitimo puede dejarlo
// casi sin borde — ver caso 8 del arnes, rect con dedo).
const SUPPORT_SAMPLES = 48;        // muestras por lado (mismo calibre que parallelEdgeOffsets)
const SUPPORT_MIN_COVERAGE = 0.45; // cobertura minima exigida al 3er mejor lado

// Variante V3 (rescate por lineas): la tarjeta EN MANO rompe el contorno
// cerrado que V1/V2 necesitan (dedos cruzando bordes). HoughLinesP encuentra
// los segmentos rectos que SI sobreviven; se arman quads con 2 pares de
// lineas (~paralelas entre si, ~perpendiculares al otro par) y pasan por el
// MISMO embudo que el resto (validateQuad + smooth + soporte de bordes).
// Solo corre cuando V1+V2 no dejaron ganador: el tick feliz no paga nada.
const HOUGH_THRESHOLD = 40;       // votos minimos por segmento
const HOUGH_MIN_LINE_FRAC = 0.22; // longitud minima (fraccion del lado menor)
const HOUGH_MAX_GAP_FRAC = 0.08;  // hueco puenteable (dedo angosto)
const HOUGH_MAX_PER_FAMILY = 6;   // lineas por familia tras dedup
const HOUGH_ANGLE_TOL = 20;       // grados de pertenencia a familia
const HOUGH_DEDUP_DIST_FRAC = 0.03; // misma linea fisica si esta mas cerca
const HOUGH_PENALTY = 0.9;        // score: entre quad exacto (1.0) y minAreaRect (0.82)
// Los quads Hough nacen de INTERSECCIONES de lineas extendidas: pueden tener un
// lado largo sin borde real debajo (combinacion mala de segmentos sueltos). Por
// eso el camino Hough exige, ademas del chequeo de 3 mejores lados, cobertura
// minima en el PEOR de los 4 lados: una tarjeta real en mano cubre casi todos
// sus 4 bordes (los huecos de dedo son de 30-60px y quedan puenteados), mientras
// que un quad malformado tiene al menos un lado mayormente vacio.
const HOUGH_SUPPORT_MIN_WORST = 0.70; // cobertura minima exigida al PEOR lado (solo Hough)

function lineIntersection(a1, a2, b1, b2) {
  const d1x = a2.x - a1.x, d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x, d2y = b2.y - b1.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / denom;
  return { x: a1.x + t * d1x, y: a1.y + t * d1y };
}

// Tolerancia de +-2 px en cruz: una linea fisica levemente inclinada respecto
// al lado muestreado reparte sus hits entre offsets vecinos (visto en fotos
// reales: cobertura 0.5 del borde superior de la INE por ~2px de inclinacion).
function edgeAt(edgeData, width, height, x, y) {
  const xi = Math.round(x), yi = Math.round(y);
  if (xi < 2 || yi < 2 || xi >= width - 2 || yi >= height - 2) return false;
  const i = yi * width + xi;
  return edgeData[i] !== 0 || edgeData[i - 1] !== 0 || edgeData[i + 1] !== 0
    || edgeData[i - 2] !== 0 || edgeData[i + 2] !== 0
    || edgeData[i - width] !== 0 || edgeData[i + width] !== 0
    || edgeData[i - 2 * width] !== 0 || edgeData[i + 2 * width] !== 0;
}

// Offsets (px hacia afuera) donde hay una linea de borde paralela al lado
// [a,b]. Los offsets contiguos con cobertura alta se agrupan en "runs" (una
// linea fisica dilatada abarca varios); se regresa el mejor offset de cada
// run, de adentro hacia afuera.
function parallelEdgeOffsets(edgeData, width, height, a, b, nx, ny, range) {
  const runs = [];
  let inRun = false, runBest = 0, runBestCov = 0;
  const samples = 48;
  for (let d = SNAP_MIN_OFFSET; d <= range; d += 1) {
    let hits = 0;
    for (let s = 0; s < samples; s += 1) {
      const t = (s + 0.5) / samples;
      const x = a.x + (b.x - a.x) * t + nx * d;
      const y = a.y + (b.y - a.y) * t + ny * d;
      if (edgeAt(edgeData, width, height, x, y)) hits += 1;
    }
    const cov = hits / samples;
    if (cov >= SNAP_COVERAGE) {
      if (!inRun) { inRun = true; runBest = d; runBestCov = cov; }
      else if (cov > runBestCov) { runBest = d; runBestCov = cov; }
    } else if (inRun) {
      runs.push(runBest);
      inRun = false;
    }
  }
  if (inRun) runs.push(runBest);
  return runs.slice(0, SNAP_MAX_RUNS);
}

function refineToOuterEdges(edgeData, corners, width, height, allowPortrait) {
  const tl = corners.topLeftCorner, tr = corners.topRightCorner;
  const bl = corners.bottomLeftCorner, br = corners.bottomRightCorner;
  const original = validateQuad(corners, width, height, allowPortrait);
  if (!original) return { corners: corners, valid: null };

  // Tarjeta vertical: el objetivo del refinado y las bandas de busqueda se
  // giran con ella (la franja del encabezado que motiva la banda ancha corre
  // paralela al lado LARGO fisico).
  const portrait = original.aspect < 1;
  const targetAspect = portrait ? 1 / ID1_ASPECT : ID1_ASPECT;
  const rangeTB = portrait ? SNAP_RANGE_LR : SNAP_RANGE_TB;
  const rangeLR = portrait ? SNAP_RANGE_TB : SNAP_RANGE_LR;

  const cx = (tl.x + tr.x + bl.x + br.x) / 4;
  const cy = (tl.y + tr.y + bl.y + br.y) / 4;
  const quadW = (distance(tl, tr) + distance(bl, br)) / 2;
  const quadH = (distance(tl, bl) + distance(tr, br)) / 2;
  // lados en orden top/right/bottom/left; esquinas = interseccion de lineas
  const sides = [
    { a: tl, b: tr, range: quadH * rangeTB },
    { a: tr, b: br, range: quadW * rangeLR },
    { a: br, b: bl, range: quadH * rangeTB },
    { a: bl, b: tl, range: quadW * rangeLR }
  ];
  for (const side of sides) {
    let nx = -(side.b.y - side.a.y);
    let ny = side.b.x - side.a.x;
    const len = Math.hypot(nx, ny) || 1;
    nx /= len; ny /= len;
    const mx = (side.a.x + side.b.x) / 2 - cx;
    const my = (side.a.y + side.b.y) / 2 - cy;
    if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
    side.nx = nx; side.ny = ny;
    side.offsets = parallelEdgeOffsets(edgeData, width, height, side.a, side.b, nx, ny, Math.round(side.range));
  }

  let best = { corners: corners, valid: original };
  let bestDist = Math.abs(original.aspect - targetAspect);
  const choices = sides.map(s => [0].concat(s.offsets));
  for (const o0 of choices[0]) for (const o1 of choices[1]) for (const o2 of choices[2]) for (const o3 of choices[3]) {
    if (o0 === 0 && o1 === 0 && o2 === 0 && o3 === 0) continue;
    const offs = [o0, o1, o2, o3];
    const moved = sides.map((s, i) => ({
      a: { x: s.a.x + s.nx * offs[i], y: s.a.y + s.ny * offs[i] },
      b: { x: s.b.x + s.nx * offs[i], y: s.b.y + s.ny * offs[i] }
    }));
    const nTl = lineIntersection(moved[0].a, moved[0].b, moved[3].a, moved[3].b);
    const nTr = lineIntersection(moved[0].a, moved[0].b, moved[1].a, moved[1].b);
    const nBr = lineIntersection(moved[1].a, moved[1].b, moved[2].a, moved[2].b);
    const nBl = lineIntersection(moved[2].a, moved[2].b, moved[3].a, moved[3].b);
    if (!nTl || !nTr || !nBr || !nBl) continue;
    const quad = { topLeftCorner: nTl, topRightCorner: nTr, bottomLeftCorner: nBl, bottomRightCorner: nBr };
    const valid = validateQuad(quad, width, height, allowPortrait);
    if (!valid) continue;
    const dist = Math.abs(valid.aspect - targetAspect);
    if (dist < bestDist - 1e-6) {
      bestDist = dist;
      best = { corners: quad, valid: valid };
    }
  }
  return best;
}

// Variante del refinado para el RESCATE por soporte (calibracion reverso
// 2026-07-23): igual que refineToOuterEdges pero elige la combinacion de
// lineas exteriores que MAXIMIZA la cobertura de borde de los lados, con el
// aspecto solo como desempate. Necesaria porque en el reverso del INE el
// rectangulo interior del contenido impreso (barcode->MRZ) tiene el MISMO
// aspecto ~1.586 que la tarjeta, asi que el refinado por aspecto "no ve
// mejora" y deja el quad interior (medido en corpus real 2026-07-23: el quad
// interior sale con soporte 0.10-0.27 y muere en quadEdgeSupport).
function refineToSupportedEdges(edgeData, corners, width, height, allowPortrait) {
  const tl = corners.topLeftCorner, tr = corners.topRightCorner;
  const bl = corners.bottomLeftCorner, br = corners.bottomRightCorner;
  const original = validateQuad(corners, width, height, allowPortrait);
  if (!original) return { corners: corners, valid: null };

  const portrait = original.aspect < 1;
  const targetAspect = portrait ? 1 / ID1_ASPECT : ID1_ASPECT;
  const rangeTB = portrait ? SNAP_RANGE_LR : SNAP_RANGE_TB;
  const rangeLR = portrait ? SNAP_RANGE_TB : SNAP_RANGE_LR;

  const cx = (tl.x + tr.x + bl.x + br.x) / 4;
  const cy = (tl.y + tr.y + bl.y + br.y) / 4;
  const quadW = (distance(tl, tr) + distance(bl, br)) / 2;
  const quadH = (distance(tl, bl) + distance(tr, br)) / 2;
  const sides = [
    { a: tl, b: tr, range: quadH * rangeTB },
    { a: tr, b: br, range: quadW * rangeLR },
    { a: br, b: bl, range: quadH * rangeTB },
    { a: bl, b: tl, range: quadW * rangeLR }
  ];
  for (const side of sides) {
    let nx = -(side.b.y - side.a.y);
    let ny = side.b.x - side.a.x;
    const len = Math.hypot(nx, ny) || 1;
    nx /= len; ny /= len;
    const mx = (side.a.x + side.b.x) / 2 - cx;
    const my = (side.a.y + side.b.y) / 2 - cy;
    if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
    side.nx = nx; side.ny = ny;
    side.offsets = parallelEdgeOffsets(edgeData, width, height, side.a, side.b, nx, ny, Math.round(side.range));
  }

  const quadCoverage = q => sideCoverage(edgeData, width, height, q.topLeftCorner, q.topRightCorner)
    + sideCoverage(edgeData, width, height, q.topRightCorner, q.bottomRightCorner)
    + sideCoverage(edgeData, width, height, q.bottomRightCorner, q.bottomLeftCorner)
    + sideCoverage(edgeData, width, height, q.bottomLeftCorner, q.topLeftCorner);

  let best = { corners: corners, valid: original };
  let bestCov = quadCoverage(corners);
  let bestDist = Math.abs(original.aspect - targetAspect);
  const choices = sides.map(s => [0].concat(s.offsets));
  for (const o0 of choices[0]) for (const o1 of choices[1]) for (const o2 of choices[2]) for (const o3 of choices[3]) {
    if (o0 === 0 && o1 === 0 && o2 === 0 && o3 === 0) continue;
    const offs = [o0, o1, o2, o3];
    const moved = sides.map((s, i) => ({
      a: { x: s.a.x + s.nx * offs[i], y: s.a.y + s.ny * offs[i] },
      b: { x: s.b.x + s.nx * offs[i], y: s.b.y + s.ny * offs[i] }
    }));
    const nTl = lineIntersection(moved[0].a, moved[0].b, moved[3].a, moved[3].b);
    const nTr = lineIntersection(moved[0].a, moved[0].b, moved[1].a, moved[1].b);
    const nBr = lineIntersection(moved[1].a, moved[1].b, moved[2].a, moved[2].b);
    const nBl = lineIntersection(moved[2].a, moved[2].b, moved[3].a, moved[3].b);
    if (!nTl || !nTr || !nBr || !nBl) continue;
    const quad = { topLeftCorner: nTl, topRightCorner: nTr, bottomLeftCorner: nBl, bottomRightCorner: nBr };
    const valid = validateQuad(quad, width, height, allowPortrait);
    if (!valid) continue;
    const cov = quadCoverage(quad);
    const dist = Math.abs(valid.aspect - targetAspect);
    if (cov > bestCov + 1e-6 || (Math.abs(cov - bestCov) <= 1e-6 && dist < bestDist - 1e-6)) {
      bestCov = cov;
      bestDist = dist;
      best = { corners: quad, valid: valid };
    }
  }
  return best;
}

function sideCoverage(edgeData, width, height, a, b) {
  let hits = 0;
  for (let s = 0; s < SUPPORT_SAMPLES; s += 1) {
    const t = (s + 0.5) / SUPPORT_SAMPLES;
    if (edgeAt(edgeData, width, height, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) hits += 1;
  }
  return hits / SUPPORT_SAMPLES;
}

// true si al menos 3 de los 4 lados del quad tienen cobertura de borde alta.
function quadEdgeSupport(edgeData, width, height, corners) {
  const c = corners;
  const cov = [
    sideCoverage(edgeData, width, height, c.topLeftCorner, c.topRightCorner),
    sideCoverage(edgeData, width, height, c.topRightCorner, c.bottomRightCorner),
    sideCoverage(edgeData, width, height, c.bottomRightCorner, c.bottomLeftCorner),
    sideCoverage(edgeData, width, height, c.bottomLeftCorner, c.topLeftCorner)
  ].sort(function (x, y) { return y - x; });
  return cov[2] >= SUPPORT_MIN_COVERAGE;
}

// Soporte de borde exigido SOLO al camino Hough: los 3 mejores lados como el
// resto (cov[2] >= SUPPORT_MIN_COVERAGE) mas el PEOR lado por encima de
// HOUGH_SUPPORT_MIN_WORST. El chequeo de 3 mejores lados perdona al peor lado
// (pensado para dedos que muerden un lado de un quad de CONTORNO); un quad de
// lineas extendidas mal combinadas se cuela por ahi con un lado casi sin borde.
function houghQuadSupport(edgeData, width, height, corners) {
  const c = corners;
  const cov = [
    sideCoverage(edgeData, width, height, c.topLeftCorner, c.topRightCorner),
    sideCoverage(edgeData, width, height, c.topRightCorner, c.bottomRightCorner),
    sideCoverage(edgeData, width, height, c.bottomRightCorner, c.bottomLeftCorner),
    sideCoverage(edgeData, width, height, c.bottomLeftCorner, c.topLeftCorner)
  ].sort(function (x, y) { return y - x; });
  return cov[2] >= SUPPORT_MIN_COVERAGE && cov[3] >= HOUGH_SUPPORT_MIN_WORST;
}

function pointLineDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return Math.abs(dx * (p.y - a.y) - dy * (p.x - a.x)) / len;
}

// Agrega un segmento a la familia salvo que ya haya una linea fisica igual
// (los segmentos van ordenados por longitud: el primero que llega gana).
function pushSegDedup(family, seg, minSide) {
  if (family.length >= HOUGH_MAX_PER_FAMILY) return;
  const mid = { x: (seg.a.x + seg.b.x) / 2, y: (seg.a.y + seg.b.y) / 2 };
  for (const other of family) {
    if (pointLineDistance(mid, other.a, other.b) < minSide * HOUGH_DEDUP_DIST_FRAC) return;
  }
  family.push(seg);
}

function collectHoughCandidates(edgeData, width, height, imgArea, minAreaRatio, maxAreaRatio, out, allowPortrait) {
  const cv = self.cv;
  const minSide = Math.min(width, height);
  let edges = null;
  let lines = null;
  try {
    edges = new cv.Mat(height, width, cv.CV_8UC1);
    edges.data.set(edgeData);
    lines = new cv.Mat();
    cv.HoughLinesP(edges, lines, 1, Math.PI / 180, HOUGH_THRESHOLD,
      minSide * HOUGH_MIN_LINE_FRAC, minSide * HOUGH_MAX_GAP_FRAC);

    const segs = [];
    for (let i = 0; i < lines.rows; i += 1) {
      const a = { x: lines.data32S[i * 4], y: lines.data32S[i * 4 + 1] };
      const b = { x: lines.data32S[i * 4 + 2], y: lines.data32S[i * 4 + 3] };
      let angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
      if (angle < 0) angle += 180; // la direccion del segmento no importa
      segs.push({ a: a, b: b, len: distance(a, b), angle: angle });
    }
    if (segs.length < 4) return;
    segs.sort(function (s1, s2) { return s2.len - s1.len; });

    // Dos familias: la del segmento mas largo y su perpendicular.
    const angDiff = function (x, y) {
      const d = Math.abs(x - y) % 180;
      return Math.min(d, 180 - d);
    };
    const baseAngle = segs[0].angle;
    const famA = [], famB = [];
    for (const s of segs) {
      if (angDiff(s.angle, baseAngle) <= HOUGH_ANGLE_TOL) pushSegDedup(famA, s, minSide);
      else if (angDiff(s.angle, baseAngle + 90) <= HOUGH_ANGLE_TOL) pushSegDedup(famB, s, minSide);
    }
    if (famA.length < 2 || famB.length < 2) return;

    for (let i = 0; i < famA.length; i += 1) {
      for (let j = i + 1; j < famA.length; j += 1) {
        for (let k = 0; k < famB.length; k += 1) {
          for (let l = k + 1; l < famB.length; l += 1) {
            const p1 = lineIntersection(famA[i].a, famA[i].b, famB[k].a, famB[k].b);
            const p2 = lineIntersection(famA[i].a, famA[i].b, famB[l].a, famB[l].b);
            const p3 = lineIntersection(famA[j].a, famA[j].b, famB[k].a, famB[k].b);
            const p4 = lineIntersection(famA[j].a, famA[j].b, famB[l].a, famB[l].b);
            if (!p1 || !p2 || !p3 || !p4) continue;
            const corners = orderCorners([p1, p2, p3, p4]);
            const valid = validateQuad(corners, width, height, allowPortrait);
            if (!valid) continue;
            const ratio = valid.quadArea / imgArea;
            if (ratio < minAreaRatio || ratio > maxAreaRatio) continue;
            out.push(makeCandidate(corners, valid, 1, imgArea, HOUGH_PENALTY));
          }
        }
      }
    }
  } catch (error) {
    // HoughLinesP no disponible o Mat invalido: V1/V2 siguen funcionando
  } finally {
    if (lines) lines.delete();
    if (edges) edges.delete();
  }
}

// Extrae candidatos de una imagen binaria de bordes. Dos vias por contorno:
// 1) cuadrilatero convexo exacto (approxPolyDP) — preciso;
// 2) fallback minAreaRect para contornos "casi tarjeta" (dedos tapando un
//    borde, esquina comida): si el contorno llena >= 75% de su rect rotado,
//    se usan los 4 vertices del rect (con penalizacion por menor precision).
function collectCandidates(binary, width, height, imgArea, minAreaRatio, maxAreaRatio, penalty, out, allowPortrait) {
  const cv = self.cv;
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(binary, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

  for (let i = 0; i < contours.size(); i += 1) {
    const cnt = contours.get(i);
    const area = cv.contourArea(cnt);
    if (area < imgArea * minAreaRatio || area > imgArea * maxAreaRatio) {
      cnt.delete();
      continue;
    }

    let matched = false;
    const peri = cv.arcLength(cnt, true);
    for (const eps of [0.02, 0.04, 0.07]) {
      const approx = new cv.Mat();
      cv.approxPolyDP(cnt, approx, eps * peri, true);
      if (approx.rows === 4 && cv.isContourConvex(approx)) {
        const pts = [];
        for (let j = 0; j < 8; j += 2) {
          pts.push({ x: approx.data32S[j], y: approx.data32S[j + 1] });
        }
        approx.delete();
        const corners = orderCorners(pts);
        const valid = validateQuad(corners, width, height, allowPortrait);
        if (valid) {
          const solidity = area / (valid.quadArea + 1e-10);
          if (solidity >= 0.7) out.push(makeCandidate(corners, valid, solidity, imgArea, penalty));
        }
        matched = true;
        break;
      }
      approx.delete();
    }

    if (!matched) {
      try {
        const rect = cv.minAreaRect(cnt);
        const rectArea = rect.size.width * rect.size.height;
        // Relleno del minAreaRect relajado 0.75 -> 0.62: el reverso de la INE
        // sostenido en mano tiene dedos que muerden uno o ambos lados, dejando
        // el contorno "casi tarjeta" con relleno 0.62-0.74. La solidez (relleno)
        // ya entra como factor lineal del score, asi que un relleno bajo puntua
        // proporcionalmente menos; ademas la via rect lleva penalty extra (0.82)
        // para que un quad exacto siempre le gane. Backstops contra falsos
        // positivos intactos: aspecto ID-1, angulos, margen, densidad y
        // contencion. Debajo de 0.62 el "contorno" ya no es una tarjeta.
        if (rectArea > 0 && area / rectArea >= 0.62) {
          const vertices = cv.RotatedRect.points(rect);
          const corners = orderCorners(vertices.map(v => ({ x: v.x, y: v.y })));
          const valid = validateQuad(corners, width, height, allowPortrait);
          if (valid) out.push(makeCandidate(corners, valid, area / rectArea, imgArea, penalty * 0.82));
        }
      } catch (error) {
        // RotatedRect.points no disponible en algun build: via exacta sigue activa
      }
    }
    cnt.delete();
  }

  contours.delete();
  hierarchy.delete();
}

// Punto dentro de cuadrilatero convexo (mismo signo de cruz en los 4 lados).
function pointInQuad(p, c) {
  const poly = [c.topLeftCorner, c.topRightCorner, c.bottomRightCorner, c.bottomLeftCorner];
  let sign = 0;
  for (let i = 0; i < 4; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % 4];
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (cross !== 0) {
      const s = cross > 0 ? 1 : -1;
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
  }
  return true;
}

// true si el candidato inner esta contenido en el candidato outer (y outer
// es significativamente mas grande). El bloque de codigos QR del reverso de
// la INE es un rectangulo con aspecto de tarjeta: si tambien se detecto el
// contorno de la tarjeta que lo contiene, debe ganar la tarjeta.
function isContainedIn(inner, outer) {
  if (outer.areaRatio < inner.areaRatio * 1.25) return false;
  return CORNER_KEYS_W.every(key => pointInQuad(inner.corners[key], outer.corners));
}

const CORNER_KEYS_W = ['topLeftCorner', 'topRightCorner', 'bottomLeftCorner', 'bottomRightCorner'];

// Mapa de zonas LISAS (varianza local < umbral en ventana 9x9). Un documento
// real siempre tiene areas lisas (margenes, fondo de la foto, franjas en
// blanco); un bloque de puro codigo QR/denso no tiene casi ninguna: cada
// ventana cruza transiciones negro/blanco y su varianza es alta.
function buildSmoothMask(gray) {
  const cv = self.cv;
  const g32 = new cv.Mat();
  gray.convertTo(g32, cv.CV_32F);
  const g2 = new cv.Mat();
  cv.multiply(g32, g32, g2);
  const m = new cv.Mat();
  const m2 = new cv.Mat();
  const ksize = new cv.Size(9, 9);
  cv.blur(g32, m, ksize);
  cv.blur(g2, m2, ksize);
  const mm = new cv.Mat();
  cv.multiply(m, m, mm);
  const variance = new cv.Mat();
  cv.subtract(m2, mm, variance);
  const smooth = new cv.Mat();
  // var < 100 (std < 10 niveles) = zona lisa
  cv.threshold(variance, smooth, 100, 255, cv.THRESH_BINARY_INV);
  g32.delete(); g2.delete(); m.delete(); m2.delete(); mm.delete(); variance.delete();
  return smooth;
}

// Fraccion de pixeles lisos dentro del bbox del quad. Documento: > 0.12
// holgado (margenes y fondos). Bloque solo-QR: ~0 a 0.10 (solo la franja
// entre codigos). Permite rechazar el recorte "solo QR" cuando la tarjeta
// llena el frame y sus bordes quedaron fuera del encuadre.
function smoothRatioInQuad(smoothMask, corners, width, height) {
  const cv = self.cv;
  const xs = CORNER_KEYS_W.map(k => corners[k].x);
  const ys = CORNER_KEYS_W.map(k => corners[k].y);
  const x1 = Math.max(0, Math.floor(Math.min.apply(null, xs)));
  const y1 = Math.max(0, Math.floor(Math.min.apply(null, ys)));
  const x2 = Math.min(width, Math.ceil(Math.max.apply(null, xs)));
  const y2 = Math.min(height, Math.ceil(Math.max.apply(null, ys)));
  const w = x2 - x1;
  const h = y2 - y1;
  if (w < 4 || h < 4) return 0;
  const roi = smoothMask.roi(new cv.Rect(x1, y1, w, h));
  const ratio = cv.countNonZero(roi) / (w * h);
  roi.delete();
  return ratio;
}

// Deteccion multi-candidato y multi-variante. En lugar del "contorno mas
// grande" de jscanify (que en una habitacion es la pared, no la credencial),
// se evaluan TODOS los contornos bajo dos preprocesamientos:
//   V1: Canny estandar (50/200) — tarjeta con buen contraste
//   V2: equalizeHist + Canny sensible (25/100) — frente de INE: tarjeta
//       clara sobre fondo claro, bordes lavados
// Solo sobreviven cuadrilateros con geometria de tarjeta. El ganador ademas
// no debe estar contenido en otro candidato (QR-block vs tarjeta) ni ser
// puro patron denso (densidad de bordes > 0.25).
function handleDetect(message) {
  const cv = self.cv;
  const width = message.imageData.width;
  const height = message.imageData.height;
  const imgArea = width * height;
  const minAreaRatio = message.minAreaRatio || 0.04;
  const maxAreaRatio = message.maxAreaRatio || 0.70;
  const allowPortrait = !!message.allowPortrait;

  let img = null, gray = null, work = null, edges = null, smoothMask = null, kernel = null, kernelClose = null;
  let statsMean = null, statsStd = null, glareMask = null;
  const candidates = [];

  try {
    img = cv.matFromImageData(message.imageData);
    gray = new cv.Mat();
    cv.cvtColor(img, gray, cv.COLOR_RGBA2GRAY, 0);

    // Stats del FRAME completo: van en toda respuesta (aun sin deteccion)
    // para que la UI pueda guiar ("una luz deslumbra la camara", "muy
    // oscuro") en lugar de un "buscando..." eterno. El conteo de quemados
    // va en nativo (threshold + countNonZero, no loop JS por pixel): esto
    // corre en cada tick del escaneo en vivo.
    statsMean = new cv.Mat();
    statsStd = new cv.Mat();
    cv.meanStdDev(gray, statsMean, statsStd);
    glareMask = new cv.Mat();
    cv.threshold(gray, glareMask, GLARE_LUMA - 1, 255, cv.THRESH_BINARY);
    const frame = {
      brightness: statsMean.doubleAt(0, 0),
      contrast: statsStd.doubleAt(0, 0),
      glareRatio: cv.countNonZero(glareMask) / (width * height)
    };

    work = new cv.Mat();
    edges = new cv.Mat();
    kernel = cv.Mat.ones(3, 3, cv.CV_8U);
    // Kernel 7x7 para cerrar el contorno del reverso INE en webcam: tarjeta
    // clara sobre fondo claro con luz suave produce bordes intermitentes y
    // dedos que cortan los lados; un dilate 3x3 (o un close 5x5) no puentea
    // esos huecos y el contorno queda fragmentado o se fusiona con los dedos
    // (el borde superior/inferior no cierra y el quad sale con aspecto ~2.0 en
    // vez de ~1.586). El close 7x7 une los cortes sin engordar de mas (dilate
    // seguido de erode). Medido en el corpus real (reverso en mano, 2026-07-15):
    // baja el aspecto del reverso de 2.06 a 1.58 y sube la deteccion global.
    // Solo en V2: es la variante de bajo contraste, donde vive la fragmentacion.
    kernelClose = cv.Mat.ones(7, 7, cv.CV_8U);

    // V1: contraste normal
    cv.GaussianBlur(gray, work, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
    cv.Canny(work, edges, 50, 200);
    cv.dilate(edges, edges, kernel);
    collectCandidates(edges, width, height, imgArea, minAreaRatio, maxAreaRatio, 1.0, candidates, allowPortrait);
    // copia de los bordes V1 para el refinado (necesaria: el build no expone
    // bitwise_or y edges se reutiliza para V2). La union con V2 se hace mas
    // abajo SOLO si hay ganador: el refinado es su unico consumidor.
    const edgeUnion = new Uint8Array(edges.data);

    // V2: bajo contraste (frente/reverso INE contra fondo claro). Cierre 7x7
    // en vez de dilate 3x3 para reconectar el contorno roto por dedos/luz.
    cv.equalizeHist(gray, work);
    cv.GaussianBlur(work, work, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
    cv.Canny(work, edges, 25, 100);
    cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, kernelClose);
    collectCandidates(edges, width, height, imgArea, minAreaRatio, maxAreaRatio, 0.95, candidates, allowPortrait);

    // Un candidato contenido en otro mas grande pierde (QR-block vs tarjeta)
    const uncontained = candidates.filter(a => !candidates.some(b => b !== a && isContainedIn(a, b)));
    uncontained.sort((a, b) => b.score - a.score);

    // Union de bordes V1|V2: la consumen el filtro de soporte, la variante
    // Hough y el refinado. Diferida hasta saber que hace falta (en ticks
    // vacios era trabajo tirado).
    let unionMerged = false;
    const mergeEdgeUnion = () => {
      if (unionMerged) return;
      const v2 = edges.data;
      for (let i = 0; i < edgeUnion.length; i += 1) edgeUnion[i] |= v2[i];
      unionMerged = true;
    };

    let best = null;
    if (uncontained.length > 0) {
      smoothMask = buildSmoothMask(gray);
      mergeEdgeUnion();
      for (const candidate of uncontained) {
        if (smoothRatioInQuad(smoothMask, candidate.corners, width, height) < 0.12) continue;
        if (quadEdgeSupport(edgeUnion, width, height, candidate.corners)) {
          best = candidate;
          break;
        }
        // Rescate por refinado (calibracion reverso 2026-07-23): en el reverso
        // el candidato tipico es el rectangulo INTERIOR del contenido impreso
        // (barcode->MRZ), con el mismo aspecto ~1.586 que la tarjeta — sus
        // lados caen sobre plastico liso y muere aqui con soporte 0.10-0.27
        // (medido en corpus real; por esto el reverso "parpadeaba").
        // refineToSupportedEdges expande cada lado a las lineas de borde
        // fisicas eligiendo por COBERTURA (no por aspecto, que aqui empata) y
        // se re-exige el soporte SOBRE EL QUAD REFINADO — todo lo aceptado
        // sigue asentado en bordes fisicos (anti-mutilado intacto) y lo que
        // hoy pasa directo no cambia.
        const rescueRefined = refineToSupportedEdges(edgeUnion, candidate.corners, width, height, allowPortrait);
        if (rescueRefined.valid
          && quadEdgeSupport(edgeUnion, width, height, rescueRefined.corners)
          && smoothRatioInQuad(smoothMask, rescueRefined.corners, width, height) >= 0.12) {
          best = {
            corners: rescueRefined.corners,
            aspect: rescueRefined.valid.aspect,
            areaRatio: rescueRefined.valid.quadArea / imgArea,
            score: candidate.score
          };
          break;
        }
      }
    }

    // V3: rescate por lineas cuando el pipeline de contornos no dejo ganador
    // (tarjeta en mano con dedos rompiendo el contorno). Mismo embudo de
    // filtros que los candidatos normales.
    if (!best) {
      mergeEdgeUnion();
      const rescued = [];
      collectHoughCandidates(edgeUnion, width, height, imgArea, minAreaRatio, maxAreaRatio, rescued, allowPortrait);
      if (rescued.length > 0) {
        rescued.sort((a, b) => b.score - a.score);
        if (!smoothMask) smoothMask = buildSmoothMask(gray);
        for (const candidate of rescued) {
          if (smoothRatioInQuad(smoothMask, candidate.corners, width, height) >= 0.12
            && houghQuadSupport(edgeUnion, width, height, candidate.corners)) {
            best = candidate;
            break;
          }
        }
      }
    }

    if (best) {
      // El ganador puede ser un rectangulo interior del documento: intenta
      // expandirlo hasta los bordes exteriores antes de reportar.
      const refined = refineToOuterEdges(edgeUnion, best.corners, width, height, allowPortrait);
      if (refined.valid) {
        postMessage({
          id: message.id,
          corners: refined.corners,
          aspect: refined.valid.aspect,
          areaRatio: refined.valid.quadArea / imgArea,
          score: best.score,
          frame: frame
        });
      } else {
        postMessage({ id: message.id, corners: best.corners, aspect: best.aspect, areaRatio: best.areaRatio, score: best.score, frame: frame });
      }
    } else {
      postMessage({ id: message.id, corners: null, frame: frame });
    }
  } catch (error) {
    postMessage({ id: message.id, corners: null, error: String(error) });
  } finally {
    if (glareMask) glareMask.delete();
    if (statsStd) statsStd.delete();
    if (statsMean) statsMean.delete();
    if (kernel) kernel.delete();
    if (kernelClose) kernelClose.delete();
    if (smoothMask) smoothMask.delete();
    if (edges) edges.delete();
    if (work) work.delete();
    if (gray) gray.delete();
    if (img) img.delete();
  }
}

// jscanify.extractPaper (getPerspectiveTransform + warpPerspective)
function handleExtract(message) {
  const cv = self.cv;
  const c = message.corners;
  let img = null;
  let warpedDst = null;
  let srcTri = null;
  let dstTri = null;
  let M = null;
  try {
    img = cv.matFromImageData(message.imageData);
    warpedDst = new cv.Mat();
    const dsize = new cv.Size(message.outputWidth, message.outputHeight);
    srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      c.topLeftCorner.x, c.topLeftCorner.y,
      c.topRightCorner.x, c.topRightCorner.y,
      c.bottomLeftCorner.x, c.bottomLeftCorner.y,
      c.bottomRightCorner.x, c.bottomRightCorner.y
    ]);
    dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0,
      message.outputWidth, 0,
      0, message.outputHeight,
      message.outputWidth, message.outputHeight
    ]);
    M = cv.getPerspectiveTransform(srcTri, dstTri);
    cv.warpPerspective(img, warpedDst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

    const output = new ImageData(
      new Uint8ClampedArray(warpedDst.data),
      message.outputWidth,
      message.outputHeight
    );
    postMessage({ id: message.id, output: output }, [output.data.buffer]);
  } catch (error) {
    postMessage({ id: message.id, output: null, error: String(error) });
  } finally {
    if (M) M.delete();
    if (dstTri) dstTri.delete();
    if (srcTri) srcTri.delete();
    if (warpedDst) warpedDst.delete();
    if (img) img.delete();
  }
}

// Metricas de calidad SIN OCR sobre el recorte del documento:
// - sharpness: varianza del Laplaciano (medida clasica de enfoque; borroso
//   por movimiento o desenfoque da valores bajos). Se calcula a un ancho
//   normalizado de 600px para que el umbral no dependa de la resolucion.
// - brightness/contrast: media y desviacion del gris.
// - glareRatio: fraccion de pixeles quemados (>= 250) — reflejo del plastico.
// - darkRatio: fraccion casi negra (<= 25).
function handleQuality(message) {
  const cv = self.cv;
  let img = null, small = null, gray = null, lap = null, mean = null, std = null;
  try {
    img = cv.matFromImageData(message.imageData);
    small = new cv.Mat();
    const targetWidth = 600;
    if (img.cols > targetWidth) {
      const s = targetWidth / img.cols;
      cv.resize(img, small, new cv.Size(targetWidth, Math.max(1, Math.round(img.rows * s))), 0, 0, cv.INTER_AREA);
    } else {
      img.copyTo(small);
    }
    gray = new cv.Mat();
    cv.cvtColor(small, gray, cv.COLOR_RGBA2GRAY, 0);

    lap = new cv.Mat();
    cv.Laplacian(gray, lap, cv.CV_64F);
    mean = new cv.Mat();
    std = new cv.Mat();
    cv.meanStdDev(lap, mean, std);
    const sharpness = Math.pow(std.doubleAt(0, 0), 2);

    // Ratio de nitidez inmune al contenido: se compara contra la misma
    // imagen desenfocada a proposito. Una foto nitida pierde mucha varianza
    // al desenfocarla (ratio alto ~3+); una ya borrosa casi no cambia
    // (ratio ~1-1.8). Esto atrapa QR/codigos borrosos cuya varianza absoluta
    // sigue alta por la textura densa.
    const blurred = new cv.Mat();
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
    cv.Laplacian(blurred, lap, cv.CV_64F);
    cv.meanStdDev(lap, mean, std);
    const blurredVar = Math.pow(std.doubleAt(0, 0), 2);
    const sharpRatio = sharpness / (blurredVar + 1e-6);
    blurred.delete();

    cv.meanStdDev(gray, mean, std);
    const brightness = mean.doubleAt(0, 0);
    const contrast = std.doubleAt(0, 0);

    let glare = 0;
    let dark = 0;
    let lowLight = 0;
    const pixels = gray.data;
    for (let i = 0; i < pixels.length; i += 1) {
      if (pixels[i] >= GLARE_LUMA) glare += 1;
      else if (pixels[i] <= 25) dark += 1;
      if (pixels[i] < 100) lowLight += 1;
    }

    // washedRatio: fraccion de bloques "lavados" (media > 225 y desviacion
    // < 14) en la zona central del recorte. Atrapa el reflejo difuso de un
    // foco que borra un bloque de datos SIN llegar a pixeles quemados
    // (>=250): en fotos reales de INE con lampara encima, el bloque
    // DOMICILIO queda ilegible con glareRatio 0% y nitidez normal. B=24
    // sobre el gris normalizado a 600px = bloques del 4% del ancho (misma
    // granularidad con la que se calibro el umbral del veredicto).
    const W = gray.cols, H = gray.rows, B = 24;
    const bx1 = Math.round(W * 0.08), bx2 = Math.round(W * 0.92);
    const by1 = Math.round(H * 0.10), by2 = Math.round(H * 0.90);
    let washedBlocks = 0, totalBlocks = 0;
    for (let by = by1; by + B <= by2; by += B) {
      for (let bx = bx1; bx + B <= bx2; bx += B) {
        let s = 0, s2 = 0;
        for (let y = by; y < by + B; y += 1) {
          const row = y * W;
          for (let x = bx; x < bx + B; x += 1) {
            const v = pixels[row + x];
            s += v; s2 += v * v;
          }
        }
        const m = s / (B * B);
        const sd = Math.sqrt(Math.max(0, s2 / (B * B) - m * m));
        totalBlocks += 1;
        if (m > 225 && sd < 14) washedBlocks += 1;
      }
    }

    postMessage({
      id: message.id,
      metrics: {
        sharpness: sharpness,
        sharpRatio: sharpRatio,
        brightness: brightness,
        contrast: contrast,
        glareRatio: glare / pixels.length,
        darkRatio: dark / pixels.length,
        // lowLightRatio: fraccion con luma < 100. Un recorte que ES la
        // tarjeta casi no tiene zonas asi (<= 21% medido en el corpus); si
        // domina (> 28%) el quad se llevo fondo (escritorio) en lugar del
        // documento.
        lowLightRatio: lowLight / pixels.length,
        washedRatio: totalBlocks > 0 ? washedBlocks / totalBlocks : 0
      }
    });
  } catch (error) {
    postMessage({ id: message.id, metrics: null, error: String(error) });
  } finally {
    if (std) std.delete();
    if (mean) mean.delete();
    if (lap) lap.delete();
    if (gray) gray.delete();
    if (small) small.delete();
    if (img) img.delete();
  }
}

self.onmessage = function (event) {
  const message = event.data;
  if (!cvReady) {
    postMessage({ id: message.id, corners: null, output: null, metrics: null, error: 'cv no listo' });
    return;
  }
  if (message.type === 'detect') handleDetect(message);
  else if (message.type === 'extract') handleExtract(message);
  else if (message.type === 'quality') handleQuality(message);
};
