export function StatusDot({ status }: { status?: string }) {
  const s = (status ?? '').toUpperCase();
  const cls =
    s === 'RUNNING' || s === 'WAITING'
      ? 'running'
      : s === 'SUCCESS'
        ? 'success'
        : s === 'FAIL' || s === 'CANCELED'
          ? 'fail'
          : 'idle';
  return <span className={`dot ${cls}`} title={status || '—'} />;
}
