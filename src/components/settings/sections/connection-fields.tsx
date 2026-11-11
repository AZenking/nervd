import { useEffect, useState } from 'react';
import { RefreshCwIcon } from 'lucide-react';
import * as api from '@/lib/api';
import { useApp } from '@/store/app';
import { useSettingsDraft } from '@/store/settings-draft';
import { errorLog, humanizeError } from '@/lib/error-format';
import { Button, Chip, Input } from '@heroui/react';
import { SearchableSelect } from '@/components/searchable-select';
import { SettingsRow, SettingsRowError } from '../settings-group';

/**
 * 云效连接凭据三件套（个人访问令牌 / 组织 ID / 默认项目空间）：
 * 从 ConnectionSection 抽出共享，供设置分区行布局与首启引导向导（纵向整宽）两种形态复用。
 */

/** 项目选项 hook：PAT + 组织就绪自动加载；手动重载前先冲刷未持久化草稿，确保以最新凭据请求 */
export function useProjectOptions() {
  const settings = useApp((s) => s.settings);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  const loadProjects = async () => {
    const draft = useSettingsDraft.getState();
    try {
      const orgChanged = Boolean(
        draft.draft && draft.baseline && draft.draft.organizationId !== draft.baseline.organizationId,
      );
      if (draft.pat.trim() || orgChanged) {
        await draft.flushAutoSave();
      }
      const list = await api.listProjects();
      setProjects(list);
      if (!list.length) draft.setFieldError('space', '未返回项目（检查令牌权限或组织 ID）');
      else draft.setFieldError('space', null);
    } catch (e) {
      errorLog('settings-fetch-projects', e);
      draft.setFieldError('space', `项目拉取失败：${humanizeError(e)}`);
    }
  };

  useEffect(() => {
    if (settings?.hasPat && settings.organizationId) {
      void loadProjects();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.hasPat, settings?.organizationId]);

  const projectItems = [
    {
      label: projects.length
        ? '— 选择项目 —'
        : settings?.hasPat
          ? '项目加载中…，可点击右侧刷新'
          : '先保存令牌后自动加载',
      value: null as string | null,
    },
    ...projects.map((p) => ({ label: p.name, value: p.id as string | null })),
  ];

  return { projectItems, loadProjects };
}

/** 个人访问令牌行（留空表示保持现有令牌；失焦即静默保存入 Keychain） */
export function PatRow({ orientation = 'horizontal' }: { orientation?: 'vertical' | 'horizontal' }) {
  const settings = useApp((s) => s.settings);
  const draft = useSettingsDraft();
  return (
    <SettingsRow
      orientation={orientation}
      controlWidth="w-72"
      label={(
        <span className="flex items-center gap-1.5">
          个人访问令牌
          {settings?.hasPat && <Chip size="sm" variant="secondary">已保存</Chip>}
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
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.nativeEvent.isComposing) return;
          }}
          onBlur={() => {
            if (draft.pat.trim()) void draft.save({ silent: true });
          }}
          placeholder={settings?.hasPat ? '已保存（留空则不修改）' : 'agp_…'}
        />
      )}
    />
  );
}

/** 组织 ID 行（云效组织页地址中的一段） */
export function OrgRow({ orientation = 'horizontal' }: { orientation?: 'vertical' | 'horizontal' }) {
  const draft = useSettingsDraft();
  return (
    <SettingsRow
      orientation={orientation}
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
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.nativeEvent.isComposing) return;
          }}
          onBlur={() => void draft.flushAutoSave()}
          placeholder="60de7a68…"
        />
      )}
    />
  );
}

/** 默认项目空间行（可选项：SearchableSelect + 手动重载；内联空间错误） */
export function SpaceRow({ orientation = 'horizontal' }: { orientation?: 'vertical' | 'horizontal' }) {
  const draft = useSettingsDraft();
  const { projectItems, loadProjects } = useProjectOptions();
  const spaceError = draft.fieldErrors.space;
  return (
    <SettingsRow
      orientation={orientation}
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
            isIconOnly
            variant="secondary"
            size="sm"
            aria-label="重新拉取项目列表"
            onPress={() => void loadProjects()}
          >
            <RefreshCwIcon className="size-3.5" />
          </Button>
        </div>
      )}
    />
  );
}
