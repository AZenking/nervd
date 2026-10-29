import { useEffect } from 'react';
import { ArrowRightIcon, CheckCircle2Icon, MonitorIcon, MoonIcon, SparklesIcon, SunIcon } from 'lucide-react';
import { useApp } from '../store/app';
import { useSettingsDraft } from '../store/settings-draft';
import { useUi, type SettingsSection } from '../store/ui';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SETTINGS_SECTIONS, getSectionErrorCount } from './settings/sections';
import { PageHeader } from './page-header';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { SettingsAutoSaveStatus } from './settings/SettingsAutoSaveStatus';
import { cn } from '@/lib/utils';
import {
  ConnectionSection,
  TraceSection,
  BranchRulesSection,
  CiSection,
  AiSection,
  SecuritySection,
  AboutSection,
} from './settings/sections/index';

export { SettingsAutoSaveStatus };

/**
 * 设置视图（所有设置区共享同一份草稿，保存统一走草稿）：
 * - embedded=true：工作区全页设置——左侧栏即设置菜单（AppSidebar），这里按 Linear 设置版式
 *   渲染当前分区（左对齐窄内容列 + 分组行卡 + 行内字段）；
 * - embedded=false：首次配置全屏页（无侧栏），分区导航由页内竖向菜单承担。
 */
