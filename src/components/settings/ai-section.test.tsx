import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiSection } from './sections/AiSection';
import { useApp } from '@/store/app';
import { useSettingsDraft } from '@/store/settings-draft';

// @ts-expect-error configure React testing environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const aiApi = vi.hoisted(() => ({
  getAiSettings: vi.fn(),
  saveAiSettings: vi.fn(),
  saveAiApiKey: vi.fn(),
  deleteAiApiKey: vi.fn(),
  testAiConnection: vi.fn(),
}));

vi.mock('@/lib/ai-api', () => aiApi);

beforeAll(() => {
  // jsdom 未实现 Web Animations API（HeroUI Tabs 指示器 SharedElementTransition 会调用）
  if (typeof Element.prototype.getAnimations !== 'function') {
    Element.prototype.getAnimations = (() => []) as typeof Element.prototype.getAnimations;
  }
});

const SAVED = {
  provider: 'dashscope' as const,
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  model: 'qwen-plus',
  temperature: 0.3,
  breakdownMode: 'review' as const,
  defaultBreakdownTags: ['前端'],
  hasApiKey: true,
  customPrompts: {},
};

const setInputValue = async (el: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('AiSection 端点保存流程', () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    vi.useRealTimers();
    aiApi.getAiSettings.mockResolvedValue(SAVED);
    aiApi.saveAiSettings.mockResolvedValue(SAVED);
    useApp.setState({ toast: null });
    useSettingsDraft.setState({ autoSaveStatus: 'saved', fieldErrors: {} });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root && container) {
      act(() => root?.unmount());
      container.remove();
    }
    vi.clearAllMocks();
  });

  const render = async () => {
    await act(async () => {
      root?.render(<AiSection />);
      await Promise.resolve();
    });
    await act(async () => { await Promise.resolve(); });
  };

  it('打字时不逐字符保存，停止输入 800ms 后只提交一次', async () => {
    await render();
    const input = document.getElementById('ai-base-url') as HTMLInputElement;
    expect(input).not.toBeNull();

    await setInputValue(input, 'https://a');
    expect(aiApi.saveAiSettings).not.toHaveBeenCalled();
    expect(useSettingsDraft.getState().autoSaveStatus).toBe('unsaved');

    await act(async () => { await new Promise((r) => setTimeout(r, 900)); });

    expect(aiApi.saveAiSettings).toHaveBeenCalledTimes(1);
    expect(aiApi.saveAiSettings).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'https://a' }),
    );
    expect(useSettingsDraft.getState().autoSaveStatus).toBe('saved');
  });

  it('保存失败只进入存在错误态并给出行内提示，不弹红色 Toast', async () => {
    aiApi.saveAiSettings.mockRejectedValueOnce(
      new Error('AI Base URL 必须使用 https（localhost / 127.0.0.1 / ::1 等本机回环地址允许 http）'),
    );
    await render();
    const input = document.getElementById('ai-base-url') as HTMLInputElement;

    await setInputValue(input, 'http://example.com/v1');
    await act(async () => { await new Promise((r) => setTimeout(r, 900)); });

    expect(useSettingsDraft.getState().autoSaveStatus).toBe('error');
    expect(useSettingsDraft.getState().fieldErrors['ai-base-url']).toContain('https');
    expect(document.getElementById('ai-base-url-error')?.textContent).toContain('https');
    // 不再用全局 Toast 打断输入
    expect(useApp.getState().toast).toBeNull();
  });

  it('Ollama 本地端点预设可保存（loopback http 不被前端拦截）', async () => {
    await render();
    const tab = [...document.querySelectorAll('[role="tab"]')].find((el) =>
      el.textContent?.includes('本地 Ollama'),
    ) as HTMLElement;
    expect(tab).toBeTruthy();

    await act(async () => {
      tab.click();
      await Promise.resolve();
    });

    expect(aiApi.saveAiSettings).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:7b' }),
    );
    expect(useSettingsDraft.getState().autoSaveStatus).toBe('saved');
  });
});
