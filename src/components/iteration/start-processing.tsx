import { useEffect, useMemo, useState } from 'react';
import { CheckIcon, FolderIcon, Loader2Icon, PlayIcon } from 'lucide-react';
import type { Category } from '@/types';
import type { LocalRepoBinding } from '@/types/attribution';
import { useApp } from '@/store/app';
import { useAttribution } from '@/store/attribution';
import { useUi } from '@/store/ui';
import { workitemScanRepoIds } from '@/lib/workitem-repos';
import { compactFsPath, cn } from '@/lib/utils';
import * as attributionApi from '@/lib/attribution-api';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import { READONLY_BTN_CLASS } from '../WriteOpButton';

const AGENT_COMMIT_COMMAND = './scripts/agent-commit.sh -m "<message>"';

export interface StartProcessingButtonProps {
  workitemId: string;
  category: Category;
  /** 任务/缺陷的父需求：仓库候选按父需求的关联仓库解析 */
  parentWorkitemId?: string;
  size?: 'xs' | 'sm';
  /** 紧凑工具条（详情页/抽屉头部）里的纯图标按钮 */
  iconOnly?: boolean;
  className?: string;
}

/**
 * 「开始处理」统一入口。
 *
 * 只做一件事：把目标工作项写入选定本地仓库的 `.nervd/active-workitem.json`，
 * 供 commit-msg 钩子/提交脚本读取并补 Refs；不切分支、不改云效状态、不提交代码。
 *
 * 仓库候选优先取「当前需求关联 ∩ 已绑定本地目录」；没有交集时回退到全部绑定，
 * 并在选择弹窗里明确标注。活动状态按仓库回显（正在处理 · 仓库），不再猜第一个仓库。
 */
