import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Toaster, toast } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { Shell } from './components/Shell';
import { SettingsView } from './components/SettingsView';
import { useApp } from './store/app';
import { useUi } from './store/ui';
import type { JenkinsBuildEvent, PipelineRunEvent } from './types';

// 打开外部链接（经 plugin-opener）；被 scope 拒绝等失败场景降级为错误 toast
function openExternal(url: string) {
  void openUrl(url).catch((err) => {
    toast.add({ title: '打开链接失败', description: String(err), type: 'error' });
  });
}

// Jenkins job 页：{baseUrl}/job/{jobFullName 中每个 '/' → '/job/'}；baseUrl 缺失或非法时返回 null（toast 不带入口）
function jenkinsJobUrl(baseUrl: string | undefined, jobFullName: string): string | null {
  const trimmed = (baseUrl ?? '').trim().replace(/\/+$/, '');
  if (!trimmed || !jobFullName) return null;
  const scheme = /^https?:\/\//i.test(trimmed) ? '' : 'https://';
  return `${scheme}${trimmed}/job/${jobFullName.split('/').join('/job/')}`;
}

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
  const { booting, settings, init, loadPipelines, loadRepoCi } = useApp();

  useEffect(() => {
    const theme = useUi.getState().theme;
    document.documentElement.classList.toggle('dark', theme === 'dark');
    void init();
  }, []);

  useEffect(() => {
    const un = listen<JenkinsBuildEvent>('jenkins-build-finished', (e) => {
      const { connectionId, jobFullName, runId, status, repoIds } = e.payload;
      // 事件监听不随 settings 重订阅，用 getState 取最新连接配置
      const connection = useApp
        .getState()
        .settings?.jenkinsConnections.find((c) => c.id === connectionId);
      const url = jenkinsJobUrl(connection?.baseUrl, jobFullName);
      toast.add({
        title: `Jenkins ${jobFullName} #${runId} → ${status}`,
        type: status === 'SUCCESS' ? 'success' : status === 'FAIL' || status === 'CANCELED' ? 'error' : 'info',
        ...(url ? { actionProps: { children: '查看', onClick: () => openExternal(url) } } : {}),
      });
      void Promise.all(repoIds.map((repoId) => loadRepoCi(repoId)));
    });
    return () => {
      void un.then((f) => f());
    };
  }, []);

  useEffect(() => {
    const un = listen<PipelineRunEvent>('pipeline-run-finished', (e) => {
      const { pipelineId, pipelineName, runId, status } = e.payload;
      const url = `https://flow.aliyun.com/pipelines/${pipelineId}/current`;
      toast.add({
        title: `${pipelineName} #${runId} → ${status}`,
        type: status === 'SUCCESS' ? 'success' : status === 'FAIL' ? 'error' : 'info',
        actionProps: { children: '查看', onClick: () => openExternal(url) },
      });
      void loadPipelines();
    });
    return () => {
      void un.then((f) => f());
    };
  }, []);

  if (booting) {
    return (
      <TooltipProvider>
        <div className="flex h-full min-h-0 bg-background text-foreground">
          <div className="flex w-64 shrink-0 flex-col gap-3 border-r border-border bg-sidebar p-3">
            <div className="h-8 select-none" />
            <div className="flex items-center gap-2 px-1">
              <Skeleton className="size-6 rounded-md" />
              <Skeleton className="h-4 w-20 rounded" />
            </div>
            <Skeleton className="h-7 w-full rounded-md mt-1" />
            <div className="flex flex-col gap-1.5 mt-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2.5 px-2 py-1.5">
                  <Skeleton className="size-4 rounded-sm" />
                  <Skeleton className="h-3.5 flex-1 rounded" style={{ width: `${50 + (i * 11) % 35}%` }} />
                </div>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden flex flex-col">
            <div className="h-12 border-b border-border/40 flex items-center justify-between px-8">
              <Skeleton className="h-5 w-36 rounded" />
              <Skeleton className="h-7 w-20 rounded" />
            </div>
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-8 py-6">
              <div className="grid grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-lg" />
                ))}
              </div>
              <Skeleton className="h-36 w-full rounded-lg" />
              <Skeleton className="h-48 w-full rounded-lg" />
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
