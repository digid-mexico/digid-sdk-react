import { useCallback, useEffect, useRef, useState } from 'react';
import { useFlow } from '../../core/FlowContext';
import { useStrings } from '../../i18n';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { PdfViewer } from '../pdf/PdfViewer';
import { DigidError } from '../../types/api';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function StartStep() {
  const s = useStrings();
  const { state, dispatch, termsUrl, api, notify, setBusy } = useFlow();
  const data = state.startData!;
  const [accepted, setAccepted] = useState(false);
  const needsKyc =
    data.assignament.verifiacion_rostro === 1 ||
    data.assignament.verificacion_identificacion === 1;
  const [kycOpen, setKycOpen] = useState(needsKyc);

  const repre = data.repre;
  const [pwd, setPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const gpsRef = useRef<string | null>(null);

  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const pdfUrl = api.fileUrl(`/storage/files/${data.client.id}/${data.document.archivo}`);
  const clientName = data.subAccount?.correo ?? data.client.razonsocial;

  // GPS solo si hay representante legal y el cliente lo exige (mismo patrón que
  // PlaceSignaturesStep); gps null es aceptado por el backend.
  useEffect(() => {
    if (repre != null && data.preferences?.required_gps === 1 && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        gpsRef.current = `Latitude: ${pos.coords.latitude} Longitude: ${pos.coords.longitude}`;
      }, () => { /* opcional */ });
    }
  }, [repre, data]);

  async function continueRl() {
    if (submitting) return; // guarda contra doble click durante un envío en curso
    if (pwd.length < 3 || !accepted) return;
    setSubmitting(true);
    setBusy(true);
    try {
      await api.validRepre(pwd);
    } catch (e) {
      // No se expone el Message crudo del backend: puede filtrar detalles internos.
      // Excepción: un fallo de red no es "contraseña incorrecta" y no debe
      // decirle eso al usuario (p.ej. si está sin conexión).
      if (e instanceof DigidError && e.code === 'NETWORK') {
        notify('error', s.errors.generic);
      } else {
        notify('error', s.rl.wrongPassword);
      }
      setBusy(false);
      setSubmitting(false);
      return;
    }
    try {
      const res = await api.finishAutografa(gpsRef.current);
      if (res.Success) {
        dispatch({ type: 'GOTO', step: 'completed' });
      } else {
        notify('error', s.errors.generic);
      }
    } catch {
      notify('error', s.errors.generic);
    } finally {
      setBusy(false);
      setSubmitting(false);
    }
  }

  function openReset() {
    setResetEmail('');
    setResetSent(false);
    setResetOpen(true);
  }

  async function sendReset() {
    if (resetSubmitting || !EMAIL_PATTERN.test(resetEmail)) return;
    setResetSubmitting(true);
    try {
      const res = await api.forgotPwdRl(resetEmail);
      if (res.Success) {
        notify('success', s.rl.resetSent);
        setResetSent(true);
      } else {
        notify('error', s.errors.generic);
      }
    } catch {
      notify('error', s.errors.generic);
    } finally {
      setResetSubmitting(false);
    }
  }

  const resetEmailValid = EMAIL_PATTERN.test(resetEmail);

  // Identidad estable entre renders: Modal reejecuta su efecto de foco/trampa
  // de teclado cuando `onClose` cambia de referencia (dep del useEffect), lo
  // que le robaría el foco al input de email en cada tecleo si se pasara un
  // callback inline nuevo en cada render.
  const closeKyc = useCallback(() => {}, []);
  const closeReset = useCallback(() => setResetOpen(false), []);

  return (
    <section aria-label={s.start.title}>
      <div className="digid-start__header">
        <span className="digid-start__title">{s.start.title}</span>
        <span className="digid-start__signer">{data.signatory.nombre}</span>
      </div>

      <div className="digid-start__columns">
        {/* El documento es el foco de la pantalla: ocupa la columna ancha y va
            primero en el DOM para que en móvil (columnas apiladas) el firmante
            lo vea antes que las acciones. */}
        <div className="digid-start__main">
          <PdfViewer url={pdfUrl} toolbar />
          <div className="digid-download-box">
            <a href={api.fileUrl(`/docments/verarchivo/${data.document.id}`)} target="_blank" rel="noopener noreferrer">
              {s.start.download}
            </a>
          </div>
        </div>

        {/* Panel lateral: contexto arriba, acciones ancladas abajo. */}
        <div className="digid-start__sidebar">
          {/* React escapa estos strings: sin riesgo XSS aunque vengan del backend */}
          <p className="digid-start__greeting">
            {s.start.greetingHello} <strong>{data.signatory.nombre}</strong>!{' '}
            <strong>{clientName}</strong> {s.start.greetingInvited}{' '}
            <strong>{data.document.nombre}</strong>. {s.start.greetingCta}
          </p>
          {data.diff_documents && (
            <p role="alert" className="digid-start__warning">{data.diff_documents}</p>
          )}

          {repre != null && (
            <div className="digid-rl">
              <div className="digid-rl__title">{s.rl.title}</div>
              <img className="digid-rl__sign" src={api.fileUrl(repre.firma)} alt={s.rl.signAlt} />

              <div>
                <label htmlFor="digid-rl-pwd">{s.rl.password}</label>
                <div className="digid-input-wrap">
                  <input
                    id="digid-rl-pwd"
                    className="digid-input"
                    type={showPwd ? 'text' : 'password'}
                    placeholder={s.rl.passwordPlaceholder}
                    autoComplete="current-password"
                    value={pwd}
                    onChange={(e) => setPwd(e.target.value)}
                  />
                  <button
                    type="button"
                    aria-label={showPwd ? s.rl.hidePassword : s.rl.showPassword}
                    onClick={() => setShowPwd((v) => !v)}
                  >
                    {showPwd ? (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={20} height={20} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={20} height={20} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <button type="button" className="digid-link-btn" onClick={openReset}>
                {s.rl.forgot}
              </button>
            </div>
          )}
          {/* Ancladas al fondo del panel (margin-top:auto) para que queden a
              la altura del borde inferior del documento en escritorio. */}
          <div className="digid-start__actions">
            <div className="digid-terms">
              <label className="digid-check">
                <input
                  type="checkbox"
                  aria-label={s.start.accept}
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                />
                <span className="digid-check__icon" />
              </label>
              <a href={termsUrl} target="_blank" rel="noopener noreferrer">{s.start.accept}</a>
            </div>

            {repre != null ? (
              <Button
                className="digid-start__cta"
                onClick={() => void continueRl()}
                disabled={pwd.length < 3 || !accepted || submitting}
              >
                {s.rl.continue}
              </Button>
            ) : (
              <>
                <Button
                  className="digid-start__cta"
                  disabled={!accepted}
                  onClick={() => dispatch({ type: 'NEXT' })}
                >
                  {s.start.continue}
                </Button>
                {/* Enlace, no botón secundario: en el diseño la salida es una
                    acción terciaria bajo el CTA. Sigue siendo <button> por
                    accesibilidad (dispara una acción, no navega). */}
                <button
                  type="button"
                  className="digid-start__exit"
                  onClick={() => dispatch({ type: 'EXIT', reason: 'user_exit' })}
                >
                  {s.start.exit}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {kycOpen && (
        // onClose es un no-op a propósito: el flujo legado exige una elección
        // explícita (Continuar o Salir) para el consentimiento KYC, así que el
        // backdrop y Escape (que Modal invoca vía onClose) no deben cerrarlo.
        <Modal onClose={closeKyc} ariaLabel={s.start.kycNotice}>
          <p>{s.start.kycNotice}</p>
          <div className="digid-footer">
            <Button variant="secondary" onClick={() => dispatch({ type: 'EXIT', reason: 'user_exit' })}>
              {s.start.exit}
            </Button>
            <Button onClick={() => setKycOpen(false)}>{s.idCapture.continue}</Button>
          </div>
        </Modal>
      )}

      {resetOpen && (
        <Modal onClose={closeReset} ariaLabel={s.rl.resetTitle}>
          <h2>{s.rl.resetTitle}</h2>
          <p>{s.rl.resetBody}</p>
          <input
            type="email"
            className="digid-input"
            placeholder={s.rl.resetPlaceholder}
            value={resetEmail}
            onChange={(e) => setResetEmail(e.target.value)}
          />
          {resetSent && <p>{s.rl.resetAgainHint}</p>}
          <div className="digid-footer">
            <Button variant="secondary" onClick={() => setResetOpen(false)}>
              {s.rl.resetClose}
            </Button>
            <Button onClick={() => void sendReset()} disabled={!resetEmailValid || resetSubmitting}>
              {s.rl.resetSend}
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}
