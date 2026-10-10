import { useEffect, useState } from 'react';
import * as api from '../lib/api';
import { useApp } from '../store/app';
import { useSettingsDraft } from '../store/settings-draft';
import { useUi, type SettingsSection } from '../store/ui';
import { errorLog, humanizeError } from '../lib/error-format';
import { RefreshCwIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SearchableSelect } from './searchable-select';
import { PageHeader } from './page-header';
import { StatusBadge, connectionStatus } from './StatusBadge';
import { JenkinsInstancesCard, RepoCiBindingsCard, SettingsSaveBar } from './settings/CiIntegrationCards';
import { SETTINGS_SECTIONS } from './settings/sections';

/**
 * 设置视图（所有设置区共享同一份草稿，保存统一走草稿）：
 * - embedded=true：工作区全页设置——左侧栏即设置菜单（AppSidebar），这里只渲染当前分区内容 + 保存栏；
 * - embedded=false：首次配置全屏页（无侧栏），分区导航由页内竖向 Tabs 承担。
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

  // 分区内容：左侧菜单 / 页内 Tabs 选中哪项，右侧就渲染哪份
  const sectionContent: Record<SettingsSection, React.ReactNode> = {
    connection: (
      <Card>
        <CardHeader>
          {/* D5：分区名已由页头给出，卡片标题只说明本卡内容，避免与页头重复 */}
          <CardTitle>令牌与组织</CardTitle>
          <CardDescription>令牌与组织信息，用于访问云效 DevOps API。</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="pat" className="gap-1.5">
                个人访问令牌
                {settings?.hasPat && <Badge variant="secondary">已保存</Badge>}
              </FieldLabel>
              <Input
                id="pat"
                type="password"
                className="font-mono"
                value={draft.pat}
                onChange={(e) => draft.setPat(e.target.value)}
                placeholder={settings?.hasPat ? '已保存（留空则不修改）' : 'agp_…'}
              />
              <FieldDescription>令牌仅保存在本机，留空表示保持现有令牌不变。</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="org">组织 ID</FieldLabel>
              <Input
                id="org"
                className="font-mono"
                value={draft.draft?.organizationId ?? ''}
                onChange={(e) => draft.update({ organizationId: e.target.value })}
                placeholder="60de7a68…"
              />
              <FieldDescription>浏览器地址 devops.aliyun.com/organization/&lt;组织 ID&gt; 中的一段。</FieldDescription>
            </Field>

            {/* UX A4：校验错误内联到字段（data-invalid + FieldError），不再走底部文案条 */}
            <Field data-invalid={spaceError ? true : undefined}>
              <FieldLabel htmlFor="space">默认项目空间</FieldLabel>
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
              {spaceError
                ? <FieldError>{spaceError}</FieldError>
                : <FieldDescription>工作项列表从此项目空间读取。</FieldDescription>}
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
    ),
    trace: (
      <Card>
        <CardHeader>
          <CardTitle>追溯与云效仓库</CardTitle>
          <CardDescription>
            仓库从云效组织获取。这里选择需求未单独关联云效仓库时参与扫描的默认仓库。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="pattern">关联正则</FieldLabel>
              <Input
                id="pattern"
                className="font-mono"
                value={draft.draft?.linkPattern ?? ''}
                onChange={(e) => draft.update({ linkPattern: e.target.value })}
              />
              <FieldDescription>命中后自动关联对应工作项，如 (?:REQ|BUG|TASK)[-_]?(\d+)。</FieldDescription>
            </Field>

            <RepoChecklist />
          </FieldGroup>
        </CardContent>
      </Card>
    ),
    // CI 集成与其他设置区共用同一份草稿
    ci: (
      <div className="flex flex-col gap-5">
        <JenkinsInstancesCard />
        <RepoCiBindingsCard />
      </div>
    ),
    security: (
      <Card>
        <CardHeader>
          <CardTitle>安全</CardTitle>
          <CardDescription>写操作会对云效上的真实资源生效，请谨慎开启。</CardDescription>
        </CardHeader>
        <CardContent>
          <Field orientation="horizontal">
            <Switch
              id="allow-write-ops"
              checked={draft.draft?.allowWriteOps ?? false}
              onCheckedChange={(v) => draft.update({ allowWriteOps: v })}
            />
            <div className="flex flex-col gap-1">
              <FieldLabel htmlFor="allow-write-ops">允许写操作</FieldLabel>
              <FieldDescription>建分支 / MR / 合并 / 触发流水线 —— 需写权限令牌</FieldDescription>
            </div>
          </Field>
        </CardContent>
      </Card>
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
    // 工作区设置：分区导航在左侧栏（设置菜单），这里按当前分区渲染内容
    const activeSection = SETTINGS_SECTIONS.find((s) => s.value === settingsSection) ?? SETTINGS_SECTIONS[0];
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 pb-16">
        <PageHeader
          eyebrow="Settings"
          title={activeSection.label}
          description={activeSection.description}
          className="border-b border-border pb-4"
        />
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
        <span className="text-sm font-semibold tracking-tight">nervd</span>
        <span className="text-xs text-muted-foreground">初始配置</span>
      </header>
      <main className="flex min-h-0 flex-1 justify-center overflow-y-auto workspace-scroll px-5 py-8 sm:px-8">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-20">
          <PageHeader
            eyebrow="Workspace settings"
            title="设置"
            description={SETTINGS_SECTIONS[0].description}
            className="border-b border-border pb-4"
          />

          <Tabs
            value={settingsSection}
            onValueChange={(value) => setSettingsSection(value as SettingsSection)}
            orientation="vertical"
            className="flex-col gap-4 sm:flex-row sm:gap-5"
          >
            <TabsList variant="line" className="h-fit w-full shrink-0 items-stretch justify-stretch rounded-lg border border-border bg-card p-2 sm:w-52">
              {SETTINGS_SECTIONS.map((section) => (
                <TabsTrigger
                  key={section.value}
                  value={section.value}
                  className="h-auto justify-start rounded-md px-3 py-2.5"
                >
                  <section.icon />
                  {section.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <div className="flex min-w-0 flex-1 flex-col gap-5">
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
    <Field>
      <FieldLabel>默认云效仓库{repositories.length ? `（${repositories.length} 个）` : ''}</FieldLabel>
      <ScrollArea className="h-45 rounded-md border border-border bg-background">
        <div className="flex flex-col gap-1 p-1.5">
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
    </Field>
  );
}
