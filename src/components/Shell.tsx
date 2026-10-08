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
  const [showTrace, setShowTrace] = useState(true);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-background px-4 select-none">
        <div className="flex min-w-0 items-center gap-2">
          <span className="size-2 rounded-sm bg-primary" />
          <span className="text-sm font-semibold tracking-tight text-foreground">nervd</span>
          <span className="text-border">/</span>
          <span className="truncate text-sm text-muted-foreground">
            {showSettings ? '设置' : '工作区'}
          </span>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-3">
          {settings?.organizationId && (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {settings.organizationId.slice(0, 10)}…
            </span>
          )}
          <span
            className={cn(
              'text-xs',
              connection === 'ok'
                ? 'text-sig-ok'
                : connection === 'fail'
                  ? 'text-sig-fail'
                  : 'text-muted-foreground',
            )}
          >
            {connection === 'ok' ? '● 已连接' : connection === 'fail' ? '● 连接失败' : '● 连接中'}
          </span>
          <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
            {settings?.allowWriteOps ? '可写' : '只读'}
          </span>
          {!showSettings && (
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={showTrace}
              aria-controls="trace-pane"
              onClick={() => setShowTrace((value) => !value)}
            >
              {showTrace ? '隐藏追溯' : '显示追溯'}
            </Button>
          )}
          <Button
            variant={showSettings ? 'outline' : 'ghost'}
            size="sm"
            onClick={() => setShowSettings((value) => !value)}
          >
            {showSettings ? '返回工作台' : '设置'}
          </Button>
        </div>
      </header>

      {showSettings ? (
        <main className="flex min-h-0 flex-1 justify-center overflow-y-auto bg-muted/20 px-6 py-8">
          <SettingsView embedded />
        </main>
      ) : (
        <main className="workspace-grid min-h-0 flex-1" data-trace-open={showTrace}>
          <Sidebar />
          <WorkitemDetail />
          <aside
            id="trace-pane"
            className={cn(
              'min-h-0 overflow-hidden border-l border-border bg-muted/30',
              !showTrace && 'hidden',
            )}
          >
            <TracePane />
          </aside>
        </main>
      )}
      <LogViewer />
    </div>
  );
}
