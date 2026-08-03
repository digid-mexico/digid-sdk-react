import type { Strings } from '../../i18n/es';

/** Distingue el permiso denegado (NotAllowedError) del resto de fallos de cámara. */
export function cameraErrorMessage(error: Error, s: Strings): string {
  return error.name === 'NotAllowedError' ? s.capture.permissionDenied : s.errors.camera;
}
