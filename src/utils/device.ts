export function isMobileDevice(): boolean {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// --- Port del prototipo KYC (Task 22): detección/espejo para el módulo de
// escaneo (src/scan/). Funciones puras (reciben el navigator/settings como
// parámetro) para poder testearlas en Node sin DOM; se mantienen separadas
// de isMobileDevice() de arriba (sin parámetro, usada ya por los pasos de
// INE/selfie) para no alterar su contrato existente.

/**
 * Móvil o tablet con cámara integrada. userAgentData.mobile es false en
 * tablets Android, por eso además se revisa el UA; iPadOS se anuncia como
 * "Macintosh" y solo se distingue por el multi-touch.
 */
export function isMobileDeviceUA(nav: Navigator | undefined = typeof navigator !== 'undefined' ? navigator : undefined): boolean {
  if (!nav) return false;
  const uaData = (nav as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (uaData?.mobile) return true;
  const ua = nav.userAgent || '';
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return true;
  return /Macintosh/.test(ua) && (nav.maxTouchPoints || 0) > 1;
}

/**
 * iOS/iPadOS (WebKit): una página web solo puede tener UNA cámara activa a
 * la vez — pedir la segunda mata el stream de la primera. Sirve para saber
 * cuándo NI intentar la doble cámara. iPadOS se anuncia como Macintosh y se
 * distingue por el multi-touch.
 */
export function isIOS(nav: Navigator | undefined = typeof navigator !== 'undefined' ? navigator : undefined): boolean {
  if (!nav) return false;
  const ua = nav.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return /Macintosh/.test(ua) && (nav.maxTouchPoints || 0) > 1;
}

/**
 * Regla de espejo de la vista previa:
 * - cámara trasera (facingMode 'environment'): nunca (moverse a la derecha
 *   se vería al revés)
 * - cualquier cámara de un móvil/tablet, incluida la FRONTAL: nunca (el
 *   texto del documento se lee al revés y confunde el encuadre)
 * - webcam de escritorio (facingMode 'user' o desconocido): sí, espejo
 *   estilo selfie (comportamiento histórico del prototipo)
 */
export function shouldMirrorPreview(
  settings: { facingMode?: string } = {},
  nav: Navigator | undefined = typeof navigator !== 'undefined' ? navigator : undefined,
): boolean {
  if (settings && settings.facingMode === 'environment') return false;
  if (isMobileDeviceUA(nav)) return false;
  return true;
}

/** Equivalente al string "OS/modelo/navegador" que hoy produce ua-parser. */
export function browserString(): string {
  const ua = navigator.userAgent;
  const os =
    /Android/i.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/i.test(ua) ? 'iOS'
    : /Windows/i.test(ua) ? 'Windows'
    : /Mac OS/i.test(ua) ? 'macOS'
    : /Linux/i.test(ua) ? 'Linux' : 'unknown';
  const browser =
    /Edg\//.test(ua) ? 'Edge'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : /Firefox\//.test(ua) ? 'Firefox' : 'unknown';
  return `${os}/web/${browser}`;
}
