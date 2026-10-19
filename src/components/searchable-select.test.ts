import { describe, it, expect } from 'vitest';
import {
  computeVirtualSlice,
  VIRTUAL_ITEM_HEIGHT,
  VIRTUAL_CONTAINER_HEIGHT,
  VIRTUAL_OVERSCAN,
} from './searchable-select';

describe('computeVirtualSlice (虚拟滚动切片计算)', () => {
  it('当列表为空 (totalCount = 0) 时应返回空切片与 0 高度', () => {
    const slice = computeVirtualSlice(0, 0);
    expect(slice).toEqual({
      startIndex: 0,
      endIndex: 0,
      translateY: 0,
      totalHeight: 0,
    });
  });

  it('顶部初始位置 (scrollTop = 0) 应从 0 开始并渲染视口容量 + 缓冲项', () => {
    const totalCount = 1000;
    const slice = computeVirtualSlice(totalCount, 0);

    expect(slice.startIndex).toBe(0);
    expect(slice.translateY).toBe(0);
    expect(slice.totalHeight).toBe(1000 * VIRTUAL_ITEM_HEIGHT);

    // 252 / 32 = 7.875 -> ceil 为 8，加 overscan 4 = 12
    const expectedEnd = Math.ceil(VIRTUAL_CONTAINER_HEIGHT / VIRTUAL_ITEM_HEIGHT) + VIRTUAL_OVERSCAN;
    expect(slice.endIndex).toBe(expectedEnd);
    expect(slice.endIndex - slice.startIndex).toBeLessThanOrEqual(16);
  });

  it('滚动到中间位置时应正确计算 startIndex 与 translateY', () => {
    const totalCount = 1000;
    // 假设向下滚动了 640px (即 20 个 item)
    const scrollTop = 640;
    const slice = computeVirtualSlice(totalCount, scrollTop);

    // 640 / 32 = 20，减 overscan 4 = 16
    expect(slice.startIndex).toBe(16);
    expect(slice.translateY).toBe(16 * VIRTUAL_ITEM_HEIGHT);
    // endIndex = ceil((640 + 252) / 32) + 4 = 28 + 4 = 32
    expect(slice.endIndex).toBe(32);
    // 实际渲染数量仅为 16 项
    expect(slice.endIndex - slice.startIndex).toBe(16);
  });

  it('滚动到底部附近时 endIndex 不应超过 totalCount', () => {
    const totalCount = 50;
    // 滚动到非常大的距离
    const scrollTop = 2000;
    const slice = computeVirtualSlice(totalCount, scrollTop);

    expect(slice.endIndex).toBe(50);
    expect(slice.startIndex).toBeLessThan(50);
  });

  it('10,000 条数据的大型列表无论滚动到何处，DOM 渲染项数始终稳定在约 16 项 (O(1) 复杂度)', () => {
    const totalCount = 10000;
    for (const scrollTop of [0, 320, 1600, 32000, 319000]) {
      const slice = computeVirtualSlice(totalCount, scrollTop);
      const renderedCount = slice.endIndex - slice.startIndex;
      expect(renderedCount).toBeGreaterThan(0);
      expect(renderedCount).toBeLessThanOrEqual(20);
    }
  });
});
