import { describe, it, expect, beforeEach } from 'vitest';
import { useRecentWorkitems } from './recent-workitems';

describe('useRecentWorkitems', () => {
  beforeEach(() => {
    useRecentWorkitems.getState().clear();
  });

  it('能成功记录新的需求项', () => {
    useRecentWorkitems.getState().record({
      workitemId: 'w-101',
      identifier: 'REQ-101',
      subject: '实现最近查看功能',
      category: 'Req',
      status: '开发中',
      spaceName: '主项目',
      stayedSeconds: 30,
    });

    const items = useRecentWorkitems.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].identifier).toBe('REQ-101');
    expect(items[0].subject).toBe('实现最近查看功能');
    expect(items[0].stayedSeconds).toBe(30);
    expect(items[0].viewedAt).toBeGreaterThan(0);
  });

  it('重复访问相同需求时，更新时间戳并移到最前面', async () => {
    useRecentWorkitems.getState().record({
      workitemId: 'w-101',
      identifier: 'REQ-101',
      subject: '需求一',
    });

    useRecentWorkitems.getState().record({
      workitemId: 'w-102',
      identifier: 'REQ-102',
      subject: '需求二',
    });

    let items = useRecentWorkitems.getState().items;
    expect(items[0].identifier).toBe('REQ-102');
    expect(items[1].identifier).toBe('REQ-101');

    // 再次停留并记录 w-101，标题更新
    useRecentWorkitems.getState().record({
      workitemId: 'w-101',
      identifier: 'REQ-101',
      subject: '需求一（更新）',
      status: '测试中',
    });

    items = useRecentWorkitems.getState().items;
    expect(items).toHaveLength(2);
    expect(items[0].identifier).toBe('REQ-101');
    expect(items[0].subject).toBe('需求一（更新）');
    expect(items[0].status).toBe('测试中');
    expect(items[1].identifier).toBe('REQ-102');
  });

  it('支持移除单条记录与清空全部', () => {
    useRecentWorkitems.getState().record({ workitemId: 'w-1', identifier: 'REQ-1', subject: '1' });
    useRecentWorkitems.getState().record({ workitemId: 'w-2', identifier: 'REQ-2', subject: '2' });
    expect(useRecentWorkitems.getState().items).toHaveLength(2);

    useRecentWorkitems.getState().remove('w-1');
    expect(useRecentWorkitems.getState().items).toHaveLength(1);
    expect(useRecentWorkitems.getState().items[0].workitemId).toBe('w-2');

    useRecentWorkitems.getState().clear();
    expect(useRecentWorkitems.getState().items).toHaveLength(0);
  });
});
