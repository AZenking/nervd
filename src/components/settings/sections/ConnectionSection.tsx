import { useEffect, useState } from 'react';
import { RefreshCwIcon, UserCheckIcon } from 'lucide-react';
import * as api from '@/lib/api';
import { useApp } from '@/store/app';
import { useSettingsDraft } from '@/store/settings-draft';
import { errorLog, humanizeError } from '@/lib/error-format';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { SearchableSelect } from '@/components/searchable-select';
import { StatusBadge, connectionStatus } from '@/components/StatusBadge';
import { SettingsGroup, SettingsRow, SettingsRowError } from '../settings-group';

export function ConnectionSection() {
  const {
    settings,
    connection,
    currentUser,
    loadingCurrentUser,
    loadCurrentUser,
    workitemHighlight,
    setWorkitemHighlight,
  } = useApp();
  const draft = useSettingsDraft();
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [testResult, setTestResult] = useState<string | null>(null);

  const loadProjects = async () => {
    try {
      // 若草稿中有未持久化的 PAT 或组织 ID 改动，先刷入保存，确保后端以最新凭据请求接口
      if (draft.pat.trim() || draft.draft?.organizationId !== settings?.organizationId) {
        await draft.flushAutoSave();
      }
      const list = await api.listProjects();
      setProjects(list);
      if (!list.length) useSettingsDraft.getState().setFieldError('space', '未返回项目（检查令牌权限或组织 ID）');
      else useSettingsDraft.getState().setFieldError('space', null);
    } catch (e) {
      errorLog('settings-fetch-projects', e);
      useSettingsDraft.getState().setFieldError('space', `项目拉取失败：${humanizeError(e)}`);
    }
  };

  useEffect(() => {
    if (settings?.hasPat && settings.organizationId) {
      void loadProjects();
    }
  }, [settings?.hasPat, settings?.organizationId]);

  const test = async () => {
    setTestResult('测试中…');
    try {
      const orgs = await api.checkConnection();
      setTestResult(
        orgs.length
          ? `连接正常，可见组织：${orgs.map((o) => o.organizationName).slice(0, 3).join('、')}${orgs.length > 3 ? '…' : ''}`
          : '连接正常，但未返回组织（检查令牌权限）',
      );
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

  return (
    <div className="flex flex-col gap-6">
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
              onBlur={() => {
                if (draft.pat.trim()) void draft.save({ silent: true });
              }}
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
              onBlur={() => void draft.flushAutoSave()}
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
                  draft.update({ defaultSpaceIdentifier: v ?? '' }, true);
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

        {/* 云效连接测试与状态 */}
        <div className="flex flex-col gap-2 border-t border-border/50 bg-muted/15 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2.5">
            <StatusBadge status={connectionStatus(connection)} />
            {testResult ? (
              <span className="truncate text-xs text-muted-foreground">{testResult}</span>
            ) : (
              <span className="text-xs text-muted-foreground">测试当前令牌和组织是否可连通云效</span>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 self-start sm:self-auto"
            onClick={() => void test()}
          >
            测试连接
          </Button>
        </div>
      </SettingsGroup>

      {/* 云效当前用户与需求列表高亮标记设置 */}
      <SettingsGroup
        title="当前用户与需求高亮标记"
        description="基于当前访问令牌自动识别云效用户身份，并在需求列表中高亮处理人（我负责）与关联人（我参与）。"
      >
        {/* 用户身份识别卡片 */}
        <div className="flex flex-col gap-3 p-4 border-b border-border/50 bg-muted/15 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar className="size-10 shrink-0 border border-border/60">
              {currentUser?.avatarUrl && <AvatarImage src={currentUser.avatarUrl} alt={currentUser.name} />}
              <AvatarFallback className="text-sm font-medium bg-primary/10 text-primary">
                {currentUser?.name ? currentUser.name.charAt(0) : <UserCheckIcon className="size-4" />}
              </AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-foreground">
                  {currentUser?.name || (loadingCurrentUser ? '正在识别云效用户…' : settings?.hasPat ? '未识别到用户' : '待配置访问令牌')}
                </span>
                {currentUser && (
                  <Badge variant="secondary" className="h-4.5 px-1.5 text-[10px] font-mono text-muted-foreground">
                    {currentUser.id.slice(0, 8)}…
                  </Badge>
                )}
              </div>
              <span className="truncate text-xs text-muted-foreground">
                {currentUser?.email ? (
                  currentUser.email
                ) : settings?.hasPat ? (
                  '已通过个人访问令牌 (PAT) 认证'
                ) : (
                  '在上方保存个人访问令牌后，将自动识别账号身份并激活高亮规则'
                )}
              </span>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loadingCurrentUser || !settings?.hasPat}
            onClick={() => void loadCurrentUser()}
            className="shrink-0 self-start sm:self-auto gap-1.5"
          >
            <RefreshCwIcon className={cn('size-3.5', loadingCurrentUser && 'animate-spin')} />
            <span>{loadingCurrentUser ? '识别中…' : '重新识别'}</span>
          </Button>
        </div>

        {/* 开关 1：开启需求列表高亮标记 */}
        <SettingsRow
          orientation="horizontal"
          label="开启需求列表高亮标记"
          description="在迭代工作台列表中根据当前用户身份视觉突出显示关联与负责的工作项。"
          htmlFor="highlight-enabled"
          control={(
            <Switch
              id="highlight-enabled"
              checked={workitemHighlight.enabled}
              onCheckedChange={(checked) => setWorkitemHighlight({ enabled: checked })}
            />
          )}
        />

        {/* 开关 2：高亮我负责的需求（处理人） */}
        <SettingsRow
          orientation="horizontal"
          label={(
            <span className="flex items-center gap-2">
              <span>高亮我负责的需求</span>
              <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none bg-primary/10 text-primary border border-primary/20">
                我负责
              </span>
            </span>
          )}
          description="当您为需求处理人（Assignee）时，行首显示紫色标记与「我负责」徽标。"
          htmlFor="highlight-assignee"
          control={(
            <Switch
              id="highlight-assignee"
              disabled={!workitemHighlight.enabled}
              checked={workitemHighlight.highlightAssignee}
              onCheckedChange={(checked) => setWorkitemHighlight({ highlightAssignee: checked })}
            />
          )}
        />

        {/* 开关 3：高亮我参与的需求（关联人 / 参与人） */}
        <SettingsRow
          orientation="horizontal"
          label={(
            <span className="flex items-center gap-2">
              <span>高亮我参与的需求</span>
              <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                我参与
              </span>
            </span>
          )}
          description="当您在需求关联人 / 参与人（Participants）列表中时，行首显示琥珀色标记与「我参与」徽标。"
          htmlFor="highlight-related"
          control={(
            <Switch
              id="highlight-related"
              disabled={!workitemHighlight.enabled}
              checked={workitemHighlight.highlightRelated}
              onCheckedChange={(checked) => setWorkitemHighlight({ highlightRelated: checked })}
            />
          )}
        />

        {/* 输入项：自定义匹配姓名 */}
        <SettingsRow
          orientation="horizontal"
          controlWidth="w-72"
          label="自定义匹配姓名（可选）"
          description="如果工作项中的处理人显示名与云效账号姓名存在差异或使用花名，可在此指定补充匹配姓名。"
          htmlFor="custom-match-name"
          control={(
            <Input
              id="custom-match-name"
              disabled={!workitemHighlight.enabled}
              value={workitemHighlight.customName ?? ''}
              onChange={(e) => setWorkitemHighlight({ customName: e.target.value })}
              placeholder={currentUser?.name ? `默认匹配：${currentUser.name}` : '如：花名 / 别名'}
            />
          )}
        />
      </SettingsGroup>
    </div>
  );
}
