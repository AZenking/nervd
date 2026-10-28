// L2 store 单测：乐观更新「即时呈现 → 失败回滚」闭环（AGENTS.md §5.3）
import { describe, it, expect, vi, beforeEach } from 'vitest';

// 只 mock IPC 边界层（src/lib/api），不 mock 整个 store —— 测的就是 store 自身逻辑
vi.mock('@/lib/api', () => ({
  getWorkitemWorkflowStatuses: vi.fn(),
  updateWorkitem: vi.fn(),
  listWorkitemChildren: vi.fn(),
  listWorkitems: vi.fn(),
  listIterations: vi.fn(),
}));

import * as api from '@/lib/api';
import { createAppStore, useApp } from './app';
import { scopedItems, UNPLANNED_ITERATION, useUi } from './ui';
import type { WorkitemRow } from '@/lib/api';
import type { IterationSummary } from '@/types';

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

describe('revalidateList & loadList 双缓冲平滑刷新（防列表坍塌与闪烁）', () => {
  it('loadList: 在已有数据场景下执行非 next 刷新时，采用平滑合并而不是破坏性截断', async () => {
    useApp.setState({
      settings: { defaultSpaceIdentifier: 'test-space' } as any,
      items: [
        row({ identifier: 'REQ-1', workitemId: 'wi-1', subject: '需求1', status: '开发中' }),
        row({ identifier: 'REQ-2', workitemId: 'wi-2', subject: '需求2 (第2页已补拉)', status: '待办' }),
      ],
      nextToken: 'token-page-3',
    });

    // 模拟远端返回第一页：wi-1 状态更新为「已完成」
    vi.mocked(api.listWorkitems).mockResolvedValue({
      items: [
        {
          identifier: 'REQ-1',
          workitemId: 'wi-1',
          subject: '需求1',
          status: '已完成',
          category: 'Req',
        },
      ],
      nextToken: 'token-page-2',
    });

    await useApp.getState().loadList(false);

    const state = useApp.getState();
    // wi-1 原地更新为「已完成」
    expect(state.items[0].status).toBe('已完成');
    // wi-2 (第2页数据) 依然完好保留，没有被截断丢弃！
    expect(state.items).toHaveLength(2);
    expect(state.items[1].workitemId).toBe('wi-2');
    // 保留了现有已推进的 nextToken
    expect(state.nextToken).toBe('token-page-3');
  });

  it('revalidateList: 静默后台平滑重验，更新已有项、插入新增项，且不设置 loadingList', async () => {
    useApp.setState({
      settings: { defaultSpaceIdentifier: 'test-space' } as any,
      items: [
        row({ identifier: 'REQ-1', workitemId: 'wi-1', subject: '需求1', status: '开发中' }),
      ],
      loadingList: false,
      revalidatingList: false,
    });

    vi.mocked(api.listWorkitems).mockResolvedValue({
      items: [
        {
          identifier: 'REQ-NEW',
          workitemId: 'wi-new',
          subject: '最新创建的需求',
          status: '待办',
          category: 'Req',
        },
        {
          identifier: 'REQ-1',
          workitemId: 'wi-1',
          subject: '需求1',
          status: '已解决',
          category: 'Req',
        },
      ],
      nextToken: 'token-page-2',
    });

    await useApp.getState().revalidateList();

    const state = useApp.getState();
    expect(state.loadingList).toBe(false);
    expect(state.revalidatingList).toBe(false);
    expect(state.items).toHaveLength(2);
    // 新增项插入头部
    expect(state.items[0].workitemId).toBe('wi-new');
    // 既有项原地更新字段
    expect(state.items[1].workitemId).toBe('wi-1');
    expect(state.items[1].status).toBe('已解决');
  });

  it('loadList(next = true): 追加下一页时自动去重并追加在尾部，不产生重复条目', async () => {
    useApp.setState({
      settings: { defaultSpaceIdentifier: 'test-space' } as any,
      items: [
        row({ identifier: 'REQ-1', workitemId: 'wi-1', subject: '需求1', status: '开发中' }),
        row({ identifier: 'REQ-2', workitemId: 'wi-2', subject: '需求2', status: '待办' }),
      ],
      nextToken: 'token-page-2',
      loadingList: false,
    });

    // 远端返回下一页：包含重复项 wi-2（状态发生变化）和全新项 wi-3
    vi.mocked(api.listWorkitems).mockResolvedValue({
      items: [
        {
          identifier: 'REQ-2',
          workitemId: 'wi-2',
          subject: '需求2',
          status: '开发中',
          category: 'Req',
        },
        {
          identifier: 'REQ-3',
          workitemId: 'wi-3',
          subject: '需求3',
          status: '待办',
          category: 'Req',
        },
      ],
      nextToken: 'token-page-3',
    });

    await useApp.getState().loadList(true);

    const state = useApp.getState();
    // 总项数必须为 3（wi-2 去重原地更新，wi-3 有序追加在尾部），不得累加到 4 项！
    expect(state.items).toHaveLength(3);
    expect(state.items.map((it) => it.workitemId)).toEqual(['wi-1', 'wi-2', 'wi-3']);
    // wi-2 状态原地更新
    expect(state.items[1].status).toBe('开发中');
    expect(state.nextToken).toBe('token-page-3');
  });
});

