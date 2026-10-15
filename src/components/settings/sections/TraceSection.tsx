import { useApp } from '@/store/app';
import { useSettingsDraft } from '@/store/settings-draft';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
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

      <RepoChecklist />
    </SettingsGroup>
  );
}

/** 默认云效仓库勾选清单（读写设置草稿） */
function RepoChecklist() {
  const repositories = useApp((s) => s.repositories);
  const hasPat = useApp((s) => s.settings?.hasPat);
  const watched = useSettingsDraft((s) => s.draft?.watchedRepos ?? []);
  const update = useSettingsDraft((s) => s.update);

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
      label={`默认云效仓库${repositories.length ? `（${repositories.length} 个）` : ''}`}
      description="未单独关联仓库的需求，扫描这些仓库的分支 / commit / MR。"
      control={(
        <ScrollArea className="h-48 rounded-md border border-border/60 bg-background/50">
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
