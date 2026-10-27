import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangleIcon,
  CheckIcon,
  GitMergeIcon,
  HelpCircleIcon,
  PlayCircleIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  WorkflowIcon,
} from 'lucide-react';
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
  const [strategy, setStrategy] = useState<MergeStrategy>('cautious');
  const [conflictPreference, setConflictPreference] =
    useState<AggressiveConflictPreference>('theirs');

  // Jenkins fields
  const [jenkinsConnId, setJenkinsConnId] = useState('');
  const [jenkinsJobName, setJenkinsJobName] = useState('');

  // Flow pipeline fields
  const [pipelineId, setPipelineId] = useState<number>(0);
  const [pipelineName, setPipelineName] = useState('');

  // Cron schedule fields
  const [cron, setCron] = useState('0 2 * * *');
  const [preset, setPreset] = useState('0 2 * * *');

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
      setCron('0 2 * * *');
      setPreset('0 2 * * *');
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

  const handlePresetChange = (value: string) => {
    setPreset(value);
    if (value !== 'custom') {
      setCron(value);
    }
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
      <DialogContent className="sm:max-w-xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initialTask ? `编辑任务 · ${initialTask.name}` : '新建定时任务'}
          </DialogTitle>
          <DialogDescription>
            配置自动化定时调度策略，支持代码分支安全同步、构建自动化与多源数据巡检。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
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
                  'h-auto flex flex-col items-start p-2.5 rounded-lg text-left transition-colors whitespace-normal',
                  actionType === 'branch_merge'
                    ? 'border-primary bg-primary/5 text-foreground ring-1 ring-primary hover:bg-primary/10'
                    : 'border-border/80 hover:bg-muted/40 text-muted-foreground',
                )}
              >
                <div className="flex items-center gap-1.5 font-medium text-foreground text-xs">
                  <GitMergeIcon className="size-3.5 text-primary" />
                  <span>分支安全同步</span>
                </div>
                <span className="text-[10px] text-muted-foreground mt-1">
                  谨慎/激进(零污染)
                </span>
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => setActionType('jenkins')}
                className={cn(
                  'h-auto flex flex-col items-start p-2.5 rounded-lg text-left transition-colors whitespace-normal',
                  actionType === 'jenkins'
                    ? 'border-primary bg-primary/5 text-foreground ring-1 ring-primary hover:bg-primary/10'
                    : 'border-border/80 hover:bg-muted/40 text-muted-foreground',
                )}
              >
                <div className="flex items-center gap-1.5 font-medium text-foreground text-xs">
                  <PlayCircleIcon className="size-3.5 text-blue-500" />
                  <span>Jenkins 构建</span>
                </div>
                <span className="text-[10px] text-muted-foreground mt-1">
                  触发远程 Jenkins Job
                </span>
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => setActionType('pipeline')}
                className={cn(
                  'h-auto flex flex-col items-start p-2.5 rounded-lg text-left transition-colors whitespace-normal',
                  actionType === 'pipeline'
                    ? 'border-primary bg-primary/5 text-foreground ring-1 ring-primary hover:bg-primary/10'
                    : 'border-border/80 hover:bg-muted/40 text-muted-foreground',
                )}
              >
                <div className="flex items-center gap-1.5 font-medium text-foreground text-xs">
                  <WorkflowIcon className="size-3.5 text-emerald-500" />
                  <span>云效 Flow 流水线</span>
                </div>
                <span className="text-[10px] text-muted-foreground mt-1">
                  运行云效 CI 交付流水线
                </span>
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => setActionType('sync_workitems')}
                className={cn(
                  'h-auto flex flex-col items-start p-2.5 rounded-lg text-left transition-colors whitespace-normal',
                  actionType === 'sync_workitems'
                    ? 'border-primary bg-primary/5 text-foreground ring-1 ring-primary hover:bg-primary/10'
                    : 'border-border/80 hover:bg-muted/40 text-muted-foreground',
                )}
              >
                <div className="flex items-center gap-1.5 font-medium text-foreground text-xs">
                  <RefreshCwIcon className="size-3.5 text-amber-500" />
                  <span>同步云效需求</span>
                </div>
                <span className="text-[10px] text-muted-foreground mt-1">
                  定时拉取工作项/迭代
                </span>
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => setActionType('scan_branches')}
                className={cn(
                  'h-auto flex flex-col items-start p-2.5 rounded-lg text-left transition-colors whitespace-normal',
                  actionType === 'scan_branches'
                    ? 'border-primary bg-primary/5 text-foreground ring-1 ring-primary hover:bg-primary/10'
                    : 'border-border/80 hover:bg-muted/40 text-muted-foreground',
                )}
              >
                <div className="flex items-center gap-1.5 font-medium text-foreground text-xs">
                  <RefreshCwIcon className="size-3.5 text-purple-500" />
                  <span>集成分支巡检</span>
                </div>
                <span className="text-[10px] text-muted-foreground mt-1">
                  定时比对落差与超前
                </span>
              </Button>
            </div>
          </div>

          {/* 分支同步专属配置 */}
          {actionType === 'branch_merge' && (
            <div className="rounded-lg border border-border/80 bg-muted/30 p-3 space-y-3">
              <div className="flex items-center gap-2 text-foreground font-medium text-xs">
                <GitMergeIcon className="size-4 text-primary" />
                <span>分支合并与策略配置</span>
              </div>

              <div className="space-y-2">
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

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-medium text-muted-foreground block">
                    源分支 (Source)
                  </Label>
                  <Input
                    value={sourceBranch}
                    onChange={(e) => setSourceBranch(e.target.value)}
                    placeholder="例如: dev / feature/xxx"
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-medium text-muted-foreground block">
                    目标分支 (Target)
                  </Label>
                  <Input
                    value={targetBranch}
                    onChange={(e) => setTargetBranch(e.target.value)}
                    placeholder="例如: master / release/xxx"
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>

              {/* 核心策略选择：谨慎 vs 激进 */}
              <div className="space-y-2 pt-1 border-t border-border/60">
                <Label className="text-[11px] font-medium text-muted-foreground block">
                  合并冲突策略
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStrategy('cautious')}
                    className={cn(
                      'h-auto flex items-start gap-2.5 p-2.5 rounded-md text-left transition-colors whitespace-normal',
                      strategy === 'cautious'
                        ? 'border-blue-500 bg-blue-500/10 text-foreground ring-1 ring-blue-500/60 hover:bg-blue-500/15'
                        : 'border-border/70 hover:bg-muted/50 text-muted-foreground',
                    )}
                  >
                    <ShieldAlertIcon className="size-4 text-blue-500 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                        <span>谨慎策略</span>
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1 py-0 border-blue-500/30 text-blue-500"
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
                      'h-auto flex items-start gap-2.5 p-2.5 rounded-md text-left transition-colors whitespace-normal',
                      strategy === 'aggressive'
                        ? 'border-amber-500 bg-amber-500/10 text-foreground ring-1 ring-amber-500/60 hover:bg-amber-500/15'
                        : 'border-border/70 hover:bg-muted/50 text-muted-foreground',
                    )}
                  >
                    <ShieldCheckIcon className="size-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                        <span>激进策略</span>
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1 py-0 border-amber-500/30 text-amber-500"
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
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400">
                        <HelpCircleIcon className="size-3.5 shrink-0" />
                        <span>激进冲突自动裁决偏好</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        同一行代码两端冲突时的裁决策略
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setConflictPreference('theirs')}
                        className={cn(
                          'h-auto flex flex-col items-start p-2.5 rounded-md text-left transition-colors whitespace-normal',
                          conflictPreference === 'theirs'
                            ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary hover:bg-primary/15'
                            : 'border-border/70 hover:bg-muted/40 text-muted-foreground bg-card/60',
                        )}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                            <span
                              className={cn(
                                'size-2 rounded-full shrink-0',
                                conflictPreference === 'theirs' ? 'bg-primary' : 'bg-muted-foreground/40',
                              )}
                            />
                            偏向源分支 (Theirs)
                          </span>
                          <Badge
                            variant="outline"
                            className="text-[9px] px-1 py-0 border-blue-500/30 text-blue-500"
                          >
                            新代码优先
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                          代码冲突时，自动以源分支（如 <span className="font-mono text-foreground">{sourceBranch || 'dev'}</span>）的新改为准覆盖目标分支，适合新功能冲刺迭代。
                        </p>
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setConflictPreference('ours')}
                        className={cn(
                          'h-auto flex flex-col items-start p-2.5 rounded-md text-left transition-colors whitespace-normal',
                          conflictPreference === 'ours'
                            ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary hover:bg-primary/15'
                            : 'border-border/70 hover:bg-muted/40 text-muted-foreground bg-card/60',
                        )}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                            <span
                              className={cn(
                                'size-2 rounded-full shrink-0',
                                conflictPreference === 'ours' ? 'bg-primary' : 'bg-muted-foreground/40',
                              )}
                            />
                            偏向目标分支 (Ours)
                          </span>
                          <Badge
                            variant="outline"
                            className="text-[9px] px-1 py-0 border-emerald-500/30 text-emerald-500"
                          >
                            主干稳定优先
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                          代码冲突时，保留目标分支（如 <span className="font-mono text-foreground">{targetBranch || 'master'}</span>）原本的代码，丢弃冲突改动，确保生产基线稳定。
                        </p>
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setConflictPreference('isolated_pr')}
                        className={cn(
                          'h-auto flex flex-col items-start p-2.5 rounded-md text-left transition-colors whitespace-normal',
                          conflictPreference === 'isolated_pr'
                            ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary hover:bg-primary/15'
                            : 'border-border/70 hover:bg-muted/40 text-muted-foreground bg-card/60',
                        )}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                            <span
                              className={cn(
                                'size-2 rounded-full shrink-0',
                                conflictPreference === 'isolated_pr' ? 'bg-primary' : 'bg-muted-foreground/40',
                              )}
                            />
                            生成隔离 MR 审查
                          </span>
                          <Badge
                            variant="outline"
                            className="text-[9px] px-1 py-0 border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10"
                          >
                            推荐 · 人工裁决
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
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
            <div className="rounded-lg border border-border/80 bg-muted/30 p-3 space-y-3">
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
            <div className="rounded-lg border border-border/80 bg-muted/30 p-3 space-y-3">
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

          {/* 触发频率 Cron */}
          <div className="space-y-2 pt-2 border-t border-border/60">
            <div className="flex items-center justify-between">
              <Label className="font-medium text-foreground block">
                调度周期 (Cron) <span className="text-destructive">*</span>
              </Label>
              {cronDescription && (
                <span className="text-[11px] text-primary font-mono font-medium">
                  {cronDescription}
                </span>
              )}
            </div>

            <div className="space-y-2">
              <SearchableSelect
                value={preset}
                onValueChange={(val) => handlePresetChange(val ? String(val) : '')}
                items={[
                  ...CRON_PRESETS.map((p) => ({
                    label: `${p.label} (${p.value}) · ${p.description}`,
                    value: p.value,
                  })),
                  {
                    label: '自定义 Cron 表达式...',
                    value: 'custom',
                  },
                ]}
                placeholder="选择调度周期预设..."
                className="w-full text-xs"
              />

              <div className="space-y-1">
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

              {/* 未来执行时间预览 */}
              {nextRuns.length > 0 && (
                <div className="rounded bg-muted/40 p-2.5 text-[11px] font-mono text-muted-foreground">
                  <span className="font-medium text-foreground block mb-1">
                    即将到来的执行时间：
                  </span>
                  <div className="grid grid-cols-2 gap-1 text-[10px]">
                    {nextRuns.map((time, idx) => (
                      <span key={idx}>
                        • {time.toISOString().slice(0, 19).replace('T', ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              )}
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

        <DialogFooter>
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
