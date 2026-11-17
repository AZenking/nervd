import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppearanceSection } from './AppearanceSection';
import { useApp } from '@/store/app';
import { useUi } from '@/store/ui';

// @ts-expect-error configure React testing environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('AppearanceSection 外观与交互', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    useUi.setState({ theme: 'system', resolvedTheme: 'dark', shortcutsOpen: false });
    useApp.setState({
      currentUser: { id: 'user-1', name: '测试用户', email: 'dev@example.com' },
      workitemHighlight: {
        enabled: true,
        highlightAssignee: true,
        highlightRelated: false,
        customName: '花名',
      },
    } as never);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(() => root.unmount());
    host.remove();
    document.body.innerHTML = '';
  });

  it('承载主题、需求高亮、姓名匹配与快捷键入口', async () => {
    await act(async () => {
      root.render(<AppearanceSection />);
      await Promise.resolve();
    });

    const text = document.body.textContent ?? '';
    expect(text).toContain('明暗主题模式');
    expect(text).toContain('跟随系统');
    expect(text).toContain('开启需求列表高亮标记');
    expect(text).toContain('高亮我负责的需求');
    expect(text).toContain('高亮我参与的需求');
    expect(text).toContain('自定义匹配姓名');
    expect(text).toContain('测试用户');

    // 姓名匹配沿用设置草稿之外的本地偏好输入
    const customName = document.querySelector<HTMLInputElement>('input#custom-match-name');
    expect(customName?.value).toBe('花名');
  });

  it('快捷键入口直接打开速查表', async () => {
    await act(async () => {
      root.render(<AppearanceSection />);
      await Promise.resolve();
    });

    const shortcutButton = [...document.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('查看速查表'),
    );
    expect(shortcutButton).toBeTruthy();
    await act(async () => {
      shortcutButton!.click();
    });
    expect(useUi.getState().shortcutsOpen).toBe(true);
  });
});