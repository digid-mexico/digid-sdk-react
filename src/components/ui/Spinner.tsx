export function Spinner() {
  return (
    <div className="digid-spinner" role="progressbar" aria-label="Cargando">
      <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke="var(--digid-primary)" strokeWidth="3"
          fill="none" strokeDasharray="45 20">
          <animateTransform attributeName="transform" type="rotate" from="0 12 12"
            to="360 12 12" dur="0.8s" repeatCount="indefinite" />
        </circle>
      </svg>
    </div>
  );
}
