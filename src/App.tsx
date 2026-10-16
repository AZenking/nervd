import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Toaster, toast } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Shell } from './components/Shell';
import { SettingsView } from './components/SettingsView';
import { StartupSplash } from './components/StartupSplash';
import { dismissSplashScreen } from './lib/splash';
import { useApp } from './store/app';
import { useUi } from './store/ui';
import { useUpdater } from './store/updater';
import type { JenkinsBuildEvent, PipelineRunEvent } from './types';
import { openExternal } from '@/lib/yunxiao-link';

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
  }, [init]);

  useEffect(() => {
    if (booting) return;
    void dismissSplashScreen();

    // 启动 4 秒后在后台静默检查更新一次（避免首屏与核心初始化网络争用）
    const timer = window.setTimeout(() => {
      void useUpdater.getState().checkForUpdates(true);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [booting]);

  useEffect(() => {
    const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
    if (!isTauri) return;

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
  }, [loadRepoCi]);

  useEffect(() => {
    const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
    if (!isTauri) return;

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
  }, [loadPipelines]);

  // 监听 macOS 原生系统菜单栏（工具栏/应用菜单）发出的指令
  useEffect(() => {
    const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
    if (!isTauri) return;

    const unAbout = listen('open-about', () => {
      useUi.getState().setAboutOpen(true);
    });
    const unSettings = listen<string | undefined>('open-settings', (e) => {
      useUi.getState().openSettings((e.payload as any) || 'about');
    });
    const unCommand = listen('open-command', () => {
      useUi.getState().setCommandOpen(true);
    });
    const unShortcuts = listen('open-shortcuts', () => {
      useUi.getState().setShortcutsOpen(true);
    });
    const unNav = listen<string>('navigate-view', (e) => {
      if (e.payload) {
        useUi.getState().setView(e.payload as any);
      }
    });

    return () => {
      void unAbout.then((f) => f());
      void unSettings.then((f) => f());
      void unCommand.then((f) => f());
      void unShortcuts.then((f) => f());
      void unNav.then((f) => f());
    };
  }, []);

  if (booting) {
    return (
      <TooltipProvider>
        <StartupSplash />
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
