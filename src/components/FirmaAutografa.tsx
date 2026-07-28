import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiClient } from '../api/client';
import { FlowContext } from '../core/FlowContext';
import { useAutografaFlow } from '../core/useAutografaFlow';
import { ThemeProvider, sanitizeColor, type DigidTheme } from '../theme/ThemeProvider';
import type { DetectionAssets } from '../detection/types';
import type { ScanAssets } from '../scan/types';
import { disposeFaceDetector } from '../detection/faceDetector';
import { disposeBarcodeDetector } from '../detection/barcodeDetector';
import { I18nProvider, es } from '../i18n';
import { Spinner } from './ui/Spinner';
import { Toast } from './ui/Toast';
import { StartStep } from './steps/StartStep';
import { IdCaptureStep } from './steps/IdCaptureStep';
import { SelfieStep } from './steps/SelfieStep';
import { CreateSignStep } from './steps/CreateSignStep';
import { PlaceSignaturesStep } from './steps/PlaceSignaturesStep';
import { CompletedStep } from './steps/CompletedStep';

export interface FirmaAutografaProps {
  token: string;
  baseUrl?: string;
  theme?: DigidTheme;
  termsUrl?: string;
  /** URLs configurables para los detectores on-device de auto-captura (MediaPipe/zxing). */
  detectionAssets?: DetectionAssets;
  /** URL configurable del worker de escaneo OpenCV (núcleo portado en Task 22; aún sin consumir desde los steps). */
  scanAssets?: ScanAssets;
  onComplete?: () => void;
  onExit?: (reason: string) => void;
  onError?: (error: Error) => void;
}

export function FirmaAutografa({
  token, baseUrl = '', theme, termsUrl = 'https://www.digid.com.mx/terminos-condiciones',
  detectionAssets, scanAssets, onComplete, onExit, onError,
}: FirmaAutografaProps) {
  const api = useMemo(() => new ApiClient({ baseUrl, token }), [baseUrl, token]);
  const { state, dispatch, asignado, refreshAsignado } = useAutografaFlow(api);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error' | 'warning'; message: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  const notify = useCallback((kind: 'success' | 'error' | 'warning', message: string) => {
    setToast({ kind, message });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  // Evita que un timeout pendiente dispare setState tras el desmontaje
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // Libera los detectores on-device cacheados a nivel de módulo (Task 21) al
  // desmontar la raíz del SDK: se cachean deliberadamente entre pasos
  // (INE frontal/reverso/selfie) para no reinicializar el WASM en cada uno,
  // pero deben cerrarse cuando el integrador desmonta <FirmaAutografa>.
  // Fire-and-forget: no hay nada útil que hacer con un fallo aquí.
  useEffect(
    () => () => {
      void disposeFaceDetector().catch(() => {});
      void disposeBarcodeDetector().catch(() => {});
    },
    [],
  );

  // Estilos por cliente del backend (saneados) tienen prioridad sobre el theme del integrador
  const effectiveTheme: DigidTheme = useMemo(() => {
    const backendStyle = state.startData?.style;
    return {
      ...theme,
      primaryColor: sanitizeColor(backendStyle?.btnbackground_color) ?? theme?.primaryColor,
      buttonTextColor: sanitizeColor(backendStyle?.btn_color) ?? theme?.buttonTextColor,
    };
  }, [state.startData, theme]);

  useEffect(() => {
    if (state.step === 'completed') onComplete?.();
    if (state.step === 'exited') onExit?.(state.exitReason ?? 'user_exit');
    if (state.step === 'error' && state.error) onError?.(state.error);
    // Deps incluyen state.error y state.exitReason (no solo state.step) para
    // que una segunda FAIL/EXIT estando ya en ese step (mismo step, nuevo
    // error/reason) también dispare el callback correspondiente.
  }, [state.step, state.error, state.exitReason]); // eslint-disable-line react-hooks/exhaustive-deps -- onComplete/onExit/onError intencionalmente fuera: no deben reejecutar el efecto si el consumidor pasa una nueva referencia en cada render

  const flowContextValue = useMemo(
    () => ({ api, state, dispatch, asignado, refreshAsignado, notify, setBusy, termsUrl, detectionAssets, scanAssets }),
    [api, state, asignado, refreshAsignado, notify, termsUrl, detectionAssets, scanAssets],
  );

  return (
    <I18nProvider value={es}>
      <ThemeProvider theme={effectiveTheme}>
        <FlowContext.Provider value={flowContextValue}>
          {state.step === 'loading' && <Spinner />}
          {state.step === 'start' && <StartStep />}
          {state.step === 'ineFront' && <IdCaptureStep side="front" key="front" />}
          {state.step === 'ineBack' && <IdCaptureStep side="back" key="back" />}
          {state.step === 'selfie' && <SelfieStep />}
          {state.step === 'createSign' && <CreateSignStep />}
          {state.step === 'placeSignatures' && <PlaceSignaturesStep />}
          {state.step === 'completed' && <CompletedStep />}
          {state.step === 'error' && <p role="alert">{es.errors.generic}</p>}
          {busy && <Spinner />}
          {toast && <Toast kind={toast.kind} message={toast.message} />}
        </FlowContext.Provider>
      </ThemeProvider>
    </I18nProvider>
  );
}
