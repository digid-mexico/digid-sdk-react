export function Stepper({ steps, active }: { steps: readonly string[]; active: number }) {
  return (
    <ol className="digid-stepper">
      {steps.map((label, i) => (
        <li
          key={label}
          className={`digid-stepper__item${i === active ? ' digid-stepper__item--active' : ''}`}
          aria-current={i === active ? 'step' : undefined}
        >
          <span className="digid-stepper__dot">{i + 1}</span> <span>{label}</span>
        </li>
      ))}
    </ol>
  );
}
