import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Toaster, toast } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { Shell } from './components/Shell';
import { SettingsView } from './components/SettingsView';
import { useApp } from './store/app';
import type { JenkinsBuildEvent, PipelineRunEvent } from './types';

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
  const { booting, settings, init, setToast, loadPipelines, loadRepoCi } = useApp();

  useEffect(() => {
    void init();
  }, []);

  useEffect(() => {
    const un = listen<JenkinsBuildEvent>('jenkins-build-finished', (e) => {
      const { jobFullName, runId, status, repoIds } = e.payload;
      setToast({
        text: `Jenkins ${jobFullName} #${runId} → ${status}`,
        kind: status === 'SUCCESS' ? 'ok' : status === 'FAIL' || status === 'CANCELED' ? 'fail' : 'info',
      });
      void Promise.all(repoIds.map((repoId) => loadRepoCi(repoId)));
    });
    return () => {
      void un.then((f) => f());
    };
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
        <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
          <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
            <span className="size-2 rounded-sm bg-primary" />
            <span className="text-sm font-semibold tracking-tight">nervd</span>
            <span className="text-border">/</span>
            <span className="text-sm text-muted-foreground">工作区</span>
          </header>
          <div className="workspace-grid min-h-0 flex-1">
          <div className="flex min-h-0 flex-col gap-3 border-r border-border bg-muted/40 p-4">
            <Skeleton className="h-7 w-full" />
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-md" />
            ))}
          </div>
          <div className="min-h-0 overflow-hidden p-8">
            <div className="mx-auto flex max-w-3xl flex-col gap-4">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-10 w-2/3" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="mt-4 h-12 w-full rounded-md" />
              <Skeleton className="h-12 w-full rounded-md" />
            </div>
          </div>
          <div className="flex min-h-0 flex-col gap-3 border-l border-border bg-muted/30 p-4">
            <Skeleton className="h-6 w-2/3" />
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-md" />
            ))}
          </div>
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
