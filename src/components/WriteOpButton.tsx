import { useState } from 'react';
import { useApp } from '../store/app';

export function WriteOpButton({
  label,
  onAction,
  title,
}: {
  label: string;
  onAction: () => Promise<void>;
  title?: string;
}) {
  const allow = useApp((s) => s.settings?.allowWriteOps ?? false);
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn btn-primary btn-sm"
      disabled={!allow || busy}
      title={!allow ? '需在设置中开启写操作（写权限令牌）' : (title ?? label)}
      onClick={async () => {
        setBusy(true);
        try {
          await onAction();
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? '···' : label}
    </button>
  );
}
