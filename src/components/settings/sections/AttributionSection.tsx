import { useEffect, useMemo, useRef, useState } from 'react';
import {
  RefreshCwIcon,
  ShieldAlertIcon,
  TerminalIcon,
} from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Chip } from '@/components/ui/chip';
import { ListBox } from '@/components/ui/list-box';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { CopyButton } from '@/components/ui/copy-button';
import { useApp } from '@/store/app';
import { useAttribution } from '@/store/attribution';
import { useSettingsDraft } from '@/store/settings-draft';
import { isWritebackPaused, setWritebackPaused, subscribeWritebackPause } from '@/lib/writeback-pause';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { SettingsGroup, SettingsRow, SettingsRowError } from '../settings-group';
import type { ActivityPolicy } from '@/types/attribution';

const DEFAULT_POLICY: ActivityPolicy = {
  enabled: false,
  childMode: 'batch',
  parentMode: 'milestone',
  maxPerDay: 8,
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
      className="w-48"
      selectedKey={value}
      isDisabled={disabled}
      onSelectionChange={(key) => {
        if (key != null) onChange(String(key) as T);
      }}
    >
      <Select.Trigger>
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

/**
 * 设置 → 变更追溯（Attribution）分区。
 *
 * 两块能力：归属同步与状态、动态回写策略与 Agent 接入说明。本地仓库绑定 / commit-msg 钩子
 * 已迁至「仓库与分支」；回写策略不再是显式「保存策略」按钮：改动进入同一套 800ms 防抖自动保存，
 * 保存成功后据主设置草稿是否仍 dirty 决定页头指示，避免把半成品策略反复写进后端；
 * store 已负责所有失败 toast，本组件只补充行内错误与加载态，不重复弹错。
 */
export function AttributionSection() {
  const policy = useAttribution((state) => state.policy);
  const status = useAttribution((state) => state.status);
  const activeWorkitems = useAttribution((state) => state.activeWorkitems);
  const syncing = useAttribution((state) => state.syncing);
  const loadPolicy = useAttribution((state) => state.loadPolicy);
  const savePolicy = useAttribution((state) => state.savePolicy);
  const refreshStatus = useAttribution((state) => state.refreshStatus);
  const syncNow = useAttribution((state) => state.syncNow);
  const loadActiveWorkitems = useAttribution((state) => state.loadActiveWorkitems);

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
  const [writebackPaused, setWritebackPausedState] = useState(() => isWritebackPaused());
  const [activeError, setActiveError] = useState(false);


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

  // 同步状态与当前工作项：初次静默读取，失败以行内提示兜底。
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const nextStatus = await refreshStatus({ silent: true });
      if (cancelled) return;
      setStatusError(nextStatus === null);
      const active = await loadActiveWorkitems({ silent: true });
      if (!cancelled) setActiveError(active === null);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadActiveWorkitems, refreshStatus]);

  // 仓库列表来自云效组织；未加载时补一次，失败不阻塞表单。
  useEffect(() => {
    if (!repositories.length && settings?.hasPat) void loadRepos();
  }, [loadRepos, repositories.length, settings?.hasPat]);

  // 动态回写暂停开关：本地持久化，设置页与后台写入器共享同一来源。
  useEffect(() => subscribeWritebackPause(() => setWritebackPausedState(isWritebackPaused())), []);

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

  const busy = syncing || Boolean(status?.syncing);
  const lastSyncAt = status?.lastSyncAt;
  const allowWriteOps = settings?.allowWriteOps ?? false;

  return (
    <div className="flex flex-col gap-6">
      <SettingsGroup
        title="变更归属同步"
        description="把云效仓库的提交与 MR 归属到工作项，并作为 Agent 回写的触发源。构建事件暂未接入：流水线 / Jenkins 构建结果当前不会归属到工作项。远程轮询是兜底，本地仓库钩子提供实时感知。"
        action={(
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || !policy}
            // 手动同步：强制重新解析编号 + 忽略游标回填，让已索引但未归属的事件重新计算。
            onClick={() => void syncNow({ force: true, full: true })}
            aria-label="立即同步并强制重新解析编号"
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
              : '最近一次成功同步的时间；同步中的状态会阻止重复触发。「立即同步」会强制重新解析未命中的编号（不等 1 小时负缓存）并回填最近窗口重新计算归属。同步范围仅包含 commit / MR，构建事件暂未接入。'
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
        description="控制 Agent 把代码变更写入云效工作项评论的频率与上限。仅回写代码记录（提交 / MR / 构建），且只处理负责人是当前用户的工作项（父需求额外允许协同人 / 创建人是本人）：子任务只写自己的代码记录，父需求只写里程碑或每日代码汇总；工作项状态流转不写动态；没有新变更时不产生动态。"
      >
        <SettingsRow
          orientation="horizontal"
          label="动态回写"
          description={
            writebackPaused
              ? '已暂停：不会创建或更新云效评论；归属同步与时间线不受影响。'
              : '已开启：有新变更时按下方策略更新云效评论。'
          }
          htmlFor="writeback-paused"
          control={(
            <Switch
              id="writeback-paused"
              aria-label="动态回写"
              size="md"
              isSelected={!writebackPaused}
              onChange={(enabled) => {
                const paused = !enabled;
                setWritebackPaused(paused);
                setWritebackPausedState(paused);
                useApp.getState().setToast({
                  kind: 'info',
                  text: paused ? '已暂停动态回写' : '已恢复动态回写',
                });
              }}
            />
          )}
        />
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
              onClick={flushPolicy}
            >
              重试
            </Button>
          </div>
        )}
        {!allowWriteOps && (
          <div className="border-b border-border/50 px-4 py-3">
            <Alert status="warning">
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
              description="缺陷 / 子任务级评论。批量会把 10 分钟窗口内的提交汇总进滚动评论；每条事件则每次变更都更新评论，最及时但更频繁。"
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
              description="父需求级滚动评论。里程碑当前只覆盖 MR 合入 / 关闭；构建失败回写依赖构建事件归属，而构建事件暂未接入，因此暂不会触发。每日汇总按本地日期聚合当天全部变更。"
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
              description="同一工作项每天最多更新滚动评论的次数（1–20）。超出后变更保留但当天不再自动更新评论。"
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
        title="Agent 接入"
        description="Agent 通过仓库内的 commit-msg 钩子与 .nervd/active-workitem.json 读取当前工作项；提交时自动补 Refs，CI 再做一次归属兜底检查。点击「开始处理」还会在对应工程 .nervd/ 下生成 agent-task.md 与 scripts/（commit / read / check），可直接交给 Agent。"
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
                <CopyButton text={AGENT_COMMIT_COMMAND} label="复制提交命令" />
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
                  className="max-w-56 gap-1 font-mono"
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
          <Alert status="default">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description className="flex flex-col gap-1 text-xs leading-5">
                <span className="flex items-start gap-1.5">
                  <TerminalIcon className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
                  状态文件：<code className="font-mono text-[11px]">.nervd/active-workitem.json</code>
                  记录 repoId / workitemId / parentWorkitemId，仅供本机使用，不提交。
                </span>
                <span>
                  「开始处理」同时生成 <code className="font-mono text-[11px]">.nervd/agent-task.md</code>
                  （任务上下文与推荐命令）与 <code className="font-mono text-[11px]">.nervd/scripts/</code>
                  （lib-attribution / agent-commit / read-active-workitem / check-commit-attribution），
                  每次开始处理覆盖，脚本随 nervd 版本更新。
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