import { useEffect, useState } from 'react';
import { ExternalLinkIcon, PencilIcon } from 'lucide-react';
import type { WorkitemChild } from '@/lib/api';
import * as api from '@/lib/api';
import { CATEGORY_LABELS, type Category } from '@/types';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { PropertyRow } from '../section-header';
import { StatusBadge } from '../StatusBadge';
import { RichDescription } from './rich-description';

/**
 * 子工作项/缺陷详情抽屉：列表行点击就地打开，不再跳转工作台。
 * - 描述按需拉取（getWorkitem），随 children 刷新自动重取；
 * - 编辑复用既有 SubtaskEditDialog（仅子任务），全页查看走「在工作台打开」。
 */
export function ChildDetailDrawer({
  child,
  onClose,
  onEdit,
  onOpenInWorkbench,
}: {
  child: WorkitemChild | null;
  onClose: () => void;
  /** 子任务可编辑（缺陷暂无编辑入口） */
  onEdit?: (child: WorkitemChild) => void;
  onOpenInWorkbench: (child: WorkitemChild) => void;
}) {
  const open = child != null;
  const [rawDetail, setRawDetail] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!child) {
      setRawDetail(null);
      return;
    }
    let alive = true;
    setLoading(true);
    void api.getWorkitem(child.workitemId)
      .then((detail) => {
        if (alive) setRawDetail((detail as Record<string, unknown>)?.workitem ?? detail);
      })
      .catch(() => {
        if (alive) setRawDetail(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [child]);

  const wi = (rawDetail ?? {}) as Record<string, unknown>;
  const field = (key: string): string => {
    const value = wi[key];
    return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
  };
  const categoryLabel = child?.category && child.category in CATEGORY_LABELS
    ? CATEGORY_LABELS[child.category as Category]
    : child?.category || '—';
  const canEdit = Boolean(onEdit && child && child.category !== 'Bug');

  return (
    <Drawer open={open} onOpenChange={(o) => { if (!o) onClose(); }} swipeDirection="right">
      <DrawerContent className="w-[100vw] sm:w-[min(36rem,100vw)]">
        <DrawerHeader>
          <DrawerTitle className="min-w-0 truncate">{child?.subject ?? ''}</DrawerTitle>
          <DrawerDescription className="flex items-center gap-2 font-mono text-xs">
            <span>{child?.identifier}</span>
            <span>· {categoryLabel}</span>
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-5">
          <div className="flex flex-col">
            <PropertyRow label="状态">
              <StatusBadge status={child?.status || field('status') || undefined} />
            </PropertyRow>
            <PropertyRow label="处理人">{child?.assignedTo || field('assignedTo') || '—'}</PropertyRow>
            <PropertyRow label="更新时间">{child?.gmtModified || field('gmtModified') || field('updatedAt') || '—'}</PropertyRow>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-foreground">描述</p>
            {loading ? (
              <p className="text-xs text-muted-foreground">加载描述…</p>
            ) : (
              <RichDescription raw={wi.description ?? wi.content} />
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          {canEdit && child && (
            <Button variant="outline" size="sm" onClick={() => onEdit?.(child)}>
              <PencilIcon data-icon="inline-start" />
              编辑
            </Button>
          )}
          {child && (
            <Button size="sm" onClick={() => onOpenInWorkbench(child)}>
              <ExternalLinkIcon data-icon="inline-start" />
              在工作台打开
            </Button>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
