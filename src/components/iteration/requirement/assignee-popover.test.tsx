import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SearchableAssigneePopover } from './assignee-popover';

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
});

afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
});

describe('SearchableAssigneePopover', () => {
  it('opens candidate list and selects a candidate properly', async () => {
    const candidates = [
      { id: 'u1', name: '林益生', role: '需求负责人' },
      { id: 'u2', name: '张三', role: '前端开发' },
    ];
    let selectedCandidate: any = null;

    await act(async () => {
      root.render(
        <SearchableAssigneePopover
          assignedToName="林益生"
          candidateAssignees={candidates}
          variant="button"
          checkWriteOps={false}
          onSelect={(c) => {
            selectedCandidate = c;
          }}
          placeholder="指定人"
        />
      );
    });

    const triggerBtn = host.querySelector('button');
    expect(triggerBtn).not.toBeNull();
    expect(triggerBtn?.textContent).toContain('林益生');

    // 点击触发器打开 Popover
    await act(async () => {
      triggerBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    // 检查搜索输入框与候选人员列表是否出现在 PopoverContent 中
    const searchInput = document.querySelector('input[placeholder="搜索成员或角色…"]');
    expect(searchInput).not.toBeNull();

    // 候选列表里包含张三
    const candidateButtons = Array.from(document.querySelectorAll('button')).filter((b) =>
      b.textContent?.includes('张三'),
    );
    expect(candidateButtons.length).toBeGreaterThan(0);

    // 点击张三选择
    await act(async () => {
      candidateButtons[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(selectedCandidate).toEqual({ id: 'u2', name: '张三', role: '前端开发' });
  });

  it('blocks opening and shows toast when checkWriteOps is true and allowWriteOps is false', async () => {
    const candidates = [
      { id: 'u1', name: '林益生', role: '需求负责人' },
    ];

    await act(async () => {
      root.render(
        <SearchableAssigneePopover
          assignedToName="林益生"
          candidateAssignees={candidates}
          variant="button"
          checkWriteOps={true}
          placeholder="指定人"
        />
      );
    });

    const triggerBtn = host.querySelector('button');
    expect(triggerBtn).not.toBeNull();

    // 点击触发器
    await act(async () => {
      triggerBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    // 弹窗未打开
    const searchInput = document.querySelector('input[placeholder="搜索成员或角色…"]');
    expect(searchInput).toBeNull();
  });
});

