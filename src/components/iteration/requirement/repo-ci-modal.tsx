import { useState, useEffect } from 'react';
import { WorkflowIcon } from 'lucide-react';
import type { RepoSummary, RepoCiBinding } from '@/types';
import { useApp } from '@/store/app';
import { useShallow } from 'zustand/react/shallow';
import { matchPipelineForRepo } from '@/lib/pipeline-match';
import { humanizeError } from '@/lib/error-format';
import { Button } from '@/components/ui/button';
import { READONLY_BTN_CLASS, WriteOpButton } from '@/components/WriteOpButton';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RepoCiBindingFields } from './repo-ci-binding-fields';

export interface RepoCiModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repo: RepoSummary;
  onSuccess?: (binding: RepoCiBinding | null) => void;
}

export function RepoCiModal({ open, onOpenChange, repo, onSuccess }: RepoCiModalProps) {
  const {
    settings,
    pipelines,
    loadingPipelines,
    loadPipelines,
    saveRepoCiBinding,
    setToast,
  } = useApp(
    useShallow((s) => ({
      settings: s.settings,
      pipelines: s.pipelines,
      loadingPipelines: s.loadingPipelines,
      loadPipelines: s.loadPipelines,
      saveRepoCiBinding: s.saveRepoCiBinding,
      setToast: s.setToast,
    })),
  );

  const savedBinding = settings?.repoCiBindings?.[String(repo.id)] ?? null;
  const [binding, setBinding] = useState<RepoCiBinding | null>(savedBinding);
  // pendingAction 取代布尔 saving：写入中的按钮由 WriteOpButton 的 isPending 语义（onAction Promise）
  // 自行呈现，这里只负责在另一个写入口/表单上做互斥，避免两个远端写并发。
  const [pendingAction, setPendingAction] = useState<'save' | 'clear' | null>(null);
  const saving = pendingAction !== null;

  // 智能推荐匹配
  const matchResult = matchPipelineForRepo(repo.name, pipelines);

  useEffect(() => {
    if (open) {
      if (savedBinding) {
        setBinding(savedBinding);
      } else if (matchResult.bestMatch) {
        // 未关联时，默认预选高置信匹配的云效流水线
        setBinding({
          provider: 'flow',
          pipelineId: matchResult.bestMatch.pipelineId,
          pipelineName: matchResult.bestMatch.pipelineName,
        });
      } else {
        setBinding(null);
      }
    }
  }, [open, repo.id, savedBinding]);

  const handleSave = async () => {
    setPendingAction('save');
    try {
      await saveRepoCiBinding(repo.id, binding);
      setToast({
        text: binding
          ? `已成功为「${repo.name}」关联 CI (${binding.provider === 'flow' ? binding.pipelineName : 'Jenkins'})`
          : `已清除「${repo.name}」的 CI 关联`,
        kind: 'ok',
      });
      onOpenChange(false);
      onSuccess?.(binding);
    } catch (err) {
      setToast({
        text: `保存 CI 关联失败：${humanizeError(err)}`,
        kind: 'fail',
      });
    } finally {
      setPendingAction(null);
    }
  };

  const handleClear = async () => {
    setPendingAction('clear');
    try {
      await saveRepoCiBinding(repo.id, null);
      setToast({ text: `已取消「${repo.name}」的 CI 关联`, kind: 'ok' });
      onOpenChange(false);
      onSuccess?.(null);
    } catch (err) {
      setToast({ text: `取消 CI 关联失败：${humanizeError(err)}`, kind: 'fail' });
    } finally {
      setPendingAction(null);
    }
  };

  const jenkinsConnections = settings?.jenkinsConnections ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl flex flex-col p-6 gap-4">
        <DialogHeader className="shrink-0 text-left">
          <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <WorkflowIcon className="size-4.5 text-primary" />
            <span>配置代码仓库 CI 流水线</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            为「{repo.pathWithNamespace || repo.name}」绑定默认 CI。绑定后可在需求详情中就地触发构建、检视运行记录与状态。
          </DialogDescription>
        </DialogHeader>

        <div className="py-1">
          <RepoCiBindingFields
            repoName={repo.name}
            binding={binding}
            onChange={setBinding}
            pipelines={pipelines}
            jenkinsConnections={jenkinsConnections}
            loadingPipelines={loadingPipelines}
            onRefreshPipelines={loadPipelines}
            recommendedPipeline={matchResult.bestMatch}
            recommendReason={matchResult.reason}
            disabled={saving}
          />
        </div>

        <DialogFooter className="shrink-0 flex items-center justify-between gap-2 pt-3 border-t border-border/70">
          <div>
            {savedBinding && (
              <WriteOpButton
                label="解除当前 CI 关联"
                title={`解除「${repo.name}」当前 CI 关联`}
                variant="danger-soft"
                confirm="inline"
                confirmLabel="确认解除"
                disabled={pendingAction === 'save'}
                disabledReason={pendingAction === 'save' ? '正在保存关联，请稍候' : undefined}
                onAction={handleClear}
              />
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-disabled={saving || undefined}
              className={cn(saving && READONLY_BTN_CLASS)}
              onPress={() => {
                if (saving) return;
                onOpenChange(false);
              }}
            >
              取消
            </Button>
            <WriteOpButton
              label="保存关联"
              title="保存代码仓库 CI 关联"
              variant="default"
              confirm="inline"
              confirmLabel="确认保存"
              disabled={pendingAction === 'clear'}
              disabledReason={pendingAction === 'clear' ? '正在解除关联，请稍候' : undefined}
              onAction={handleSave}
            />
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
