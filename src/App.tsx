import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Toaster, toast } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { Shell } from './components/Shell';
import { SettingsView } from './components/SettingsView';
import { useApp } from './store/app';
import type { PipelineRunEvent } from './types';

// zustand 单条 toast → Base UI 可堆叠 toast 队列
function ToastHost() {
  const t = useApp((s) => s.toast);
  useEffect(() => {
    if (!t) return;
    toast.add({
      title: t.text,
      type: t.kind === 'ok' ? 'success' : t.kind === 'fail' ? 'error' : 'info',
    });
  }, [t]);
  return <Toaster />;
}

export default function App() {
  const { booting, settings, init, setToast, loadPipelines } = useApp();

  useEffect(() => {
    void init();
  }, []);

  useEffect(() => {
    const un = listen<PipelineRunEvent>('pipeline-run-finished', (e) => {
      const { pipelineName, runId, status } = e.payload;
      setToast({ text: `${pipelineName} #${runId} → ${status}`, kind: status === 'SUCCESS' ? 'ok' : status === 'FAIL' ? 'fail' : 'info' });
      void loadPipelines();
    });
    return () => {
      void un.then((f) => f());
    };
  }, []);

  if (booting) {
    return (
      <TooltipProvider>
        <div className="flex h-9 items-center gap-3.5 border-b border-line bg-card px-3">
          <span className="font-mono text-[13px] font-medium tracking-wide text-ink-0">nervd</span>
        </div>
        <div className="grid h-[calc(100%-36px)] grid-cols-[var(--rail-w)_minmax(360px,1fr)_minmax(320px,0.9fr)]">
          <div className="flex flex-col gap-3 border-r border-line p-3">
            <Skeleton className="h-7 w-full" />
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
          <div className="flex flex-col gap-3 border-r border-line p-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-24 w-full" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
          <div className="flex flex-col gap-3 p-3">
            <Skeleton className="h-5 w-1/2" />
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        </div>
      </TooltipProvider>
    );
  }

  const needSetup = !settings?.hasPat || !settings?.organizationId || !settings?.defaultSpaceIdentifier;
  return (
    <TooltipProvider>
      {needSetup ? <SettingsView /> : <Shell />}
      <ToastHost />
    </TooltipProvider>
  );
}
