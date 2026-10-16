import { useEffect, useState } from 'react';
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
import { useWindowDrag } from './hooks/use-window-drag';
import type { JenkinsBuildEvent, PipelineRunEvent, SettingsView as SettingsViewType } from './types';
import { openExternal } from '@/lib/yunxiao-link';

const ONBOARDED_KEY = 'nervd_has_onboarded';

/**
 * 判断是否已完成初始化引导并就绪工作区：
 * 1. 核心凭据完整（PAT、组织 ID、默认项目空间）直接视为已就绪；
 * 2. 本地已标记完成引导且保留关键凭据（PAT 或组织 ID），允许留在工作区，避免因在工作区内调整某项字段而突然将整个工作台卸载打断工作现场。
 */
export function checkHasOnboarded(settings: SettingsViewType | null): boolean {
  if (!settings) return false;
  if (settings.hasPat && settings.organizationId && settings.defaultSpaceIdentifier) {
    return true;
  }
  if (typeof localStorage !== 'undefined' && localStorage.getItem(ONBOARDED_KEY) === 'true') {
    if (settings.hasPat || settings.organizationId) {
      return true;
    }
  }
  return false;
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
  const [hasOnboarded, setHasOnboarded] = useState<boolean>(() => checkHasOnboarded(settings));

  // 全局注入 macOS 沉浸式窗口拖拽与双击最大化
  useWindowDrag();

  useEffect(() => {
    const theme = useUi.getState().theme;
    document.documentElement.classList.toggle('dark', theme === 'dark');
    void init();
  }, [init]);

  // 当 settings 加载完成或发生变化时，若已齐备则自动同步已完成状态
  useEffect(() => {
    if (checkHasOnboarded(settings)) {
      setHasOnboarded(true);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(ONBOARDED_KEY, 'true');
      }
    }
  }, [settings]);

  const handleCompleteOnboarding = () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ONBOARDED_KEY, 'true');
    }
    setHasOnboarded(true);
    toast.add({
      title: '配置已完成，欢迎使用 nervd 工作台',
      type: 'success',
    });
  };

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

  const showInitialSetup = !hasOnboarded;
  return (
    <TooltipProvider>
      {showInitialSetup ? (
        <SettingsView onComplete={handleCompleteOnboarding} />
      ) : (
        <Shell />
      )}
      <ToastHost />
    </TooltipProvider>
  );
}
