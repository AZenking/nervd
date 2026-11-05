import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChildrenCard } from './children-card';
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
