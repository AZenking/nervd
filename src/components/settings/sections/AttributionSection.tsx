import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CopyIcon,
  FolderOpenIcon,
  GitBranchIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  TerminalIcon,
} from 'lucide-react';
import { Alert, Chip, ListBox, Select } from '@heroui/react';
import { Input } from '@/components/ui/input';
import { useApp } from '@/store/app';
import { useAttribution } from '@/store/attribution';
import { useSettingsDraft } from '@/store/settings-draft';
import * as attributionApi from '@/lib/attribution-api';
import { useClipboard } from '@/hooks/use-clipboard';
import { humanizeError } from '@/lib/error-format';
import { compactFsPath } from '@/lib/utils';
import { useUi } from '@/store/ui';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { SearchableSelect, type SearchableSelectOption } from '@/components/searchable-select';
import { SettingsGroup, SettingsRow, SettingsRowError } from '../settings-group';
import type { ActivityPolicy, HookMode, LocalRepoInfo } from '@/types/attribution';

const DEFAULT_POLICY: ActivityPolicy = {
  enabled: false,
  childMode: 'batch',
  parentMode: 'milestone',
  maxPerDay: 8,
};

const HOOK_MODE_LABELS: Record<HookMode, string> = {
  fill: '自动补全',
  enforce: '强制校验',
  off: '关闭',
};

const CATEGORY_LABELS: Record<'Req' | 'Bug' | 'Task', string> = {
  Req: '需求',
  Bug: '缺陷',
  Task: '任务',
};

const AGENT_COMMIT_COMMAND = './scripts/agent-commit.sh -m "<message>"';

const CHILD_MODE_OPTIONS = [
  { value: 'off', label: '关闭' },
  { value: 'batch', label: '批量（推荐）' },
  { value: 'per_event', label: '每条事件' },
] as const;

const PARENT_MODE_OPTIONS = [
  { value: 'off', label: '关闭' },
  { value: 'milestone', label: '里程碑（推荐）' },
  { value: 'daily', label: '每日汇总' },
] as const;

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

