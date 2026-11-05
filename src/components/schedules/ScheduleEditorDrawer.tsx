import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangleIcon,
  CalendarClockIcon,
  CheckIcon,
  ClockIcon,
  GitBranchIcon,
  GitMergeIcon,
  Loader2Icon,
  PlayCircleIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TerminalIcon,
  WorkflowIcon,
  XIcon,
  type LucideIcon,
} from 'lucide-react';
import { Alert, Chip, RadioGroup, Radio, TagGroup, Tag, TimeField } from '@heroui/react';
import type { TimeValue } from 'react-aria-components';
import * as api from '@/lib/api';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { SearchableSelect } from '@/components/searchable-select';
import { useApp } from '@/store/app';
import { useScheduleStore } from '@/store/schedule';
import {
  CRON_PRESETS,
  describeCron,
  getNextRunTimes,
  validateCron,
} from '@/lib/cron';
import type {
  AggressiveConflictPreference,
  MergeStrategy,
  ScheduleAction,
  ScheduleActionType,
  ScheduledTask,
} from '@/types/schedule';
import { cn } from '@/lib/utils';

export interface ScheduleEditorDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTask?: ScheduledTask | null;
}

/** 调度频率分段模式 */
type FreqMode = 'preset' | 'interval' | 'daily' | 'cron';

/** 执行动作类型选项（与 RadioGroup 联动） */
const ACTION_OPTIONS: Array<{
  value: ScheduleActionType;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    value: 'branch_merge',
    label: '分支安全同步',
    description: '谨慎/激进双策略，定时将开发分支安全合入目标分支',
    icon: GitMergeIcon,
  },
  {
    value: 'jenkins',
    label: 'Jenkins 构建',
    description: '定时触发远程 Jenkins Job 构建',
    icon: PlayCircleIcon,
  },
  {
    value: 'pipeline',
    label: '云效 Flow 流水线',
    description: '定时运行云效 CI 交付流水线',
    icon: WorkflowIcon,
  },
  {
    value: 'sync_workitems',
    label: '同步云效需求',
    description: '定时拉取云效工作项与迭代数据',
    icon: RefreshCwIcon,
  },
  {
    value: 'scan_branches',
    label: '集成分支巡检',
    description: '定时比对集成分支与基准分支的双向落差',
    icon: GitBranchIcon,
  },
];

/** 循环间隔快速选择 */
const QUICK_INTERVALS: Array<{ label: string; val: number; unit: 'minute' | 'hour' }> = [
  { label: '每 5 分钟', val: 5, unit: 'minute' },
  { label: '每 15 分钟', val: 15, unit: 'minute' },
  { label: '每 30 分钟', val: 30, unit: 'minute' },
  { label: '每 1 小时', val: 1, unit: 'hour' },
  { label: '每 2 小时', val: 2, unit: 'hour' },
];

/**
 * "HH:mm" 字符串 → RAC TimeField 兼容的 TimeValue。
 * 运行时契约：react-stately 以 `'day' in value` 判定时间型值，随后仅读取
 * hour/minute/second/millisecond 数值属性（convertValue → toCalendarDateTime），
 * 纯对象即可安全驱动；onChange 回传的是库自建的真实 Time 实例。
 * （@internationalized/date 未直接入依赖，故以此轻量转换桥接，无需动冻结的 package.json）
 */
function toTimeValue(hhmm: string): TimeValue {
  const [h = 0, m = 0] = hhmm.split(':').map((n) => Number.parseInt(n, 10) || 0);
  return { hour: h, minute: m, second: 0, millisecond: 0 } as TimeValue;
}

/** TimeValue → "HH:mm"（清空分段时回落默认 02:00） */
function fromTimeValue(value: TimeValue | null): string {
  if (!value) return '02:00';
  return `${String(value.hour).padStart(2, '0')}:${String(value.minute).padStart(2, '0')}`;
}

/** 固定时间日期类型 */
const DAYS_TYPE_OPTIONS: Array<{ label: string; value: 'everyday' | 'workday' | 'weekend' | 'weekly' }> = [
  { label: '每天', value: 'everyday' },
  { label: '工作日', value: 'workday' },
  { label: '周末', value: 'weekend' },
  { label: '每周特定日', value: 'weekly' },
];

/** 周一至周日（cron day-of-week） */
const WEEKDAY_OPTIONS: Array<{ label: string; day: number }> = [
  { label: '周一', day: 1 },
  { label: '周二', day: 2 },
  { label: '周三', day: 3 },
  { label: '周四', day: 4 },
  { label: '周五', day: 5 },
  { label: '周六', day: 6 },
  { label: '周日', day: 0 },
];

