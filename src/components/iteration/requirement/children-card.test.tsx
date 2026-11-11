import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChildrenCard } from './children-card';
import { useApp } from '@/store/app';
import * as api from '@/lib/api';
import type { WorkitemChild } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  listWorkitemTypes: vi.fn().mockResolvedValue([
    { id: 'type-task', name: '任务', category: 'Task', defaultType: true },
    { id: 'type-bug', name: '缺陷', category: 'Bug', defaultType: true },
  ]),
  createWorkitemChild: vi.fn().mockResolvedValue({
    workitemId: 'task-9',
    identifier: 'TASK-909',
    subject: '编写回归用例',
    category: 'Task',
    status: '待办',
    assignedTo: '林益生',
  }),
  createWorkitemComment: vi.fn().mockResolvedValue({ success: true }),
  setWorkitemEstimatedEffort: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/ai-api', () => ({
  getAiSettings: vi.fn().mockResolvedValue({ hasApiKey: false, breakdownMode: 'review', defaultBreakdownTags: [] }),
  aiBreakdownRequirement: vi.fn(),
}));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as any;
  }
  if (typeof Element.prototype.getAnimations === 'undefined') {
    Element.prototype.getAnimations = () => [];
  }
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);

  useApp.setState({
    settings: {
      organizationId: 'mock-org',
      defaultSpaceIdentifier: 'mock-space',
      linkPattern: 'REQ-(\\d+)',
      watchedRepos: [],
      allowWriteOps: true,
      workitemRepos: {},
      branchRuleTemplates: [],
      workitemRepoBranchTemplates: {},
      jenkinsConnections: [],
      repoCiBindings: {},
      hasPat: true,
    },
  });
});

afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
});

