import { useCallback, useEffect, useRef, useState } from 'react';
import { useSettingsDraft } from '../store/settings-draft';
import { useUi, type WorkspaceView } from '../store/ui';
import { AppSidebar } from './nav/app-sidebar';
import { AppBreadcrumb } from './nav/app-breadcrumb';
import { IterationView } from './iteration/IterationView';
import { RequirementDetails } from './iteration/RequirementDetails';
import { IntegrationView } from './integration/IntegrationView';
import { LogViewer } from './LogViewer';
import { OverviewView } from './OverviewView';
import { SettingsView } from './SettingsView';
import { CommandMenu } from './command-menu';
import { ShortcutsDialog } from './shortcuts-dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

/** g 前缀序列的等待窗口（Linear g+letter：g 后 1200ms 内的下一键才生效） */
const G_SEQUENCE_TIMEOUT_MS = 1200;

/** Base UI 弹层（AlertDialog.Popup 是 role="alertdialog"，Dialog.Popup 是 role="dialog"）都在 DOM 里即视为有浮层 */
const OPEN_DIALOG_SELECTOR = '[role="dialog"], [role="alertdialog"]';

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
    else ui.setView(dest as WorkspaceView);
  }, [setPendingView]);

  return (
    <AlertDialog open={pendingView != null} onOpenChange={(open) => { if (!open) setPendingView(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>设置有未保存的修改</AlertDialogTitle>
          <AlertDialogDescription>
            离开设置页前，可选择保存修改、放弃修改，或留在当前页面继续编辑。
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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const ui = useUi.getState();
      const el = e.target as HTMLElement | null;

      // ① ⌘/Ctrl 组合键：保持原有行为（⌘K 面板 / ⌘← 后退）；任何组合键都不触发下方单键序列
      if (e.metaKey || e.ctrlKey) {
        resetGSequence();
        if (e.key.toLowerCase() === 'k') {
          e.preventDefault();
          // 快捷键面板开着时先收起，避免两个浮层叠开
          if (ui.shortcutsOpen) ui.setShortcutsOpen(false);
          ui.toggleCommandMenu();
          return;
        }
        if (e.key === 'ArrowLeft') {
          // 输入控件内保留光标移动语义
          if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
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

      // ② 浮层打开（命令面板 / 快捷键面板 / 任意 Base UI 弹层）或焦点在输入控件：
      //    全局单键一律让路（Esc 由 Base UI 自行关闭浮层），并复位 g 序列
      if (ui.commandOpen || ui.shortcutsOpen || document.querySelector(OPEN_DIALOG_SELECTOR)) {
        resetGSequence();
        return;
      }
      if (isEditableTarget(el) || el?.tagName === 'SELECT') {
        resetGSequence();
        return;
      }

      // ③ g 前缀序列跳转（g i 迭代 / g o 总览 / g s 设置）：第二键未命中也照常复位
      const awaitingG = gTimerRef.current != null;
      resetGSequence();
      if (awaitingG) {
        if (e.key === 'i') return void ui.setView('iteration');
        if (e.key === 'o') return void ui.setView('overview');
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

      // ⑤ Esc 后退：仅 requirement / full-settings 有层级可退（iteration/overview 即根视图）
      if (e.key === 'Escape') {
        if (ui.view === 'requirement' || ui.view === 'full-settings') ui.back();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      resetGSequence();
    };
  }, [resetGSequence]);

  // 后退恢复工作区滚动位置（应用一次后清空，避免前向导航被旧值干扰）
  useEffect(() => {
    if (restoreScroll == null) return;
    const el = document.querySelector<HTMLElement>('.workspace-scroll');
    if (el) el.scrollTop = restoreScroll;
    useUi.setState({ restoreScroll: null });
  }, [restoreScroll, view]);

  return (
    <SidebarProvider>
      <AppSidebar />
      {/* Linear 浮动主卡：inset 变体自带 m-2 圆角（ui/sidebar.tsx），这里只管裁切 */}
      <SidebarInset className="overflow-hidden">
        <div className="flex h-full min-h-0">
          <section className="flex min-w-0 flex-1 flex-col">
            {/* 迭代/需求详情：面包屑已上移进页头（PageHeader breadcrumb 槽），顶栏不再重复 */}
            {(view === 'overview' || view === 'full-settings') && (
              <div className="workspace-topbar px-5 pt-2 sm:px-8">
                <div className="flex min-h-12 w-full items-center gap-3 px-1">
                  <AppBreadcrumb />
                </div>
              </div>
            )}

            {/* 只读横幅：在内容网格之上，不挤占三栏布局 */}

            {/* 顶部留白不放在滚动容器上（由各视图 / 吸顶页头自带 pt-5）：
                吸顶 PageHeader 的 top-0 才能严格贴住可视顶部，否则吸顶后顶部会露出一条 padding 缝隙 */}
            <div className="workspace-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-14 sm:px-8 lg:px-10">
              {view === 'iteration' && <IterationView />}
              {view === 'requirement' && <RequirementDetails />}
              {view === 'integration' && <IntegrationView />}
              {view === 'overview' && <OverviewView />}
              {/* 设置为全页布局：左侧栏即设置菜单，这里只渲染当前分区内容（宽度由 embedded 视图自带） */}
              {view === 'full-settings' && <SettingsView embedded />}
            </div>
          </section>
        </div>
      </SidebarInset>
      <LogViewer />
      <DirtyGuardDialog />
      <ShortcutsDialog />
      <CommandMenu />
    </SidebarProvider>
  );
}
