// L2 store 单测：乐观更新「即时呈现 → 失败回滚」闭环（AGENTS.md §5.3）
import { describe, it, expect, vi, beforeEach } from 'vitest';

// 只 mock IPC 边界层（src/lib/api），不 mock 整个 store —— 测的就是 store 自身逻辑
vi.mock('@/lib/api', () => ({
  getWorkitemWorkflowStatuses: vi.fn(),
  updateWorkitem: vi.fn(),
  listWorkitemChildren: vi.fn(),
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

describe('addOptimisticChild and loadChildren optimistic merge', () => {
  it('创建子任务后立即乐观呈现，且即便远端受 ES 延迟索引返回空列表，也不会被覆盖丢弃', async () => {
    useApp.setState({
      selectedId: 'wi-req-1',
      children: [],
    });

    const newChild = {
      workitemId: 'wi-sub-1',
      identifier: 'TASK-101',
      subject: '新建子任务',
      category: 'Task',
      status: '待办',
    };

    // 1. 立即乐观插入
    useApp.getState().addOptimisticChild('wi-req-1', newChild);
    expect(useApp.getState().children).toHaveLength(1);
    expect(useApp.getState().children[0].identifier).toBe('TASK-101');

    // 2. 模拟随后立即调用的 loadChildren：云效 ES 尚未索引，返回空列表
    vi.mocked(api.listWorkitemChildren).mockResolvedValue({ items: [] } as never);
    await useApp.getState().loadChildren('wi-req-1');

    // 3. 验证乐观子项依然得以保留，没有因 ES 延迟而被冲刷置空
    expect(useApp.getState().children).toHaveLength(1);
    expect(useApp.getState().children[0].identifier).toBe('TASK-101');

    // 4. 当 ES 索引赶上并返回该数据时，能正常合并
    vi.mocked(api.listWorkitemChildren).mockResolvedValue({
      items: [{ ...newChild, status: '开发中' }],
    } as never);
    await useApp.getState().loadChildren('wi-req-1');
    expect(useApp.getState().children).toHaveLength(1);
    expect(useApp.getState().children[0].status).toBe('开发中');
  });
});

describe('updateWorkitemAssigneeOptimistic', () => {
  it('成功路径：detail、items、children 乐观更新新负责人，调用 API，并给出 ok Toast', async () => {
    vi.mocked(api.updateWorkitem).mockResolvedValue({ success: true } as never);

    useApp.setState({
      detail: {
        workitemId: 'wi-1',
        assignedTo: { id: 'user-old', name: '旧负责人' },
        workitem: {
          workitemId: 'wi-1',
          assignedTo: { id: 'user-old', name: '旧负责人' },
        },
      },
      items: [row({ identifier: 'REQ-2001', workitemId: 'wi-1', assignedTo: '旧负责人', assignedToId: 'user-old' })],
      children: [
        {
          workitemId: 'wi-1',
          identifier: 'TASK-1',
          subject: '子任务',
          assignedTo: '旧负责人',
        } as never,
      ],
      toast: null,
    });

    const ok = await useApp.getState().updateWorkitemAssigneeOptimistic('wi-1', 'user-new', '新负责人');

    expect(ok).toBe(true);
    const state = useApp.getState();
    const detail = state.detail as Record<string, any>;
    expect(detail?.assignedTo).toEqual({ id: 'user-new', name: '新负责人' });
    expect(detail?.workitem?.assignedTo).toEqual({ id: 'user-new', name: '新负责人' });
    expect(state.items[0].assignedTo).toBe('新负责人');
    expect(state.items[0].assignedToId).toBe('user-new');
    expect(state.children[0].assignedTo).toBe('新负责人');
    expect(api.updateWorkitem).toHaveBeenCalledWith('wi-1', { assignedTo: 'user-new' });
    expect(state.toast?.kind).toBe('ok');
    expect(state.toast?.text).toContain('新负责人');
  });

  it('失败路径：API 报错时回滚原负责人并发出 fail Toast', async () => {
    vi.mocked(api.updateWorkitem).mockRejectedValue(new Error('云效 403 权限不足'));

    useApp.setState({
      detail: {
        workitemId: 'wi-1',
        assignedTo: '旧负责人',
        workitem: {
          workitemId: 'wi-1',
          assignedTo: '旧负责人',
        },
      },
      items: [row({ identifier: 'REQ-2001', workitemId: 'wi-1', assignedTo: '旧负责人', assignedToId: 'user-old' })],
      children: [
        {
          workitemId: 'wi-1',
          identifier: 'TASK-1',
          subject: '子任务',
          assignedTo: '旧负责人',
        } as never,
      ],
      toast: null,
    });

    const ok = await useApp.getState().updateWorkitemAssigneeOptimistic('wi-1', 'user-new', '新负责人');

    expect(ok).toBe(false);
    const state = useApp.getState();
    const detail = state.detail as Record<string, any>;
    expect(detail?.assignedTo).toBe('旧负责人');
    expect(state.items[0].assignedTo).toBe('旧负责人');
    expect(state.items[0].assignedToId).toBe('user-old');
    expect(state.children[0].assignedTo).toBe('旧负责人');
    expect(state.toast?.kind).toBe('fail');
    expect(state.toast?.text).toContain('负责人修改失败');
  });
});

