import { useState, useEffect } from 'react';
import { WorkflowIcon, Loader2Icon, CheckIcon, Trash2Icon } from 'lucide-react';
import type { RepoSummary, RepoCiBinding } from '@/types';
import { useApp } from '@/store/app';
import { matchPipelineForRepo } from '@/lib/pipeline-match';
import { humanizeError } from '@/lib/error-format';
import { Button } from '@/components/ui/button';
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
  } = useApp();

  const savedBinding = settings?.repoCiBindings?.[String(repo.id)] ?? null;
  const [binding, setBinding] = useState<RepoCiBinding | null>(savedBinding);
  const [saving, setSaving] = useState(false);

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
    setSaving(true);
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
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      await saveRepoCiBinding(repo.id, null);
      setToast({ text: `已取消「${repo.name}」的 CI 关联`, kind: 'ok' });
      onOpenChange(false);
      onSuccess?.(null);
    } catch (err) {
      setToast({ text: `取消 CI 关联失败：${humanizeError(err)}`, kind: 'fail' });
    } finally {
      setSaving(false);
    }
  };

  const jenkinsConnections = settings?.jenkinsConnections ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg flex flex-col p-6 gap-4">
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
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClear}
                disabled={saving}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive gap-1 text-xs"
              >
                <Trash2Icon className="size-3.5" />
                <span>解除当前 CI 关联</span>
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="gap-1.5"
            >
              {saving ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <CheckIcon className="size-3.5" />
              )}
              <span>保存关联</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
