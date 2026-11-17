import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChildrenCard } from './children-card';
import { useApp } from '@/store/app';
import * as api from '@/lib/api';
import { toast } from '@/components/ui/toast';
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

vi.mock('@/components/ui/toast', () => ({
  toast: { add: vi.fn() },
}));

// Agent 联动：本地仓库绑定 / 当前工作项 / 剪贴板均用内存桩，避免测试触达 Tauri IPC。
const attributionMock = vi.hoisted(() => ({
  bindings: [] as Array<{
    repoId: number;
    path: string;
    hookInstalled: boolean;
    hookMode: 'fill' | 'enforce' | 'off';
    updatedAt: number;
  }>,
  activeWorkitems: {} as Record<number, {
    repoId: number;
    workitemId: string;
    identifier: string;
    category: 'Req' | 'Bug' | 'Task';
    parentWorkitemId?: string;
    parentIdentifier?: string;
    updatedAt: number;
  }>,
  loadBindings: vi.fn(async () => []),
  loadActiveWorkitems: vi.fn(async () => ({})),
  setActive: vi.fn(async () => true),
}));

vi.mock('@/store/attribution', () => ({
  useAttribution: (selector: (state: typeof attributionMock) => unknown) => selector(attributionMock),
}));

const copyMock = vi.hoisted(() => vi.fn(async (_text?: string) => true));
vi.mock('@/hooks/use-clipboard', () => ({
  useClipboard: () => ({ copy: copyMock, copied: false }),
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
  attributionMock.bindings = [];
  attributionMock.activeWorkitems = {};
  attributionMock.loadBindings.mockClear();
  attributionMock.loadActiveWorkitems.mockClear();
  copyMock.mockClear();
  vi.mocked(toast.add).mockClear();
});

afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
});

