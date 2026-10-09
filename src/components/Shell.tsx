import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useApp } from '../store/app';
import { useUi } from '../store/ui';
import { AppSidebar } from './nav/app-sidebar';
import { EnvironmentPolicySettings } from './iteration/EnvironmentPolicySettings';
import { IterationView } from './iteration/IterationView';
import { RequirementDetails } from './iteration/RequirementDetails';
import { LogViewer } from './LogViewer';
import { OverviewView } from './OverviewView';
import { SettingsView } from './SettingsView';
import { TracePane } from './TracePane';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';

/** 追溯链路（真实数据）以 v0 基准的浮层形式打开 */
function TraceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-[min(560px,92vw)] max-w-none overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>追溯链路</DialogTitle>
          <DialogDescription>工作项到仓库 / CI 的实时追溯</DialogDescription>
        </DialogHeader>
        <div className="max-h-[85vh] overflow-y-auto bg-sidebar">
          <TracePane />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function Shell() {
  const { view, iterationKey } = useUi();
  const { items, selectedId } = useApp();
  const [traceOpen, setTraceOpen] = useState(false);
  const selectedItem = items.find((i) => i.workitemId === selectedId);

  const crumbRoot = view === 'settings' || view === 'full-settings' ? '工作区' : '迭代';
  const crumbLeaf = view === 'settings'
    ? '环境与策略'
    : view === 'full-settings'
      ? '工作区设置'
      : view === 'requirement'
        ? selectedItem?.identifier ?? '详情'
        : view === 'overview'
          ? '总览'
          : iterationKey;

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="h-svh overflow-hidden">
        <div className="flex h-full min-h-0">
          <section className="flex min-w-0 flex-1 flex-col">
            <div className="px-5 pt-4 sm:px-8">
              <div className="flex h-11 w-full items-center gap-3 px-1">
                <SidebarTrigger className="-ml-1" aria-label="展开导航" />
                <Separator orientation="vertical" className="data-vertical:h-4 data-vertical:self-auto" />
                <div className="flex min-w-0 items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{crumbRoot}</span>
                  <ChevronRight size={14} className="shrink-0 text-muted-foreground/60" />
                  <span className="truncate font-medium text-foreground">{crumbLeaf}</span>
                </div>
                {(view === 'requirement') && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto"
                    onClick={() => setTraceOpen(true)}
                  >
                    打开追溯链路
                  </Button>
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-10 pt-4 sm:px-8">
              {view === 'iteration' && <IterationView />}
              {view === 'requirement' && <RequirementDetails />}
              {view === 'settings' && <EnvironmentPolicySettings />}
              {view === 'overview' && <OverviewView />}
              {view === 'full-settings' && (
                <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 py-2">
                  <SettingsView embedded />
                </div>
              )}
            </div>
          </section>
        </div>
      </SidebarInset>
      <TraceDialog open={traceOpen} onOpenChange={setTraceOpen} />
      <LogViewer />
    </SidebarProvider>
  );
}
