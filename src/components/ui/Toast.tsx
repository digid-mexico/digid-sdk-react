export function Toast({ kind, message }: { kind: 'success' | 'error' | 'warning'; message: string }) {
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`digid-toast digid-toast--${kind}`}>
      {message}
    </div>
  );
}
