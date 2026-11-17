import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequirementActivity } from './requirement-activity';

// 项目无 @testing-library：与 children-card.test.tsx / page-header.test.tsx 一致，
// 采用 vitest + jsdom + createRoot/act 直查 DOM。

const appState = vi.hoisted(() => ({
  settings: { allowWriteOps: true },
  reloadComments: vi.fn().mockResolvedValue(undefined),
}));

const uiState = vi.hoisted(() => ({
  openSettings: vi.fn(),
}));

vi.mock('@/store/app', () => ({
  useApp: (selector: (state: typeof appState) => unknown) => selector(appState),
}));

vi.mock('@/store/ui', () => ({
  useUi: (selector: (state: typeof uiState) => unknown) => selector(uiState),
}));

vi.mock('@/lib/api', () => ({
  createWorkitemComment: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/lib/ai-api', () => ({
  aiSummarizeComments: vi.fn(),
  aiGenerateCommentDraft: vi.fn().mockResolvedValue('一段生成好的评论草稿'),
}));

vi.mock('@/components/ui/toast', () => ({
  toast: { add: vi.fn() },
}));

// RichEditor 基于 Tiptap/ProseMirror，jsdom 中无需真实编辑能力：退化为 textarea
vi.mock('@/components/ui/rich-editor', async () => {
  const { createElement } = await import('react');
  return {
    RichEditor: (props: { content?: string; placeholder?: string }) =>
      createElement('textarea', {
        'data-testid': 'rich-editor',
        value: props.content ?? '',
        placeholder: props.placeholder,
        readOnly: true,
      }),
  };
});

import { aiGenerateCommentDraft } from '@/lib/ai-api';

let host: HTMLDivElement;
let root: Root;

const COMMENTS = [
  {
    author: { name: '林益生' },
    createdAt: '2026-11-12T10:00:00+08:00',
    content: '<p>后端接口已完成，等待联调。</p>',
  },
  {
    author: { name: '张三' },
    createdAt: '2026-11-12T11:30:00+08:00',
    content: '<p>前端页面已提测。</p>',
  },
];

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
  appState.settings = { allowWriteOps: true };
  vi.mocked(aiGenerateCommentDraft).mockClear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  document.body.innerHTML = '';
});

async function render() {
  await act(async () => {
    root.render(
      <RequirementActivity
        comments={COMMENTS}
        workitemId="req-1"
        identifier="REQ-101"
        subject="需求标题"
        branch="feature/req-101"
        ciStatus="success"
      />,
    );
  });
}

async function openAiMenu() {
  const trigger = host.querySelector<HTMLButtonElement>('[data-testid="activity-ai-menu-trigger"]');
  expect(trigger).not.toBeNull();
  await act(async () => {
    trigger!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

function menuItem(testId: string) {
  return document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
}

describe('RequirementActivity AI 收纳', () => {
  it('评论纪要保留在活动区（AI 提炼纪要入口与讨论时间轴）', async () => {
    await render();

    expect(host.textContent).toContain('动态');
    expect(host.textContent).toContain('AI 提炼纪要');
    expect(host.textContent).toContain('林益生');
    expect(host.textContent).toContain('前端页面已提测');
  });

  it('评论编辑区的 AI 动作收纳进「AI 辅助」下拉菜单，而不是并排常驻标签', async () => {
    await render();

    // 菜单关闭时动作不可见
    expect(host.querySelector('[data-testid="activity-ai-menu-trigger"]')).not.toBeNull();
    expect(host.textContent).not.toContain('研发进度同步');
    expect(host.textContent).not.toContain('提测交付说明');
    expect(host.textContent).not.toContain('智能润色');

    await openAiMenu();
    expect(menuItem('ai-menu-progress')?.textContent).toContain('研发进度同步');
    expect(menuItem('ai-menu-test-delivery')?.textContent).toContain('提测交付说明');
    expect(menuItem('ai-menu-polish')?.textContent).toContain('智能润色');
  });

  it('菜单项执行对应 AI 动作并携带动作类型', async () => {
    await render();
    await openAiMenu();

    await act(async () => {
      menuItem('ai-menu-progress')!.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      );
    });

    expect(aiGenerateCommentDraft).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'progress', identifier: 'REQ-101' }),
    );
  });

  it('智能润色在无输入时禁用并给出禁用原因，点击不触发生成', async () => {
    await render();
    await openAiMenu();

    const polish = menuItem('ai-menu-polish');
    expect(polish?.getAttribute('aria-disabled')).toBe('true');
    expect(polish?.textContent).toContain('先输入要点');

    await act(async () => {
      polish!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(aiGenerateCommentDraft).not.toHaveBeenCalled();
  });
});