export function ScheduleEditorDrawer({
  open,
  onOpenChange,
  initialTask,
}: ScheduleEditorDrawerProps) {
  const addTask = useScheduleStore((s) => s.addTask);
  const updateTask = useScheduleStore((s) => s.updateTask);
  const repositories = useApp((s) => s.repositories);
  const settings = useApp((s) => s.settings);

  // Form states
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [actionType, setActionType] = useState<ScheduleActionType>('branch_merge');

  // Branch merge fields
  const [repoId, setRepoId] = useState<number>(0);
  const [sourceBranch, setSourceBranch] = useState('dev');
  const [targetBranch, setTargetBranch] = useState('master');
  const [availableBranches, setAvailableBranches] = useState<string[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [strategy, setStrategy] = useState<MergeStrategy>('cautious');
  const [conflictPreference, setConflictPreference] =
    useState<AggressiveConflictPreference>('theirs');

  // 当选择的代码仓库变更且处于抽屉打开态时，异步获取该仓库的所有远端分支
  useEffect(() => {
    if (!open || !repoId || repoId <= 0) {
      setAvailableBranches([]);
      return;
    }
    let cancelled = false;
    setBranchesLoading(true);

    api
      .listBranches(repoId)
      .then((res) => {
        if (cancelled) return;
        const collect = (input: unknown): string[] => {
          if (Array.isArray(input)) {
            return input.flatMap((item) => {
              if (typeof item === 'string') return [item];
              if (!item || typeof item !== 'object') return [];
              const record = item as Record<string, unknown>;
              const name = record.name ?? record.branchName ?? record.branch_name;
              return typeof name === 'string' ? [name] : [];
            });
          }
          if (!input || typeof input !== 'object') return [];
          const record = input as Record<string, unknown>;
          for (const key of ['branches', 'items', 'data', 'result']) {
            if (record[key] !== undefined) {
              const names = collect(record[key]);
              if (names.length) return names;
            }
          }
          return [];
        };
        const branchList = [...new Set(collect(res).map((name) => name.trim()).filter(Boolean))].sort();
        setAvailableBranches(branchList);
      })
      .catch(() => {
        if (!cancelled) setAvailableBranches([]);
      })
      .finally(() => {
        if (!cancelled) setBranchesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, repoId]);

  // Jenkins fields
  const [jenkinsConnId, setJenkinsConnId] = useState('');
  const [jenkinsJobName, setJenkinsJobName] = useState('');

  // Flow pipeline fields
  const [pipelineId, setPipelineId] = useState<number>(0);
  const [pipelineName, setPipelineName] = useState('');

  // Cron schedule fields
  const [freqMode, setFreqMode] = useState<FreqMode>('preset');
  const [cron, setCron] = useState('0 2 * * *');
  const [preset, setPreset] = useState('0 2 * * *');

  // 自定义周期模式（每 N 分钟/小时）
  const [intervalValue, setIntervalValue] = useState<number>(30);
  const [intervalUnit, setIntervalUnit] = useState<'minute' | 'hour'>('minute');

  // 自定义固定时间模式（每天/工作日/特定日期的 HH:mm）
  const [fixedDaysType, setFixedDaysType] = useState<'everyday' | 'workday' | 'weekend' | 'weekly'>('everyday');
  const [fixedWeeklyDay, setFixedWeeklyDay] = useState<number>(1); // 1 = 周一
  const [fixedTime, setFixedTime] = useState('02:00'); // HH:mm

  // Notification fields
  const [notifyOnSuccess, setNotifyOnSuccess] = useState(true);
  const [notifyOnFailure, setNotifyOnFailure] = useState(true);

  // Load initial data when editing or opening
  useEffect(() => {
    if (!open) return;

    if (initialTask) {
      // 旧版本持久化的任务可能缺少新字段：所有读取一律回退默认值，防止编辑态渲染崩溃
      setName(initialTask.name ?? '未命名任务');
      setDescription(initialTask.description ?? '');
      setEnabled(initialTask.enabled ?? true);
      setCron(initialTask.cron || '0 2 * * *');
      setNotifyOnSuccess(initialTask.notifyOnSuccess ?? true);
      setNotifyOnFailure(initialTask.notifyOnFailure ?? true);

      const editCron = initialTask.cron || '0 2 * * *';
      const matchedPreset = CRON_PRESETS.find((p) => p.value === editCron);
      setPreset(matchedPreset ? matchedPreset.value : 'custom');
      if (matchedPreset) {
        setFreqMode('preset');
      } else {
        // 尝试判断是否是固定时间模式（如 0 2 * * *）或周期模式（如 */10 * * * *）
        const parts = editCron.trim().split(/\s+/);
        if (parts.length === 5 && parts[0].startsWith('*/') && parts[1] === '*' && parts[2] === '*' && parts[3] === '*' && parts[4] === '*') {
          setFreqMode('interval');
          setIntervalValue(parseInt(parts[0].slice(2), 10) || 30);
          setIntervalUnit('minute');
        } else if (parts.length === 5 && parts[0] === '0' && parts[1].startsWith('*/') && parts[2] === '*' && parts[3] === '*' && parts[4] === '*') {
          setFreqMode('interval');
          setIntervalValue(parseInt(parts[1].slice(2), 10) || 2);
          setIntervalUnit('hour');
        } else if (parts.length === 5 && !parts[0].includes('*') && !parts[1].includes('*') && parts[2] === '*' && parts[3] === '*') {
          setFreqMode('daily');
          const hh = parts[1].padStart(2, '0');
          const mm = parts[0].padStart(2, '0');
          setFixedTime(`${hh}:${mm}`);
          if (parts[4] === '*') setFixedDaysType('everyday');
          else if (parts[4] === '1-5') setFixedDaysType('workday');
          else if (parts[4] === '0,6' || parts[4] === '6,0') setFixedDaysType('weekend');
          else {
            setFixedDaysType('weekly');
            setFixedWeeklyDay(parseInt(parts[4], 10) || 1);
          }
        } else {
          setFreqMode('cron');
        }
      }

      const act = initialTask.action ?? { type: 'branch_merge' as const };
      setActionType(act.type ?? 'branch_merge');
      if (act.type === 'branch_merge') {
        setRepoId(act.repoId ?? 0);
        setSourceBranch(act.sourceBranch ?? '');
        setTargetBranch(act.targetBranch ?? '');
        setStrategy(act.strategy ?? 'cautious');
        if (act.aggressiveConflictPreference) {
          setConflictPreference(act.aggressiveConflictPreference);
        }
      } else if (act.type === 'jenkins') {
        setJenkinsConnId(act.connectionId ?? '');
        setJenkinsJobName(act.jobFullName ?? '');
      } else if (act.type === 'pipeline') {
        setPipelineId(act.pipelineId ?? 0);
        setPipelineName(act.pipelineName ?? '');
      }
    } else {
      // Reset defaults for new task
      setName('');
      setDescription('');
      setEnabled(true);
      setActionType('branch_merge');
      const defaultRepo = repositories[0]?.id ?? 0;
      setRepoId(defaultRepo);
      setSourceBranch('dev');
      setTargetBranch('master');
      setStrategy('cautious');
      setConflictPreference('theirs');
      setFreqMode('preset');
      setCron('0 2 * * *');
      setPreset('0 2 * * *');
      setIntervalValue(30);
      setIntervalUnit('minute');
      setFixedDaysType('everyday');
      setFixedTime('02:00');
      setNotifyOnSuccess(true);
      setNotifyOnFailure(true);

      const firstConn = settings?.jenkinsConnections?.[0]?.id ?? '';
      setJenkinsConnId(firstConn);
      setJenkinsJobName('');
      setPipelineId(0);
      setPipelineName('');
    }
  }, [open, initialTask, repositories, settings]);

  // Cron validation & preview
  const cronValidation = useMemo(() => validateCron(cron), [cron]);
  const cronDescription = useMemo(
    () => (cronValidation.valid ? describeCron(cron) : null),
    [cron, cronValidation.valid],
  );
  const nextRuns = useMemo(
    () => (cronValidation.valid ? getNextRunTimes(cron, 4) : []),
    [cron, cronValidation.valid],
  );

  // 周期切换处理
  const handleFreqModeSelect = (mode: FreqMode) => {
    setFreqMode(mode);
    if (mode === 'preset') {
      setCron(preset === 'custom' ? '0 2 * * *' : preset);
    } else if (mode === 'interval') {
      if (intervalUnit === 'minute') {
        setCron(`*/${intervalValue} * * * *`);
      } else {
        setCron(`0 */${intervalValue} * * *`);
      }
    } else if (mode === 'daily') {
      const [hh, mm] = fixedTime.split(':').map((v) => parseInt(v, 10) || 0);
      let dowStr = '*';
      if (fixedDaysType === 'workday') dowStr = '1-5';
      else if (fixedDaysType === 'weekend') dowStr = '0,6';
      else if (fixedDaysType === 'weekly') dowStr = String(fixedWeeklyDay);
      setCron(`${mm} ${hh} * * ${dowStr}`);
    }
  };

  const handlePresetChange = (value: string) => {
    setPreset(value);
    if (value !== 'custom') {
      setCron(value);
    } else {
      setFreqMode('cron');
    }
  };

  // 自定义周期修改
  const handleIntervalChange = (val: number, unit: 'minute' | 'hour') => {
    const safeVal = Math.max(1, val);
    setIntervalValue(safeVal);
    setIntervalUnit(unit);
    if (unit === 'minute') {
      setCron(`*/${safeVal} * * * *`);
    } else {
      setCron(`0 */${safeVal} * * *`);
    }
  };

  // 自定义固定时间修改
  const handleFixedTimeChange = (
    newTime: string,
    daysType: 'everyday' | 'workday' | 'weekend' | 'weekly',
    weeklyDay: number,
  ) => {
    setFixedTime(newTime);
    setFixedDaysType(daysType);
    setFixedWeeklyDay(weeklyDay);

    const [hh, mm] = newTime.split(':').map((v) => parseInt(v, 10) || 0);
    let dowStr = '*';
    if (daysType === 'workday') dowStr = '1-5';
    else if (daysType === 'weekend') dowStr = '0,6';
    else if (daysType === 'weekly') dowStr = String(weeklyDay);
    setCron(`${mm} ${hh} * * ${dowStr}`);
  };

  const handleSave = () => {
    if (!name.trim()) {
      toast.add({ title: '请输入任务名称', type: 'error' });
      return;
    }

    if (!cronValidation.valid) {
      toast.add({ title: `Cron 格式错误: ${cronValidation.error}`, type: 'error' });
      return;
    }

    let action: ScheduleAction;

    if (actionType === 'branch_merge') {
      if (!repoId) {
        toast.add({ title: '请选择关联的代码仓库', type: 'error' });
        return;
      }
      if (!sourceBranch.trim()) {
        toast.add({ title: '请输入源分支名称', type: 'error' });
        return;
      }
      if (!targetBranch.trim()) {
        toast.add({ title: '请输入目标分支名称', type: 'error' });
        return;
      }
      if (sourceBranch.trim() === targetBranch.trim()) {
        toast.add({ title: '源分支与目标分支不能相同', type: 'error' });
        return;
      }

      const repo = repositories.find((r) => r.id === repoId);
      action = {
        type: 'branch_merge',
        repoId,
        repoName: repo?.name,
        sourceBranch: sourceBranch.trim(),
        targetBranch: targetBranch.trim(),
        strategy,
        aggressiveConflictPreference: strategy === 'aggressive' ? conflictPreference : undefined,
      };
    } else if (actionType === 'jenkins') {
      if (!jenkinsConnId) {
        toast.add({ title: '请选择 Jenkins 连接实例', type: 'error' });
        return;
      }
      if (!jenkinsJobName.trim()) {
        toast.add({ title: '请输入 Jenkins 任务名 (Job)', type: 'error' });
        return;
      }
      action = {
        type: 'jenkins',
        connectionId: jenkinsConnId,
        jobFullName: jenkinsJobName.trim(),
      };
    } else if (actionType === 'pipeline') {
      if (!pipelineId || pipelineId <= 0) {
        toast.add({ title: '请输入有效的云效流水线 ID', type: 'error' });
        return;
      }
      action = {
        type: 'pipeline',
        pipelineId: Number(pipelineId),
        pipelineName: pipelineName.trim() || undefined,
      };
    } else if (actionType === 'sync_workitems') {
      action = { type: 'sync_workitems' };
    } else {
      action = { type: 'scan_branches' };
    }

    if (initialTask) {
      updateTask(initialTask.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        enabled,
        cron,
        cronLabel: cronDescription ?? undefined,
        action,
        notifyOnSuccess,
        notifyOnFailure,
      });
      toast.add({ title: '定时任务已更新', type: 'success' });
    } else {
      addTask({
        name: name.trim(),
        description: description.trim() || undefined,
        enabled,
        cron,
        cronLabel: cronDescription ?? undefined,
        action,
        notifyOnSuccess,
        notifyOnFailure,
      });
      toast.add({ title: '定时任务创建成功', type: 'success' });
    }

    onOpenChange(false);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="right">
      <DrawerContent className="w-full sm:w-[min(44rem,92vw)] sm:max-w-none">
        <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
          {/* 抽屉头部：标题 + 说明 + 关闭（与 ScheduleLogDrawer 同构） */}
          <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-6">
            <div className="flex min-w-0 items-center gap-2.5">
              <CalendarClockIcon className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold tracking-tight">
                  {initialTask ? `编辑定时任务 · ${initialTask.name}` : '新建定时任务'}
                </h2>
                <p className="truncate text-[11px] text-muted-foreground">
                  配置自动化定时调度策略，支持代码分支安全同步、构建自动化与多源数据巡检
                </p>
              </div>
            </div>

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onOpenChange(false)}
                    title="关闭 (Esc)"
                    aria-label="关闭"
                  >
                    <XIcon className="size-4" />
                  </Button>
                }
              />
              <TooltipContent>关闭 (Esc)</TooltipContent>
            </Tooltip>
          </div>

          {/* 抽屉正文：完整 Card 分节 */}
          <ScrollArea className="min-h-0 flex-1 px-6 py-5">
            <div className="flex flex-col gap-4">
              {/* 分节 1：基本信息 */}
              <Card>
                <Card.Header>
                  <div className="flex items-center gap-2">
                    <Card.Title className="text-[13px] font-semibold tracking-tight text-foreground">
                      基本信息
                    </Card.Title>
                  </div>
                </Card.Header>
                <Card.Content className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs text-muted-foreground">
                      任务名称 <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="例如：每日凌晨开发分支向主干安全合入"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs text-muted-foreground">任务描述</Label>
                    <Textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="简要说明此任务的用途与调度场景（选填）"
                    />
                  </div>
                </Card.Content>
              </Card>

              {/* 分节 2：执行动作类型 + 动作专属配置（同一 Card 内分节） */}
              <Card>
                <Card.Header>
                  <div className="flex items-center gap-2">
                    <Card.Title className="text-[13px] font-semibold tracking-tight text-foreground">
                      执行动作类型 <span className="text-destructive">*</span>
                    </Card.Title>
                  </div>
                </Card.Header>
                <Card.Content className="flex flex-col gap-3">
                  {/* 动作选择：TagGroup 单选，仅展示动作名 */}
                  <TagGroup
                    aria-label="执行动作类型"
                    selectionMode="single"
                    disallowEmptySelection
                    size="sm"
                    selectedKeys={new Set([actionType])}
                    onSelectionChange={(keys) => {
                      const key = Array.from(keys)[0];
                      if (key) setActionType(key as ScheduleActionType);
                    }}
                  >
                    <TagGroup.List>
                      {ACTION_OPTIONS.map((option) => (
                        <Tag key={option.value} id={option.value}>
                          <option.icon className="size-3 shrink-0" />
                          {option.label}
                        </Tag>
                      ))}
                    </TagGroup.List>
                  </TagGroup>
                  {/* 选中动作说明：描述置于内容区 */}
                  <p className="text-xs text-muted-foreground">
                    {ACTION_OPTIONS.find((option) => option.value === actionType)?.description}
                  </p>

                  {/* 动作专属配置：同卡分隔线下 */}
                  {actionType === 'branch_merge' && (
                    <div className="flex flex-col gap-3 border-t border-border/50 pt-3">
                      <div className="flex items-center gap-2">
                        <GitMergeIcon className="size-3.5 shrink-0 text-primary" />
                        <span className="text-[13px] font-semibold tracking-tight text-foreground">
                          分支同步配置
                        </span>
                      </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs text-muted-foreground">目标代码仓库</Label>
                      <SearchableSelect
                        value={repoId || null}
                        onValueChange={(val) => setRepoId(val ? Number(val) : 0)}
                        items={repositories.map((repo) => ({
                          label: `${repo.name} (${repo.pathWithNamespace || repo.id})`,
                          value: repo.id,
                        }))}
                        placeholder="搜索或选择目标代码仓库..."
                        className="w-full"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="flex min-w-0 flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs text-muted-foreground">源分支 (Source)</Label>
                          {branchesLoading && (
                            <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                              <Loader2Icon className="size-2.5 animate-spin" />
                              拉取分支...
                            </span>
                          )}
                        </div>
                        <SearchableSelect
                          value={sourceBranch || null}
                          onValueChange={(val) => setSourceBranch(val ? String(val) : '')}
                          items={availableBranches.map((b) => ({ label: b, value: b }))}
                          placeholder="选择或输入源分支..."
                          allowCustomValue
                          className="w-full font-mono"
                        />
                      </div>
                      <div className="flex min-w-0 flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs text-muted-foreground">目标分支 (Target)</Label>
                          {branchesLoading && (
                            <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                              <Loader2Icon className="size-2.5 animate-spin" />
                              拉取分支...
                            </span>
                          )}
                        </div>
                        <SearchableSelect
                          value={targetBranch || null}
                          onValueChange={(val) => setTargetBranch(val ? String(val) : '')}
                          items={availableBranches.map((b) => ({ label: b, value: b }))}
                          placeholder="选择或输入目标分支..."
                          allowCustomValue
                          className="w-full font-mono"
                        />
                      </div>
                    </div>

                    {/* 核心策略选择：谨慎 vs 激进 */}
                    <div className="flex flex-col gap-2 border-t border-border/50 pt-3">
                      <Label className="text-xs text-muted-foreground">合并冲突策略</Label>
                      <RadioGroup
                        aria-label="合并冲突策略"
                        value={strategy}
                        onChange={(value) => setStrategy(value as MergeStrategy)}
                        className="flex flex-col gap-2"
                      >
                        <Radio value="cautious">
                          <Radio.Content className="min-w-0">
                            <Radio.Control>
                              <Radio.Indicator />
                            </Radio.Control>
                            <ShieldAlertIcon className="size-4 shrink-0 text-muted-foreground" />
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span>谨慎策略</span>
                              <Badge variant="outline" color="accent">冲突即终止</Badge>
                            </span>
                          </Radio.Content>
                          <span data-slot="description" className="block">
                            若比对检测到有代码冲突则立即终止，不产生任何修改，零破坏风险。
                          </span>
                        </Radio>

                        <Radio value="aggressive">
                          <Radio.Content className="min-w-0">
                            <Radio.Control>
                              <Radio.Indicator />
                            </Radio.Control>
                            <ShieldCheckIcon className="size-4 shrink-0 text-muted-foreground" />
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span>激进策略</span>
                              <Badge variant="outline" color="warning">零污染隔离</Badge>
                            </span>
                          </Radio.Content>
                          <span data-slot="description" className="block">
                            即使有冲突也自动解决；强制在独立影子隔离分支上操作，严禁污染原分支。
                          </span>
                        </Radio>
                      </RadioGroup>

                      {strategy === 'aggressive' && (
                        <div className="flex flex-col gap-2 rounded-md border border-border/70 bg-muted/20 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <Label className="text-xs text-muted-foreground">冲突自动裁决偏好</Label>
                            <span className="text-[11px] text-muted-foreground/80">
                              同一行代码两端冲突时的裁决策略
                            </span>
                          </div>
                          <RadioGroup
                            aria-label="冲突自动裁决偏好"
                            value={conflictPreference}
                            onChange={(value) =>
                              setConflictPreference(value as AggressiveConflictPreference)
                            }
                            className="flex flex-col gap-1.5"
                          >
                            <Radio value="theirs">
                              <Radio.Content className="min-w-0">
                                <Radio.Control>
                                  <Radio.Indicator />
                                </Radio.Control>
                                <span className="flex min-w-0 items-center gap-1.5">
                                  <span>偏向源分支 (Theirs)</span>
                                  <Badge variant="outline" color="accent">新代码优先</Badge>
                                </span>
                              </Radio.Content>
                              <span data-slot="description" className="block">
                                代码冲突时，自动以源分支（如{' '}
                                <span className="break-all font-mono text-foreground">
                                  {sourceBranch || 'dev'}
                                </span>
                                ）的新改为准覆盖目标分支，适合新功能冲刺迭代。
                              </span>
                            </Radio>

                            <Radio value="ours">
                              <Radio.Content className="min-w-0">
                                <Radio.Control>
                                  <Radio.Indicator />
                                </Radio.Control>
                                <span className="flex min-w-0 items-center gap-1.5">
                                  <span>偏向目标分支 (Ours)</span>
                                  <Badge variant="outline" color="success">主干稳定优先</Badge>
                                </span>
                              </Radio.Content>
                              <span data-slot="description" className="block">
                                代码冲突时，保留目标分支（如{' '}
                                <span className="break-all font-mono text-foreground">
                                  {targetBranch || 'master'}
                                </span>
                                ）原本的代码，丢弃冲突改动，确保生产基线稳定。
                              </span>
                            </Radio>

                            <Radio value="isolated_pr">
                              <Radio.Content className="min-w-0">
                                <Radio.Control>
                                  <Radio.Indicator />
                                </Radio.Control>
                                <span className="flex min-w-0 items-center gap-1.5">
                                  <span>生成隔离 MR 审查</span>
                                  <Badge variant="outline" color="warning">推荐 · 人工裁决</Badge>
                                </span>
                              </Radio.Content>
                              <span data-slot="description" className="block">
                                机器不自动覆盖。在影子分支完整保留冲突现场并发起 MR，由负责人人工比对与核准，零污染且最安全。
                              </span>
                            </Radio>
                          </RadioGroup>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {actionType === 'jenkins' && (
                  <div className="flex flex-col gap-3 border-t border-border/50 pt-3">
                    <div className="flex items-center gap-2">
                      <PlayCircleIcon className="size-3.5 shrink-0 text-primary" />
                      <span className="text-[13px] font-semibold tracking-tight text-foreground">
                        Jenkins 构建配置
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs text-muted-foreground">Jenkins 实例连接</Label>
                      <Select
                        value={jenkinsConnId || ''}
                        onValueChange={(val) => setJenkinsConnId(val || '')}
                        aria-label="Jenkins 实例连接"
                        className="w-full"
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="选择 Jenkins 连接..." />
                        </SelectTrigger>
                        <SelectContent>
                          {(settings?.jenkinsConnections || []).map((conn) => (
                            <SelectItem key={conn.id} value={conn.id}>
                              {conn.name} ({conn.baseUrl})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs text-muted-foreground">Job 全名 / 路径 (FullName)</Label>
                      <Input
                        value={jenkinsJobName}
                        onChange={(e) => setJenkinsJobName(e.target.value)}
                        placeholder="例如: frontend-app/release-build"
                        className="font-mono"
                      />
                    </div>
                  </div>
                )}

                {actionType === 'pipeline' && (
                  <div className="flex flex-col gap-3 border-t border-border/50 pt-3">
                    <div className="flex items-center gap-2">
                      <WorkflowIcon className="size-3.5 shrink-0 text-primary" />
                      <span className="text-[13px] font-semibold tracking-tight text-foreground">
                        云效 Flow 配置
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs text-muted-foreground">流水线 ID (Pipeline ID)</Label>
                      <Input
                        type="number"
                        value={pipelineId || ''}
                        onChange={(e) => setPipelineId(Number(e.target.value))}
                        placeholder="云效流水线数字 ID，如 123456"
                        className="font-mono"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs text-muted-foreground">流水线名称备注 (选填)</Label>
                      <Input
                        value={pipelineName}
                        onChange={(e) => setPipelineName(e.target.value)}
                        placeholder="例如: 主应用生产发布流水线"
                      />
                    </div>
                  </div>
                )}
                </Card.Content>
              </Card>

              {/* 分节 3：调度频率 */}
              <Card>
                <Card.Header>
                  <div className="flex items-center justify-between gap-2">
                    <Card.Title className="text-[13px] font-semibold tracking-tight text-foreground">
                      自动执行时间 (调度频率) <span className="text-destructive">*</span>
                    </Card.Title>
                    {cronDescription && (
                      <span className="shrink-0 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        {cronDescription}
                      </span>
                    )}
                  </div>
                </Card.Header>
                <Card.Content className="flex flex-col gap-2.5">
                  <Tabs
                    value={freqMode}
                    onValueChange={(val) => handleFreqModeSelect(val as FreqMode)}
                  >
                    <TabsList containerClassName="w-full" className="grid w-full grid-cols-4">
                      <TabsTrigger value="preset">
                        <SparklesIcon className="size-3 shrink-0" />
                        <span className="truncate">常用推荐</span>
                      </TabsTrigger>
                      <TabsTrigger value="interval">
                        <ClockIcon className="size-3 shrink-0" />
                        <span className="truncate">循环间隔</span>
                      </TabsTrigger>
                      <TabsTrigger value="daily">
                        <CalendarClockIcon className="size-3 shrink-0" />
                        <span className="truncate">固定时间</span>
                      </TabsTrigger>
                      <TabsTrigger value="cron">
                        <TerminalIcon className="size-3 shrink-0" />
                        <span className="truncate">Cron 专家</span>
                      </TabsTrigger>
                    </TabsList>

                    {/* Tab 1: 常用推荐模式 */}
                    <TabsContent value="preset" className="mt-2.5">
                      <Select
                        value={preset}
                        onValueChange={(val) => handlePresetChange(val || '')}
                        aria-label="选择预设频率"
                        className="w-full"
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="请选择预设频率..." />
                        </SelectTrigger>
                        <SelectContent>
                          {CRON_PRESETS.map((p) => (
                            <SelectItem key={p.value} value={p.value}>
                              {p.label} · {p.description}
                            </SelectItem>
                          ))}
                          <SelectItem value="custom">自定义 Cron 表达式 (高级设置)...</SelectItem>
                        </SelectContent>
                      </Select>
                    </TabsContent>

                    {/* Tab 2: 循环间隔模式 (每 N 分钟/小时) */}
                    <TabsContent value="interval" className="mt-2.5">
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="shrink-0 text-xs text-muted-foreground">每隔</span>
                          <Input
                            type="number"
                            min={1}
                            max={intervalUnit === 'minute' ? 59 : 23}
                            value={intervalValue}
                            onChange={(e) =>
                              handleIntervalChange(parseInt(e.target.value, 10) || 1, intervalUnit)
                            }
                            className="w-16 font-mono"
                          />
                          <TagGroup
                            aria-label="间隔单位"
                            selectionMode="single"
                            disallowEmptySelection
                            size="sm"
                            className="shrink-0"
                            selectedKeys={new Set([`unit-${intervalUnit}`])}
                            onSelectionChange={(keys) => {
                              const key = Array.from(keys)[0];
                              if (key === 'unit-minute' || key === 'unit-hour') {
                                handleIntervalChange(intervalValue, key === 'unit-hour' ? 'hour' : 'minute');
                              }
                            }}
                          >
                            <TagGroup.List>
                              <Tag id="unit-minute">分钟</Tag>
                              <Tag id="unit-hour">小时</Tag>
                            </TagGroup.List>
                          </TagGroup>
                          <span className="text-xs text-muted-foreground">执行一次</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span className="shrink-0">快速选择：</span>
                          <TagGroup
                            aria-label="快速选择间隔"
                            selectionMode="single"
                            disallowEmptySelection
                            size="sm"
                            className="min-w-0"
                            selectedKeys={
                              new Set(
                                QUICK_INTERVALS.filter(
                                  (item) => intervalValue === item.val && intervalUnit === item.unit
                                ).map((item) => `quick-${item.val}-${item.unit}`)
                              )
                            }
                            onSelectionChange={(keys) => {
                              const key = Array.from(keys)[0];
                              const hit = QUICK_INTERVALS.find(
                                (item) => `quick-${item.val}-${item.unit}` === key
                              );
                              if (hit) handleIntervalChange(hit.val, hit.unit);
                            }}
                          >
                            <TagGroup.List>
                              {QUICK_INTERVALS.map((item) => (
                                <Tag key={item.label} id={`quick-${item.val}-${item.unit}`}>
                                  {item.label}
                                </Tag>
                              ))}
                            </TagGroup.List>
                          </TagGroup>
                        </div>
                      </div>
                    </TabsContent>

                    {/* Tab 3: 固定时间模式 (每天/工作日/周末/每周几的 HH:mm) */}
                    <TabsContent value="daily" className="mt-2.5">
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="shrink-0 text-xs text-muted-foreground">在每个</span>
                          <TagGroup
                            aria-label="固定日期类型"
                            selectionMode="single"
                            disallowEmptySelection
                            size="sm"
                            className="shrink-0"
                            selectedKeys={new Set([`days-${fixedDaysType}`])}
                            onSelectionChange={(keys) => {
                              const key = Array.from(keys)[0];
                              const hit = DAYS_TYPE_OPTIONS.find((item) => `days-${item.value}` === key);
                              if (hit) handleFixedTimeChange(fixedTime, hit.value, fixedWeeklyDay);
                            }}
                          >
                            <TagGroup.List>
                              {DAYS_TYPE_OPTIONS.map((item) => (
                                <Tag key={item.value} id={`days-${item.value}`}>
                                  {item.label}
                                </Tag>
                              ))}
                            </TagGroup.List>
                          </TagGroup>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {fixedDaysType === 'weekly' && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="shrink-0 text-xs text-muted-foreground">逢</span>
                              <TagGroup
                                aria-label="每周执行日"
                                selectionMode="single"
                                disallowEmptySelection
                                size="sm"
                                className="shrink-0"
                                selectedKeys={new Set([`dow-${fixedWeeklyDay}`])}
                                onSelectionChange={(keys) => {
                                  const key = Array.from(keys)[0];
                                  const hit = WEEKDAY_OPTIONS.find((item) => `dow-${item.day}` === key);
                                  if (hit) handleFixedTimeChange(fixedTime, fixedDaysType, hit.day);
                                }}
                              >
                                <TagGroup.List>
                                  {WEEKDAY_OPTIONS.map((item) => (
                                    <Tag key={item.day} id={`dow-${item.day}`}>
                                      {item.label}
                                    </Tag>
                                  ))}
                                </TagGroup.List>
                              </TagGroup>
                            </div>
                          )}

                          <div className="flex items-center gap-1.5">
                            <span className="shrink-0 text-xs text-muted-foreground">时间</span>
                            <TimeField
                              aria-label="执行时间"
                              hourCycle={24}
                              shouldForceLeadingZeros
                              value={toTimeValue(fixedTime)}
                              onChange={(v) =>
                                handleFixedTimeChange(fromTimeValue(v), fixedDaysType, fixedWeeklyDay)
                              }
                            >
                              <TimeField.Group className="font-mono tabular-nums">
                                <TimeField.Input>
                                  {(segment) => <TimeField.Segment key={segment.type} segment={segment} />}
                                </TimeField.Input>
                                <TimeField.Suffix>
                                  <ClockIcon className="size-3.5 text-muted-foreground" />
                                </TimeField.Suffix>
                              </TimeField.Group>
                            </TimeField>
                          </div>
                        </div>
                      </div>
                    </TabsContent>

                    {/* Tab 4: Cron 专家模式 */}
                    <TabsContent value="cron" className="mt-2.5">
                      <div className="flex flex-col gap-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <span className="text-[11px] text-muted-foreground">
                            标准 5 段式 Cron 表达式（分 时 日 月 周）
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground/70">
                            * 代表任意，*/N 代表步长
                          </span>
                        </div>
                        <Input
                          value={cron}
                          onChange={(e) => {
                            setCron(e.target.value);
                            setPreset('custom');
                          }}
                          placeholder="例如: 0 2 * * *"
                          className={cn('font-mono', !cronValidation.valid && 'border-destructive')}
                        />
                        {!cronValidation.valid && (
                          <p className="flex items-center gap-1 text-[11px] text-destructive">
                            <AlertTriangleIcon className="size-3 shrink-0" />
                            <span>{cronValidation.error}</span>
                          </p>
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>

                  {/* Cron 表达式预览与预计接下来执行时间（HeroUI Alert 标准槽位：Indicator + Title/Description） */}
                  <Alert status="default">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Title className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                        <span className="shrink-0">预计接下来的执行时间：</span>
                        <span className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] font-normal text-muted-foreground">
                          Cron 规则:
                          <Chip size="sm" variant="soft" color="accent" className="max-w-56 truncate font-mono">
                            {cron}
                          </Chip>
                        </span>
                      </Alert.Title>
                      {nextRuns.length > 0 ? (
                        // Alert.Description 渲染为 span：直接以 grid 布局承载时间项，避免块级元素嵌进短语内容
                        <Alert.Description className="grid w-full grid-cols-1 gap-1 pt-0.5 font-mono text-[11px] sm:grid-cols-2">
                          {nextRuns.map((time, idx) => (
                            <span key={idx} className="flex min-w-0 items-center gap-1.5">
                              <span className="size-1 shrink-0 rounded-full bg-primary" />
                              <span className="truncate">
                                {time.toLocaleString('zh-CN', {
                                  month: '2-digit',
                                  day: '2-digit',
                                  weekday: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  hour12: false,
                                })}
                              </span>
                            </span>
                          ))}
                        </Alert.Description>
                      ) : (
                        <Alert.Description className="text-destructive">
                          当前表达式无有效执行时间，请检查输入格式
                        </Alert.Description>
                      )}
                    </Alert.Content>
                  </Alert>
                </Card.Content>
              </Card>

              {/* 分节 4：运行与通知 */}
              <Card>
                <Card.Header>
                  <div className="flex items-center gap-2">
                    <Card.Title className="text-[13px] font-semibold tracking-tight text-foreground">
                      运行与通知
                    </Card.Title>
                  </div>
                </Card.Header>
                <Card.Content className="flex flex-col divide-y divide-border/50">
                  <div className="flex items-center justify-between gap-4 py-2 first:pt-0">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-foreground">启用此任务</p>
                      <p className="text-[11px] text-muted-foreground">关闭后调度器将跳过此任务的触发</p>
                    </div>
                    <Switch checked={enabled} onCheckedChange={setEnabled} />
                  </div>
                  <div className="flex items-center justify-between gap-4 py-2 first:pt-0">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-foreground">成功发送通知</p>
                      <p className="text-[11px] text-muted-foreground">任务执行成功时发送桌面通知</p>
                    </div>
                    <Switch checked={notifyOnSuccess} onCheckedChange={setNotifyOnSuccess} />
                  </div>
                  <div className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-foreground">失败告警通知</p>
                      <p className="text-[11px] text-muted-foreground">任务报错或冲突终止时立即告警</p>
                    </div>
                    <Switch checked={notifyOnFailure} onCheckedChange={setNotifyOnFailure} />
                  </div>
                </Card.Content>
              </Card>
            </div>
          </ScrollArea>

          {/* 抽屉底部操作栏 */}
          <div className="flex h-14 shrink-0 items-center justify-end gap-2 border-t border-border bg-background px-6">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button onClick={handleSave}>
              <CheckIcon className="size-3.5" />
              {initialTask ? '保存修改' : '创建任务'}
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
