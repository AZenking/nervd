import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/store/app';
import { useSettingsDraft } from '@/store/settings-draft';
import { Checkbox, Chip, ScrollShadow } from '@heroui/react';
import { Input } from '@/components/ui/input';
import { getCustomDevBranch, setCustomDevBranch } from '@/lib/dev-branch-settings';
import { SettingsGroup, SettingsRow, SettingsRowError } from '../settings-group';

type SettingsDraftState = ReturnType<typeof useSettingsDraft.getState>;

/** 独立通道（如 dev 分支）提交后据主草稿状态落定页头指示，避免误报「已自动保存」 */
function settleAutoSaveStatus() {
  useSettingsDraft.setState((st: SettingsDraftState) => {
    if (st.saving) return {};
    if (st.isDirty()) return { autoSaveStatus: 'unsaved' as const };
    return { autoSaveStatus: 'saved' as const, lastSavedAt: Date.now() };
  });
}

function markUnsaved() {
  useSettingsDraft.setState((st: SettingsDraftState) => (st.saving ? {} : { autoSaveStatus: 'unsaved' as const }));
}

export function TraceSection() {
  const draft = useSettingsDraft();
  const [patternError, setPatternError] = useState<string | null>(null);

  const validatePattern = () => {
    const value = draft.draft?.linkPattern ?? '';
    if (!value.trim()) {
      setPatternError('关联正则不能为空');
      return;
    }
    try {
      new RegExp(value);
      setPatternError(null);
    } catch (e) {
      setPatternError(`正则表达式无效：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <SettingsGroup
      title="关联规则与默认仓库"
      description="仓库从云效组织获取。这里选择需求未单独关联云效仓库时参与扫描的默认仓库。"
    >
      <SettingsRow
        orientation="horizontal"
        controlWidth="w-72"
        label="关联正则"
        description="命中后自动关联对应工作项，如 (?:REQ|BUG|TASK)[-_]?(\d+)。用于从分支名、Commit 记录与 MR 标题中识别需求。"
        htmlFor="pattern"
        error={patternError ? <SettingsRowError>{patternError}</SettingsRowError> : undefined}
        control={(
          <Input
            id="pattern"
            className="font-mono"
            value={draft.draft?.linkPattern ?? ''}
            aria-invalid={Boolean(patternError)}
            aria-describedby={patternError ? 'pattern-error' : undefined}
            onChange={(e) => {
              if (patternError) setPatternError(null);
              draft.update({ linkPattern: e.target.value });
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.nativeEvent.isComposing) return;
            }}
            onBlur={() => {
              validatePattern();
              void draft.flushAutoSave();
            }}
          />
        )}
      />

      <SettingsRow
        orientation="horizontal"
        controlWidth="w-72"
        label="默认集成分支模式"
        description="集成分支视图默认扫描 release/*、integration/*、temp/*、hotfix/* 交付分支，并依据上方关联正则提取需求编号计算双向落差。"
        control={(
          <div className="flex flex-wrap gap-1 font-mono text-xs text-muted-foreground">
            <Chip size="sm" variant="soft">release/*</Chip>
            <Chip size="sm" variant="soft">integration/*</Chip>
            <Chip size="sm" variant="soft">temp/*</Chip>
            <Chip size="sm" variant="soft">hotfix/*</Chip>
          </div>
        )}
      />

      <DevBranchSettingRow />

      <RepoChecklist />
    </SettingsGroup>
  );
}

function DevBranchSettingRow() {
  const [val, setVal] = useState(() => getCustomDevBranch());
  const timerRef = useRef<number | null>(null);
  const pendingRef = useRef<string | null>(null);

  /** 提交 dev 分支到 localStorage（静态配置，非设置草稿字段）；仅提交后落定页头状态。 */
  const commit = (next: string) => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingRef.current = null;
    setCustomDevBranch(next);
    settleAutoSaveStatus();
  };

  useEffect(() => () => {
    // 离开分区时冲刷尚未到期的 800ms 防抖窗口，避免切换设置页丢失输入
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
      if (pendingRef.current != null) {
        setCustomDevBranch(pendingRef.current);
        pendingRef.current = null;
        settleAutoSaveStatus();
      }
    }
  }, []);

  // 窗口失焦时立即冲刷 dev 分支防抖，避免切 App / 关窗前丢失输入
  useEffect(() => {
    const flush = () => {
      if (timerRef.current == null) return;
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
      if (pendingRef.current != null) {
        setCustomDevBranch(pendingRef.current);
        pendingRef.current = null;
        settleAutoSaveStatus();
      }
    };
    window.addEventListener('blur', flush);
    return () => window.removeEventListener('blur', flush);
  }, []);

  return (
    <SettingsRow
      orientation="horizontal"
      controlWidth="w-72"
      label="默认集成主干分支 (dev)"
      description="用于监控各仓库迭代基准分支向主干/测试环境的合入状态。默认比较 dev 分支，若某仓库无 dev 分支则自动回退至模板源分支（如 master）。"
      htmlFor="dev-branch-input"
      control={(
        <Input
          id="dev-branch-input"
          className="font-mono text-xs"
          placeholder="dev"
          value={val}
          onChange={(e) => {
            const next = e.target.value;
            setVal(next);
            pendingRef.current = next;
            markUnsaved();
            if (timerRef.current != null) window.clearTimeout(timerRef.current);
            timerRef.current = window.setTimeout(() => {
              timerRef.current = null;
              commit(next);
            }, 800);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.nativeEvent.isComposing) return;
          }}
          onBlur={() => {
            if (pendingRef.current != null) commit(pendingRef.current);
          }}
        />
      )}
    />
  );
}

/** 默认云效仓库勾选清单（读写设置草稿） */
function RepoChecklist() {
  const [filter, setFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const repositories = useApp((s) => s.repositories);
  const hasPat = useApp((s) => s.settings?.hasPat);
  const watched = useSettingsDraft((s) => s.draft?.watchedRepos ?? []);
  const update = useSettingsDraft((s) => s.update);

  const archivedCount = repositories.filter((r) => r.archived).length;
  // 已勾选的归档仓库仍显示，否则用户无法取消勾选
  const scoped = showArchived
    ? repositories
    : repositories.filter((r) => !r.archived || watched.includes(r.id));
  const keyword = filter.trim().toLowerCase();
  const visibleRepos = keyword
    ? scoped.filter((r) => (r.pathWithNamespace || r.name).toLowerCase().includes(keyword))
    : scoped;

  const toggleRepo = (id: number) => {
    update(
      {
        watchedRepos: watched.includes(id) ? watched.filter((x) => x !== id) : [...watched, id],
      },
      true,
    );
  };

  return (
    <SettingsRow
      label={
        repositories.length ? (
          <span>
            默认云效仓库（已选{' '}
            <span className="font-mono tabular-nums">{watched.length}</span> / 共{' '}
            <span className="font-mono tabular-nums">{scoped.length}</span> 个）
          </span>
        ) : (
          '默认云效仓库'
        )
      }
      description="未单独关联仓库的需求，扫描这些仓库的分支 / commit / MR。"
      htmlFor="repo-filter-input"
      control={(
        <div className="flex flex-col gap-2">
          <Input
            id="repo-filter-input"
            className="h-8 text-xs"
            placeholder="输入名称过滤…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.nativeEvent.isComposing) return;
            }}
          />
          {archivedCount > 0 && (
            <Checkbox
              isSelected={showArchived}
              onChange={(v) => setShowArchived(v)}
              className="cursor-pointer text-xs font-normal text-muted-foreground"
            >
              <Checkbox.Content>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                显示已归档（{archivedCount}）
              </Checkbox.Content>
            </Checkbox>
          )}
          <ScrollShadow className="h-48 rounded-md border border-border/60 bg-background/50 overflow-y-auto overscroll-contain">
            <div className="flex flex-col gap-0.5 p-1.5">
              {visibleRepos.map((r) => (
                <Checkbox
                  key={r.id}
                  isSelected={watched.includes(r.id)}
                  onChange={() => toggleRepo(r.id)}
                  className="cursor-pointer rounded-md px-2 py-1.5 font-normal text-foreground hover:bg-surface-secondary"
                >
                  <Checkbox.Content>
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                    <span className="font-mono text-xs truncate" title={r.pathWithNamespace || r.name}>{r.pathWithNamespace || r.name}</span>
                  </Checkbox.Content>
                </Checkbox>
              ))}
              {!visibleRepos.length && (
                <div className="p-2 text-sm text-muted-foreground">
                  {repositories.length
                    ? '无匹配仓库'
                    : hasPat
                      ? '仓库加载中…'
                      : '先保存令牌后自动加载'}
                </div>
              )}
            </div>
          </ScrollShadow>
        </div>
      )}
    />
  );
}