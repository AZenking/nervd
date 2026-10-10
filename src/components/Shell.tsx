import { useCallback, useEffect, useState } from 'react';
import { useSettingsDraft } from '../store/settings-draft';
import { useUi, type WorkspaceView } from '../store/ui';
import { AppSidebar } from './nav/app-sidebar';
import { AppBreadcrumb } from './nav/app-breadcrumb';
import { IterationView } from './iteration/IterationView';
import { RequirementDetails } from './iteration/RequirementDetails';
import { LogViewer } from './LogViewer';
import { OverviewView } from './OverviewView';
import { SettingsView } from './SettingsView';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

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

  // ⌘← / Ctrl+← 后退（输入框内保留光标移动语义）；⌘K / Ctrl+K 全局搜索
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useUi.getState().focusGlobalSearch();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowLeft') {
        const el = e.target as HTMLElement | null;
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
        if (!useUi.getState().history.length) return;
        e.preventDefault();
        useUi.getState().back();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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
      <SidebarInset className="h-svh overflow-hidden">
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

            <div className="workspace-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-14 pt-5 sm:px-8 lg:px-10">
              {view === 'iteration' && <IterationView />}
              {view === 'requirement' && <RequirementDetails />}
              {view === 'overview' && <OverviewView />}
              {/* 设置为全页布局：左侧栏即设置菜单，这里只渲染当前分区内容（宽度由 embedded 视图自带） */}
              {view === 'full-settings' && <SettingsView embedded />}
            </div>
          </section>
        </div>
      </SidebarInset>
      <LogViewer />
      <DirtyGuardDialog />
    </SidebarProvider>
  );
}
