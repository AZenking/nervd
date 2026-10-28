import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageHeader, STICKY_PAGE_HEADER_CLASS, type PageHeaderProps } from './page-header';

// 项目无 @testing-library：与 descriptions.test.tsx / rich-description.test.tsx 一致，
// 采用 vitest + jsdom + createRoot/act 直查 DOM。

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
});

async function render(props: PageHeaderProps) {
  await act(() => root.render(<PageHeader {...props} />));
  return host.querySelector('header')!;
}

describe('PageHeader 统一插槽', () => {
  it('renders navigation / title / titleBadge / scope / toolbar / actions in one header', async () => {
    const header = await render({
      navigation: <button type="button">侧栏入口</button>,
      title: '迭代工作台',
      titleBadge: <span>REQ-101</span>,
      scope: 'Sprint 42',
      toolbar: <input aria-label="状态筛选" />,
      actions: <button type="button">刷新</button>,
    });

    expect(header.tagName).toBe('HEADER');
    const h1 = header.querySelector('h1')!;
    expect(h1.textContent).toBe('迭代工作台');
    // title 容器：min-w-0 + truncate（titleBadge 独立包裹，不被挤压消失）
    expect(h1.className).toContain('truncate');
    expect(h1.className).toContain('min-w-0');

    expect(header.textContent).toContain('侧栏入口');
    expect(header.textContent).toContain('REQ-101');
    expect(header.textContent).toContain('刷新');
    expect(header.querySelector('input[aria-label="状态筛选"]')).not.toBeNull();

    // scope：独立截断容器（min-w-0 + max-w-[40%] + truncate），带 "/" 分隔
    const scopeBox = header.querySelector('[class*="max-w-[40%]"]')!;
    expect(scopeBox).not.toBeNull();
    expect(scopeBox.className).toContain('min-w-0');
    expect(scopeBox.querySelector('span.truncate')?.textContent).toBe('Sprint 42');
  });

  it('does not render scope / toolbar / secondary containers when slots are omitted', async () => {
    const header = await render({ title: '总览' });
    expect(header.querySelector('[class*="max-w-[40%]"]')).toBeNull();
    expect(header.querySelector('[data-slot="page-header-secondary-inline"]')).toBeNull();
    expect(header.querySelector('[data-slot="page-header-secondary-more"]')).toBeNull();
    expect(header.querySelector('button[aria-label="更多操作"]')).toBeNull();
  });
});