function formatSyncTime(timestamp?: number): string {
  if (!timestamp) return '尚未同步';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '尚未同步';
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function PolicySelect<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      id={id}
      aria-label={label}
      className="w-48 text-xs"
      selectedKey={value}
      isDisabled={disabled}
      onSelectionChange={(key) => {
        if (key != null) onChange(String(key) as T);
      }}
    >
      <Select.Trigger className="h-8 text-xs">
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((option) => (
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
      className="w-40 text-[11px]"
      selectedKey={value}
      isDisabled={disabled}
      onSelectionChange={(key) => {
        if (key != null) onChange(String(key) as HookMode);
      }}
    >
      <Select.Trigger className="h-6 text-[11px]">
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
 * 设置 → 变更归属（Attribution）分区。
 *
 * 三块能力：同步开关与状态、回写策略、本地仓库绑定 / commit-msg 钩子，外加 Agent 接入说明。
 * 回写策略不再是显式「保存策略」按钮：改动进入同一套 800ms 防抖自动保存，
 * 保存成功后据主设置草稿是否仍 dirty 决定页头指示，避免把半成品策略反复写进后端；
 * store 已负责所有失败 toast，本组件只补充行内错误与加载态，不重复弹错。
 */
export function AttributionSection() {
  const policy = useAttribution((state) => state.policy);
  const status = useAttribution((state) => state.status);
  const bindings = useAttribution((state) => state.bindings);
  const activeWorkitems = useAttribution((state) => state.activeWorkitems);
  const syncing = useAttribution((state) => state.syncing);
  const loadPolicy = useAttribution((state) => state.loadPolicy);
  const savePolicy = useAttribution((state) => state.savePolicy);
  const refreshStatus = useAttribution((state) => state.refreshStatus);
  const syncNow = useAttribution((state) => state.syncNow);
  const loadBindings = useAttribution((state) => state.loadBindings);
  const saveBinding = useAttribution((state) => state.saveBinding);
  const loadActiveWorkitems = useAttribution((state) => state.loadActiveWorkitems);
  const installHook = useAttribution((state) => state.installHook);
  const uninstallHook = useAttribution((state) => state.uninstallHook);

  const settings = useApp((state) => state.settings);
  const repositories = useApp((state) => state.repositories);
  const loadRepos = useApp((state) => state.loadRepos);

  const [draft, setDraft] = useState<ActivityPolicy | null>(policy);
  const [maxPerDayText, setMaxPerDayText] = useState(
    String((policy ?? DEFAULT_POLICY).maxPerDay),
  );
  const [policyLoading, setPolicyLoading] = useState(!policy);
  const [saving, setSaving] = useState(false);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const policyTimerRef = useRef<number | null>(null);
  const pendingPolicyRef = useRef<ActivityPolicy | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [bindingsError, setBindingsError] = useState(false);
  const [activeError, setActiveError] = useState(false);
  const [inspectByRepo, setInspectByRepo] = useState<Record<number, InspectState>>({});
  const [hookModes, setHookModes] = useState<Record<number, HookMode>>({});
  const [hookBusyRepo, setHookBusyRepo] = useState<number | null>(null);
  // 独立绑定入口：不依赖「默认扫描仓库」，从云效全量仓库里选一个再选本地目录
  const [newRepoId, setNewRepoId] = useState<number | null>(null);
  const [bindingNew, setBindingNew] = useState(false);

  const { copy, copied } = useClipboard({ successMessage: '提交命令已复制' });

  // 首次进入：仅在 store 尚未持有时拉取策略，避免覆盖已有状态。
  useEffect(() => {
    if (policy) {
      setPolicyLoading(false);
      setDraft(policy);
      setMaxPerDayText(String(policy.maxPerDay));
      return;
    }
    let cancelled = false;
    setPolicyLoading(true);
    void loadPolicy()
      .catch(() => null)
      .finally(() => {
        if (!cancelled) setPolicyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadPolicy, policy]);

  // 离开设置页时冲刷回写策略尚未到期的 800ms 防抖窗口，避免丢配置
  useEffect(() => () => {
    if (policyTimerRef.current != null) {
      window.clearTimeout(policyTimerRef.current);
      policyTimerRef.current = null;
      const pending = pendingPolicyRef.current;
      pendingPolicyRef.current = null;
      if (pending) void savePolicy(pending, { silent: true });
    }
  }, [savePolicy]);

  // 窗口失焦（切到其他 App）时立即冲刷尚未到期的策略防抖，避免关窗前丢改动
  useEffect(() => {
    const flush = () => {
      if (policyTimerRef.current == null) return;
      window.clearTimeout(policyTimerRef.current);
      policyTimerRef.current = null;
      const pending = pendingPolicyRef.current;
      pendingPolicyRef.current = null;
      if (pending) void savePolicy(pending, { silent: true });
    };
    window.addEventListener('blur', flush);
    return () => window.removeEventListener('blur', flush);
  }, [savePolicy]);

  // 同步状态 / 本地绑定 / 当前工作项：初次静默读取，失败以行内提示兜底。
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [nextStatus, nextBindings] = await Promise.all([
        refreshStatus({ silent: true }),
        loadBindings({ silent: true }),
      ]);
      if (cancelled) return;
      setStatusError(nextStatus === null);
      setBindingsError(nextBindings === null);
      const active = await loadActiveWorkitems({ silent: true });
      if (!cancelled) setActiveError(active === null);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadActiveWorkitems, loadBindings, refreshStatus]);

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

  // 活动状态按仓库记录：可能多个仓库各自记录不同工作项
  const activeEntries = useMemo(
    () => Object.values(activeWorkitems).sort((left, right) => right.updatedAt - left.updatedAt),
    [activeWorkitems],
  );
  const activeEntry = activeEntries[0];

  const effectivePolicy = draft ?? policy ?? DEFAULT_POLICY;
  const parsedMaxPerDay = Number.parseInt(maxPerDayText.trim(), 10);
  const maxPerDayValid =
    /^\d+$/.test(maxPerDayText.trim()) &&
    Number.isInteger(parsedMaxPerDay) &&
    parsedMaxPerDay >= 1 &&
    parsedMaxPerDay <= 20;

  const markPolicyUnsaved = () => {
    useSettingsDraft.setState((st) => (st.saving ? {} : { autoSaveStatus: 'unsaved' as const }));
  };

  const clearPolicyTimer = () => {
    if (policyTimerRef.current != null) {
      window.clearTimeout(policyTimerRef.current);
      policyTimerRef.current = null;
    }
  };

  /** 保存成功后据主设置草稿状态落定页头指示：主草稿仍 dirty 时绝不误报「已自动保存」。 */
  const settlePolicyStatus = () => {
    useSettingsDraft.setState((st) => {
      if (st.saving) return {};
      if (st.isDirty()) return { autoSaveStatus: 'unsaved' as const };
      return { autoSaveStatus: 'saved' as const, lastSavedAt: Date.now() };
    });
  };

  const commitPolicy = async (target?: ActivityPolicy) => {
    clearPolicyTimer();
    const next = target ?? pendingPolicyRef.current;
    if (!next) return;
    pendingPolicyRef.current = null;
    setPolicyError(null);
    setSaving(true);
    useSettingsDraft.setState((st) => (st.saving ? {} : { autoSaveStatus: 'saving' as const }));
    try {
      const saved = await savePolicy(next, { silent: true });
      if (saved) {
        setDraft(saved);
        setMaxPerDayText(String(saved.maxPerDay));
        settlePolicyStatus();
      } else {
        pendingPolicyRef.current = next;
        setPolicyError('回写策略保存失败，请检查网络后重试。');
        markPolicyUnsaved();
      }
    } finally {
      setSaving(false);
    }
  };

  const queuePolicySave = (next: ActivityPolicy) => {
    setDraft(next);
    pendingPolicyRef.current = next;
    setPolicyError(null);
    markPolicyUnsaved();
    clearPolicyTimer();
    policyTimerRef.current = window.setTimeout(() => {
      policyTimerRef.current = null;
      void commitPolicy();
    }, 800);
  };

  const flushPolicy = () => {
    if (pendingPolicyRef.current) void commitPolicy();
  };

  const handleMaxPerDayChange = (value: string) => {
    setMaxPerDayText(value);
    const parsed = Number.parseInt(value.trim(), 10);
    const valid =
      /^\d+$/.test(value.trim()) &&
      Number.isInteger(parsed) &&
      parsed >= 1 &&
      parsed <= 20;
    if (!valid) {
      // 非法值不写入后端：保留行内错误与「未保存」态，修正后继续 800ms 防抖
      pendingPolicyRef.current = null;
      clearPolicyTimer();
      return;
    }
    queuePolicySave({ ...effectivePolicy, maxPerDay: parsed });
  };

  const toggleEnabled = (enabled: boolean) => {
    // 安全开关是显式动作：立即提交，但仍进入同一套自动保存状态指示
    const next: ActivityPolicy = { ...effectivePolicy, enabled };
    setDraft(next);
    pendingPolicyRef.current = next;
    void commitPolicy(next);
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

  const busy = syncing || Boolean(status?.syncing);
  const lastSyncAt = status?.lastSyncAt;
  const allowWriteOps = settings?.allowWriteOps ?? false;

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
          className="h-5 px-1.5 text-[10px]"
        >
          {inspect.info.dirty ? '工作区有未提交修改' : '工作区干净'}
        </Chip>
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <SettingsGroup
        title="变更归属同步"
        description="把云效仓库的提交、MR 与构建事件归属到工作项，并作为 Agent 回写的触发源。远程轮询是兜底，本地仓库钩子提供实时感知。"
        action={(
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || !policy}
            onClick={() => void syncNow()}
            aria-label="立即同步变更归属"
          >
            {busy ? <Spinner className="size-3.5" /> : <RefreshCwIcon className="size-3.5" />}
            {busy ? '同步中…' : '立即同步'}
          </Button>
        )}
      >
        <SettingsRow
          orientation="horizontal"
          label="启用变更归属"
          description="关闭后不再轮询或接收本地事件，已有归属记录仍可在需求详情中查看。"
          htmlFor="attribution-enabled"
          control={(
            <Switch
              id="attribution-enabled"
              aria-label="启用变更归属"
              size="md"
              isSelected={effectivePolicy.enabled}
              disabled={!policy || saving || policyLoading}
              onChange={(enabled) => toggleEnabled(enabled)}
            />
          )}
        />

        <SettingsRow
          orientation="horizontal"
          label="同步状态"
          description={
            statusError
              ? '状态读取失败，可点击「立即同步」重试。'
              : '最近一次成功同步的时间；同步中的状态会阻止重复触发。'
          }
          control={(
            <div className="flex flex-col items-end gap-1">
              <span className="font-mono text-xs text-foreground">
                {formatSyncTime(lastSyncAt)}
              </span>
              {busy && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Spinner className="size-3" />
                  正在同步…
                </span>
              )}
            </div>
          )}
        />
      </SettingsGroup>

      <SettingsGroup
        title="回写策略"
        description="控制 Agent 把代码变更写入云效工作项评论的频率与上限。评论采用 [nervd] 前缀，需求级只汇总里程碑或每日进展，避免刷屏。"
      >
        {policyError && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 px-4 py-2.5 text-xs text-destructive"
          >
            <span>{policyError}</span>
            <Button
              type="button"
              size="xs"
              variant="outline"
              className="h-5 px-1.5 text-[11px]"
              onClick={flushPolicy}
            >
              重试
            </Button>
          </div>
        )}
        {!allowWriteOps && (
          <div className="border-b border-border/50 px-4 py-3">
            <Alert status="warning" className="rounded-md px-2.5 py-2 shadow-none">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>当前处于只读保护模式</Alert.Title>
                <Alert.Description className="text-xs leading-5">
                  安全设置中的 allowWriteOps=false 时，回写评论会挂起排队、不会请求云效；
                  开启写操作后才会真正提交。变更归属同步与本地仓库钩子不受影响。
                </Alert.Description>
              </Alert.Content>
            </Alert>
          </div>
        )}

        {policyLoading ? (
          <div className="flex items-center gap-2 px-4 py-3.5 text-xs text-muted-foreground">
            <Spinner className="size-3.5" />
            正在读取回写策略…
          </div>
        ) : !policy ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 px-4 py-3.5 last:border-b-0">
            <span className="flex items-center gap-1.5 text-xs text-destructive">
              <ShieldAlertIcon className="size-3.5" />
              回写策略读取失败，请重试。
            </span>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => {
                setPolicyLoading(true);
                void loadPolicy().finally(() => setPolicyLoading(false));
              }}
            >
              重新读取
            </Button>
          </div>
        ) : (
          <>
            <SettingsRow
              orientation="horizontal"
              label="子项回写模式"
              description="缺陷 / 子任务级评论。批量会把 10 分钟窗口内的提交聚合成一条；每条事件逐条评论，最及时但最吵。"
              control={(
                <PolicySelect
                  id="attribution-child-mode"
                  label="子项回写模式"
                  value={effectivePolicy.childMode}
                  options={CHILD_MODE_OPTIONS}
                  disabled={saving}
                  onChange={(childMode) => queuePolicySave({ ...effectivePolicy, childMode })}
                />
              )}
            />

            <SettingsRow
              orientation="horizontal"
              label="需求回写模式"
              description="父需求级评论。里程碑只覆盖 MR 合入 / 关闭与构建失败；每日汇总按本地日期聚合当天全部变更。"
              control={(
                <PolicySelect
                  id="attribution-parent-mode"
                  label="需求回写模式"
                  value={effectivePolicy.parentMode}
                  options={PARENT_MODE_OPTIONS}
                  disabled={saving}
                  onChange={(parentMode) => queuePolicySave({ ...effectivePolicy, parentMode })}
                />
              )}
            />

            <SettingsRow
              orientation="horizontal"
              label="每日回写上限"
              description="同一工作项每天最多回写的评论条数（1–20）。超出后事件会保留但不再自动评论。"
              htmlFor="attribution-max-per-day"
              error={
                maxPerDayValid ? undefined : (
                  <SettingsRowError>请输入 1–20 的整数</SettingsRowError>
                )
              }
              control={(
                <Input
                  id="attribution-max-per-day"
                  type="number"
                  min={1}
                  max={20}
                  step={1}
                  className="w-24 font-mono"
                  aria-invalid={!maxPerDayValid}
                  aria-describedby={maxPerDayValid ? undefined : 'attribution-max-per-day-error'}
                  value={maxPerDayText}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.nativeEvent.isComposing) return;
                  }}
                  onBlur={flushPolicy}
                  onChange={(event) => handleMaxPerDayChange(event.target.value)}
                />
              )}
            />
          </>
        )}
      </SettingsGroup>

      <SettingsGroup
        title="本地仓库"
        description="绑定本地 Git 目录后，nervd 通过 commit-msg 钩子实时捕获尚未推送的提交；远程轮询仍是兜底，因此未绑定也不影响归属主流程。"
      >
        <SettingsRow
          orientation="horizontal"
          controlWidth="w-80"
          label="绑定新的本地仓库"
          description="从云效仓库中选一个，再指定它在本机的 Git 目录；不要求先加入「默认扫描仓库」，绑定成功后仓库会出现在下方列表。"
          control={(
            <div className="flex flex-col gap-2">
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
                className="w-full text-xs"
              />
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="w-full"
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
                  <Spinner className="size-3" />
                ) : (
                  <FolderOpenIcon className="size-3" />
                )}
                {bindingNew ? '绑定中…' : '选择目录并绑定'}
              </Button>
              {repositories.length === 0 && (
                <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                  <span>仓库列表为空，请先保存访问令牌并加载仓库。</span>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="h-5 px-1 text-[11px]"
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
          <div className="px-4 py-4 text-xs text-muted-foreground">
            还没有默认扫描仓库，也没有已绑定仓库。用上方「绑定新的本地仓库」选择目录后，这里会显示每个仓库的 Git 状态与钩子开关。
          </div>
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
                    className="h-5 px-1.5 text-[10px]"
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
                    size="xs"
                    variant="outline"
                    onClick={() => void pickDirectory(repoId)}
                  >
                    <FolderOpenIcon className="size-3" />
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
                        size="xs"
                        variant={hookInstalled ? 'outline' : 'default'}
                        disabled={hookBusy}
                        onClick={() => void toggleHook(repoId, 'install')}
                      >
                        {hookBusy ? <Spinner className="size-3" /> : null}
                        {hookInstalled ? '更新钩子' : '安装钩子'}
                      </Button>
                      {hookInstalled && (
                        <Button
                          type="button"
                          size="xs"
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
                        className="h-5 px-1.5 text-[10px]"
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

      <SettingsGroup
        title="Agent 接入"
        description="Agent 通过仓库内的 commit-msg 钩子与 .nervd/active-workitem.json 读取当前工作项；提交时自动补 Refs，CI 再做一次归属兜底检查。"
      >
        <SettingsRow
          label="提交命令"
          description="Agent 统一使用该脚本提交，自动读取当前工作项并补全 Refs 尾注；不要直接 git commit。"
          control={(
            <div className="flex flex-col gap-2">
              <pre className="overflow-x-auto rounded-md border border-border/60 bg-background/70 px-3 py-2 font-mono text-[11px] text-foreground/90">
                {AGENT_COMMIT_COMMAND}
              </pre>
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => void copy(AGENT_COMMIT_COMMAND)}
                >
                  <CopyIcon className="size-3" />
                  {copied ? '已复制' : '复制'}
                </Button>
              </div>
            </div>
          )}
        />

        <SettingsRow
          orientation="horizontal"
          label="当前工作项"
          description="来自 .nervd/active-workitem.json 的本地上下文；缺失时请先让 Agent 写入或手动切换。"
          control={
            activeEntry ? (
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <Chip size="sm" variant="soft" color="accent" className="font-mono">
                  {activeEntry.identifier}
                </Chip>
                <Chip size="sm" variant="secondary">
                  {CATEGORY_LABELS[activeEntry.category] ?? activeEntry.category}
                </Chip>
                <Chip
                  size="sm"
                  variant="soft"
                  className="max-w-56 gap-1 font-mono text-[11px]"
                  title={activeEntries.map((item) => repoLabel(item.repoId)).join('\n')}
                >
                  <Chip.Label className="truncate">{repoLabel(activeEntry.repoId)}</Chip.Label>
                </Chip>
                {activeEntries.length > 1 && (
                  <span className="text-[11px] text-muted-foreground">
                    +{activeEntries.length - 1} 个仓库
                  </span>
                )}
                <span className="text-[11px] text-muted-foreground">
                  {activeEntry.parentIdentifier
                    ? `父需求 ${activeEntry.parentIdentifier}`
                    : '无父需求'}
                </span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">
                {activeError ? '读取失败' : '未设置'}
              </span>
            )
          }
        />

        <div className="border-b border-border/50 px-4 py-3 last:border-b-0">
          <Alert status="default" className="rounded-md px-2.5 py-2 shadow-none">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description className="flex flex-col gap-1 text-xs leading-5">
                <span className="flex items-start gap-1.5">
                  <TerminalIcon className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
                  状态文件：<code className="font-mono text-[11px]">.nervd/active-workitem.json</code>
                  记录 repoId / workitemId / parentWorkitemId，仅供本机使用，不提交。
                </span>
                <span>
                  commit-msg 钩子默认 fill：缺少 Refs 时自动补全，不阻断提交；enforce 会拒绝缺少归属的提交。
                </span>
                <span>
                  CI 使用 <code className="font-mono text-[11px]">check-commit-attribution.sh</code>
                  校验 origin/base...HEAD，无 Refs 的提交会失败。
                </span>
              </Alert.Description>
            </Alert.Content>
          </Alert>
        </div>
      </SettingsGroup>
    </div>
  );
}