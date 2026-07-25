import { useStrings } from '../../i18n';

export function CompletedStep() {
  const s = useStrings();
  return (
    <section aria-label={s.completed.title} style={{ textAlign: 'center' }}>
      <svg width="120" height="120" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="11" fill="#22AD5C" />
        <path d="M7 12.5l3 3 7-7" stroke="#fff" strokeWidth="2" fill="none" />
      </svg>
      <h1>{s.completed.title}</h1>
      <p>{s.completed.message}</p>
    </section>
  );
}
