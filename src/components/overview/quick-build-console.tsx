import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Chip, Tooltip } from '@heroui/react';
import {
  ChevronDownIcon,
  GitBranchIcon,
  PlayIcon,
  RotateCwIcon,
  SlidersHorizontalIcon,
  ZapIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';
import { useShallow } from 'zustand/react/shallow';
import {
  extractConfiguredBuildTargets,
  markHistoryStaleness,
  useQuickBuild,
  type QuickBuildTarget,
} from '@/store/quick-build';
import { StatusIcon } from '@/components/status-icon';
import {
  QuickBuildActiveTable,
  useActiveBuildItems,
  type ActiveBuildItem,
} from './quick-build-active-table';
import { QuickBuildTriggerForm } from './quick-build-trigger-form';

export type { ActiveBuildItem };

export function QuickBuildConsole() {
  const { settings, repositories } = useApp(
    useShallow((s) => ({
      settings: s.settings,
      repositories: s.repositories,
    })),
  );

  const openSettings = useUi((s) => s.openSettings);
  const allowWriteOps = settings?.allowWriteOps ?? false;

  const history = useQuickBuild((s) => s.history);
  const isTriggering = useQuickBuild((s) => s.isTriggering);
  const triggerQuickBuild = useQuickBuild((s) => s.triggerQuickBuild);
  const activeBuilds = useActiveBuildItems();

  const [buildFormOpen, setBuildFormOpen] = useState(false);

  useEffect(() => {
    useQuickBuild.getState().loadHistoryForContext(settings?.organizationId, settings?.defaultSpaceIdentifier);
  }, [settings?.organizationId, settings?.defaultSpaceIdentifier]);

  const configuredTargets = useMemo(
    () => extractConfiguredBuildTargets(settings, repositories),
    [settings, repositories],
  );

  const staleAwareHistory = useMemo(
    () => markHistoryStaleness(history, configuredTargets),
    [history, configuredTargets],
  );

  const recentTarget = staleAwareHistory[0] || null;

  // 如果无活跃任务且无任何可构建配置与历史，不显示空壳
  if (configuredTargets.length === 0 && history.length === 0 && activeBuilds.length === 0) {
    return null;
  }

  const handleRerun = async (target: QuickBuildTarget) => {
    if (!allowWriteOps) {
      useApp.getState().setToast({
        text: '当前处于只读保护模式，无法触发构建。可在「设置 → 安全策略」开启写操作。',
        kind: 'fail',
      });
      return;
    }
    if (target.isStale) return;
    await triggerQuickBuild(target, target.parameters);
  };

  const recentBranch = recentTarget?.parameters?.branch ||
    recentTarget?.parameters?.BRANCH ||
    recentTarget?.parameters?.ref ||
    null;

  const recentEnv = recentTarget?.parameters?.env ||
    recentTarget?.parameters?.ENV ||
    recentTarget?.parameters?.environment ||
    null;

  const recentKey = recentTarget ? (recentTarget.targetKey || recentTarget.id) : '';
  const isRecentTriggering = recentKey ? isTriggering(recentKey) : false;

  return (
    <Card
      role="region"
      data-testid="quick-build-console"
      aria-label="CI/CD 构建工作台"
      variant="default"
      className="p-0"
    >
      <Card.Header className="flex flex-row flex-wrap items-center justify-between gap-2.5 border-b border-border/60 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-surface-secondary text-muted">
            <ZapIcon className="size-3.5 fill-current text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Card.Title className="text-sm font-semibold tracking-tight text-foreground">
                快捷构建控制台
              </Card.Title>
              {activeBuilds.length > 0 ? (
                <Chip size="sm" color="warning" variant="soft" className="gap-1.5">
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning opacity-75" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-warning" />
                  </span>
                  <Chip.Label>活跃构建中 · {activeBuilds.length}</Chip.Label>
                </Chip>
              ) : null}
            </div>
            <Card.Description className="mt-0.5 text-xs text-muted">
              {activeBuilds.length > 0
                ? '活跃任务实时更新，可继续发起新的构建。'
                : '默认展示最近使用的配置，支持一键重跑或自定义参数构建。'}
            </Card.Description>
          </div>
        </div>

        <Button
          type="button"
          variant={buildFormOpen ? 'secondary' : 'primary'}
          size="sm"
          aria-expanded={buildFormOpen}
          aria-controls="quick-build-form"
          onPress={() => setBuildFormOpen((open) => !open)}
          className="shrink-0 gap-1.5"
        >
          {buildFormOpen ? (
            <>
              <ChevronDownIcon className="size-3 rotate-180 text-muted transition-transform" />
              <span>收起表单</span>
            </>
          ) : (
            <>
              <PlayIcon className="size-3 fill-current" />
              <span>触发构建</span>
            </>
          )}
        </Button>
      </Card.Header>

      {/* 活跃执行任务表格 */}
      <QuickBuildActiveTable activeBuilds={activeBuilds} />

      {/* 默认状态展示最近构建目标摘要与一键重跑 */}
      {!buildFormOpen && recentTarget && (
        <Card.Content className="flex flex-col gap-2.5 border-t border-border/60 bg-surface-secondary/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-xs text-foreground">
                {recentTarget.repoName} · {recentTarget.pipelineName}
              </span>
              <Chip
                size="sm"
                variant="soft"
                color={recentTarget.type === 'jenkins' ? 'warning' : 'accent'}
              >
                {recentTarget.type === 'jenkins' ? 'Jenkins' : '云效 Flow'}
              </Chip>
              {recentTarget.isStale && (
                <Chip size="sm" variant="soft" color="danger">
                  配置已变更
                </Chip>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted">
              {recentBranch && (
                <span className="flex items-center gap-1 font-mono">
                  <GitBranchIcon className="size-3" />
                  {recentBranch}
                </span>
              )}
              {recentEnv && (
                <Chip size="sm" variant="tertiary" color="default" className="font-mono text-[10px]">
                  <Chip.Label>{recentEnv}</Chip.Label>
                </Chip>
              )}
              {recentTarget.lastBuildState && (
                <span className="flex items-center gap-1">
                  <StatusIcon
                    status={
                      recentTarget.lastBuildState === 'success'
                        ? 'SUCCESS'
                        : recentTarget.lastBuildState === 'fail'
                        ? 'FAIL'
                        : recentTarget.lastBuildState === 'running'
                        ? 'RUNNING'
                        : 'OTHER'
                    }
                    className="size-3"
                  />
                  <span>
                    上次状态 · {recentTarget.lastBuildState === 'success' ? '成功' : recentTarget.lastBuildState === 'fail' ? '失败' : recentTarget.lastBuildState}
                  </span>
                </span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {!allowWriteOps ? (
              <Tooltip>
                <Tooltip.Trigger
                  aria-disabled="true"
                  className="cursor-not-allowed opacity-60"
                >
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onPress={() => handleRerun(recentTarget)}
                  >
                    <RotateCwIcon className="size-3" />
                    <span>重跑</span>
                  </Button>
                </Tooltip.Trigger>
                <Tooltip.Content className="max-w-xs text-xs">
                  当前处于只读保护模式，无法触发构建。可在
                  <button
                    type="button"
                    onClick={() => openSettings('security')}
                    className="ml-1 underline text-primary cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    设置 → 安全策略
                  </button>
                  开启写权限。
                </Tooltip.Content>
              </Tooltip>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                isDisabled={recentTarget.isStale || isRecentTriggering}
                onPress={() => void handleRerun(recentTarget)}
                className="gap-1.5"
              >
                <RotateCwIcon className={cn('size-3', isRecentTriggering && 'animate-spin')} />
                <span>{isRecentTriggering ? '触发中…' : '重跑'}</span>
              </Button>
            )}

            <Button
              type="button"
              size="sm"
              variant="ghost"
              onPress={() => setBuildFormOpen(true)}
              className="gap-1.5 text-muted hover:text-foreground"
            >
              <SlidersHorizontalIcon className="size-3" />
              <span>修改参数</span>
            </Button>
          </div>
        </Card.Content>
      )}

      {/* 自定义参数构建表单 */}
      {buildFormOpen && (
        <QuickBuildTriggerForm
          configuredTargets={configuredTargets}
          initialTargetKey={recentTarget?.targetKey || recentTarget?.id}
          onSuccess={() => setBuildFormOpen(false)}
        />
      )}
    </Card>
  );
}
