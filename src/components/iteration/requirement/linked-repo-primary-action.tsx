import {
  GitBranchIcon,
  GitPullRequestIcon,
  PlusIcon,
  RefreshCwIcon,
  WorkflowIcon,
} from 'lucide-react';
import type { MrSummary, RepoCiBinding } from '@/types';
import { Button } from '@/components/ui/button';
import { BuildWorkbenchTrigger } from '@/components/build-workbench';
import type { BuildWorkbenchTarget } from '@/store/ui';
import { WriteOpButton } from '@/components/WriteOpButton';
import type { LinkedRepoDeliveryDecision } from './linked-repo-delivery';

export interface LinkedRepoPrimaryActionProps {
  action: LinkedRepoDeliveryDecision['action'];
  baselineCreating: boolean;
  operationBaseBranch: string;
  onCreateIterationBaseline: () => void | Promise<void>;
  branchCreating: boolean;
  developerBranch: string;
  branchDisabledReason?: string;
  onCreateDeveloperBranch: () => void | Promise<void>;
  targetActiveMr?: MrSummary;
  onViewMr: (mr?: MrSummary) => void;
  onCreateMr: () => void;
  ciBinding?: RepoCiBinding;
  repoName: string;
  buildTarget: BuildWorkbenchTarget;
  onOpenCiModal: () => void;
  cardRefreshing: boolean;
  onRefresh: () => void;
  onConfigureRule: () => void;
  onOpenDetails: () => void;
}

export function LinkedRepoPrimaryAction({
  action,
  baselineCreating,
  operationBaseBranch,
  onCreateIterationBaseline,
  branchCreating,
  developerBranch,
  branchDisabledReason,
  onCreateDeveloperBranch,
  targetActiveMr,
  onViewMr,
  onCreateMr,
  ciBinding,
  repoName,
  buildTarget,
  onOpenCiModal,
  cardRefreshing,
  onRefresh,
  onConfigureRule,
  onOpenDetails,
}: LinkedRepoPrimaryActionProps) {
  switch (action) {
    case 'configure-rule':
      return (
        <Button type="button" size="sm" variant="outline" onPress={onConfigureRule}>
          <GitBranchIcon data-icon="inline-start" />
          配置分支规则
        </Button>
      );
    case 'create-baseline':
      return (
        <WriteOpButton
          label={baselineCreating ? '正在创建迭代分支…' : '创建迭代分支'}
          title={'创建迭代基准 ' + operationBaseBranch}
          disabled={baselineCreating}
          disabledReason={baselineCreating ? '迭代基准创建中' : undefined}
          onAction={async () => { await onCreateIterationBaseline(); }}
        />
      );
    case 'create-workitem-branch':
      return (
        <WriteOpButton
          label={branchCreating ? '正在创建需求分支…' : '创建需求分支'}
          title={'创建需求分支 ' + developerBranch}
          disabled={branchCreating || Boolean(branchDisabledReason)}
          disabledReason={branchDisabledReason}
          onAction={async () => { await onCreateDeveloperBranch(); }}
        />
      );
    case 'view-mr':
      return (
        <Button type="button" size="sm" variant="outline" onPress={() => onViewMr(targetActiveMr)}>
          <GitPullRequestIcon data-icon="inline-start" />
          查看 MR !{targetActiveMr?.localId}
        </Button>
      );
    case 'create-mr':
      return (
        <Button type="button" size="sm" variant="default" onPress={onCreateMr}>
          <PlusIcon data-icon="inline-start" />
          创建 MR
        </Button>
      );
    case 'build':
      if (!ciBinding) {
        return (
          <Button
            type="button"
            size="sm"
            variant="default"
            onPress={onOpenCiModal}
            title="代码已合入，请关联 CI 流水线并准备发起构建"
          >
            <WorkflowIcon data-icon="inline-start" />
            关联 CI 并构建
          </Button>
        );
      }
      return (
        <BuildWorkbenchTrigger
          target={buildTarget}
          label="发起构建"
          title={ciBinding.provider === 'flow' ? '触发流水线 ' + ciBinding.pipelineName : '为 ' + repoName + ' 发起构建'}
          variant="default"
        />
      );
    case 'retry':
      return (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={cardRefreshing}
          onPress={onRefresh}
        >
          <RefreshCwIcon data-icon="inline-start" className={cardRefreshing ? 'animate-spin' : ''} />
          重试查询
        </Button>
      );
    case 'querying':
      return (
        <Button type="button" size="sm" variant="outline" disabled>
          <RefreshCwIcon data-icon="inline-start" className="animate-spin" />
          查询中
        </Button>
      );
    case 'blocked':
      return (
        <WriteOpButton
          label="暂不可创建"
          variant="outline"
          disabled
          disabledReason="交付链路被阻塞，暂不可创建"
          onAction={async () => {}}
        />
      );
    case 'details':
      return (
        <Button type="button" size="sm" variant="outline" onPress={onOpenDetails}>
          查看详情
        </Button>
      );
  }
}
