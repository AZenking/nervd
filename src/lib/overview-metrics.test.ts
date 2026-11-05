import { describe, expect, it } from 'vitest';
import {
  normalizeUpdateDate,
  scopeOverviewItems,
  sortRecentOverviewItems,
  toStatusChartData,
  toUpdateActivityData,
} from './overview-metrics';

describe('overview metrics', () => {
  it('按原始状态聚合并在完整数据时计算占比', () => {
    const rows = toStatusChartData(
      [
        { status: '已完成' },
        { status: '进行中' },
        { status: '未知自定义状态' },
        { status: '已完成' },
      ],
      true,
    );

    expect(rows.map((row) => row.label)).toEqual(['进行中', '未知自定义状态', '已完成']);
    expect(rows.find((row) => row.label === '已完成')?.percent).toBe(50);
  });

  it('部分加载只返回计数，不伪造完整占比', () => {
    const rows = toStatusChartData([{ status: '已完成' }, { status: '进行中' }], false);
    expect(rows.every((row) => row.percent === undefined)).toBe(true);
  });

  it('按日期聚合更新时间，并单独统计缺失值', () => {
    const result = toUpdateActivityData([
      { updatedAt: '2026-10-29T10:00:00Z' },
      { updatedAt: '2026-10-29 11:00:00' },
      { updatedAt: '' },
      { updatedAt: 'not-a-date' },
    ]);

    expect(result.data).toEqual([{ date: '2026-10-29', count: 2 }]);
    expect(result.missingCount).toBe(2);
  });

  it('无更新时间排在最近更新列表末尾', () => {
    const result = sortRecentOverviewItems([
      { workitemId: 'old', updatedAt: '2026-10-01' },
      { workitemId: 'missing', updatedAt: undefined },
      { workitemId: 'new', updatedAt: '2026-10-29' },
    ]);
    expect(result.map((item) => item.workitemId)).toEqual(['new', 'old', 'missing']);
  });

  it('优先保留日期字符串的日期部分，不改变后端时区语义', () => {
    expect(normalizeUpdateDate('2026-10-29T23:59:59+08:00')).toBe('2026-10-29');
    expect(normalizeUpdateDate('')).toBeNull();
  });

  it('按迭代 ID 收窄范围，同名迭代不会串数据', () => {
    const items = [
      { workitemId: 'a', identifier: 'REQ-1', subject: 'A', status: '待办', category: 'Req', sprintId: 'id-a' },
      { workitemId: 'b', identifier: 'REQ-2', subject: 'B', status: '待办', category: 'Req', sprintId: 'id-b' },
    ] as never;
    const result = scopeOverviewItems(items, {
      id: 'id-b',
      name: '同名迭代',
      title: '',
      state: '进行中',
      startDate: '',
      endDate: '',
    });
    expect(result.map((item) => item.workitemId)).toEqual(['b']);
  });
});
