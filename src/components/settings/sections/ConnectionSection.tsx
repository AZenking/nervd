import { useState } from 'react';
import { RefreshCwIcon, UserCheckIcon } from 'lucide-react';
import * as api from '@/lib/api';
import { useApp } from '@/store/app';
import { useSettingsDraft } from '@/store/settings-draft';
import { errorLog, humanizeError } from '@/lib/error-format';
import { cn } from '@/lib/utils';
import { Avatar, Button, Chip, Input } from '@heroui/react';
import { Switch } from '@/components/ui/switch';
import { StatusBadge, connectionStatus } from '@/components/StatusBadge';
import { SettingsGroup, SettingsRow } from '../settings-group';
import { OrgRow, PatRow, SpaceRow } from './connection-fields';

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
  const [testResult, setTestResult] = useState<string | null>(null);

  const test = async () => {
    setTestResult('测试中…');
    try {
      // 若草稿中有未持久化的改动，先刷入保存，确保后端以最新凭据测试连接
      if (draft.isDirty()) {
        await draft.flushAutoSave();
      }
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

  return (
    <div className="flex flex-col gap-6">
      <SettingsGroup
        title="令牌与组织"
        description="令牌与组织信息，用于访问云效 DevOps API。"
      >
        <PatRow />

        <OrgRow />

        <SpaceRow />

        {/* 云效连接测试与状态 */}
        <div className="flex flex-col gap-2 border-t border-border/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
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
            variant="secondary"
            size="sm"
            className="shrink-0 self-start sm:self-auto"
            onPress={() => void test()}
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
        <div className="flex flex-col gap-3 p-4 border-b border-border/50 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar size="md" className="border border-border/60 shrink-0">
              {currentUser?.avatarUrl && <Avatar.Image src={currentUser.avatarUrl} alt={currentUser.name} />}
              <Avatar.Fallback className="text-sm font-medium bg-primary/10 text-primary">
                {currentUser?.name ? currentUser.name.charAt(0) : <UserCheckIcon className="size-4" />}
              </Avatar.Fallback>
            </Avatar>
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-foreground">
                  {currentUser?.name || (loadingCurrentUser ? '正在识别云效用户…' : settings?.hasPat ? '未识别到用户' : '待配置访问令牌')}
                </span>
                {currentUser && (
                  <Chip size="sm" variant="secondary" className="h-4.5 px-1.5 text-[10px] font-mono text-muted-foreground">
                    {currentUser.id.slice(0, 8)}…
                  </Chip>
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
            variant="secondary"
            size="sm"
            isDisabled={loadingCurrentUser || !settings?.hasPat}
            onPress={() => void loadCurrentUser()}
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
              aria-label="开启需求列表高亮标记"
              size="md"
              isSelected={workitemHighlight.enabled}
              onChange={(checked) => setWorkitemHighlight({ enabled: checked })}
            />
          )}
        />

        {/* 开关 2：高亮我负责的需求（处理人） */}
        <SettingsRow
          orientation="horizontal"
          label={(
            <span className="flex items-center gap-2">
              <span>高亮我负责的需求</span>
              <Chip
                size="sm"
                variant="soft"
                color="accent"
                className="h-5 shrink-0 px-2 text-[10.5px] font-medium border border-primary/30 bg-primary/15 text-primary rounded-sm select-none"
              >
                我负责
              </Chip>
            </span>
          )}
          description="当您为需求处理人（Assignee）时，行首显示紫色标记与「我负责」徽标。"
          htmlFor="highlight-assignee"
          control={(
            <Switch
              id="highlight-assignee"
              aria-label="高亮我负责的需求"
              size="md"
              isDisabled={!workitemHighlight.enabled}
              isSelected={workitemHighlight.highlightAssignee}
              onChange={(checked) => setWorkitemHighlight({ highlightAssignee: checked })}
            />
          )}
        />

        {/* 开关 3：高亮我参与的需求（关联人 / 参与人） */}
        <SettingsRow
          orientation="horizontal"
          label={(
            <span className="flex items-center gap-2">
              <span>高亮我参与的需求</span>
              <Chip
                size="sm"
                variant="soft"
                color="warning"
                className="h-5 shrink-0 px-2 text-[10.5px] font-medium border border-warning/30 bg-warning/15 text-warning rounded-sm select-none"
              >
                我参与
              </Chip>
            </span>
          )}
          description="当您在需求关联人 / 参与人（Participants）列表中时，行首显示琥珀色标记与「我参与」徽标。"
          htmlFor="highlight-related"
          control={(
            <Switch
              id="highlight-related"
              aria-label="高亮我参与的需求"
              size="md"
              isDisabled={!workitemHighlight.enabled}
              isSelected={workitemHighlight.highlightRelated}
              onChange={(checked) => setWorkitemHighlight({ highlightRelated: checked })}
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
