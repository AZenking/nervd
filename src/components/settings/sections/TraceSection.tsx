import { useState } from 'react';
import { useApp } from '@/store/app';
import { useSettingsDraft } from '@/store/settings-draft';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getCustomDevBranch, setCustomDevBranch } from '@/lib/dev-branch-settings';
import { SettingsGroup, SettingsRow } from '../settings-group';

export function TraceSection() {
  const draft = useSettingsDraft();

  return (
    <SettingsGroup
      title="追溯与云效仓库"
      description="仓库从云效组织获取。这里选择需求未单独关联云效仓库时参与扫描的默认仓库。"
    >
      <SettingsRow
        orientation="horizontal"
        controlWidth="w-72"
        label="关联正则"
        description="命中后自动关联对应工作项，如 (?:REQ|BUG|TASK)[-_]?(\d+)。用于从分支名、Commit 记录与 MR 标题中识别需求。"
        htmlFor="pattern"
        control={(
          <Input
            id="pattern"
            className="font-mono"
            value={draft.draft?.linkPattern ?? ''}
            onChange={(e) => draft.update({ linkPattern: e.target.value })}
            onBlur={() => void draft.flushAutoSave()}
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
            <span className="rounded bg-muted/70 px-1.5 py-0.5">release/*</span>
            <span className="rounded bg-muted/70 px-1.5 py-0.5">integration/*</span>
            <span className="rounded bg-muted/70 px-1.5 py-0.5">temp/*</span>
            <span className="rounded bg-muted/70 px-1.5 py-0.5">hotfix/*</span>
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
            setCustomDevBranch(next);
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
      label={`默认云效仓库${
        repositories.length ? `（已选 ${watched.length} / 共 ${scoped.length} 个）` : ''
      }`}
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
          />
          {archivedCount > 0 && (
            <Label className="cursor-pointer text-xs font-normal text-muted-foreground">
              <Checkbox
                checked={showArchived}
                onCheckedChange={(v) => setShowArchived(v === true)}
              />
              显示已归档（{archivedCount}）
            </Label>
          )}
          <ScrollArea className="h-48 rounded-md border border-border/60 bg-background/50">
            <div className="flex flex-col gap-0.5 p-1.5">
              {visibleRepos.map((r) => (
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
          </ScrollArea>
        </div>
      )}
    />
  );
}