/** 点击区块标题右侧 ButtonGroup 里的动作按钮（新建 / AI 拆解，均常驻、不再藏进「更多」菜单） */
async function clickCardAction(testId: string) {
  const button = host.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
  expect(button, `未找到动作按钮：${testId}`).not.toBeNull();
  await act(async () => {
    button!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

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

    // 从「更多」菜单选择「新建缺陷」打开快速创建行（AI 拆解已收纳进同一菜单）
    await clickCardAction('children-card-add');

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
    await clickCardAction('children-card-add');
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
    await clickCardAction('children-card-add');
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

describe('ChildrenCard 区块动作 ButtonGroup（新建 / AI 拆解常驻）', () => {
  const renderCard = async (options: { category?: 'Task' | 'Bug'; allowWriteOps?: boolean } = {}) => {
    const { category = 'Task', allowWriteOps = true } = options;
    useApp.setState({
      settings: {
        ...(useApp.getState().settings as unknown as Record<string, unknown>),
        allowWriteOps,
      } as never,
    });
    await act(async () => {
      root.render(
        <ChildrenCard
          title={category === 'Bug' ? '缺陷' : '子任务'}
          category={category}
          items={[]}
          parentWorkitemId="req-1"
          parentIdentifier="REQ-101"
          parentSubject="需求标题"
          parentAssigneeId="u1"
          parentAssigneeName="林益生"
          onSelect={vi.fn()}
        />,
      );
    });
  };

  beforeEach(() => {
    vi.mocked(toast.add).mockClear();
  });

  it('AI 智能拆解与新建常驻在区块标题的 ButtonGroup 里，不再收进「更多」菜单', async () => {
    await renderCard();

    // 2026-11-17 设计评审：取消「更多」菜单，两个动作直接以 ButtonGroup 常驻
    expect(host.querySelector('[data-testid="children-card-more-trigger"]')).toBeNull();
    const group = host.querySelector('[aria-label="子任务操作"]');
    expect(group?.getAttribute('data-slot')).toBe('button-group');

    const addButton = host.querySelector<HTMLElement>('[data-testid="children-card-add"]');
    const aiButton = host.querySelector<HTMLElement>('[data-testid="children-card-ai-breakdown"]');
    // 文案超过四个字 → 只给图标，语义由 aria-label / Tooltip 承载
    expect(addButton?.getAttribute('aria-label')).toBe('新建子任务');
    expect(aiButton?.getAttribute('aria-label')).toBe('AI 智能拆解');
    expect(addButton?.textContent ?? '').not.toContain('新建子任务');
  });

  it('只读模式下动作按钮保留可点击的 Toast 引导而不是静默失败', async () => {
    await renderCard({ allowWriteOps: false });

    const aiButton = host.querySelector<HTMLElement>('[data-testid="children-card-ai-breakdown"]');
    expect(aiButton?.getAttribute('aria-disabled')).toBe('true');

    await clickCardAction('children-card-ai-breakdown');
    expect(toast.add).toHaveBeenCalledWith(
      expect.objectContaining({ title: '当前处于只读模式', type: 'warning' }),
    );
  });

  it('缺陷区块不提供 AI 智能拆解按钮（仅子任务支持）', async () => {
    await renderCard({ category: 'Bug' });

    expect(host.querySelector('[data-testid="children-card-ai-breakdown"]')).toBeNull();
    expect(host.querySelector('[data-testid="children-card-add"]')?.getAttribute('aria-label')).toBe(
      '新建缺陷',
    );
  });
});


describe('ChildrenCard Agent 联动（子任务行处理入口与状态）', () => {
  const items: WorkitemChild[] = [
    { workitemId: 'task-1', identifier: 'TASK-101', subject: '前端联调', category: 'Task', status: '待办' },
    { workitemId: 'task-2', identifier: 'TASK-102', subject: '后端联调', category: 'Task', status: '待办' },
  ];

  const renderCard = async () => {
    useApp.setState({
      repositories: [
        { id: 101, name: 'nervd-web', pathWithNamespace: 'codeup/nervd-web' },
        { id: 102, name: 'nervd-core', pathWithNamespace: 'codeup/nervd-core' },
      ] as never,
    });
    await act(async () => {
      root.render(
        <ChildrenCard
          title="子任务"
          category="Task"
          items={items}
          parentWorkitemId="req-1"
          parentIdentifier="REQ-101"
          parentSubject="需求标题"
          candidateAssignees={[{ id: 'u1', name: '林益生', role: '需求负责人' }]}
          onSelect={vi.fn()}
        />,
      );
    });
  };

  it('每行都有处理入口；当前处理中的子任务透出仓库状态；可复制 Codex 命令', async () => {
    attributionMock.bindings = [
      { repoId: 101, path: '/tmp/nervd-web', hookInstalled: true, hookMode: 'fill', updatedAt: 1 },
    ];
    attributionMock.activeWorkitems = {
      101: {
        repoId: 101,
        workitemId: 'task-1',
        identifier: 'TASK-101',
        category: 'Task',
        parentWorkitemId: 'req-1',
        updatedAt: 2,
      },
    };
    await renderCard();

    // 行内处理按钮：每行一个
    expect(host.querySelectorAll('[data-testid="child-agent-start"]')).toHaveLength(2);
    // 状态透出：仅处理中的子任务显示仓库 chip
    expect(host.textContent).toContain('处理中 · nervd-web');

    // Codex 命令复制：使用该子任务当前所在仓库 + 显式 --workitem/--req
    const codexButtons = host.querySelectorAll<HTMLElement>('[data-testid="child-codex-copy"]');
    expect(codexButtons).toHaveLength(2);
    await act(async () => {
      codexButtons[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(copyMock).toHaveBeenCalledTimes(1);
    const command = copyMock.mock.calls[0][0] as string;
    expect(command).toContain("cd '/tmp/nervd-web' && codex '");
    expect(command).toContain('--workitem TASK-101');
    expect(command).toContain('--req REQ-101');
  });

  it('未确定仓库且存在多个绑定时，给出先点「处理」的提示且不复制命令', async () => {
    attributionMock.bindings = [
      { repoId: 101, path: '/tmp/nervd-web', hookInstalled: true, hookMode: 'fill', updatedAt: 1 },
      { repoId: 102, path: '/tmp/nervd-core', hookInstalled: true, hookMode: 'fill', updatedAt: 1 },
    ];
    attributionMock.activeWorkitems = {};
    await renderCard();

    expect(host.textContent).not.toContain('处理中 ·');
    const codexButton = host.querySelector<HTMLElement>('[data-testid="child-codex-copy"]');
    expect(codexButton).not.toBeNull();
    await act(async () => {
      codexButton!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(copyMock).not.toHaveBeenCalled();
    expect(toast.add).toHaveBeenCalledWith(expect.objectContaining({ type: 'warning' }));
  });
});
