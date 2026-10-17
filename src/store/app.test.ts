// L2 store 单测：乐观更新「即时呈现 → 失败回滚」闭环（AGENTS.md §5.3）
import { describe, it, expect, vi, beforeEach } from 'vitest';

// 只 mock IPC 边界层（src/lib/api），不 mock 整个 store —— 测的就是 store 自身逻辑
vi.mock('@/lib/api', () => ({
  getWorkitemWorkflowStatuses: vi.fn(),
  updateWorkitem: vi.fn(),
}));

import * as api from '@/lib/api';
import { useApp } from './app';
import type { WorkitemRow } from '@/lib/api';

const row = (over: Partial<WorkitemRow>): WorkitemRow => ({
  identifier: 'REQ-2001',
  workitemId: 'wi-1',
  subject: '测试工作项',
  status: '开发中',
  category: 'Req',
  ...over,
} as WorkitemRow);

beforeEach(() => {
  vi.clearAllMocks();
  useApp.setState({
    items: [row({ identifier: 'REQ-2001', workitemId: 'wi-1', status: '开发中' })],
    children: [],
    detail: null,
    toast: null,
  });
});

describe('updateWorkitemStatusOptimistic', () => {
  it('成功路径：状态保持新值，返回 true 并给出 ok Toast', async () => {
    vi.mocked(api.getWorkitemWorkflowStatuses).mockResolvedValue([
      { id: 's-done', name: '已完成' },
    ] as never);
    vi.mocked(api.updateWorkitem).mockResolvedValue({ success: true } as never);

    const ok = await useApp.getState().updateWorkitemStatusOptimistic('wi-1', '已完成');

    expect(ok).toBe(true);
    expect(useApp.getState().items[0].status).toBe('已完成');
    expect(api.updateWorkitem).toHaveBeenCalledWith('wi-1', { statusId: 's-done' });
    expect(useApp.getState().toast?.kind).toBe('ok');
  });

  it('失败路径：items 回滚为旧值，返回 false 并给出 fail Toast', async () => {
    vi.mocked(api.getWorkitemWorkflowStatuses).mockResolvedValue([
      { id: 's-done', name: '已完成' },
    ] as never);
    vi.mocked(api.updateWorkitem).mockRejectedValue(new Error('云效 403'));

    const ok = await useApp.getState().updateWorkitemStatusOptimistic('wi-1', '已完成');

    expect(ok).toBe(false);
    expect(useApp.getState().items[0].status).toBe('开发中'); // 已回滚
    expect(useApp.getState().toast?.kind).toBe('fail');
    expect(useApp.getState().toast?.text).toContain('状态流转失败');
  });

  it('状态字典拉取失败但提供了 statusId 时仍可成功更新', async () => {
    vi.mocked(api.getWorkitemWorkflowStatuses).mockRejectedValue(new Error('字典 500'));
    vi.mocked(api.updateWorkitem).mockResolvedValue({ success: true } as never);

    const ok = await useApp.getState().updateWorkitemStatusOptimistic('wi-1', '已完成', 's-done');

    expect(ok).toBe(true);
    expect(useApp.getState().items[0].status).toBe('已完成');
    expect(api.updateWorkitem).toHaveBeenCalledWith('wi-1', { statusId: 's-done' });
  });

  it('状态字典拉取失败且未提供 statusId 时应回滚并报错', async () => {
    vi.mocked(api.getWorkitemWorkflowStatuses).mockRejectedValue(new Error('字典 500'));

    const ok = await useApp.getState().updateWorkitemStatusOptimistic('wi-1', '已完成');

    expect(ok).toBe(false);
    expect(useApp.getState().items[0].status).toBe('开发中');
    expect(useApp.getState().toast?.kind).toBe('fail');
    expect(useApp.getState().toast?.text).toContain('无法找到目标状态「已完成」');
  });
});

describe('updateWorkitemDescriptionOptimistic', () => {
  it('成功路径：detail、items、children 乐观更新新描述，调用 API，且不发生全量 detail 重置', async () => {
    vi.mocked(api.updateWorkitem).mockResolvedValue({ success: true } as never);

    useApp.setState({
      detail: {
        workitemId: 'wi-1',
        description: '<p>旧描述</p>',
        workitem: {
          workitemId: 'wi-1',
          description: '<p>旧描述</p>',
        },
      },
      items: [row({ identifier: 'REQ-2001', workitemId: 'wi-1', status: '开发中' })],
      children: [
        {
          workitemId: 'wi-child-1',
          identifier: 'TASK-1',
          subject: '子任务',
          status: '待办',
          category: 'Task',
        } as never,
      ],
      loadingDetail: false,
    });

    const ok = await useApp.getState().updateWorkitemDescriptionOptimistic('wi-1', '<p>新更新的描述</p>');

    expect(ok).toBe(true);
    const state = useApp.getState();
    const detail = state.detail as Record<string, any>;
    expect(detail?.description).toBe('<p>新更新的描述</p>');
    expect(detail?.workitem?.description).toBe('<p>新更新的描述</p>');
    expect(state.loadingDetail).toBe(false); // 绝不触发 loadingDetail 大刷新
    expect(api.updateWorkitem).toHaveBeenCalledWith('wi-1', {
      description: '<p>新更新的描述</p>',
      formatType: 'RICHTEXT',
    });
  });

  it('失败路径：API 报错时回滚原描述并发出 fail Toast', async () => {
    vi.mocked(api.updateWorkitem).mockRejectedValue(new Error('网络超时 504'));

    const initialDetail = {
      workitemId: 'wi-1',
      description: '<p>原描述</p>',
      workitem: {
        workitemId: 'wi-1',
        description: '<p>原描述</p>',
      },
    };

    useApp.setState({
      detail: initialDetail,
      items: [row({ identifier: 'REQ-2001', workitemId: 'wi-1' })],
      toast: null,
    });

    const ok = await useApp.getState().updateWorkitemDescriptionOptimistic('wi-1', '<p>尝试保存的新描述</p>');

    expect(ok).toBe(false);
    const state = useApp.getState();
    const detail = state.detail as Record<string, any>;
    expect(detail?.description).toBe('<p>原描述</p>');
    expect(state.toast?.kind).toBe('fail');
    expect(state.toast?.text).toContain('描述保存失败');
  });
});
