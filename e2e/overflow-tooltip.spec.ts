import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

const branch = 'feature/BENZ-6428-very-long-branch-name-for-tooltip-validation';
const title = '这是需要进行两行裁切的需求标题，用于检查真实浏览器中纵向内容超出容器后能够展示完整提示。多行截断必须与单行一样可靠。';
const popup = '[data-slot="tooltip-content"][data-open]';

async function mountExamples(page: Page) {
  await page.goto('/#workbench');
  await page.waitForFunction(() => Boolean((window as any).__nervd_app));
  await page.evaluate(async ({ componentPath, branch, title }) => {
    // Use Vite's already optimized React instance, so the harness exercises the
    // real component and CSS without introducing a product-only test route.
    const source = await (await fetch('/main.tsx')).text();
    const reactPath = source.match(/from "([^"]+\/react\.js\?[^"]+)"/)![1];
    const domPath = source.match(/from "([^"]+\/react-dom_client\.js\?[^"]+)"/)![1];
    const React = (await import(/* @vite-ignore */ reactPath)).default;
    const { createRoot } = (await import(/* @vite-ignore */ domPath)).default;
    const { OverflowTooltip } = await import(/* @vite-ignore */ componentPath);
    const selectPath = componentPath.replace('overflow-tooltip.tsx', 'searchable-select.tsx');
    const { SearchableSelect } = await import(/* @vite-ignore */ selectPath);
    const h = React.createElement;
    const host = document.createElement('section');
    host.id = 'overflow-examples';
    host.style.cssText = 'position:fixed;inset:0;z-index:40;background:white;color:black;padding:64px;display:flex;flex-direction:column;gap:24px';
    document.body.append(host);
    const text = (id: string, value: string, props = {}) => h('div', { id, style: { width: 180 } },
      h(OverflowTooltip, { text: value, className: 'block', ...props }));
    createRoot(host).render(h(React.Fragment, null,
      h('button', { id: 'before-tooltip' }, 'Before'),
      text('single-tooltip', branch),
      text('default-tooltip', branch, { className: undefined }),
      text('multiline-tooltip', title, { lineClamp: 2 }),
      h('button', { id: 'parent-tooltip', style: { width: 180 } },
        h(OverflowTooltip, { text: branch, className: 'block' })),
      h('button', { id: 'multiple-tooltips', style: { width: 180 } },
        h(OverflowTooltip, { text: `Primary ${branch}`, className: 'block' }),
        h(OverflowTooltip, { text: `Secondary ${branch}`, className: 'block' })),
      text('short-tooltip', '短标题'),
      h('button', { id: 'after-tooltip' }, 'After'),
      h('div', { id: 'roving-tooltip', role: 'listitem', tabIndex: -1, style: { width: 180 } },
        h(OverflowTooltip, { text: branch, className: 'block' })),
      h('div', { style: { width: 180 } }, h(SearchableSelect, {
        items: [{ value: 'first', label: `First ${branch}` }, { value: 'second', label: `Second ${branch}` }],
        value: 'first', onValueChange: () => {}, ariaLabel: 'Tooltip branch selection',
        className: 'w-full',
      })),
    ));
  }, { componentPath: `/@fs${path.resolve('src/components/overflow-tooltip.tsx')}`, branch, title });
  await expect(page.locator('#parent-tooltip')).toBeVisible();
}

test.beforeEach(async ({ page }) => mountExamples(page));

test('only clipped text shows full content, including real multiline clipping', async ({ page }) => {
  await page.locator('#single-tooltip span').hover();
  await expect(page.locator(popup)).toHaveText(branch);
  await page.locator('#default-tooltip span').hover();
  await expect(page.locator(popup)).toHaveText(branch);
  await page.locator('#multiline-tooltip span').hover();
  await expect(page.locator(popup)).toHaveText(title);
  expect(await page.locator('#multiline-tooltip span').evaluate((element) =>
    element.scrollHeight > element.clientHeight + 1)).toBe(true);
  await page.locator('#short-tooltip span').hover();
  await expect(page.locator(popup)).toHaveCount(0);
});

test('existing button focus exposes one tooltip and Escape preserves focus', async ({ page }) => {
  await page.locator('#before-tooltip').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#parent-tooltip')).toBeFocused();
  await expect(page.locator(popup)).toHaveText(branch);
  await expect(page.locator('#overflow-examples span[tabindex="0"]')).toHaveCount(0);
  await expect(page.locator('#parent-tooltip button')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator(popup)).toHaveCount(0);
  await expect(page.locator('#parent-tooltip')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#multiple-tooltips')).toBeFocused();
  await expect(page.locator(popup)).toHaveCount(1);
  await expect(page.locator(popup)).toHaveText(`Primary ${branch}`);
});

test('resizing to reveal full text closes an open tooltip', async ({ page }) => {
  await page.locator('#single-tooltip span').hover();
  await expect(page.locator(popup)).toHaveText(branch);
  await page.locator('#single-tooltip').evaluate((element) => { element.style.width = '1000px'; });
  await expect(page.locator(popup)).toHaveCount(0);
  expect(await page.locator('#single-tooltip span').evaluate((element) =>
    element.scrollWidth <= element.clientWidth + 1)).toBe(true);
});

test('combobox keyboard highlighting reveals the full option without moving input focus', async ({ page }) => {
  await page.getByLabel('Tooltip branch selection').click();
  const search = page.locator('input[role="combobox"]');
  await expect(search).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[role="option"][data-highlighted]')).toHaveCount(1);
  await expect(page.locator(popup)).toHaveText(new RegExp(branch));
  await expect(search).toBeFocused();
  // 高亮切换到下一项：旧提示关闭、新候选项的全文提示跟随打开（Base UI 方向键不循环）。
  await page.keyboard.press('ArrowDown');
  const highlighted = page.locator('[role="option"][data-highlighted]');
  await expect(highlighted).toHaveCount(1);
  await expect(page.locator(popup)).toHaveCount(1);
  await expect(page.locator(popup)).toHaveText((await highlighted.getAttribute('aria-label'))!);
  await page.keyboard.press('Escape');
  await expect(page.locator(popup)).toHaveCount(0);
  await expect(page.getByRole('listbox')).toBeVisible();
  await expect(search).toBeFocused();
});

test('programmatically focused list rows expose full titles without adding a Tab stop', async ({ page }) => {
  await page.locator('#roving-tooltip').focus();
  await expect(page.locator(popup)).toHaveText(branch);
  await expect(page.locator('#roving-tooltip')).toHaveAttribute('tabindex', '-1');
  await page.keyboard.press('Escape');
  await expect(page.locator(popup)).toHaveCount(0);
  await expect(page.locator('#roving-tooltip')).toBeFocused();
});
