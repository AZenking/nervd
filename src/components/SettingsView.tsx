import { useEffect, useState } from 'react';
import { ArrowRightIcon, MonitorIcon, MoonIcon, SparklesIcon, SunIcon } from 'lucide-react';
import { useApp } from '../store/app';
import { useSettingsDraft } from '../store/settings-draft';
import { useUi, type SettingsSection } from '../store/ui';
import { Alert, Button, Card } from '@heroui/react';
import { SETTINGS_SECTIONS } from './settings/sections';
import { PageHeader } from './page-header';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SettingsAutoSaveStatus } from './settings/SettingsAutoSaveStatus';
import { Stepper } from './ui/stepper';
import { OrgRow, PatRow, SpaceRow } from './settings/sections/connection-fields';
import {
  ConnectionSection,
  TraceSection,
  BranchRulesSection,
  CiSection,
  AiSection,
  SecuritySection,
  AboutSection,
} from './settings/sections/index';

/** 首启就绪向导的三步元数据（就绪状态在渲染时按 settings 计算） */
const ONBOARDING_STEPS = [
  { key: 'pat', label: '个人访问令牌', description: '云效 → 个人设置 → 个人访问令牌' },
  { key: 'organization', label: '组织 ID', description: '组织页地址中的一段' },
  { key: 'space', label: '默认项目空间', description: '工作项列表数据来源（可选）' },
] as const;

export { SettingsAutoSaveStatus };

/**
 * 设置视图（所有设置区共享同一份草稿，保存统一走草稿）：
 * - embedded=true：工作区全页设置——左侧栏即设置菜单（AppSidebar），这里按 Linear 设置版式
 *   渲染当前分区（左对齐窄内容列 + 分组行卡 + 行内字段）；
 * - embedded=false：首次配置全屏页（无侧栏）——三步就绪向导（Stepper）承载令牌 / 组织 / 项目空间
 *   输入（上一步 / 下一步步进），不再渲染分区表单。
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
  const theme = useUi((state) => state.theme);
  const resolvedTheme = useUi((state) => state.resolvedTheme);
  const toggleTheme = useUi((state) => state.toggleTheme);
  const [wizardStep, setWizardStep] = useState(0);

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
    // 工作区设置：页头与主页（总览）保持一致——sticky 全宽单行 + 统一 h1（26px）标题 + 右上角自动保存状态；
    // 分区导航在左侧栏（设置菜单），分区功能说明下沉正文首行，内容列仍按 Linear 版式居中展示
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          sticky
          contentClassName="w-full"
          navigation={<SidebarTrigger aria-label="折叠/展开侧栏" />}
          title={activeSection.label}
          actions={<SettingsAutoSaveStatus />}
        />
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-20">
          {/* 分区功能说明（自页头下移正文首行，随内容滚动；HeroUI Alert default 呈现） */}
          <Alert status="default" className="gap-2.5 rounded-md px-2.5 py-2 shadow-none">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description className="text-xs leading-5 text-muted-foreground">
                {activeSection.description}
              </Alert.Description>
            </Alert.Content>
          </Alert>
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
          <span className="size-2 rounded-sm bg-primary ring-3 ring-(--accent-dim)" />
          <span className="text-sm font-medium tracking-tight">nervd</span>
          <span className="text-xs text-muted-foreground">初始配置</span>
        </div>
        <div className="flex items-center gap-2">
          <SettingsAutoSaveStatus />
          <Button
            type="button"
            isIconOnly
            variant="ghost"
            size="sm"
            className="size-7 cursor-pointer text-muted-foreground hover:text-foreground"
            onPress={(e) => toggleTheme({ clientX: e.x, clientY: e.y })}
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
              variant="primary"
              size="sm"
              isDisabled={!canEnterWorkbench}
              onPress={onComplete}
              className="h-7 cursor-pointer gap-1.5 px-3 text-xs"
              aria-label={!canEnterWorkbench ? '请先配置云效访问令牌与组织 ID' : '进入 nervd 桌面工作台'}
            >
              <span>进入工作台</span>
              <ArrowRightIcon className="size-3" />
            </Button>
          )}
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-4 sm:p-6">
        {/* 最外层 Card：填充页头以下整个区域（透明底 + 细边框）；向导内容在卡内垂直居中，
            小窗口下内容超高时卡内自行滚动 */}
        <Card className="flex min-h-0 flex-1 flex-col rounded-lg border border-border/60 bg-transparent p-6">
          <ScrollArea className="m-auto flex max-h-full w-full max-w-3xl flex-col gap-6">
            <div className="flex items-center gap-2">
              <SparklesIcon className="size-4 text-primary" />
              <span className="text-sm font-medium text-foreground">欢迎使用 nervd 桌面工作台</span>
            </div>

            <Stepper
              current={wizardStep}
              // 到达即高亮：done 由 Stepper 按到达位置推导（当前步之前的节点点亮 ✓ 与连线）
              steps={[...ONBOARDING_STEPS]}
            />

            {/* 当前步骤内容（纵向整宽字段；min-h 避免步进时高度跳动；切换时 content-fade 淡入上浮，reduced-motion 降级） */}
            <div
              key={wizardStep}
              className="min-h-36 animate-content-fade motion-reduce:animate-none"
            >
              {wizardStep === 0 && <PatRow orientation="vertical" />}
              {wizardStep === 1 && <OrgRow orientation="vertical" />}
              {wizardStep === 2 && <SpaceRow orientation="vertical" />}
            </div>

            {/* 向导脚部：上一步 ｜ 步数指示 ｜ 下一步 / 进入工作台 */}
            <div className="flex items-center justify-between border-t border-border/40 pt-4">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                isDisabled={wizardStep === 0}
                onPress={() => setWizardStep((s) => Math.max(0, s - 1))}
                className="cursor-pointer"
              >
                上一步
              </Button>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                第 {wizardStep + 1} / {ONBOARDING_STEPS.length} 步
              </span>
              {wizardStep < ONBOARDING_STEPS.length - 1 ? (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onPress={() => setWizardStep((s) => Math.min(ONBOARDING_STEPS.length - 1, s + 1))}
                  className="cursor-pointer"
                >
                  下一步
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  isDisabled={!canEnterWorkbench}
                  onPress={onComplete}
                  className="cursor-pointer gap-1.5"
                  aria-label={!canEnterWorkbench ? '请先配置云效访问令牌与组织 ID' : '进入 nervd 桌面工作台'}
                >
                  <span>进入工作台</span>
                  <ArrowRightIcon className="size-3.5" />
                </Button>
              )}
            </div>
          </ScrollArea>
        </Card>
      </main>
    </div>
  );
}
