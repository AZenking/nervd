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

  it('评论编辑区的 AI 动作常驻在同一个 ButtonGroup 里（不再收进下拉菜单）', async () => {
    await render();

    const group = host.querySelector('[data-slot="button-group"][aria-label="AI 辅助"]');
    expect(group).not.toBeNull();
    expect(host.querySelector('[data-testid="activity-ai-menu-trigger"]')).toBeNull();
    for (const [testId, label] of [
      ['ai-menu-progress', '研发进度同步'],
      ['ai-menu-test-delivery', '提测交付说明'],
      ['ai-menu-polish', '智能润色'],
    ] as const) {
      const btn = menuItem(testId);
      expect(btn).not.toBeNull();
      expect(btn?.textContent).toContain(label);
      expect(btn?.closest('[data-slot="button-group"]')).not.toBeNull();
    }
  });

  it('点击 AI 动作按钮执行对应生成并携带动作类型', async () => {
    await render();

    await act(async () => {
      menuItem('ai-menu-progress')!.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      );
    });

    expect(aiGenerateCommentDraft).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'progress', identifier: 'REQ-101' }),
    );
  });

  it('智能润色在无输入时禁用（原生 disabled），点击不触发生成', async () => {
    await render();

    const polish = menuItem('ai-menu-polish') as HTMLButtonElement | null;
    expect(polish).not.toBeNull();
    expect(polish?.disabled).toBe(true);

    await act(async () => {
      polish!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(aiGenerateCommentDraft).not.toHaveBeenCalled();
  });
});