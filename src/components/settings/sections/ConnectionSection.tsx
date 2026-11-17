import { useState } from 'react';
import { RefreshCwIcon, UserCheckIcon } from 'lucide-react';
import * as api from '@/lib/api';
import { useApp } from '@/store/app';
import { useSettingsDraft } from '@/store/settings-draft';
import { errorLog, humanizeError } from '@/lib/error-format';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { StatusBadge, connectionStatus } from '@/components/StatusBadge';
import { SettingsGroup } from '../settings-group';
import { OrgRow, PatRow, SpaceRow } from './connection-fields';

/**
 * 设置 → 云效连接（工作区）。
 *
 * 当前账号身份、令牌 / 组织 / 默认项目空间与连接测试。需求列表高亮与姓名匹配
 * 属于个人偏好，已迁至「外观与交互」；这里不再重复。
 */
export function ConnectionSection() {
  const {
    settings,
    connection,
    currentUser,
    loadingCurrentUser,
    loadCurrentUser,
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
        title="当前账号"
        description="基于已保存的访问令牌自动识别云效用户身份。"
      >
        <div className="flex flex-col gap-3 border-b border-border/50 p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar size="md" className="border border-border/60 shrink-0">
              {currentUser?.avatarUrl && <AvatarImage src={currentUser.avatarUrl} alt={currentUser.name} />}
              <AvatarFallback>
                {currentUser?.name ? currentUser.name.charAt(0) : <UserCheckIcon className="size-4" />}
              </AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-foreground" title={currentUser?.name}>
                  {currentUser?.name || (loadingCurrentUser ? '正在识别云效用户…' : settings?.hasPat ? '未识别到用户' : '待配置访问令牌')}
                </span>
                {currentUser && (
                  <Chip size="sm" variant="secondary" className="font-mono text-muted-foreground">
                    {currentUser.id.slice(0, 8)}…
                  </Chip>
                )}
              </div>
              <span className="truncate text-xs text-muted-foreground" title={currentUser?.email}>
                {currentUser?.email ? (
                  currentUser.email
                ) : settings?.hasPat ? (
                  '已通过个人访问令牌 (PAT) 认证'
                ) : (
                  '在下方保存个人访问令牌后，将自动识别账号身份'
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
      </SettingsGroup>

      <SettingsGroup
        title="令牌与组织"
        description="令牌与组织信息仅保存在本机，用于访问云效 DevOps API。"
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
    </div>
  );
}