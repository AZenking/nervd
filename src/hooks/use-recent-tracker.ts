import { useEffect, useRef } from 'react';
import { useRecentWorkitems } from '@/store/recent-workitems';

export interface UseRecentTrackerOptions {
  workitemId?: string | null;
  identifier?: string | null;
  subject?: string | null;
  category?: string | null;
  status?: string | null;
  spaceName?: string | null;
  /** 停留判定门槛（毫秒），默认 30,000ms (30s) */
  dwellMs?: number;
}

const DEFAULT_DWELL_MS = 30_000;

/**
 * 需求停留计时器：用户在当前需求详情中停留持续超过 30 秒（默认 30s）才将其记录至「最近查看」
 */
export function useRecentTracker({
  workitemId,
  identifier,
  subject,
  category,
  status,
  spaceName,
  dwellMs = DEFAULT_DWELL_MS,
}: UseRecentTrackerOptions): void {
  // 保存最新引用，避免定时器闭包拿到过期数据
  const infoRef = useRef({
    workitemId,
    identifier,
    subject,
    category,
    status,
    spaceName,
  });

  useEffect(() => {
    infoRef.current = {
      workitemId,
      identifier,
      subject,
      category,
      status,
      spaceName,
    };
  }, [workitemId, identifier, subject, category, status, spaceName]);

  useEffect(() => {
    if (!workitemId || !identifier) return;

    // 只有在同一个需求中停留满 dwellMs (30s) 才触发保存
    const timer = window.setTimeout(() => {
      const current = infoRef.current;
      if (current.workitemId && current.identifier) {
        useRecentWorkitems.getState().record({
          workitemId: current.workitemId,
          identifier: current.identifier,
          subject: current.subject ?? '',
          category: current.category ?? undefined,
          status: current.status ?? undefined,
          spaceName: current.spaceName ?? undefined,
          stayedSeconds: Math.round(dwellMs / 1000),
        });
      }
    }, dwellMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [workitemId, identifier, dwellMs]);
}
