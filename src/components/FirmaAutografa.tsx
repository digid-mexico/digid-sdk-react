import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiClient } from '../api/client';
import { FlowContext } from '../core/FlowContext';
import { useAutografaFlow } from '../core/useAutografaFlow';
import { ThemeProvider, sanitizeColor, type DigidTheme } from '../theme/ThemeProvider';
import { I18nProvider, es } from '../i18n';
import { Spinner } from './ui/Spinner';
import { Toast } from './ui/Toast';
import { StartStep } from './steps/StartStep';
import { IdCaptureStep } from './steps/IdCaptureStep';
import { CreateSignStep } from './steps/CreateSignStep';
import { PlaceSignaturesStep } from './steps/PlaceSignaturesStep';
import { CompletedStep } from './steps/CompletedStep';

export interface FirmaAutografaProps {
  token: string;
  baseUrl?: string;
  theme?: DigidTheme;
  termsUrl?: string;
  onComplete?: () => void;
  onExit?: (reason: string) => void;
  onError?: (error: Error) => void;
}

export function FirmaAutografa({
  token, baseUrl = '', theme, termsUrl = 'https://www.digid.com.mx/terminos-condiciones',
  onComplete, onExit, onError,
}: FirmaAutografaProps) {
  const api = useMemo(() => new ApiClient({ baseUrl, token }), [baseUrl, token]);
  const { state, dispatch, asignado, refreshAsignado } = useAutografaFlow(api);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error' | 'warning'; message: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  const notify = (kind: 'success' | 'error' | 'warning', message: string) => {
    setToast({ kind, message });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  };

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
  }, [state.step]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <I18nProvider value={es}>
      <ThemeProvider theme={effectiveTheme}>
        <FlowContext.Provider
          value={{ api, state, dispatch, asignado, refreshAsignado, notify, setBusy, termsUrl }}
        >
          {state.step === 'loading' && <Spinner />}
          {state.step === 'start' && <StartStep />}
          {state.step === 'ineFront' && <IdCaptureStep side="front" key="front" />}
          {state.step === 'ineBack' && <IdCaptureStep side="back" key="back" />}
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
