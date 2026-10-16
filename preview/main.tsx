/// <reference types="../src/vite-env.d.ts" />
import React from 'react';
import ReactDOM from 'react-dom/client';
import './theme.css';
import { useApp } from '../src/store/app';
import { Shell } from '../src/components/Shell';
import { Toaster } from '../src/components/ui/toast';
import { TooltipProvider } from '../src/components/ui/tooltip';

import { useUi } from '../src/store/ui';
import { dismissSplashScreen } from '../src/lib/splash';
import { toast } from '../src/components/ui/toast';

// zustand 单条 toast → Base UI 可堆叠 toast 队列（对齐 App.tsx 的 ToastHost，
// 否则 preview 下 store 的 setToast（乐观更新成功/失败提示等）不会显示）
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

// 预览入口：浏览器内以 mock 数据驱动新 UI（不经过 App 的 Tauri 事件监听）
function Preview() {
  const init = useApp((s) => s.init);
  const booting = useApp((s) => s.booting);
  const theme = useUi((s) => s.theme);

  React.useEffect(() => {
    (window as any).__nervd_app = useApp;
    (window as any).__nervd_ui = useUi;
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  React.useEffect(() => { void init(); }, [init]);

  React.useEffect(() => {
    if (booting) return;
    void dismissSplashScreen();
  }, [booting]);
  return (
    <React.StrictMode>
      <TooltipProvider>
        <Shell />
        <ToastHost />
      </TooltipProvider>
    </React.StrictMode>
  );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<Preview />);
