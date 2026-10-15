import { useEffect, useState } from 'react';
import { RefreshCwIcon } from 'lucide-react';
import * as api from '@/lib/api';
import { useApp } from '@/store/app';
import { useSettingsDraft } from '@/store/settings-draft';
import { errorLog, humanizeError } from '@/lib/error-format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/searchable-select';
import { StatusBadge, connectionStatus } from '@/components/StatusBadge';
import { SettingsGroup, SettingsRow, SettingsRowError } from '../settings-group';

export function ConnectionSection() {
  const { settings, connection } = useApp();
  const draft = useSettingsDraft();
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [testResult, setTestResult] = useState<string | null>(null);

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
  );
}
