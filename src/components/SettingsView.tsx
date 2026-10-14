import { useEffect, useState } from 'react';
import * as api from '../lib/api';
import { useApp } from '../store/app';
import { useSettingsDraft } from '../store/settings-draft';
import { useUi, type SettingsSection } from '../store/ui';
import { errorLog, humanizeError } from '../lib/error-format';
import { RefreshCwIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SearchableSelect } from './searchable-select';
import { StatusBadge, connectionStatus } from './StatusBadge';
import { JenkinsInstancesCard, RepoCiBindingsCard, SettingsSaveBar } from './settings/CiIntegrationCards';
import { SETTINGS_SECTIONS } from './settings/sections';
import { SettingsGroup, SettingsRow, SettingsRowError } from './settings/settings-group';

/**
 * 设置视图（所有设置区共享同一份草稿，保存统一走草稿）：
 * - embedded=true：工作区全页设置——左侧栏即设置菜单（AppSidebar），这里按 Linear 设置版式
 *   渲染当前分区（左对齐窄内容列 + 分组行卡 + 行内字段）；
 * - embedded=false：首次配置全屏页（无侧栏），分区导航由页内竖向菜单承担。
 */
export function SettingsView({ embedded = false }: { embedded?: boolean }) {
  const { settings, connection, loadRepos, loadPipelines } = useApp();
  const draft = useSettingsDraft();
  const settingsSection = useUi((state) => state.settingsSection);
  const setSettingsSection = useUi((state) => state.setSettingsSection);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [testResult, setTestResult] = useState<string | null>(null);

  // 进入设置页：接管草稿会话（有未保存修改则保留，跨入口继续编辑）
  useEffect(() => {
    useSettingsDraft.getState().beginEdit(settings);
  }, [settings]);

  const loadProjects = async () => {
    try {
      const list = await api.listProjects();
      setProjects(list);
      if (!list.length) useSettingsDraft.getState().setFieldError('space', '未返回项目（检查令牌权限或组织 ID）');
      else useSettingsDraft.getState().setFieldError('space', null);
    } catch (e) {
      errorLog('settings-fetch-projects', e);
      useSettingsDraft.getState().setFieldError('space', `项目拉取失败：${humanizeError(e)}`);
    }
  };

  // 已配置令牌时自动拉取项目 / 仓库 / 流水线，下拉与勾选直接可用
  useEffect(() => {
    if (settings?.hasPat && settings.organizationId) {
      void loadProjects();
      void loadRepos();
      void loadPipelines();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.hasPat, settings?.organizationId]);

  const test = async () => {
    setTestResult('测试中…');
    try {
      const orgs = await api.checkConnection();
      setTestResult(orgs.length
        ? `连接正常，可见组织：${orgs.map((o) => o.organizationName).slice(0, 3).join('、')}${orgs.length > 3 ? '…' : ''}`
        : '连接正常，但未返回组织（检查令牌权限）');
    } catch (e) {
      errorLog('settings-test-connection', e);
      setTestResult(`连接失败：${humanizeError(e, '无法连接云效，请检查令牌与组织 ID')}`);
    }
  };

  const spaceError = draft.fieldErrors.space;
  const projectItems = [
    {
      label: projects.length ? '— 选择项目 —' : settings?.hasPat ? '项目加载中…，可点击右侧刷新' : '先保存令牌后自动加载',
      value: null as string | null,
    },
    ...projects.map((p) => ({ label: p.name, value: p.id as string | null })),
  ];

  // 分区内容：左侧菜单 / 页内菜单选中哪项，右侧就渲染哪份
  const sectionContent: Record<SettingsSection, React.ReactNode> = {
    connection: (
      <SettingsGroup
        title="令牌与组织"
        description="令牌与组织信息，用于访问云效 DevOps API。"
      >
        <SettingsRow
          orientation="horizontal"
          controlWidth="w-72"
          label={(
            <span className="flex items-center gap-1.5">
              个人访问令牌
              {settings?.hasPat && <Badge variant="secondary">已保存</Badge>}
            </span>
          )}
          description="令牌仅保存在本机，留空表示保持现有令牌不变。"
          htmlFor="pat"
          control={(
            <Input
              id="pat"
              type="password"
              className="font-mono"
              value={draft.pat}
              onChange={(e) => draft.setPat(e.target.value)}
              placeholder={settings?.hasPat ? '已保存（留空则不修改）' : 'agp_…'}
            />
          )}
        />

        <SettingsRow
          orientation="horizontal"
          controlWidth="w-72"
          label="组织 ID"
          description="浏览器地址 devops.aliyun.com/organization/<组织 ID> 中的一段。"
          htmlFor="org"
          control={(
            <Input
              id="org"
              className="font-mono"
              value={draft.draft?.organizationId ?? ''}
              onChange={(e) => draft.update({ organizationId: e.target.value })}
              placeholder="60de7a68…"
            />
          )}
        />

        {/* UX A4：校验错误内联到字段，不再走底部文案条 */}
        <SettingsRow
          orientation="horizontal"
          controlWidth="w-72"
          label="默认项目空间"
          description="工作项列表从此项目空间读取。"
          htmlFor="space"
          error={spaceError ? <SettingsRowError>{spaceError}</SettingsRowError> : undefined}
          control={(
            <div className="flex gap-2">
              <SearchableSelect
                id="space"
                className="min-w-0 flex-1 font-mono"
                value={draft.draft?.defaultSpaceIdentifier || null}
                onValueChange={(v) => {
                  draft.setFieldError('space', null);
                  draft.update({ defaultSpaceIdentifier: v ?? '' });
                }}
                items={projectItems}
              />
              <Button
                variant="outline"
                size="icon"
                aria-label="重新拉取项目列表"
                onClick={() => void loadProjects()}
              >
                <RefreshCwIcon />
              </Button>
            </div>
          )}
        />
      </SettingsGroup>
    ),
    trace: (
      <SettingsGroup
        title="追溯与云效仓库"
        description="仓库从云效组织获取。这里选择需求未单独关联云效仓库时参与扫描的默认仓库。"
      >
        <SettingsRow
          orientation="horizontal"
          controlWidth="w-72"
          label="关联正则"
          description="命中后自动关联对应工作项，如 (?:REQ|BUG|TASK)[-_]?(\d+)。"
          htmlFor="pattern"
          control={(
            <Input
              id="pattern"
              className="font-mono"
              value={draft.draft?.linkPattern ?? ''}
              onChange={(e) => draft.update({ linkPattern: e.target.value })}
            />
          )}
        />

        <RepoChecklist />
      </SettingsGroup>
    ),
    // CI 集成与其他设置区共用同一份草稿
    ci: (
      <div className="flex flex-col gap-6">
        <JenkinsInstancesCard />
        <RepoCiBindingsCard />
      </div>
    ),
    security: (
      <SettingsGroup
        title="安全"
        description="写操作会对云效上的真实资源生效，请谨慎开启。"
      >
        <SettingsRow
          orientation="horizontal"
          label="允许写操作"
          description="建分支 / MR / 合并 / 触发流水线 —— 需写权限令牌"
          htmlFor="allow-write-ops"
          control={(
            <Switch
              id="allow-write-ops"
              checked={draft.draft?.allowWriteOps ?? false}
              onCheckedChange={(v) => draft.update({ allowWriteOps: v })}
            />
          )}
        />
      </SettingsGroup>
    ),
  };

  const saveBar = (
    <SettingsSaveBar>
      <Button variant="outline" onClick={() => void test()}>
        测试连接
      </Button>
      {/* 连接状态统一徽章（已连接 / 连接失败 / 连接中） */}
      <StatusBadge status={connectionStatus(connection)} />
      {testResult && (
        <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
          {testResult}
        </p>
      )}
    </SettingsSaveBar>
  );

  if (embedded) {
    // 工作区设置：分区导航在左侧栏（设置菜单），内容列按 Linear 版式在卡内居中
    const activeSection = SETTINGS_SECTIONS.find((s) => s.value === settingsSection) ?? SETTINGS_SECTIONS[0];
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 pb-20 pt-8">
        {/* Linear 设置页头：仅 24px medium 标题（指引由各组描述携带，页头不放副标题） */}
        <h1 className="text-2xl font-medium tracking-tight text-foreground">{activeSection.label}</h1>
        {sectionContent[settingsSection]}
        {saveBar}
      </div>
    );
  }

  // 首次配置全屏页
  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-sidebar/70 px-5">
        <span className="size-2 rounded-sm bg-primary shadow-[0_0_0_3px_var(--accent-dim)]" />
        <span className="text-sm font-medium tracking-tight">nervd</span>
        <span className="text-xs text-muted-foreground">初始配置</span>
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

          {saveBar}
        </div>
      </main>
    </div>
  );
}