export function SettingsView({
  embedded = false,
  onComplete,
}: {
  embedded?: boolean;
  onComplete?: () => void;
}) {
  const { settings, loadSettings, loadRepos, loadPipelines } = useApp();
  const settingsSection = useUi((state) => state.settingsSection);
  const setSettingsSection = useUi((state) => state.setSettingsSection);
  const theme = useUi((state) => state.theme);
  const resolvedTheme = useUi((state) => state.resolvedTheme);
  const toggleTheme = useUi((state) => state.toggleTheme);
  const fieldErrors = useSettingsDraft((state) => state.fieldErrors);

  // 挂载时拉取最新已保存凭据状态（例如 Keychain 中的 Token 状态）
  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  // 进入设置页：接管草稿会话（有未保存修改则保留，跨入口继续编辑）
  useEffect(() => {
    useSettingsDraft.getState().beginEdit(settings);
  }, [settings]);

  // 窗口失焦（切到其他 App）或窗口即将关闭时，若草稿存在有效未保存修改，立即静默冲刷持久化
  useEffect(() => {
    const handleBlurOrUnload = () => {
      const draft = useSettingsDraft.getState();
      if (draft.isDirty() && !draft.hasBlockingErrors()) {
        void draft.flushAutoSave();
      }
    };
    window.addEventListener('blur', handleBlurOrUnload);
    window.addEventListener('beforeunload', handleBlurOrUnload);
    return () => {
      window.removeEventListener('blur', handleBlurOrUnload);
      window.removeEventListener('beforeunload', handleBlurOrUnload);
    };
  }, []);

  // 已配置令牌时自动拉取仓库 / 流水线，下拉与勾选直接可用
  useEffect(() => {
    if (settings?.hasPat && settings.organizationId) {
      void loadRepos();
      void loadPipelines();
    }
  }, [settings?.hasPat, settings?.organizationId, loadRepos, loadPipelines]);

  // 分区内容映射表
  const sectionContent: Record<SettingsSection, React.ReactNode> = {
    connection: <ConnectionSection />,
    trace: (
      <div className="flex flex-col gap-6">
        <TraceSection />
        <BranchRulesSection />
      </div>
    ),
    ci: <CiSection />,
    ai: <AiSection />,
    security: <SecuritySection />,
    about: <AboutSection />,
  };

  const activeSection =
    SETTINGS_SECTIONS.find((s) => s.value === settingsSection) ?? SETTINGS_SECTIONS[0];
  const canEnterWorkbench = Boolean(settings?.hasPat && settings?.organizationId);

  if (embedded) {
    // 工作区设置：分区导航在左侧栏（设置菜单），内容列按 Linear 版式居中展示
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          sticky
          navigation={<SidebarTrigger aria-label="折叠/展开侧栏" />}
          actions={<SettingsAutoSaveStatus />}
          title={activeSection.label}
          titleClassName="text-2xl font-semibold tracking-tight text-foreground"
          description={activeSection.description}
        />
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-20">
          {sectionContent[settingsSection]}
        </div>
      </div>
    );
  }

  // 首次配置全屏页
  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header
        data-tauri-drag-region
        className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-sidebar/70 pl-20 pr-4 sm:pl-24 sm:pr-6 select-none"
      >
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-sm bg-primary shadow-[0_0_0_3px_var(--accent-dim)]" />
          <span className="text-sm font-medium tracking-tight">nervd</span>
          <span className="text-xs text-muted-foreground">初始配置</span>
        </div>
        <div className="flex items-center gap-2">
          <SettingsAutoSaveStatus />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 cursor-pointer text-muted-foreground hover:text-foreground"
            onClick={(e) => toggleTheme({ clientX: e.clientX, clientY: e.clientY })}
            title={
              theme === 'system'
                ? `主题：跟随系统（当前${resolvedTheme === 'dark' ? '深色' : '浅色'}）· 点击切换`
                : theme === 'dark'
                ? '主题：深色模式 · 点击切换'
                : '主题：浅色模式 · 点击切换'
            }
            aria-label={
              theme === 'system'
                ? `主题：跟随系统（当前${resolvedTheme === 'dark' ? '深色' : '浅色'}）`
                : theme === 'dark'
                ? '主题：深色模式'
                : '主题：浅色模式'
            }
          >
            {theme === 'system' ? (
              <MonitorIcon className="size-3.5" />
            ) : theme === 'dark' ? (
              <MoonIcon className="size-3.5" />
            ) : (
              <SunIcon className="size-3.5" />
            )}
          </Button>
          {onComplete && (
            <Button
              type="button"
              size="sm"
              disabled={!canEnterWorkbench}
              onClick={onComplete}
              className="h-7 cursor-pointer gap-1.5 px-3 text-xs shadow-xs"
              title={!canEnterWorkbench ? '请先配置云效访问令牌与组织 ID' : '进入 nervd 桌面工作台'}
            >
              <span>进入工作台</span>
              <ArrowRightIcon className="size-3" />
            </Button>
          )}
        </div>
      </header>
      <main className="flex min-h-0 flex-1 justify-center overflow-y-auto workspace-scroll px-5 py-8 sm:px-8">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-20">
          {/* 首次配置就绪检查卡片（云效连接分区顶部展示引导） */}
          {settingsSection === 'connection' && (
            <div className="rounded-lg border border-border/60 bg-muted/20 p-4 transition-all">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <SparklesIcon className="size-4 text-primary" />
                    <span className="text-sm font-medium text-foreground">欢迎使用 nervd 桌面工作台</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    完成以下 3 项基础连接凭据配置，即可开启「需求 → 分支 → Commit → CI」全生命周期追溯。
                  </p>
                </div>
                {onComplete && (
                  <Button
                    type="button"
                    size="sm"
                    disabled={!canEnterWorkbench}
                    onClick={onComplete}
                    className="h-8 shrink-0 cursor-pointer gap-1.5 self-start text-xs shadow-xs sm:self-auto"
                    title={!canEnterWorkbench ? '请先配置访问令牌与组织 ID' : '立即进入工作台'}
                  >
                    <span>进入工作台</span>
                    <ArrowRightIcon className="size-3.5" />
                  </Button>
                )}
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 border-t border-border/40 pt-3 text-xs sm:grid-cols-3">
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'size-1.5 rounded-full',
                      settings?.hasPat ? 'bg-emerald-500' : 'bg-muted-foreground/40',
                    )}
                  />
                  <span className={settings?.hasPat ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                    1. 个人访问令牌 {settings?.hasPat ? '✓' : '(待填)'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'size-1.5 rounded-full',
                      settings?.organizationId ? 'bg-emerald-500' : 'bg-muted-foreground/40',
                    )}
                  />
                  <span className={settings?.organizationId ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                    2. 组织 ID {settings?.organizationId ? '✓' : '(待填)'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'size-1.5 rounded-full',
                      settings?.defaultSpaceIdentifier ? 'bg-emerald-500' : 'bg-muted-foreground/40',
                    )}
                  />
                  <span
                    className={
                      settings?.defaultSpaceIdentifier ? 'font-medium text-foreground' : 'text-muted-foreground'
                    }
                  >
                    3. 项目空间 {settings?.defaultSpaceIdentifier ? '✓' : '(可选)'}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-medium tracking-tight text-foreground">{activeSection.label}</h1>
              {canEnterWorkbench && (
                <div className="hidden sm:flex items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2Icon className="size-3.5" />
                  <span>核心配置已就绪</span>
                </div>
              )}
            </div>
            <p className="text-[13px] leading-5 text-muted-foreground">{activeSection.description}</p>
          </div>

          <Tabs
            value={settingsSection}
            onValueChange={(value) => setSettingsSection(value as SettingsSection)}
            orientation="vertical"
            className="flex-col gap-6 sm:flex-row sm:gap-8"
          >
            {/* Linear 式竖向菜单：无边框底色，激活项 accent 底 */}
            <TabsList variant="ghost" className="h-fit w-full shrink-0 flex-col items-stretch gap-0.5 rounded-none border-0 p-0 sm:w-48">
              {SETTINGS_SECTIONS.map((section) => {
                const errorCount = getSectionErrorCount(section.value, fieldErrors);
                return (
                  <TabsTrigger
                    key={section.value}
                    value={section.value}
                    className="h-8 justify-between rounded-md px-2.5 text-[13px] font-medium text-muted-foreground shadow-none data-active:bg-accent data-active:text-foreground"
                  >
                    <span className="flex items-center gap-2">
                      <section.icon />
                      {section.label}
                    </span>
                    {errorCount > 0 && (
                      <span
                        className="size-1.5 rounded-full bg-destructive shrink-0"
                        title={`${section.label}有待修正项`}
                      />
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            <div className="flex min-w-0 flex-1 flex-col gap-6">
              {SETTINGS_SECTIONS.map((section) => (
                <TabsContent key={section.value} value={section.value}>
                  {sectionContent[section.value]}
                </TabsContent>
              ))}
            </div>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
