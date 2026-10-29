// Shell 布局自适应（lead 集成范围）：窄容器侧栏自动图标化 / 临时展开与用户偏好分别管理 /
// 侧栏宽度拖动（钳制 200–300、双击恢复默认 256、持久化）/ 浏览器 <768px 移动抽屉。
// SL-001~005；迭代列表分栏与单栏切换见 layout-adaptation.spec.ts（Luna 3）。
import { test, expect, type Page } from './fixtures';

const SIDEBAR = '[data-slot="sidebar"]';
const GAP = '[data-slot="sidebar-gap"]';
const TRIGGER = '[data-sidebar="trigger"]';
const SIDEBAR_SEPARATOR = '[role="separator"][aria-label^="调整侧栏宽度"]';

const sidebarState = (page: Page) => page.locator(SIDEBAR).getAttribute('data-state');

/** 侧栏 gap 元素计算宽度 = 生效的 --sidebar-width（展开态） */
const gapWidth = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.querySelector('[data-slot="sidebar-gap"]')!).width);

const sidebarCookie = (page: Page) =>
  page.evaluate(() => /(?:^|;\s*)sidebar_state=(true|false)/.exec(document.cookie)?.[1] ?? null);

test.describe('Shell 布局自适应', () => {
  test('SL-001 容器 <1180px：侧栏自动收为图标栏，宽度分隔线不渲染', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 700 });
    await expect.poll(() => sidebarState(page)).toBe('collapsed');
    await expect(page.locator(SIDEBAR_SEPARATOR)).toHaveCount(0);
  });

  test('SL-002 窄容器入口临时展开：放大窗口后恢复用户偏好（折叠）', async ({ page }) => {
    // 宽容器下用户主动折叠（写入偏好 false）
    await expect.poll(() => sidebarState(page)).toBe('expanded');
    await page.locator(TRIGGER).first().click();
    await expect.poll(() => sidebarState(page)).toBe('collapsed');
    expect(await sidebarCookie(page)).toBe('false');

    // 收窄：自动折叠；入口点击 → 临时展开（会话态）
    await page.setViewportSize({ width: 1100, height: 700 });
    await expect.poll(() => sidebarState(page)).toBe('collapsed');
    await page.locator(TRIGGER).first().click();
    await expect.poll(() => sidebarState(page)).toBe('expanded');

    // 放大：清除临时展开，恢复用户偏好（保持折叠），cookie 修正回偏好值
    await page.setViewportSize({ width: 1250, height: 700 });
    await expect.poll(() => sidebarState(page)).toBe('collapsed');
    expect(await sidebarCookie(page)).toBe('false');
  });

  test('SL-003 收窄再放大：恢复用户原有偏好（展开）', async ({ page }) => {
    await expect.poll(() => sidebarState(page)).toBe('expanded');
    await page.setViewportSize({ width: 1100, height: 700 });
    await expect.poll(() => sidebarState(page)).toBe('collapsed');
    await page.setViewportSize({ width: 1250, height: 700 });
    await expect.poll(() => sidebarState(page)).toBe('expanded');
  });

  test('SL-004 侧栏分隔线：拖动钳制 200–300、双击恢复 256 并持久化', async ({ page }) => {
    await expect.poll(() => sidebarState(page)).toBe('expanded');
    const separator = page.locator(SIDEBAR_SEPARATOR);
    await expect(separator).toBeVisible();
    await expect.poll(() => gapWidth(page)).toBe('256px');

    // 向右大幅拖动 → 钳制到 300
    const box = await separator.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + 120);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 240, box.y + 120, { steps: 10 });
    await page.mouse.up();
    await expect.poll(() => gapWidth(page)).toBe('300px');

    // 向左越过下限 → 200
    const box2 = await separator.boundingBox();
    await page.mouse.move(box2.x + box2.width / 2, box2.y + 120);
    await page.mouse.down();
    await page.mouse.move(box2.x + box2.width / 2 - 240, box2.y + 120, { steps: 10 });
    await page.mouse.up();
    await expect.poll(() => gapWidth(page)).toBe('200px');

    // 双击恢复默认 256（reset 立即落盘）
    await separator.dblclick();
    await expect.poll(() => gapWidth(page)).toBe('256px');
    const stored = await page.evaluate(() => localStorage.getItem('nervd-layout'));
    expect(stored).toContain('"sidebarWidth":256');
  });

  test('SL-005 侧栏分隔线：键盘方向键调整宽度', async ({ page }) => {
    await expect.poll(() => sidebarState(page)).toBe('expanded');
    const separator = page.locator(SIDEBAR_SEPARATOR);
    await separator.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => gapWidth(page)).toBe('264px');
    await page.keyboard.press('Shift+ArrowRight');
    await expect.poll(() => gapWidth(page)).toBe('296px');
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => gapWidth(page)).toBe('300px');
    await page.keyboard.press('Home');
    await expect.poll(() => gapWidth(page)).toBe('200px');
    await page.keyboard.press('End');
    await expect.poll(() => gapWidth(page)).toBe('300px');
  });

  test('SL-006 浏览器 <768px：沿用移动侧栏抽屉', async ({ page }) => {
    // 用已迁移统一页头的总览页作入口（迭代页页头由 Luna 3 迁移，此处不依赖其进度）
    await page.keyboard.press('g');
    await page.keyboard.press('o');
    await expect(page.getByRole('heading', { level: 1, name: '总览' })).toBeVisible();
    await page.setViewportSize({ width: 700, height: 700 });
    await page.waitForTimeout(200);
    await page.locator(TRIGGER).first().click();
    await expect(page.locator('[data-mobile="true"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-mobile="true"]')).toBeHidden();
  });
});