describe('scopedItems 迭代收窄边界防护', () => {
  it('当存在真实迭代但传入不存在的迭代名时，返回空数组，杜绝泄露全部工作项', () => {
    const items = [
      row({ identifier: 'REQ-1', workitemId: 'wi-1', sprintId: 'sprint-1' }),
      row({ identifier: 'REQ-2', workitemId: 'wi-2', sprintId: 'sprint-2' }),
    ];
    const realIterations: IterationSummary[] = [
      { id: 'sprint-1', name: 'Sprint 1', title: '', state: '进行中', startDate: '', endDate: '' },
    ];
    const scoped = scopedItems(items, 'Unknown Sprint', realIterations);
    expect(scoped).toEqual([]);
  });
  it('未规划虚拟桶：只聚合 sprintId 为空的工作项，不泄露已规划迭代的工作项', () => {
    const items = [
      row({ identifier: 'REQ-1', workitemId: 'wi-1', sprintId: 'sprint-1' }),
      row({ identifier: 'REQ-2', workitemId: 'wi-2', sprintId: '' }),
    ];
    const realIterations: IterationSummary[] = [
      { id: 'sprint-1', name: 'Sprint 1', title: '', state: '进行中', startDate: '', endDate: '' },
    ];
    const scoped = scopedItems(items, '未规划', realIterations);
    expect(scoped.map((it) => it.workitemId)).toEqual(['wi-2']);
  });
  it('loadIterations：iterationKey 为虚拟「未规划」时，刷新后不被重置回真实迭代', async () => {
    vi.mocked(api.listIterations).mockResolvedValue([
      { id: 'sprint-1', name: 'Sprint 1', title: '', state: '进行中', startDate: '', endDate: '' },
    ] as never);
    useApp.setState({ iterations: [], iterationsFetchedAt: null });
    useUi.setState({ iterationKey: UNPLANNED_ITERATION.name });

    await useApp.getState().loadIterations();

    expect(useUi.getState().iterationKey).toBe(UNPLANNED_ITERATION.name);
  });



  it('当真实迭代为空（未加载完成/占位阶段）时，回退展示全量', () => {
    const items = [
      row({ identifier: 'REQ-1', workitemId: 'wi-1', sprintId: 'sprint-1' }),
    ];
    const scoped = scopedItems(items, 'Any Sprint', []);
    expect(scoped).toEqual(items);
  });
});

describe('拆分 store 的详情同步与实例隔离', () => {
  it('嵌套 workitem 详情也会同步状态、负责人和列表行', async () => {
    vi.mocked(api.getWorkitemWorkflowStatuses).mockResolvedValue([{ id: 's-done', name: '已完成' }] as never);
    vi.mocked(api.updateWorkitem).mockResolvedValue({ success: true } as never);
    useApp.setState({
      detail: {
        data: {
          workitem: {
            id: 'wi-1',
            status: { id: 's-old', name: '开发中' },
            assignedTo: { id: 'user-old', name: '旧负责人' },
          },
        },
      },
      items: [row({ workitemId: 'wi-1', status: '开发中', assignedTo: '旧负责人', assignedToId: 'user-old' })],
    });

    await useApp.getState().updateWorkitemStatusOptimistic('wi-1', '已完成');
    await useApp.getState().updateWorkitemAssigneeOptimistic('wi-1', 'user-new', '新负责人');

    const detail = useApp.getState().detail as any;
    expect(detail.data.workitem.status.name).toBe('已完成');
    expect(detail.data.workitem.assignedTo).toEqual({ id: 'user-new', name: '新负责人' });
    expect(useApp.getState().items[0].status).toBe('已完成');
    expect(useApp.getState().items[0].assignedTo).toBe('新负责人');
    expect(api.updateWorkitem).toHaveBeenCalledTimes(2);
  });

  it('子项旧调用方先做本地更新时，带 statusId 的统一 action 仍会发出 API 请求', async () => {
    vi.mocked(api.updateWorkitem).mockResolvedValue({ success: true } as never);
    useApp.setState({
      children: [{ workitemId: 'child-1', identifier: 'TASK-1', subject: '子项', status: '已完成' } as never],
    });

    await useApp.getState().updateChildStatusOptimistic('child-1', '已完成', 's-done');
    await useApp.getState().updateWorkitemStatusOptimistic('child-1', '已完成', 's-done');

    expect(api.updateWorkitem).toHaveBeenCalledWith('child-1', { statusId: 's-done' });
  });

  it('子项旧调用方的预更新在写入失败时按字段回滚，不覆盖其他状态', async () => {
    vi.mocked(api.updateWorkitem).mockRejectedValue(new Error('写入失败'));
    useApp.setState({
      children: [{ workitemId: 'child-2', identifier: 'TASK-2', subject: '子项', status: '待办', statusId: 's-todo' } as never],
    });

    await useApp.getState().updateChildStatusOptimistic('child-2', '已完成', 's-done');
    const result = await useApp.getState().updateWorkitemStatusOptimistic('child-2', '已完成', 's-done');

    expect(result).toBe(false);
    expect(useApp.getState().children[0].status).toBe('待办');
    expect(useApp.getState().toast?.kind).toBe('fail');
  });

  it('factory 创建的 store 不共享请求/乐观状态', () => {
    const first = createAppStore();
    const second = createAppStore();
    first.setState({ items: [row({ workitemId: 'first' })] });
    expect(second.getState().items).toEqual([]);
    second.setState({ items: [row({ workitemId: 'second' })] });
    expect(first.getState().items[0].workitemId).toBe('first');
  });
});

