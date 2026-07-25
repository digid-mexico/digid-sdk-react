export function isMobileDevice(): boolean {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
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
