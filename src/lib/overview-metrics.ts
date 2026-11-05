import type { WorkitemRow } from '@/lib/api';
import { statusMeta, STATUS_TONE_ORDER } from '@/components/status-icon';
import type { StatusTone } from '@/components/StatusBadge';
import type { IterationSummary } from '@/types';

export interface StatusChartDatum {
  label: string;
  count: number;
  percent?: number;
  tone: 'ok' | 'run' | 'fail' | 'idle';
}

export interface UpdateActivityDatum {
  date: string;
  count: number;
}

export interface UpdateActivityResult {
  data: UpdateActivityDatum[];
  missingCount: number;
}

export function scopeOverviewItems(
  items: WorkitemRow[],
  iteration: IterationSummary | null | undefined,
): WorkitemRow[] {
  if (!iteration) return [];
  if (!iteration.id) return items.filter((item) => !item.sprintId);
  return items.filter((item) => item.sprintId === iteration.id);
}

function statusLabel(status?: string | null): string {
  return status?.trim() || '—';
}

function toneOrder(tone: StatusTone): number {
  return STATUS_TONE_ORDER.indexOf(tone);
}

export function toStatusChartData(items: Pick<WorkitemRow, 'status'>[], complete: boolean): StatusChartDatum[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const label = statusLabel(item.status);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const total = items.length;
  return [...counts.entries()]
    .map(([label, count]) => ({
      label,
      count,
      tone: statusMeta(label).tone,
      ...(complete && total > 0 ? { percent: Math.round((count / total) * 100) } : {}),
    }))
    .sort((a, b) => toneOrder(a.tone) - toneOrder(b.tone) || b.count - a.count || a.label.localeCompare(b.label));
}

export function normalizeUpdateDate(value?: string | null): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const isoDate = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoDate) return isoDate[1];
  const timestamp = Date.parse(raw);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString().slice(0, 10);
}

export function toUpdateActivityData(
  items: Pick<WorkitemRow, 'updatedAt'>[],
): UpdateActivityResult {
  const counts = new Map<string, number>();
  let missingCount = 0;
  for (const item of items) {
    const date = normalizeUpdateDate(item.updatedAt);
    if (!date) {
      missingCount += 1;
      continue;
    }
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  return {
    data: [...counts.entries()]
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    missingCount,
  };
}

export function sortRecentOverviewItems<T extends Pick<WorkitemRow, 'updatedAt' | 'workitemId'>>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    const aTime = normalizeUpdateDate(a.updatedAt);
    const bTime = normalizeUpdateDate(b.updatedAt);
    if (aTime === null && bTime !== null) return 1;
    if (aTime !== null && bTime === null) return -1;
    return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') || a.workitemId.localeCompare(b.workitemId);
  });
}
