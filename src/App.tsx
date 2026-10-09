import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Toaster, toast } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { Shell } from './components/Shell';
import { SettingsView } from './components/SettingsView';
import { useApp } from './store/app';
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
          <div className="flex w-64 shrink-0 flex-col gap-3 border-r border-border bg-muted/30 p-4">
            <Skeleton className="h-10 w-full rounded-lg" />
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full rounded-md" />
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <div className="px-8 pt-6">
              <Skeleton className="h-8 w-64" />
            </div>
            <div className="mx-auto flex max-w-4xl flex-col gap-4 px-8 pt-8">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-40 w-full rounded-xl" />
              <Skeleton className="h-56 w-full rounded-xl" />
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
