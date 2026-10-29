import { useCallback, useEffect, useRef, useState } from 'react';
import { useSettingsDraft } from '../store/settings-draft';
import { useUi, type WorkspaceView } from '../store/ui';
import { AppSidebar } from './nav/app-sidebar';
import { IterationView } from './iteration/IterationView';
import { RequirementDetails } from './iteration/RequirementDetails';
import { IntegrationView } from './integration/IntegrationView';
import { BuildWorkbenchDrawer } from './build-workbench';
import { OverviewView } from './OverviewView';
import { RecentsView } from './recents/RecentsView';
import { SettingsView } from './SettingsView';
import { SchedulesView } from './schedules/SchedulesView';
import { LocalTasksView } from './local-tasks/LocalTasksView';
import { CommandMenu } from './command-menu';
import { ShortcutsDialog } from './shortcuts-dialog';
import { AboutDialog } from './about-dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { PaneSeparator } from '@/components/ui/resizable';
import { useElementWidth } from '@/hooks/use-element-width';
import { useIsMobile } from '@/hooks/use-mobile';
import { useLayout, SIDEBAR_PANE, NARROW_CONTAINER_WIDTH } from '@/store/layout';
import { useGlobalCiScheduler } from '@/hooks/use-ci-polling';
import { useScheduleRunner } from '@/hooks/use-schedule-runner';
import { useEventListener } from '@/hooks/use-event-listener';
import { useApp } from '@/store/app';
import { listen } from '@tauri-apps/api/event';
import { hasWorkspaceOverlay, isEditing, performWorkspaceAction } from '@/lib/workspace-actions';

/** g 前缀序列的等待窗口（Linear g+letter：g 后 1200ms 内的下一键才生效） */
const G_SEQUENCE_TIMEOUT_MS = 1200;

/** Base UI 弹层（AlertDialog.Popup 是 role="alertdialog"，Dialog.Popup 是 role="dialog"）都在 DOM 里即视为有浮层 */
const OPEN_DIALOG_SELECTOR = '[role="dialog"], [role="alertdialog"]';

/** shadcn sidebar 折叠态 cookie（ui/sidebar.tsx 内部写入）；Shell 受控模式下自读初始偏好 */
const SIDEBAR_STATE_COOKIE = 'sidebar_state';
const SIDEBAR_STATE_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

function readStoredSidebarOpen(): boolean {
  if (typeof document === 'undefined') return true;
  const row = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${SIDEBAR_STATE_COOKIE}=`));
  return row ? row.slice(SIDEBAR_STATE_COOKIE.length + 1) === 'true' : true;
}

function persistSidebarOpen(open: boolean): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${SIDEBAR_STATE_COOKIE}=${open}; path=/; max-age=${SIDEBAR_STATE_COOKIE_MAX_AGE}`;
}

/** 焦点是否在文本可编辑控件内（输入框 / 文本域 / 可编辑区域） */
function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}