describe('ChildrenCard Fast Create with Select Components', () => {
  it('opens fast create inline row and renders Select components for severity and assignee', async () => {
    const candidates = [
      { id: 'u1', name: '林益生', role: '需求负责人' },
      { id: 'u2', name: '张三', role: '前端' },
    ];

    await act(async () => {
      root.render(
        <ChildrenCard
          title="缺陷"
          category="Bug"
          description="挂载在该需求下的缺陷"
          items={[]}
          parentWorkitemId="req-1"
          parentIdentifier="REQ-101"
          parentSubject="需求标题"
          parentAssigneeId="u1"
          parentAssigneeName="林益生"
          candidateAssignees={candidates}
          onSelect={vi.fn()}
        />
      );
    });

    // 点击 "+ 新建缺陷" 打开快速创建行
    const addBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('新建缺陷'),
    );
    expect(addBtn).not.toBeUndefined();

    await act(async () => {
      addBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    // 检查是否渲染了三个 Select / Tag
    const triggers = host.querySelectorAll('[data-slot="select-trigger"]');
    expect(triggers.length).toBeGreaterThanOrEqual(1);

    // 检查指定人 Select 回显为林益生
    const assigneeTrigger = Array.from(triggers).find((t) => t.textContent?.includes('林益生'));
    expect(assigneeTrigger).not.toBeUndefined();

    // 检查严重程度 Select 回显为一般
    const severityTrigger = Array.from(triggers).find((t) => t.textContent?.includes('一般'));
    expect(severityTrigger).not.toBeUndefined();

    // 交互测试：点击指定人 Select 触发器
    await act(async () => {
      assigneeTrigger?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    // 弹出的 ListBox 中找到张三并点击切换
    const zhangsanOption = Array.from(document.querySelectorAll('[role="listbox"] [role="option"]')).find(
      (opt) => opt.textContent?.includes('张三'),
    );
    expect(zhangsanOption).not.toBeUndefined();

    await act(async () => {
      zhangsanOption?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    // 检查指定人 Select 回显更新为张三
    const updatedTriggers = host.querySelectorAll('[data-slot="select-trigger"]');
    const updatedAssignee = Array.from(updatedTriggers).find((t) => t.textContent?.includes('张三'));
    expect(updatedAssignee).not.toBeUndefined();
  });
});

describe('ChildrenCard 创建动态回写', () => {
  const renderCard = async (items: any[] = []) => {
    await act(async () => {
      root.render(
        <ChildrenCard
          title="子任务"
          category="Task"
          description="挂载在该需求下的子任务"
          items={items}
          parentWorkitemId="req-1"
          parentIdentifier="REQ-101"
          parentSubject="需求标题"
          parentAssigneeId="u1"
          parentAssigneeName="林益生"
          candidateAssignees={[{ id: 'u1', name: '林益生', role: '需求负责人' }]}
          onSelect={vi.fn()}
        />,
      );
    });
  };

  const typeAndSubmit = async (text: string) => {
    const addBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('新建子任务'),
    );
    await act(async () => {
      addBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    const input = host.querySelector('input[placeholder^="输入子任务名称"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
  };

  beforeEach(() => {
    vi.mocked(api.createWorkitemChild).mockClear();
    vi.mocked(api.createWorkitemComment).mockClear();
    vi.mocked(api.createWorkitemComment).mockResolvedValue({ success: true });
    const loadChildren = vi.fn().mockResolvedValue(undefined);
    const addOptimisticChild = vi.fn();
    const reloadComments = vi.fn().mockResolvedValue(undefined);
    useApp.setState({ loadChildren, addOptimisticChild, reloadComments } as never);
  });

  it('单个任务创建成功后向父需求动态发布「概要 + 状态」评论并刷新动态', async () => {
    await renderCard();
    await typeAndSubmit('编写回归用例');

    expect(api.createWorkitemChild).toHaveBeenCalledWith('req-1', expect.objectContaining({
      subject: '编写回归用例',
      category: 'Task',
    }));
    expect(api.createWorkitemComment).toHaveBeenCalledTimes(1);
    const [workitemId, content, formatType] = vi.mocked(api.createWorkitemComment).mock.calls[0];
    expect(workitemId).toBe('req-1');
    expect(formatType).toBe('RICHTEXT');
    expect(String(content)).toContain('TASK-909');
    expect(String(content)).toContain('编写回归用例');
    expect(String(content)).toContain('待办');
    // 动态刷新面向父需求
    const reloadComments = useApp.getState().reloadComments as unknown as ReturnType<typeof vi.fn>;
    expect(reloadComments).toHaveBeenCalledWith('req-1');
  });

  it('动态评论发布失败不阻断创建流程（无异常抛出）', async () => {
    vi.mocked(api.createWorkitemComment).mockRejectedValueOnce(new Error('云效 400 拦截'));
    await renderCard();
    await typeAndSubmit('编写回归用例');

    expect(api.createWorkitemChild).toHaveBeenCalledTimes(1);
    // 评论失败后不再刷新动态
    const reloadComments = useApp.getState().reloadComments as unknown as ReturnType<typeof vi.fn>;
    expect(reloadComments).not.toHaveBeenCalled();
  });

  it('行内快速新建输入框在 IME 输入法选词与按键时阻止事件冒泡且不提前提交', async () => {
    await renderCard();
    const addBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('新建子任务'),
    );
    await act(async () => {
      addBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    const input = host.querySelector('input[placeholder^="输入子任务名称"]') as HTMLInputElement;
    expect(input).not.toBeNull();

    // 监听冒泡到全局 window 的 keydown 事件（验证不会被全局快捷键截获）
    let bubbleCount = 0;
    const onWindowKeyDown = () => { bubbleCount += 1; };
    window.addEventListener('keydown', onWindowKeyDown);

    // 1. 按 Space 键时阻止冒泡到全局
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    });
    expect(bubbleCount).toBe(0);

    // 2. IME 选字阶段按 Enter，不触发 handleCreate
    await act(async () => {
      const imeEnter = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(imeEnter, 'isComposing', { value: true });
      input.dispatchEvent(imeEnter);
    });
    expect(api.createWorkitemChild).not.toHaveBeenCalled();

    window.removeEventListener('keydown', onWindowKeyDown);
  });

  it('工作项行渲染 title 提示属性以支持长文本悬浮查看', async () => {
    const mockChild: WorkitemChild = {
      workitemId: 'c-100',
      identifier: 'TASK-100',
      subject: '超长子任务标题用于测试 tooltip 和 title 属性截断提示展示',
      status: '待办',
      category: 'Task',
    };
    await renderCard([mockChild]);

    const row = host.querySelector('[data-testid="child-row"]') as HTMLElement;
    expect(row).not.toBeNull();
    expect(row.getAttribute('title')).toContain('TASK-100');
    expect(row.getAttribute('title')).toContain('超长子任务标题');

    const idSpan = row.querySelector('span.font-mono') as HTMLElement;
    expect(idSpan).not.toBeNull();
    expect(idSpan.getAttribute('title')).toBe('TASK-100');
  });
});