export function StartProcessingButton({
  workitemId,
  category,
  parentWorkitemId,
  size = 'sm',
  iconOnly = false,
  className,
}: StartProcessingButtonProps) {
  const settings = useApp((state) => state.settings);
  const repositories = useApp((state) => state.repositories);
  const openSettings = useUi((state) => state.openSettings);
  const activeWorkitems = useAttribution((state) => state.activeWorkitems);
  const loadBindings = useAttribution((state) => state.loadBindings);
  const loadActiveWorkitems = useAttribution((state) => state.loadActiveWorkitems);
  const setActive = useAttribution((state) => state.setActive);

  const [busy, setBusy] = useState(false);
  const [choices, setChoices] = useState<LocalRepoBinding[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [fellBackToAll, setFellBackToAll] = useState(false);

  const allowWrite = settings?.allowWriteOps ?? false;

  useEffect(() => {
    // 活动状态按仓库汇总；切换工作项时重新读取，失败静默退回「开始处理」
    void loadActiveWorkitems({ silent: true });
  }, [loadActiveWorkitems, workitemId]);

  const linkedRepoIds = useMemo(() => {
    if (!settings) return [];
    return workitemScanRepoIds(category, workitemId, settings, parentWorkitemId);
  }, [category, parentWorkitemId, settings, workitemId]);

  const repoLabel = (repoId: number): string => {
    const repo = repositories.find((item) => item.id === repoId);
    return repo?.pathWithNamespace || repo?.name || `#${repoId}`;
  };

  // 当前工作项在各仓库的活动记录（同一工作项可能被写入多个仓库）
  const activeForWorkitem = useMemo(
    () =>
      Object.values(activeWorkitems)
        .filter((item) => item.workitemId === workitemId)
        .sort((left, right) => right.updatedAt - left.updatedAt),
    [activeWorkitems, workitemId],
  );
  const current = activeForWorkitem[0];
  const isProcessing = Boolean(current);

  const resolveCandidates = (list: LocalRepoBinding[]) => {
    const preferred = list.filter((binding) => linkedRepoIds.includes(binding.repoId));
    if (preferred.length) return { candidates: preferred, fellBack: false };
    return { candidates: list, fellBack: list.length > 0 };
  };

  const activate = async (binding: LocalRepoBinding) => {
    const ok = await setActive(
      { repoId: binding.repoId, workitemId, parentWorkitemId },
      { silent: true },
    );
    if (!ok) {
      toast.add({
        type: 'error',
        title: '当前工作项切换失败',
        description: '请稍后重试，或检查本地仓库绑定是否有效。',
      });
      return;
    }

    // 以实际钩子文件为准（绑定记录可能因换目录而过期），确认后续提交能否自动补 Refs
    const info = await attributionApi
      .inspectLocalRepo({ path: binding.path })
      .catch(() => null);
    const hookInstalled = info?.hookInstalled ?? binding.hookInstalled;
    const hookMode = info?.hookMode ?? binding.hookMode;
    const label = repoLabel(binding.repoId);

    if (hookInstalled && hookMode !== 'off') {
      toast.add({
        type: 'success',
        title: '已设为当前工作项',
        description: `${label}：后续提交将自动补充 Refs（${hookMode} 模式）。`,
      });
      return;
    }
    toast.add({
      type: 'warning',
      title: '已设为当前工作项，但钩子未启用',
      description: `${label} 的 commit-msg 钩子不可用，后续提交不会自动补 Refs；请安装钩子，或使用 ${AGENT_COMMIT_COMMAND} 提交。`,
      actionProps: {
        children: '前往安装',
        onClick: () => openSettings('attribution'),
      },
    });
  };

  const handleStart = async () => {
    if (busy) return;
    if (!allowWrite) {
      toast.add({
        type: 'warning',
        title: '当前处于只读模式',
        description: '「开始处理」会写入本地工作项上下文。可在「设置 → 安全」中开启写权限后执行。',
        actionProps: {
          children: '前往设置',
          onClick: () => openSettings('security'),
        },
      });
      return;
    }

    setBusy(true);
    try {
      const list = await loadBindings();
      if (!list) return;
      if (!list.length) {
        toast.add({
          type: 'warning',
          title: '尚未绑定本地仓库',
          description: '请先在「设置 → 变更归属」中绑定本地仓库，再开始处理。',
          actionProps: {
            children: '前往设置',
            onClick: () => openSettings('attribution'),
          },
        });
        return;
      }
      const { candidates, fellBack } = resolveCandidates(list);
      if (candidates.length === 1) {
        await activate(candidates[0]);
        return;
      }
      setChoices(candidates);
      setFellBackToAll(fellBack);
      setPickerOpen(true);
    } finally {
      setBusy(false);
    }
  };

  const choose = async (binding: LocalRepoBinding) => {
    setPickerOpen(false);
    setBusy(true);
    try {
      await activate(binding);
    } finally {
      setBusy(false);
    }
  };

  const label = isProcessing ? `正在处理 · ${repoLabel(current.repoId)}` : '开始处理';
  const tooltip = !allowWrite
    ? '写操作已关闭：需在「设置 → 安全」中开启（需写权限令牌）'
    : isProcessing
      ? `当前已在 ${repoLabel(current.repoId)} 处理 ${workitemId}；点击可切换仓库`
      : '设为当前工作项，供后续提交填写任务归属';

  const button = (
    <Button
      type="button"
      variant={isProcessing ? 'secondary' : 'outline'}
      size={iconOnly ? 'icon-xs' : size}
      aria-disabled={!allowWrite || busy}
      className={cn(
        iconOnly ? '' : 'gap-1.5',
        !allowWrite && READONLY_BTN_CLASS,
        busy && 'cursor-wait',
        className,
      )}
      onClick={() => void handleStart()}
      aria-label={iconOnly ? label : undefined}
    >
      {busy ? (
        <Loader2Icon className="size-3.5 animate-spin" />
      ) : isProcessing ? (
        <CheckIcon className="size-3.5 text-sig-ok" />
      ) : (
        <PlayIcon className="size-3.5" />
      )}
      {!iconOnly && <span className="truncate">{busy ? '正在设置…' : label}</span>}
    </Button>
  );

  return (
    <>
      <Tooltip>
        <TooltipTrigger render={button} />
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>

      {pickerOpen && (
        <Dialog open onOpenChange={setPickerOpen}>
        <DialogContent className="gap-3 p-5 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>选择本地仓库</DialogTitle>
            <DialogDescription>
              {fellBackToAll
                ? '当前需求没有已绑定的关联仓库，以下为全部本地绑定。请选择本次提交使用的仓库。'
                : `该需求关联且已绑定 ${choices.length} 个本地仓库，请选择本次提交使用的仓库。`}
            </DialogDescription>
            <p className="text-[11px] leading-5 text-muted-foreground">
              只会写入该仓库的 <code className="font-mono">.nervd/active-workitem.json</code>；
              不会切换分支、修改云效状态或提交代码。
            </p>
          </DialogHeader>
          <div className="flex flex-col gap-1">
            {choices.map((binding) => {
              const hookReady = binding.hookInstalled && binding.hookMode !== 'off';
              return (
                <Button
                  key={binding.repoId}
                  variant="ghost"
                  size="sm"
                  className="h-auto w-full min-w-0 justify-start gap-2 overflow-hidden py-1.5"
                  onClick={() => void choose(binding)}
                >
                  <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
                    <span
                      className="w-full truncate text-xs"
                      title={repoLabel(binding.repoId)}
                    >
                      {compactFsPath(repoLabel(binding.repoId), 3)}
                    </span>
                    <span
                      className="w-full truncate font-mono text-[10px] text-muted-foreground"
                      title={binding.path}
                    >
                      {compactFsPath(binding.path)}
                    </span>
                  </span>
                  <Chip
                    size="sm"
                    variant="soft"
                    color={hookReady ? 'success' : 'default'}
                    className="h-5 shrink-0 border border-border/60 px-1.5 text-[10px]"
                    title={
                      hookReady
                        ? `该仓库的 commit-msg 钩子已安装并启用（${binding.hookMode}）：提交时自动补充 Refs`
                        : '该仓库的 commit-msg 钩子未安装或已关闭：提交不会自动补充 Refs，可到「设置 → 变更归属」安装，或使用 agent-commit.sh'
                    }
                  >
                    {hookReady ? '钩子已启用' : '钩子未启用'}
                  </Chip>
                </Button>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setPickerOpen(false)}>
              取消
            </Button>
          </DialogFooter>
        </DialogContent>
        </Dialog>
      )}
    </>
  );
}