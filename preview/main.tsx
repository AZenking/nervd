/// <reference types="../src/vite-env.d.ts" />
import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './theme.css';
import { useApp } from '../src/store/app';
import { Shell } from '../src/components/Shell';
import { Toaster } from '../src/components/ui/toast';
import { TooltipProvider } from '../src/components/ui/tooltip';

import { useUi, initThemeListener } from '../src/store/ui';
import { dismissSplashScreen } from '../src/lib/splash';
import { toast } from '../src/components/ui/toast';
import { LandingView } from './landing/LandingView';
import { ArrowLeft, Sparkles } from 'lucide-react';

// zustand 单条 toast → Base UI 可堆叠 toast 队列
function ToastHost() {
  const t = useApp((s) => s.toast);
  React.useEffect(() => {
    if (!t) return;
    toast.add({
      title: t.text,
      type: t.kind === 'ok' ? 'success' : t.kind === 'fail' ? 'error' : 'info',
    });
  }, [t]);
  return <Toaster />;
}

// 预览总入口：支持落地页（LandingView，基于 React Bits 组件）与在线工作台（Shell）一键无缝切换
function Preview() {
  const init = useApp((s) => s.init);
  const booting = useApp((s) => s.booting);
  const resolvedTheme = useUi((s) => s.resolvedTheme);

  const getInitialMode = (): 'landing' | 'workbench' => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.toLowerCase();
      if (hash === '#workbench' || hash === '#demo') {
        return 'workbench';
      }
    }
    return 'landing';
  };

  const [mode, setMode] = useState<'landing' | 'workbench'>(getInitialMode);

  useEffect(() => {
    const unlisten = initThemeListener();
    return () => unlisten();
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.toLowerCase();
      if (hash === '#workbench' || hash === '#demo') {
        setMode('workbench');
      } else if (hash === '#landing' || hash === '' || hash === '#') {
        setMode('landing');
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    (window as any).__nervd_app = useApp;
    (window as any).__nervd_ui = useUi;
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
  }, [resolvedTheme]);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (booting) return;
    void dismissSplashScreen();
  }, [booting]);

  const handleLaunchWorkbench = () => {
    window.location.hash = '#workbench';
    setMode('workbench');
  };

  const handleReturnToLanding = () => {
    window.location.hash = '#';
    setMode('landing');
  };

  return (
    <React.StrictMode>
      <TooltipProvider>
        {mode === 'landing' ? (
          <LandingView onLaunchWorkbench={handleLaunchWorkbench} />
        ) : (
          <div className="flex flex-col h-screen w-screen overflow-hidden">
            {/* 演示环境提示横幅 */}
            <div className="bg-primary/10 border-b border-primary/20 px-3 py-1.5 flex items-center justify-between text-xs text-foreground z-50">
              <div className="flex items-center gap-2">
                <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-medium text-primary">
                  nervd 在线模拟演示环境
                </span>
                <span className="text-muted-foreground hidden sm:inline">
                  (已加载 Mock 真实数据，可体验全键盘快捷键与状态流转)
                </span>
              </div>
              <button
                onClick={handleReturnToLanding}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-background hover:bg-muted text-xs font-medium border border-border text-foreground transition-colors shadow-xs active:scale-95"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>返回产品介绍</span>
              </button>
            </div>
            {/* 工作台主体 */}
            <div className="flex-1 overflow-hidden relative">
              <Shell />
            </div>
          </div>
        )}
        <ToastHost />
      </TooltipProvider>
    </React.StrictMode>
  );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<Preview />);