describe('PageHeader 次要操作双形态（容器查询降级）', () => {
  it('renders secondaryActions inline and in the more menu with container-query classes', async () => {
    const header = await render({
      title: '集成分支',
      secondaryActions: [
        { key: 'sync', label: '同步需求', onSelect: () => {} },
        {
          key: 'export',
          label: '导出报告',
          render: <button type="button">自定义导出</button>,
        },
      ],
    });

    // 宽屏内联容器：hidden @[520px]:flex
    const inline = header.querySelector('[data-slot="page-header-secondary-inline"]')!;
    expect(inline).not.toBeNull();
    expect(inline.className).toContain('hidden');
    expect(inline.className).toContain('@[520px]:flex');
    // 有 render 的项宽屏用自定义节点；无 render 的项用默认 ghost 按钮形态
    expect(inline.textContent).toContain('同步需求');
    const inlineButtons = [...inline.querySelectorAll('button')].map((b) => b.textContent);
    expect(inlineButtons).toContain('同步需求');
    expect(inlineButtons).toContain('自定义导出');

    // 「更多」触发容器：flex @[520px]:hidden，两套节点同时存在
    const more = header.querySelector('[data-slot="page-header-secondary-more"]')!;
    expect(more).not.toBeNull();
    expect(more.className).toContain('flex');
    expect(more.className).toContain('@[520px]:hidden');
    const trigger = more.querySelector('button[aria-label="更多操作"]');
    expect(trigger).not.toBeNull();
  });

  it('opens the more menu and degrades render-items to label-only entries', async () => {
    const onSelect = vi.fn();
    await render({
      title: '集成分支',
      secondaryActions: [
        { key: 'sync', label: '同步需求', onSelect },
        { key: 'export', label: '导出报告', render: <button type="button">自定义导出</button> },
      ],
    });

    const trigger = host.querySelector<HTMLButtonElement>(
      'button[aria-label="更多操作"]',
    )!;
    await act(() => trigger.click());

    const items = [
      ...document.querySelectorAll<HTMLElement>('[data-slot="dropdown-menu-item"]'),
    ];
    expect(items.map((item) => item.textContent)).toEqual(['同步需求', '导出报告']);
    // 菜单项内不出现宽屏自定义节点，仅降级为 label（自定义节点仍留在内联容器中）
    expect(items.every((item) => !item.textContent?.includes('自定义导出'))).toBe(true);

    await act(() => items[0].click());
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('renders nothing secondary when the list is empty', async () => {
    await render({ title: '总览', secondaryActions: [] });
    expect(host.querySelector('[data-slot="page-header-secondary-inline"]')).toBeNull();
    expect(host.querySelector('[data-slot="page-header-secondary-more"]')).toBeNull();
  });
});

describe('PageHeader 窗口拖拽约定', () => {
  it('marks the header as a drag region and wraps interactive controls with data-no-drag', async () => {
    const header = await render({
      navigation: <button type="button">侧栏入口</button>,
      title: '总览',
      actions: <button type="button">刷新</button>,
      toolbar: <input aria-label="搜索" />,
      secondaryActions: [{ key: 'logs', label: '调度日志', onSelect: () => {} }],
    });

    expect(header.hasAttribute('data-tauri-drag-region')).toBe(true);

    const noDrag = [...header.querySelectorAll('[data-no-drag]')];
    expect(noDrag.length).toBeGreaterThan(0);
    // navigation / actions / toolbar / secondary 容器均为 data-no-drag
    expect(noDrag.some((el) => el.querySelector('button')?.textContent === '侧栏入口')).toBe(true);
    expect(noDrag.some((el) => el.querySelector('button')?.textContent === '刷新')).toBe(true);
    expect(noDrag.some((el) => el.querySelector('input[aria-label="搜索"]'))).toBe(true);
    expect(
      noDrag.some((el) => el.querySelector('button[aria-label="更多操作"]')),
    ).toBe(true);
  });
});

describe('PageHeader 密度与吸顶', () => {
  it('applies STICKY_PAGE_HEADER_CLASS when sticky', async () => {
    const header = await render({ title: '总览', sticky: true });
    for (const token of STICKY_PAGE_HEADER_CLASS.split(' ')) {
      expect(header.className).toContain(token);
    }
  });

  it('tightens vertical rhythm in compact mode while keeping traffic-light clearance', async () => {
    const header = await render({ title: '需求详情', sticky: true, density: 'compact' });
    expect(header.className).toContain('sticky');
    expect(header.className).toContain('pt-7'); // 28px，仍满足红绿灯避让下限
    expect(header.className).not.toContain('pt-8');
    expect(header.className).toContain('pb-2.5');
    expect(header.className).toContain('gap-2'); // compact 行距
    expect(header.querySelector('div[class*="min-h-8"]')).not.toBeNull(); // 主行紧凑高度
  });

  it('keeps regular density defaults untouched', async () => {
    const header = await render({ title: '总览', sticky: true });
    expect(header.className).toContain('pt-8');
    expect(header.className).toContain('pb-3.5');
    expect(header.className).toContain('gap-3');
    expect(header.querySelector('div[class*="min-h-9"]')).not.toBeNull();
  });
});

describe('PageHeader 旧 props 向后兼容', () => {
  it('still renders eyebrow / description stacked above the main row', async () => {
    const header = await render({
      eyebrow: 'WORKSPACE',
      title: '总览',
      description: '聚合全局迭代与 CI 状态',
    });
    expect(header.querySelector('p.eyebrow')?.textContent).toBe('WORKSPACE');
    expect(header.querySelector('h1')?.textContent).toBe('总览');
    expect(header.textContent).toContain('聚合全局迭代与 CI 状态');
  });

  it('keeps breadcrumb mode structure (non-truncating h1, meta divider)', async () => {
    const header = await render({
      breadcrumb: <nav>迭代 / REQ-101</nav>,
      title: '需求标题',
      titleClassName: 'text-2xl font-semibold tracking-tight',
      titleBadge: <span>REQ-101</span>,
      description: '一行描述',
      actions: <button type="button">在云效中打开</button>,
      meta: <div>meta 行</div>,
    });

    const h1 = header.querySelector('h1')!;
    expect(h1.className).toContain('text-2xl');
    expect(h1.className).not.toContain('truncate');
    expect(header.textContent).toContain('迭代 / REQ-101');
    expect(header.textContent).toContain('在云效中打开');
    expect(header.textContent).toContain('meta 行');
    expect(header.querySelector('.border-t')).not.toBeNull();
  });

  it('keeps STICKY_PAGE_HEADER_CLASS export stable for existing importers', () => {
    expect(STICKY_PAGE_HEADER_CLASS).toContain('sticky top-0');
    expect(STICKY_PAGE_HEADER_CLASS).toContain('pt-8');
    expect(STICKY_PAGE_HEADER_CLASS).toContain('sm:-mx-8 sm:px-8');
    expect(STICKY_PAGE_HEADER_CLASS).toContain('lg:-mx-10 lg:px-10');
  });
});
