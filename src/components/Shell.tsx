import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useApp } from '../store/app';
import { Button } from '@/components/ui/button';
import { LogViewer } from './LogViewer';
import { SettingsView } from './SettingsView';
import { Sidebar } from './Sidebar';
import { TracePane } from './TracePane';
import { WorkitemDetail } from './WorkitemDetail';

export function Shell() {
  const { settings, connection } = useApp();
  const [showSettings, setShowSettings] = useState(false);

  if (showSettings) {
    return (
      <>
        <div className="flex h-9 shrink-0 items-center gap-3.5 border-b border-line bg-card px-3 select-none">
          <span className="flex items-center gap-2 font-mono text-[13px] font-medium tracking-wide text-ink-0">
            <span className="inline-block size-[7px] translate-y-px bg-primary" />
            nervd
          </span>
          <span className="font-mono text-[11px] text-ink-2">设置</span>
          <span className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => setShowSettings(false)}>
            返回工作台
          </Button>
        </div>
        <div className="flex h-[calc(100%-36px)] justify-center overflow-y-auto py-10 px-5">
          <SettingsView embedded />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex h-9 shrink-0 items-center gap-3.5 border-b border-line bg-card px-3 select-none">
        <span className="flex items-center gap-2 font-mono text-[13px] font-medium tracking-wide text-ink-0">
          <span className="inline-block size-[7px] translate-y-px bg-primary" />
          nervd
        </span>
        <span className="font-mono text-[11px] text-ink-2">
          org:{settings?.organizationId ? settings.organizationId.slice(0, 10) + '…' : '—'}
        </span>
        <span
          className={cn(
            'font-mono text-[11px]',
            connection === 'ok' ? 'text-sig-ok' : connection === 'fail' ? 'text-sig-fail' : 'text-ink-2',
          )}
        >
          {connection === 'ok' ? '● LINK OK' : connection === 'fail' ? '● LINK FAIL' : '● …'}
        </span>
        <span className="font-mono text-[11px] text-ink-2">{settings?.allowWriteOps ? 'RW' : 'RO'}</span>
        <span className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => setShowSettings(true)}>
          设置
        </Button>
      </div>
      <div className="grid h-[calc(100%-36px)] grid-cols-[var(--rail-w)_minmax(360px,1fr)_minmax(320px,0.9fr)]">
        <Sidebar />
        <WorkitemDetail />
        <TracePane />
      </div>
      <LogViewer />
    </>
  );
}
