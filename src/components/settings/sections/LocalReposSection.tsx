import { useEffect, useMemo, useState } from 'react';
import { FolderOpenIcon, GitBranchIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { ListBox } from '@/components/ui/list-box';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { EmptyHint } from '@/components/empty-hint';
import { SearchableSelect, type SearchableSelectOption } from '@/components/searchable-select';
import { useApp } from '@/store/app';
import { useAttribution } from '@/store/attribution';
import { useUi } from '@/store/ui';
import * as attributionApi from '@/lib/attribution-api';
import { humanizeError } from '@/lib/error-format';
import { compactFsPath } from '@/lib/utils';
import { SettingsGroup, SettingsRow } from '../settings-group';
import type { HookMode, LocalRepoInfo } from '@/types/attribution';

const HOOK_MODE_LABELS: Record<HookMode, string> = {
  fill: '自动补全',
  enforce: '强制校验',
  off: '关闭',
};

const HOOK_MODE_OPTIONS: Array<{ value: HookMode; label: string }> = [
  { value: 'fill', label: 'fill（自动补全）' },
  { value: 'enforce', label: 'enforce（强制校验）' },
  { value: 'off', label: 'off（关闭）' },
];

interface InspectState {
  loading: boolean;
  info?: LocalRepoInfo;
  error?: string;
}

function HookModeSelect({
  repoId,
  value,
  onChange,
  disabled,
}: {
  repoId: number;
  value: HookMode;
  onChange: (mode: HookMode) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      aria-label={`仓库 ${repoId} 钩子模式`}
      className="w-40"
      selectedKey={value}
      isDisabled={disabled}
      onSelectionChange={(key) => {
        if (key != null) onChange(String(key) as HookMode);
      }}
    >
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {HOOK_MODE_OPTIONS.map((option) => (
            <ListBox.Item key={option.value} id={option.value} textValue={option.label}>
              {option.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

/**
 * 设置 → 仓库与分支 → 本地仓库（从「变更归属」迁出）。
 *
 * 绑定本机 Git 目录并管理 commit-msg 钩子；只读写 attribution store 的本地绑定通道，
 * 与远程同步 / 回写策略分离，避免整块设置集中在同一页面。
 */
export function LocalReposSection() {
  const bindings = useAttribution((state) => state.bindings);
  const loadBindings = useAttribution((state) => state.loadBindings);
  const saveBinding = useAttribution((state) => state.saveBinding);
  const installHook = useAttribution((state) => state.installHook);
  const uninstallHook = useAttribution((state) => state.uninstallHook);

  const settings = useApp((state) => state.settings);
  const repositories = useApp((state) => state.repositories);
  const loadRepos = useApp((state) => state.loadRepos);

  const [bindingsError, setBindingsError] = useState(false);
  const [inspectByRepo, setInspectByRepo] = useState<Record<number, InspectState>>({});
  const [hookModes, setHookModes] = useState<Record<number, HookMode>>({});
  const [hookBusyRepo, setHookBusyRepo] = useState<number | null>(null);
  // 独立绑定入口：不依赖「默认扫描仓库」，从云效全量仓库里选一个再选本地目录
  const [newRepoId, setNewRepoId] = useState<number | null>(null);
  const [bindingNew, setBindingNew] = useState(false);

  // 本地绑定：初次静默读取，失败以行内提示兜底。
  useEffect(() => {
    let cancelled = false;
    void loadBindings({ silent: true }).then((result) => {
      if (!cancelled) setBindingsError(result === null);
    });
    return () => {
      cancelled = true;
    };
  }, [loadBindings]);

  // 仓库列表来自云效组织；未加载时补一次，失败不阻塞表单。
  useEffect(() => {
    if (!repositories.length && settings?.hasPat) void loadRepos();
  }, [loadRepos, repositories.length, settings?.hasPat]);

  // 已绑定路径的 Git 真实状态（分支 / 脏工作区）；逐仓并行探测，失败只落行内。
  useEffect(() => {
    const bound = bindings.filter((binding) => binding.path?.trim());
    if (!bound.length) {
      setInspectByRepo({});
      return;
    }
    let cancelled = false;
    setInspectByRepo((previous) => {
      const next: Record<number, InspectState> = { ...previous };
      for (const binding of bound) next[binding.repoId] = { loading: true };
      return next;
    });

    for (const binding of bound) {
      attributionApi
        .inspectLocalRepo({ path: binding.path })
        .then((info) => {
          if (cancelled) return;
          setInspectByRepo((previous) => ({
            ...previous,
            [binding.repoId]: { loading: false, info },
          }));
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setInspectByRepo((previous) => ({
            ...previous,
            [binding.repoId]: {
              loading: false,
              error: humanizeError(err, '无法读取 Git 状态'),
            },
          }));
        });
    }

    return () => {
      cancelled = true;
    };
  }, [bindings]);

  const repoIds = useMemo(() => {
    const ids = new Set<number>(settings?.watchedRepos ?? []);
    for (const binding of bindings) ids.add(binding.repoId);
    return [...ids].sort((a, b) => a - b);
  }, [bindings, settings?.watchedRepos]);

  const bindingByRepo = useMemo(
    () => new Map(bindings.map((binding) => [binding.repoId, binding])),
    [bindings],
  );

  // 全量云效仓库选项：未绑定的排前面，方便直接挑选新目录
  const repoOptions = useMemo<SearchableSelectOption<number>[]>(() => {
    const boundIds = new Set(bindings.map((binding) => binding.repoId));
    return [...repositories]
      .sort((left, right) => {
        const leftBound = boundIds.has(left.id) ? 1 : 0;
        const rightBound = boundIds.has(right.id) ? 1 : 0;
        if (leftBound !== rightBound) return leftBound - rightBound;
        return (left.pathWithNamespace || left.name).localeCompare(
          right.pathWithNamespace || right.name,
          'zh-CN',
        );
      })
      .map((repo) => ({
        label: `${repo.pathWithNamespace || repo.name}${boundIds.has(repo.id) ? ' · 已绑定' : ''}`,
        value: repo.id,
      }));
  }, [bindings, repositories]);

  const repoLabel = (repoId: number) => {
    const repo = repositories.find((item) => item.id === repoId);
    return repo?.pathWithNamespace || repo?.name || `#${repoId}`;
  };

  const pickDirectory = async (repoId: number) => {
    try {
      const path = await attributionApi.pickRepoDirectory();
      if (!path) return false;
      const saved = await saveBinding(repoId, path);
      if (saved) await loadBindings({ silent: true });
      return Boolean(saved);
    } catch (err) {
      useApp.getState().setToast({
        kind: 'fail',
        text: `选择本地仓库目录失败：${humanizeError(err, '请重试')}`,
      });
      return false;
    }
  };

  // 独立入口的绑定流程：先选仓库，再选目录；成功后该仓库会出现在下方列表
  const bindNewRepo = async () => {
    if (newRepoId == null) return;
    setBindingNew(true);
    try {
      const saved = await pickDirectory(newRepoId);
      if (saved) setNewRepoId(null);
    } finally {
      setBindingNew(false);
    }
  };

  const toggleHook = async (repoId: number, action: 'install' | 'uninstall') => {
    const binding = bindingByRepo.get(repoId);
    const mode = hookModes[repoId] ?? binding?.hookMode ?? 'fill';
    setHookBusyRepo(repoId);
    try {
      if (action === 'install') await installHook(repoId, mode);
      else await uninstallHook(repoId);
    } finally {
      setHookBusyRepo(null);
    }
  };

  const renderInspect = (repoId: number) => {
    const binding = bindingByRepo.get(repoId);
    if (!binding) {
      return (
        <span className="text-[11px] text-muted-foreground">
          未绑定本地目录：无法实时感知未推送提交。
        </span>
      );
    }
    const inspect = inspectByRepo[repoId];
    if (inspect?.loading) {
      return (
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Spinner className="size-3" />
          探测 Git 状态…
        </span>
      );
    }
    if (inspect?.error) {
      return <span className="text-[11px] text-destructive">{inspect.error}</span>;
    }
    if (!inspect?.info) {
      return <span className="text-[11px] text-muted-foreground">等待 Git 状态…</span>;
    }
    if (!inspect.info.isGit) {
      return <span className="text-[11px] text-destructive">该目录不是 Git 仓库</span>;
    }
    return (
      <span className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span className="font-mono text-foreground/80">
          {inspect.info.currentBranch || 'detached HEAD'}
        </span>
        {inspect.info.headSha && (
          <span className="font-mono text-muted-foreground/80">
            {inspect.info.headSha.slice(0, 7)}
          </span>
        )}
        <Chip
          size="sm"
          variant="soft"
          color={inspect.info.dirty ? 'warning' : 'success'}
        >
          {inspect.info.dirty ? '工作区有未提交修改' : '工作区干净'}
        </Chip>
      </span>
    );
  };

  return (
    <SettingsGroup
      title="本地仓库与 Hook"
      description="绑定本地 Git 目录后，nervd 通过 commit-msg 钩子实时捕获尚未推送的提交；远程轮询仍是兜底，因此未绑定也不影响归属主流程。"
    >
      <SettingsRow
        orientation="horizontal"
        controlWidth="w-80"
        label="绑定新的本地仓库"
        description="从云效仓库中选一个，再指定它在本机的 Git 目录；不要求先加入「仓库与分支」中的默认扫描仓库，绑定成功后仓库会出现在下方列表。"
        control={(
          <div className="flex w-full flex-col gap-2">
            {/* 选择仓库 → 选目录绑定：同一行内两个 32px 控件（HeroUI 字段 + 主按钮），
                不再上下堆两块等宽「输入框样」的控件，避免按钮被误读成表单字段。 */}
            <div className="flex w-full items-center gap-2">
              <SearchableSelect
                ariaLabel="选择要绑定的云效仓库"
                items={repoOptions}
                value={newRepoId}
                onValueChange={(value) =>
                  setNewRepoId(typeof value === 'number' ? value : null)
                }
                placeholder={repositories.length ? '选择云效仓库…' : '暂无可选仓库'}
                searchPlaceholder="搜索仓库名或路径…"
                emptyText="没有匹配的仓库"
                disabled={bindingNew || repositories.length === 0}
                className="min-w-0 flex-1"
              />
              <Button
                type="button"
                size="default"
                className="shrink-0"
                disabled={bindingNew}
                onClick={() => {
                  if (newRepoId == null) {
                    useApp.getState().setToast({
                      kind: 'info',
                      text: '请先选择要绑定的云效仓库',
                    });
                    return;
                  }
                  void bindNewRepo();
                }}
              >
                {bindingNew ? (
                  <Spinner className="size-3.5" />
                ) : (
                  <FolderOpenIcon className="size-3.5" />
                )}
                {bindingNew ? '绑定中…' : '选择目录并绑定'}
              </Button>
            </div>
            {repositories.length === 0 && (
              <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                <span>仓库列表为空，请先保存访问令牌并加载仓库。</span>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => useUi.getState().openSettings('connection')}
                >
                  前往云效连接
                </Button>
              </div>
            )}
          </div>
        )}
      />

      {bindingsError && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 px-4 py-3 text-xs">
          <span className="text-destructive">本地仓库绑定读取失败。</span>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => {
              void loadBindings().then((result) => setBindingsError(result === null));
            }}
          >
            重新读取
          </Button>
        </div>
      )}

      {repoIds.length === 0 ? (
        <EmptyHint
          compact
          title="尚未绑定本地仓库"
          description="还没有默认扫描仓库，也没有已绑定仓库。用上方「绑定新的本地仓库」选择目录后，这里会显示每个仓库的 Git 状态与钩子开关。"
        />
      ) : (
        repoIds.map((repoId) => {
          const binding = bindingByRepo.get(repoId);
          const label = repoLabel(repoId);
          const hookMode = hookModes[repoId] ?? binding?.hookMode ?? 'fill';
          const hookInstalled = binding?.hookInstalled ?? false;
          const hookBusy = hookBusyRepo === repoId;

          return (
            <div
              key={repoId}
              className="flex flex-col gap-2.5 border-b border-border/50 px-4 py-3.5 last:border-b-0"
            >
              <div className="flex flex-wrap items-center gap-2">
                <GitBranchIcon className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 truncate font-mono text-xs font-medium" title={label}>
                  {label}
                </span>
                <Chip
                  size="sm"
                  variant="soft"
                  color={binding ? 'accent' : 'default'}
                >
                  {binding ? '已绑定' : '未绑定'}
                </Chip>
                {binding && (
                  <span
                    className="min-w-0 truncate font-mono text-[11px] text-muted-foreground"
                    title={binding.path}
                  >
                    {compactFsPath(binding.path)}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="default"
                  variant="outline"
                  onClick={() => void pickDirectory(repoId)}
                >
                  <FolderOpenIcon className="size-3.5" />
                  {binding ? '重新选择目录' : '选择目录'}
                </Button>

                {binding ? (
                  <>
                    <HookModeSelect
                      repoId={repoId}
                      value={hookMode}
                      disabled={hookBusy}
                      onChange={(mode) => setHookModes((prev) => ({ ...prev, [repoId]: mode }))}
                    />
                    <Button
                      type="button"
                      size="default"
                      variant="secondary"
                      disabled={hookBusy}
                      onClick={() => void toggleHook(repoId, 'install')}
                    >
                      {hookBusy ? <Spinner className="size-3.5" /> : null}
                      {hookInstalled ? '更新钩子' : '安装钩子'}
                    </Button>
                    {hookInstalled && (
                      <Button
                        type="button"
                        size="default"
                        variant="ghost"
                        disabled={hookBusy}
                        onClick={() => void toggleHook(repoId, 'uninstall')}
                      >
                        卸载钩子
                      </Button>
                    )}
                    <Chip
                      size="sm"
                      variant="soft"
                      color={hookInstalled ? 'success' : 'default'}
                    >
                      {hookInstalled
                        ? `commit-msg 已安装 · ${HOOK_MODE_LABELS[hookMode]}`
                        : 'commit-msg 未安装'}
                    </Chip>
                  </>
                ) : (
                  <span className="text-[11px] text-muted-foreground">
                    绑定目录后可安装 commit-msg 钩子。
                  </span>
                )}
              </div>

              <div className="min-h-4">{renderInspect(repoId)}</div>
            </div>
          );
        })
      )}
    </SettingsGroup>
  );
}