/** 未保存设置草稿的导航守卫（UX A1）：保存并离开 / 放弃修改 / 继续编辑 */
function DirtyGuardDialog() {
  const pendingView = useSettingsDraft((s) => s.pendingView);
  const save = useSettingsDraft((s) => s.save);
  const discard = useSettingsDraft((s) => s.discard);
  const setPendingView = useSettingsDraft((s) => s.setPendingView);
  const [saving, setSaving] = useState(false);

  /** 完成被拦截的导航；目标需在 save()/discard() 之前捕获（二者会清空 pendingView） */
  const navigateTo = useCallback((dest: string | null) => {
    setPendingView(null);
    if (!dest) return;
    const ui = useUi.getState();
    if (dest === 'back') ui.back();
    else if (dest === 'forward') ui.forward();
    else ui.setView(dest as WorkspaceView);
  }, [setPendingView]);

  return (
    <AlertDialog open={pendingView != null} onOpenChange={(open) => { if (!open) setPendingView(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>设置存在未修正的错误</AlertDialogTitle>
          <AlertDialogDescription>
            当前设置存在格式错误或未填项，无法自动保存。离开设置页前，可选择放弃修改，或留在当前页面继续修正。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>继续编辑</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              const dest = useSettingsDraft.getState().pendingView;
              discard();
              navigateTo(dest);
            }}
          >
            放弃修改
          </AlertDialogAction>
          <AlertDialogAction
            variant="destructive"
            disabled={saving}
            onClick={() => {
              setSaving(true);
              const dest = useSettingsDraft.getState().pendingView;
              void save().then((ok) => {
                setSaving(false);
                // 保存失败（校验错误等）留在设置页修正
                if (ok) navigateTo(dest);
              });
            }}
          >
            {saving ? '保存中…' : '保存并离开'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function Shell() {
  const { view } = useUi();
  const restoreScroll = useUi((s) => s.restoreScroll);
  const loadingDetail = useApp((s) => s.loadingDetail);

  // ---- 布局自适应（窄窗口侧栏自动图标化，与用户主动开合分别管理）----
  // 容器宽度 < 1180px：侧栏自动收为图标栏；页头/侧栏入口可临时展开（会话态，不写偏好）。
  // 放大窗口后自动清除临时展开，恢复用户持久偏好（sidebar_state cookie）。
  const [containerRef, containerWidth] = useElementWidth<HTMLDivElement>();
  const sidebarWidth = useLayout((s) => s.sidebarWidth);
  const setSidebarWidth = useLayout((s) => s.setSidebarWidth);
  const resetSidebarWidth = useLayout((s) => s.resetSidebarWidth);
  const isMobile = useIsMobile();
  const [userSidebarOpen, setUserSidebarOpen] = useState(readStoredSidebarOpen);
  const [navTemporarilyExpanded, setNavTemporarilyExpanded] = useState(false);
  const containerNarrow = containerWidth > 0 && containerWidth < NARROW_CONTAINER_WIDTH;
  const sidebarOpen = navTemporarilyExpanded || (!containerNarrow && userSidebarOpen);

  // 宽容器下校正 cookie 回用户偏好（窄窗临时展开会被 ui/sidebar.tsx 内部写入污染）
  useEffect(() => {
    if (containerNarrow) return;
    if (navTemporarilyExpanded) setNavTemporarilyExpanded(false);
    persistSidebarOpen(userSidebarOpen);
  }, [containerNarrow, userSidebarOpen, navTemporarilyExpanded]);

  const handleSidebarOpenChange = useCallback((open: boolean) => {
    if (containerNarrow) {
      // 窄窗：入口展开是临时态，不覆盖用户偏好
      setNavTemporarilyExpanded(open);
      return;
    }
    setNavTemporarilyExpanded(false);
    setUserSidebarOpen(open);
    persistSidebarOpen(open);
  }, [containerNarrow]);

  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;
    const unlisten = listen<string>('workspace-command', (event) => {
      performWorkspaceAction(event.payload);
    });
    return () => { void unlisten.then((dispose) => dispose()); };
  }, []);

  // 挂载全局自适应 CI 轮询调度器（覆盖总览、迭代、需求详情全视图，活跃态 4s / 空闲态 60s）
  useGlobalCiScheduler();

  // 挂载全局常驻定时任务调度执行器（10s 心跳自愈调度）
  useScheduleRunner();

  // 窗口激活焦点时自动重验陈旧数据（SWR 机制：超过 2 分钟未刷新的工作项和迭代数据静默补拉）
  useEventListener('focus', () => {
    if (document.querySelector(OPEN_DIALOG_SELECTOR)) return;
    const activeEl = document.activeElement;
    if (isEditableTarget(activeEl)) return;
    void useApp.getState().revalidateIfStale(120_000);
  });

  // ---- 全局快捷键层（Linear 操作逻辑，合并原有 ⌘K / ⌘←）----
  // 处理顺序：① ⌘/Ctrl 组合键（不参与 g 序列）→ ② 浮层/输入焦点让路 → ③ g 前缀序列 → ④ ? 面板 → ⑤ Esc 后退。
  // j/k/Enter 与 `/` 列表导航归 IterationView 自身监听，此处不重复绑定。
  const gTimerRef = useRef<number | null>(null);

  /** 结束 g 序列等待（清除超时计时器；幂等） */
  const resetGSequence = useCallback(() => {
    if (gTimerRef.current != null) {
      window.clearTimeout(gTimerRef.current);
      gTimerRef.current = null;
    }
  }, []);

  useEventListener('keydown', (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.isComposing) return;
    const ui = useUi.getState();
    const el = e.target as HTMLElement | null;

    // ① ⌘/Ctrl 组合键：保持原有行为（⌘K 面板 / ⌘← 后退）；任何组合键都不触发下方单键序列
    if (e.metaKey || e.ctrlKey) {
      resetGSequence();
      if (e.key.toLowerCase() === 'k' && ui.commandOpen && !e.altKey && !e.shiftKey) {
        if ('__TAURI_INTERNALS__' in window && /Mac/i.test(navigator.platform)) return;
        e.preventDefault();
        ui.setCommandOpen(false);
        return;
      }
      if (e.altKey || e.shiftKey || hasWorkspaceOverlay()) return;
      const command = ({ '[': 'back', ']': 'forward', f: 'find', r: 'refresh' } as Record<string, string>)[e.key.toLowerCase()];
      if (command) {
        // macOS accelerators are delivered by the native menu event exactly once.
        if ('__TAURI_INTERNALS__' in window && /Mac/i.test(navigator.platform)) return;
        const handled = performWorkspaceAction(command);
        if (handled || command === 'refresh') e.preventDefault();
        return;
      }
      if (e.key === ',') {
        if ('__TAURI_INTERNALS__' in window && /Mac/i.test(navigator.platform)) return;
        e.preventDefault();
        ui.openSettings('connection');
        return;
      }
      if (e.key.toLowerCase() === 'k') {
        if ('__TAURI_INTERNALS__' in window && /Mac/i.test(navigator.platform)) return;
        e.preventDefault();
        // 快捷键面板或关于面板开着时先收起，避免两个浮层叠开
        if (ui.shortcutsOpen) ui.setShortcutsOpen(false);
        if (ui.aboutOpen) ui.setAboutOpen(false);
        ui.toggleCommandMenu();
        return;
      }
      if (e.key === 'ArrowLeft') {
        // 输入控件内保留光标移动语义
        if (isEditing(el)) return;
        if (!ui.history.length) return;
        e.preventDefault();
        ui.back();
      }
      return;
    }
    if (e.altKey) {
      resetGSequence();
      return;
    }

    // ② 浮层打开（命令面板 / 快捷键面板 / 关于面板 / 任意 Base UI 弹层）或焦点在输入控件：
    //    全局单键一律让路（Esc 由 Base UI 自行关闭浮层），并复位 g 序列
    if (ui.commandOpen || ui.shortcutsOpen || ui.aboutOpen || hasWorkspaceOverlay()) {
      resetGSequence();
      return;
    }
    if (isEditing(el)) {
      resetGSequence();
      return;
    }

    // ③ g 前缀序列跳转（g o 总览 / g i 迭代 / g b 集成分支 / g c 定时任务 / g s 设置）：第二键未命中也照常复位
    const awaitingG = gTimerRef.current != null;
    resetGSequence();
    if (awaitingG) {
      if (e.key === 'o') return void ui.setView('overview');
      if (e.key === 'r') return void ui.setView('recents');
      if (e.key === 'i') return void ui.setView('iteration');
      if (e.key === 'b') return void ui.setView('integration');
      if (e.key === 'c') return void ui.setView('schedules');
      if (e.key === 't') return void ui.setView('local-tasks');
      if (e.key === 's') return void ui.openSettings('connection');
      // 其他键：已复位，继续落入下方单键逻辑
    } else if (e.key === 'g') {
      gTimerRef.current = window.setTimeout(resetGSequence, G_SEQUENCE_TIMEOUT_MS);
      return;
    }

    // ④ ? 打开键盘快捷键面板（Shift+/，焦点不在输入控件时）
    if (e.key === '?') {
      e.preventDefault();
      ui.setShortcutsOpen(true);
      return;
    }

    // Esc dismisses transient UI; full-page navigation uses Back / ⌘[.
  });

  // 组件卸载时安全清理 g 序列计时器
  useEffect(() => {
    return () => resetGSequence();
  }, [resetGSequence]);

  // 后退恢复工作区滚动位置（应用一次后清空，避免前向导航被旧值干扰）
  useEffect(() => {
    if (restoreScroll == null || view === 'iteration' || (view === 'requirement' && loadingDetail)) return;
    const frame = requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>('.workspace-scroll');
      if (!el) return;
      el.scrollTop = restoreScroll;
      useUi.setState({ restoreScroll: null });
    });
    return () => cancelAnimationFrame(frame);
  }, [restoreScroll, view, loadingDetail]);

  return (
    <SidebarProvider
      ref={containerRef}
      className="relative"
      style={{ '--sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}
      open={sidebarOpen}
      onOpenChange={handleSidebarOpenChange}
    >
      <AppSidebar />
      {/* 侧栏右缘拖动分隔线：1px 可见线 + 透明命中区；键盘可调、双击恢复默认 256px。
          仅在展开态渲染（图标栏模式下宽度拖动无意义），移动端走抽屉不渲染。 */}
      {!isMobile && sidebarOpen && (
        <PaneSeparator
          aria-label={`调整侧栏宽度，${SIDEBAR_PANE.min} 到 ${SIDEBAR_PANE.max} 像素`}
          className="z-20"
          style={{ left: 'calc(var(--sidebar-width) - 4px)' }}
          value={sidebarWidth}
          min={SIDEBAR_PANE.min}
          max={SIDEBAR_PANE.max}
          onChange={setSidebarWidth}
          onReset={resetSidebarWidth}
        />
      )}
      {/* Linear 浮动主卡：inset 变体自带 m-2 圆角（ui/sidebar.tsx），这里只管裁切 */}
      <SidebarInset className="overflow-hidden">
        <div className="flex h-full min-h-0">
          <section data-workspace-content className="flex min-w-0 flex-1 flex-col h-full min-h-0 overflow-hidden">
            {view === 'iteration' ? (
              <IterationView />
            ) : (
              /* 顶部留白不放在滚动容器上（由各视图 / 吸顶页头自带 pt-5）：
                  吸顶 PageHeader 的 top-0 才能严格贴住可视顶部，避免吸顶缝隙；
                  overflow-x-hidden 阻断页头负边距在滚动条占位时引发的微量水平溢出 */
              <div className="workspace-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 pb-14 sm:px-8 lg:px-10">
                {view === 'requirement' && <RequirementDetails />}
                {view === 'integration' && <IntegrationView />}
                {view === 'overview' && <OverviewView />}
                {view === 'recents' && <RecentsView />}
                {view === 'schedules' && <SchedulesView />}
                {view === 'local-tasks' && <LocalTasksView />}
                {/* 设置为全页布局：左侧栏即设置菜单，这里只渲染当前分区内容（宽度由 embedded 视图自带） */}
                {view === 'full-settings' && <SettingsView embedded />}
              </div>
            )}
          </section>
        </div>
      </SidebarInset>
      <BuildWorkbenchDrawer />
      <DirtyGuardDialog />
      <ShortcutsDialog />
      <AboutDialog />
      <CommandMenu />
    </SidebarProvider>
  );
}
