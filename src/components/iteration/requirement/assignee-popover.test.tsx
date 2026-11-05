import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SearchableAssigneePopover } from './assignee-popover';
import { useApp } from '@/store/app';

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

describe('SearchableAssigneePopover (Select 规范实现)', () => {
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

    // 触发器回显当前负责人
    const trigger = host.querySelector('[data-slot="select-trigger"]') as HTMLButtonElement | null;
    expect(trigger).not.toBeNull();
    expect(trigger?.textContent).toContain('林益生');

    // 点击触发器展开 Select 弹层
    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    // 候选列表（ListBox option）包含张三
    const option = Array.from(document.querySelectorAll('[role="listbox"] [role="option"]')).find(
      (opt) => opt.textContent?.includes('张三'),
    );
    expect(option).not.toBeUndefined();

    // 点击张三完成选择
    await act(async () => {
      option?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(selectedCandidate).toEqual({ id: 'u2', name: '张三', role: '前端开发' });
  });

  it('blocks opening and shows toast when checkWriteOps is true and allowWriteOps is false', async () => {
    useApp.setState({
      settings: {
        organizationId: 'mock-org',
        defaultSpaceIdentifier: 'mock-space',
        linkPattern: 'REQ-(\\d+)',
        watchedRepos: [],
        allowWriteOps: false,
        workitemRepos: {},
        branchRuleTemplates: [],
        workitemRepoBranchTemplates: {},
        jenkinsConnections: [],
        repoCiBindings: {},
        hasPat: true,
      },
    });

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

    const trigger = host.querySelector('[data-slot="select-trigger"]') as HTMLButtonElement | null;
    expect(trigger).not.toBeNull();

    // 点击触发器：受控 isOpen 拦截，弹层不展开
    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(document.querySelectorAll('[role="listbox"] [role="option"]').length).toBe(0);
  });
});
