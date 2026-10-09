/// <reference types="../src/vite-env.d.ts" />
import React from 'react';
import ReactDOM from 'react-dom/client';
import './theme.css';
import { useApp } from '../src/store/app';
import { Shell } from '../src/components/Shell';
import { Toaster } from '../src/components/ui/toast';
import { TooltipProvider } from '../src/components/ui/tooltip';

// 预览入口：浏览器内以 mock 数据驱动新 UI（不经过 App 的 Tauri 事件监听）
function Preview() {
  const init = useApp((s) => s.init);
  React.useEffect(() => { void init(); }, [init]);
  return (
    <React.StrictMode>
      <TooltipProvider>
        <Shell />
        <Toaster />
      </TooltipProvider>
    </React.StrictMode>
  );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<Preview />);
