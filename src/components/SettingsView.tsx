import { useEffect } from 'react';
import { useApp } from '../store/app';
import { useSettingsDraft } from '../store/settings-draft';
import { useUi, type SettingsSection } from '../store/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SETTINGS_SECTIONS } from './settings/sections';
import { PageHeader, STICKY_PAGE_HEADER_CLASS } from './page-header';
import { SettingsAutoSaveStatus } from './settings/SettingsAutoSaveStatus';
import {
  ConnectionSection,
  TraceSection,
  BranchRulesSection,
  CiSection,
  SecuritySection,
} from './settings/sections/index';

export { SettingsAutoSaveStatus };

/**
 * 设置视图（所有设置区共享同一份草稿，保存统一走草稿）：
 * - embedded=true：工作区全页设置——左侧栏即设置菜单（AppSidebar），这里按 Linear 设置版式
 *   渲染当前分区（左对齐窄内容列 + 分组行卡 + 行内字段）；
 * - embedded=false：首次配置全屏页（无侧栏），分区导航由页内竖向菜单承担。
 */
export function SettingsView({ embedded = false }: { embedded?: boolean }) {
  const { settings, loadRepos, loadPipelines } = useApp();
  const settingsSection = useUi((state) => state.settingsSection);
  const setSettingsSection = useUi((state) => state.setSettingsSection);

  // 进入设置页：接管草稿会话（有未保存修改则保留，跨入口继续编辑）
  useEffect(() => {
    useSettingsDraft.getState().beginEdit(settings);
  }, [settings]);

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
    security: <SecuritySection />,
  };

  if (embedded) {
    // 工作区设置：分区导航在左侧栏（设置菜单），内容列按 Linear 版式居中展示
    const activeSection =
      SETTINGS_SECTIONS.find((s) => s.value === settingsSection) ?? SETTINGS_SECTIONS[0];
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          actions={<SettingsAutoSaveStatus />}
          title={activeSection.label}
          titleClassName="text-2xl font-semibold tracking-tight text-foreground"
          description={activeSection.description}
          className={STICKY_PAGE_HEADER_CLASS}
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
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-sidebar/70 px-5">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-sm bg-primary shadow-[0_0_0_3px_var(--accent-dim)]" />
          <span className="text-sm font-medium tracking-tight">nervd</span>
          <span className="text-xs text-muted-foreground">初始配置</span>
        </div>
        <SettingsAutoSaveStatus />
      </header>
      <main className="flex min-h-0 flex-1 justify-center overflow-y-auto workspace-scroll px-5 py-8 sm:px-8">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-20">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-medium tracking-tight text-foreground">设置</h1>
            <p className="text-[13px] leading-5 text-muted-foreground">{SETTINGS_SECTIONS[0].description}</p>
          </div>

          <Tabs
            value={settingsSection}
            onValueChange={(value) => setSettingsSection(value as SettingsSection)}
            orientation="vertical"
            className="flex-col gap-6 sm:flex-row sm:gap-8"
          >
            {/* Linear 式竖向菜单：无边框底色，激活项 accent 底 */}
            <TabsList className="h-fit w-full shrink-0 flex-col items-stretch gap-0.5 rounded-none border-0 bg-transparent p-0 sm:w-48">
              {SETTINGS_SECTIONS.map((section) => (
                <TabsTrigger
                  key={section.value}
                  value={section.value}
                  className="h-8 justify-start rounded-md px-2.5 text-[13px] font-medium text-muted-foreground shadow-none data-active:bg-accent data-active:text-foreground"
                >
                  <section.icon />
                  {section.label}
                </TabsTrigger>
              ))}
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