/** 默认云效仓库勾选清单（读写设置草稿） */
function RepoChecklist() {
  const repositories = useApp((s) => s.repositories);
  const hasPat = useApp((s) => s.settings?.hasPat);
  const watched = useSettingsDraft((s) => s.draft?.watchedRepos ?? []);
  const update = useSettingsDraft((s) => s.update);

  const toggleRepo = (id: number) => {
    update({
      watchedRepos: watched.includes(id) ? watched.filter((x) => x !== id) : [...watched, id],
    });
  };

  return (
    <SettingsRow
      label={`默认云效仓库${repositories.length ? `（${repositories.length} 个）` : ''}`}
      description="未单独关联仓库的需求，扫描这些仓库的分支 / commit / MR。"
      control={(
        <ScrollArea className="h-48 rounded-md border border-border bg-background">
          <div className="flex flex-col gap-0.5 p-1.5">
            {repositories.map((r) => (
              <Label
                key={r.id}
                className="cursor-pointer rounded-md px-2 py-1.5 font-normal text-foreground hover:bg-muted"
              >
                <Checkbox
                  checked={watched.includes(r.id)}
                  onCheckedChange={() => toggleRepo(r.id)}
                />
                <span className="font-mono text-xs">{r.pathWithNamespace || r.name}</span>
              </Label>
            ))}
            {!repositories.length && (
              <div className="p-2 text-sm text-muted-foreground">
                {hasPat ? '仓库加载中…' : '先保存令牌后自动加载'}
              </div>
            )}
          </div>
        </ScrollArea>
      )}
    />
  );
}
