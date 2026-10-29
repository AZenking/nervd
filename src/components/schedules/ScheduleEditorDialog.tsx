import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangleIcon,
  CalendarClockIcon,
  CheckIcon,
  ClockIcon,
  GitMergeIcon,
  HelpCircleIcon,
  Loader2Icon,
  PlayCircleIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TerminalIcon,
  WorkflowIcon,
} from 'lucide-react';
import * as api from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

export interface ScheduleEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTask?: ScheduledTask | null;
}

export function ScheduleEditorDialog({
  open,
  onOpenChange,
  initialTask,
}: ScheduleEditorDialogProps) {
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

  // 当选择的代码仓库变更且处于弹窗打开态时，异步获取该仓库的所有远端分支
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
  type FreqMode = 'preset' | 'interval' | 'daily' | 'cron';
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
      setName(initialTask.name);
      setDescription(initialTask.description ?? '');
      setEnabled(initialTask.enabled);
      setCron(initialTask.cron);
      setNotifyOnSuccess(initialTask.notifyOnSuccess);
      setNotifyOnFailure(initialTask.notifyOnFailure);

      const matchedPreset = CRON_PRESETS.find((p) => p.value === initialTask.cron);
      setPreset(matchedPreset ? matchedPreset.value : 'custom');
      if (matchedPreset) {
        setFreqMode('preset');
      } else {
        // 尝试判断是否是固定时间模式（如 0 2 * * *）或周期模式（如 */10 * * * *）
        const parts = initialTask.cron.trim().split(/\s+/);
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

      const act = initialTask.action;
      setActionType(act.type);
      if (act.type === 'branch_merge') {
        setRepoId(act.repoId);
        setSourceBranch(act.sourceBranch);
        setTargetBranch(act.targetBranch);
        setStrategy(act.strategy);
        if (act.aggressiveConflictPreference) {
          setConflictPreference(act.aggressiveConflictPreference);
        }
      } else if (act.type === 'jenkins') {
        setJenkinsConnId(act.connectionId);
        setJenkinsJobName(act.jobFullName);
      } else if (act.type === 'pipeline') {
        setPipelineId(act.pipelineId);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[88vh] flex flex-col p-5 overflow-hidden">
        <DialogHeader className="shrink-0 pb-1">
          <DialogTitle
            className="truncate"
            title={initialTask ? `编辑任务 · ${initialTask.name}` : '新建定时任务'}
          >
            {initialTask ? `编辑任务 · ${initialTask.name}` : '新建定时任务'}
          </DialogTitle>
          <DialogDescription>
            配置自动化定时调度策略，支持代码分支安全同步、构建自动化与多源数据巡检。
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden space-y-4 py-2 pr-1 text-xs">
          {/* 任务基本信息 */}
          <div className="space-y-2">
            <Label className="font-medium text-foreground block">
              任务名称 <span className="text-destructive">*</span>
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：每日凌晨开发分支向主干安全合入"
              className="text-xs"
            />
          </div>

          <div className="space-y-2">
            <Label className="font-medium text-foreground block">任务描述</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简要说明此任务的用途与调度场景（选填）"
              className="text-xs min-h-14"
            />
          </div>

          {/* 调度动作类型 */}
          <div className="space-y-2">
            <Label className="font-medium text-foreground block">
              执行动作类型 <span className="text-destructive">*</span>
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setActionType('branch_merge')}
                className={cn(
                  'h-auto flex flex-col items-start p-2.5 rounded-md text-left transition-colors whitespace-normal min-w-0 w-full',
                  actionType === 'branch_merge'
                    ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary'
                    : 'border-border/60 hover:bg-muted/40 text-muted-foreground',
                )}
              >
                <div className="flex items-center gap-1.5 font-medium text-foreground text-xs min-w-0">
                  <GitMergeIcon className="size-3.5 text-primary shrink-0" />
                  <span className="truncate">分支安全同步</span>
                </div>
                <span className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                  谨慎/激进(零污染)
                </span>
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => setActionType('jenkins')}
                className={cn(
                  'h-auto flex flex-col items-start p-2.5 rounded-md text-left transition-colors whitespace-normal min-w-0 w-full',
                  actionType === 'jenkins'
                    ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary'
                    : 'border-border/60 hover:bg-muted/40 text-muted-foreground',
                )}
              >
                <div className="flex items-center gap-1.5 font-medium text-foreground text-xs min-w-0">
                  <PlayCircleIcon className="size-3.5 text-primary shrink-0" />
                  <span className="truncate">Jenkins 构建</span>
                </div>
                <span className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                  触发远程 Jenkins Job
                </span>
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => setActionType('pipeline')}
                className={cn(
                  'h-auto flex flex-col items-start p-2.5 rounded-md text-left transition-colors whitespace-normal min-w-0 w-full',
                  actionType === 'pipeline'
                    ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary'
                    : 'border-border/60 hover:bg-muted/40 text-muted-foreground',
                )}
              >
                <div className="flex items-center gap-1.5 font-medium text-foreground text-xs min-w-0">
                  <WorkflowIcon className="size-3.5 text-emerald-500 shrink-0" />
                  <span className="truncate">云效 Flow 流水线</span>
                </div>
                <span className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                  运行云效 CI 交付流水线
                </span>
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => setActionType('sync_workitems')}
                className={cn(
                  'h-auto flex flex-col items-start p-2.5 rounded-md text-left transition-colors whitespace-normal min-w-0 w-full',
                  actionType === 'sync_workitems'
                    ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary'
                    : 'border-border/60 hover:bg-muted/40 text-muted-foreground',
                )}
              >
                <div className="flex items-center gap-1.5 font-medium text-foreground text-xs min-w-0">
                  <RefreshCwIcon className="size-3.5 text-amber-500 shrink-0" />
                  <span className="truncate">同步云效需求</span>
                </div>
                <span className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                  定时拉取工作项/迭代
                </span>
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => setActionType('scan_branches')}
                className={cn(
                  'h-auto flex flex-col items-start p-2.5 rounded-md text-left transition-colors whitespace-normal min-w-0 w-full',
                  actionType === 'scan_branches'
                    ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary'
                    : 'border-border/60 hover:bg-muted/40 text-muted-foreground',
                )}
              >
                <div className="flex items-center gap-1.5 font-medium text-foreground text-xs min-w-0">
                  <RefreshCwIcon className="size-3.5 text-purple-400 shrink-0" />
                  <span className="truncate">集成分支巡检</span>
                </div>
                <span className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                  定时比对落差与超前
                </span>
              </Button>
            </div>
          </div>

          {/* 分支同步专属配置 */}
          {actionType === 'branch_merge' && (
            <div className="rounded-md border border-border/70 bg-card/40 p-3 space-y-3">
              <div className="flex items-center gap-2 text-foreground font-medium text-xs">
                <GitMergeIcon className="size-4 text-primary" />
                <span>分支合并与策略配置</span>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] font-medium text-muted-foreground block">
                  目标代码仓库
                </Label>
                <SearchableSelect
                  value={repoId || null}
                  onValueChange={(val) => setRepoId(val ? Number(val) : 0)}
                  items={repositories.map((repo) => ({
                    label: `${repo.name} (${repo.pathWithNamespace || repo.id})`,
                    value: repo.id,
                  }))}
                  placeholder="搜索或选择目标代码仓库..."
                  className="w-full text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] font-medium text-muted-foreground block">
                      源分支 (Source)
                    </Label>
                    {branchesLoading && (
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
                        <Loader2Icon className="size-2.5 animate-spin" />
                        拉取分支...
                      </span>
                    )}
                  </div>
                  <SearchableSelect
                    value={sourceBranch || null}
                    onValueChange={(val) => setSourceBranch(val ? String(val) : '')}
                    items={availableBranches.map((b) => ({
                      label: b,
                      value: b,
                    }))}
                    placeholder="选择或输入源分支..."
                    allowCustomValue
                    className="w-full text-xs font-mono"
                  />
                </div>
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] font-medium text-muted-foreground block">
                      目标分支 (Target)
                    </Label>
                    {branchesLoading && (
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
                        <Loader2Icon className="size-2.5 animate-spin" />
                        拉取分支...
                      </span>
                    )}
                  </div>
                  <SearchableSelect
                    value={targetBranch || null}
                    onValueChange={(val) => setTargetBranch(val ? String(val) : '')}
                    items={availableBranches.map((b) => ({
                      label: b,
                      value: b,
                    }))}
                    placeholder="选择或输入目标分支..."
                    allowCustomValue
                    className="w-full text-xs font-mono"
                  />
                </div>
              </div>

              {/* 核心策略选择：谨慎 vs 激进 */}
              <div className="space-y-2 pt-1 border-t border-border/50">
                <Label className="text-[11px] font-medium text-muted-foreground block">
                  合并冲突策略
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStrategy('cautious')}
                    className={cn(
                      'h-auto flex items-start gap-2.5 p-2.5 rounded-md text-left transition-colors whitespace-normal min-w-0 w-full',
                      strategy === 'cautious'
                        ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary'
                        : 'border-border/60 hover:bg-muted/40 text-muted-foreground',
                    )}
                  >
                    <ShieldAlertIcon className="size-4 text-blue-400 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                        <span>谨慎策略</span>
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1 py-0 border-blue-500/30 text-blue-400 shrink-0"
                        >
                          冲突即终止
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-normal">
                        若比对检测到有代码冲突则立即终止，不产生任何修改，零破坏风险。
                      </p>
                    </div>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStrategy('aggressive')}
                    className={cn(
                      'h-auto flex items-start gap-2.5 p-2.5 rounded-md text-left transition-colors whitespace-normal min-w-0 w-full',
                      strategy === 'aggressive'
                        ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary'
                        : 'border-border/60 hover:bg-muted/40 text-muted-foreground',
                    )}
                  >
                    <ShieldCheckIcon className="size-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                        <span>激进策略</span>
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1 py-0 border-amber-500/30 text-amber-400 shrink-0"
                        >
                          零污染隔离
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-normal">
                        即使有冲突也自动解决；强制在独立影子隔离分支上操作，严禁污染原分支。
                      </p>
                    </div>
                  </Button>
                </div>

                {strategy === 'aggressive' && (
                  <div className="rounded-md border border-border/70 bg-muted/20 p-2.5 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-medium text-amber-500 shrink-0">
                        <HelpCircleIcon className="size-3.5 shrink-0" />
                        <span>激进冲突自动裁决偏好</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        同一行代码两端冲突时的裁决策略
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setConflictPreference('theirs')}
                        className={cn(
                          'h-auto flex flex-col items-start p-2 rounded-md text-left transition-colors whitespace-normal min-w-0 w-full',
                          conflictPreference === 'theirs'
                            ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary'
                            : 'border-border/60 hover:bg-muted/40 text-muted-foreground bg-card/40',
                        )}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                            <span
                              className={cn(
                                'size-1.5 rounded-full shrink-0',
                                conflictPreference === 'theirs' ? 'bg-primary' : 'bg-muted-foreground/40',
                              )}
                            />
                            偏向源分支 (Theirs)
                          </span>
                          <Badge
                            variant="outline"
                            className="text-[9px] px-1 py-0 border-blue-500/30 text-blue-400 shrink-0"
                          >
                            新代码优先
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed break-words">
                          代码冲突时，自动以源分支（如 <span className="font-mono text-foreground break-all">{sourceBranch || 'dev'}</span>）的新改为准覆盖目标分支，适合新功能冲刺迭代。
                        </p>
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setConflictPreference('ours')}
                        className={cn(
                          'h-auto flex flex-col items-start p-2 rounded-md text-left transition-colors whitespace-normal min-w-0 w-full',
                          conflictPreference === 'ours'
                            ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary'
                            : 'border-border/60 hover:bg-muted/40 text-muted-foreground bg-card/40',
                        )}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                            <span
                              className={cn(
                                'size-1.5 rounded-full shrink-0',
                                conflictPreference === 'ours' ? 'bg-primary' : 'bg-muted-foreground/40',
                              )}
                            />
                            偏向目标分支 (Ours)
                          </span>
                          <Badge
                            variant="outline"
                            className="text-[9px] px-1 py-0 border-emerald-500/30 text-emerald-400 shrink-0"
                          >
                            主干稳定优先
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed break-words">
                          代码冲突时，保留目标分支（如 <span className="font-mono text-foreground break-all">{targetBranch || 'master'}</span>）原本的代码，丢弃冲突改动，确保生产基线稳定。
                        </p>
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setConflictPreference('isolated_pr')}
                        className={cn(
                          'h-auto flex flex-col items-start p-2 rounded-md text-left transition-colors whitespace-normal min-w-0 w-full',
                          conflictPreference === 'isolated_pr'
                            ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary'
                            : 'border-border/60 hover:bg-muted/40 text-muted-foreground bg-card/40',
                        )}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                            <span
                              className={cn(
                                'size-1.5 rounded-full shrink-0',
                                conflictPreference === 'isolated_pr' ? 'bg-primary' : 'bg-muted-foreground/40',
                              )}
                            />
                            生成隔离 MR 审查
                          </span>
                          <Badge
                            variant="outline"
                            className="text-[9px] px-1 py-0 border-amber-500/30 text-amber-500 bg-amber-500/10 shrink-0"
                          >
                            推荐 · 人工裁决
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed break-words">
                          机器不自动覆盖。在影子分支完整保留冲突现场并发起 MR，由负责人人工比对与核准，零污染且最安全。
                        </p>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Jenkins 配置 */}
          {actionType === 'jenkins' && (
            <div className="rounded-md border border-border/70 bg-card/40 p-3 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-medium text-muted-foreground block">
                  Jenkins 实例连接
                </Label>
                <SearchableSelect
                  value={jenkinsConnId || null}
                  onValueChange={(val) => setJenkinsConnId(val ? String(val) : '')}
                  items={(settings?.jenkinsConnections || []).map((conn) => ({
                    label: `${conn.name} (${conn.baseUrl})`,
                    value: conn.id,
                  }))}
                  placeholder="选择 Jenkins 连接..."
                  className="w-full text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] font-medium text-muted-foreground block">
                  Job 全名 / 路径 (FullName)
                </Label>
                <Input
                  value={jenkinsJobName}
                  onChange={(e) => setJenkinsJobName(e.target.value)}
                  placeholder="例如: frontend-app/release-build"
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
          )}

          {/* 云效 Flow 配置 */}
          {actionType === 'pipeline' && (
            <div className="rounded-md border border-border/70 bg-card/40 p-3 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-medium text-muted-foreground block">
                  流水线 ID (Pipeline ID)
                </Label>
                <Input
                  type="number"
                  value={pipelineId || ''}
                  onChange={(e) => setPipelineId(Number(e.target.value))}
                  placeholder="云效流水线数字 ID，如 123456"
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-medium text-muted-foreground block">
                  流水线名称备注 (选填)
                </Label>
                <Input
                  value={pipelineName}
                  onChange={(e) => setPipelineName(e.target.value)}
                  placeholder="例如: 主应用生产发布流水线"
                  className="h-8 text-xs"
                />
              </div>
            </div>
          )}

          {/* 执行时间与频率 */}
          <div className="space-y-3 pt-2 border-t border-border/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <ClockIcon className="size-3.5 text-primary" />
                <Label className="font-medium text-foreground text-xs block">
                  自动执行时间 (调度频率) <span className="text-destructive">*</span>
                </Label>
              </div>

              {cronDescription && (
                <span className="text-[11px] text-emerald-400 font-medium">
                  {cronDescription}
                </span>
              )}
            </div>

            <div className="space-y-2.5">
              {/* 分段模式切换 Tabs: 常用推荐 / 循环间隔 / 固定时间 / Cron 专家 */}
              <Tabs
                value={freqMode}
                onValueChange={(val) => handleFreqModeSelect(val as FreqMode)}
                className="w-full space-y-2.5"
              >
                <TabsList size="lg" className="w-full grid grid-cols-4 rounded-lg">
                  <TabsTrigger
                    value="preset"
                    className="min-w-0"
                  >
                    <SparklesIcon className="size-3 mr-1 text-primary shrink-0" />
                    <span className="truncate">常用推荐</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="interval"
                    className="min-w-0"
                  >
                    <ClockIcon className="size-3 mr-1 text-blue-500 shrink-0" />
                    <span className="truncate">循环间隔</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="daily"
                    className="min-w-0"
                  >
                    <CalendarClockIcon className="size-3 mr-1 text-amber-500 shrink-0" />
                    <span className="truncate">固定时间</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="cron"
                    className="min-w-0"
                  >
                    <TerminalIcon className="size-3 mr-1 text-purple-500 shrink-0" />
                    <span className="truncate">Cron 专家</span>
                  </TabsTrigger>
                </TabsList>

                {/* Tab 1: 常用推荐模式 */}
                <TabsContent value="preset" className="mt-0 space-y-2 focus-visible:outline-none">
                  <SearchableSelect
                    value={preset}
                    onValueChange={(val) => {
                      const selected = val ? String(val) : '';
                      handlePresetChange(selected);
                    }}
                    items={[
                      ...CRON_PRESETS.map((p) => ({
                        label: `${p.label} · ${p.description}`,
                        value: p.value,
                      })),
                      {
                        label: '自定义 Cron 表达式 (高级设置)...',
                        value: 'custom',
                      },
                    ]}
                    placeholder="请选择预设频率..."
                    className="w-full text-xs"
                  />
                </TabsContent>

                {/* Tab 2: 循环间隔模式 (每 N 分钟/小时) */}
                <TabsContent value="interval" className="mt-0 focus-visible:outline-none">
                  <div className="rounded-md border border-border/70 bg-card/40 p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground shrink-0">每隔</span>
                      <Input
                        type="number"
                        min={1}
                        max={intervalUnit === 'minute' ? 59 : 23}
                        value={intervalValue}
                        onChange={(e) =>
                          handleIntervalChange(
                            parseInt(e.target.value, 10) || 1,
                            intervalUnit,
                          )
                        }
                        className="w-20 h-8 text-xs font-mono"
                      />
                      <div className="inline-flex rounded-md border border-border/70 bg-muted/30 p-0.5 shrink-0">
                        <Button
                          type="button"
                          variant={intervalUnit === 'minute' ? 'default' : 'ghost'}
                          size="xs"
                          onClick={() => handleIntervalChange(intervalValue, 'minute')}
                          className={cn(
                            'h-6 px-2.5 text-xs rounded-sm transition-colors',
                            intervalUnit === 'minute'
                              ? 'bg-primary text-primary-foreground font-medium shadow-xs'
                              : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          分钟
                        </Button>
                        <Button
                          type="button"
                          variant={intervalUnit === 'hour' ? 'default' : 'ghost'}
                          size="xs"
                          onClick={() => handleIntervalChange(intervalValue, 'hour')}
                          className={cn(
                            'h-6 px-2.5 text-xs rounded-sm transition-colors',
                            intervalUnit === 'hour'
                              ? 'bg-primary text-primary-foreground font-medium shadow-xs'
                              : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          小时
                        </Button>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">执行一次</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-muted-foreground">
                      <span className="text-muted-foreground/70 shrink-0">快速选择:</span>
                      {[
                        { label: '每 5 分钟', val: 5, unit: 'minute' as const },
                        { label: '每 15 分钟', val: 15, unit: 'minute' as const },
                        { label: '每 30 分钟', val: 30, unit: 'minute' as const },
                        { label: '每 1 小时', val: 1, unit: 'hour' as const },
                        { label: '每 2 小时', val: 2, unit: 'hour' as const },
                      ].map((item) => (
                        <Button
                          key={item.label}
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={() => handleIntervalChange(item.val, item.unit)}
                          className={cn(
                            'h-5 px-1.5 rounded text-[10px] border border-border/50 hover:border-primary/50 transition-colors shrink-0',
                            intervalValue === item.val && intervalUnit === item.unit
                              ? 'bg-primary/10 text-primary border-primary hover:bg-primary/15'
                              : 'bg-muted/30 text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {item.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </TabsContent>

                {/* Tab 3: 固定时间模式 (每天/工作日/周末/每周几的 HH:mm) */}
                <TabsContent value="daily" className="mt-0 focus-visible:outline-none">
                  <div className="rounded-md border border-border/70 bg-card/40 p-3 space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground shrink-0">在每个</span>
                      <div className="inline-flex flex-wrap rounded-md border border-border/70 bg-muted/30 p-0.5">
                        {[
                          { label: '每天', value: 'everyday' as const },
                          { label: '工作日 (周一至周五)', value: 'workday' as const },
                          { label: '周末 (周六日)', value: 'weekend' as const },
                          { label: '每周特定日', value: 'weekly' as const },
                        ].map((item) => (
                          <Button
                            key={item.value}
                            type="button"
                            variant={fixedDaysType === item.value ? 'default' : 'ghost'}
                            size="xs"
                            onClick={() =>
                              handleFixedTimeChange(
                                fixedTime,
                                item.value,
                                fixedWeeklyDay,
                              )
                            }
                            className={cn(
                              'h-6 px-2 text-xs rounded-sm transition-colors',
                              fixedDaysType === item.value
                                ? 'bg-primary text-primary-foreground font-medium shadow-xs'
                                : 'text-muted-foreground hover:text-foreground',
                            )}
                          >
                            {item.label}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {fixedDaysType === 'weekly' && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-muted-foreground shrink-0">逢</span>
                          <div className="inline-flex flex-wrap rounded-md border border-border/70 bg-muted/30 p-0.5">
                            {[
                              { label: '周一', day: 1 },
                              { label: '周二', day: 2 },
                              { label: '周三', day: 3 },
                              { label: '周四', day: 4 },
                              { label: '周五', day: 5 },
                              { label: '周六', day: 6 },
                              { label: '周日', day: 0 },
                            ].map((item) => (
                              <Button
                                key={item.day}
                                type="button"
                                variant={fixedWeeklyDay === item.day ? 'default' : 'ghost'}
                                size="xs"
                                onClick={() =>
                                  handleFixedTimeChange(
                                    fixedTime,
                                    fixedDaysType,
                                    item.day,
                                  )
                                }
                                className={cn(
                                  'h-6 px-1.5 text-xs rounded-sm transition-colors',
                                  fixedWeeklyDay === item.day
                                    ? 'bg-primary text-primary-foreground font-medium shadow-xs'
                                    : 'text-muted-foreground hover:text-foreground',
                                )}
                              >
                                {item.label}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-xs text-muted-foreground shrink-0">时间</span>
                        <Input
                          type="time"
                          value={fixedTime}
                          onChange={(e) =>
                            handleFixedTimeChange(
                              e.target.value || '02:00',
                              fixedDaysType,
                              fixedWeeklyDay,
                            )
                          }
                          className="w-28 h-8 text-xs font-mono"
                        />
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* Tab 4: Cron 专家模式 */}
                <TabsContent value="cron" className="mt-0 focus-visible:outline-none">
                  <div className="space-y-1.5 rounded-md border border-border/70 bg-card/40 p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-muted-foreground">
                        标准 5 段式 Cron 表达式（分 时 日 月 周）
                      </span>
                      <span className="text-[10px] text-muted-foreground/70 font-mono">
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
                      className={cn(
                        'h-8 font-mono text-xs',
                        !cronValidation.valid && 'border-destructive focus-visible:ring-destructive',
                      )}
                    />
                    {!cronValidation.valid && (
                      <p className="text-[11px] text-destructive flex items-center gap-1">
                        <AlertTriangleIcon className="size-3" />
                        <span>{cronValidation.error}</span>
                      </p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>

              {/* Cron 表达式预览与预计接下来执行时间 */}
              <div className="rounded-md border border-border/50 bg-muted/20 p-2.5 space-y-1.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 font-medium text-foreground shrink-0">
                    <ClockIcon className="size-3 text-muted-foreground shrink-0" />
                    <span>预计接下来的执行时间：</span>
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground break-all">
                    Cron 规则: <code className="rounded bg-muted px-1 py-0.5 text-foreground">{cron}</code>
                  </span>
                </div>
                {nextRuns.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] font-mono pt-0.5">
                    {nextRuns.map((time, idx) => (
                      <span key={idx} className="text-muted-foreground flex items-center gap-1 min-w-0 truncate">
                        <span className="size-1 rounded-full bg-primary shrink-0" />
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
                  </div>
                ) : (
                  <span className="text-[11px] text-destructive">
                    当前表达式无有效执行时间，请检查输入格式
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 开关与通知 */}
          <div className="pt-2 border-t border-border/60 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium text-foreground block">启用此任务</span>
                <span className="text-[11px] text-muted-foreground">
                  关闭后调度器将跳过此任务的触发
                </span>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>

            <div className="flex items-center justify-between pt-1">
              <div>
                <span className="font-medium text-foreground block">成功发送通知</span>
                <span className="text-[11px] text-muted-foreground">
                  任务执行成功时发送桌面通知
                </span>
              </div>
              <Switch checked={notifyOnSuccess} onCheckedChange={setNotifyOnSuccess} />
            </div>

            <div className="flex items-center justify-between pt-1">
              <div>
                <span className="font-medium text-foreground block">失败告警通知</span>
                <span className="text-[11px] text-muted-foreground">
                  任务报错或冲突终止时立即告警
                </span>
              </div>
              <Switch checked={notifyOnFailure} onCheckedChange={setNotifyOnFailure} />
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave}>
            <CheckIcon className="mr-1.5 size-3.5" />
            {initialTask ? '保存修改' : '创建任务'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
