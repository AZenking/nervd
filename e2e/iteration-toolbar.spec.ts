// 迭代工作台工具层：类别切换 / 右键菜单 / 主题切换（IT-010~012、TH-001）
import { test, expect, uiView, activeRow } from './fixtures';

test.describe('迭代工具栏与上下文菜单', () => {
  test('IT-010 类别 Tabs 切换：缺陷/任务列表重载', async ({ page }) => {
    await page.getByRole('tab', { name: '缺陷' }).click();
    await expect(page.locator('[data-testid="workitem-row"][data-identifier^="BUG-"]').first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole('tab', { name: '任务' }).click();
    await expect(page.locator('[data-testid="workitem-row"][data-identifier^="TASK-"]').first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole('tab', { name: '需求' }).click();
    await expect(page.locator('[data-testid="workitem-row"][data-identifier^="REQ-"]').first()).toBeVisible({ timeout: 15_000 });
  });

  test('IT-011 右键菜单：查看详情就地打开分栏', async ({ page }) => {
    await activeRow(page).click({ button: 'right' });
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitem', { name: /查看详情/ }).click();
    await expect(page.getByTestId('split-detail')).toBeVisible();
  });

  test('IT-011b 右键菜单：全屏打开进入独立工作台，Esc 返回', async ({ page }) => {
    await activeRow(page).click({ button: 'right' });
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitem', { name: /全屏打开/ }).click();
    await expect.poll(() => uiView(page)).toBe('requirement');
    await page.keyboard.press('Escape');
    await expect.poll(() => uiView(page)).toBe('iteration');
  });
});

test('TH-001 侧栏一键切换深/浅主题（html.dark 翻转）', async ({ page }) => {
  const darkBefore = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  await page.getByRole('button', { name: darkBefore ? '浅色模式' : '深色模式' }).click();
  await expect(async () => {
    const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    expect(dark).toBe(!darkBefore);
  }).toPass();
  // 再切回
  await page.getByRole('button', { name: darkBefore ? '深色模式' : '浅色模式' }).click();
  await expect(async () => {
    const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    expect(dark).toBe(darkBefore);
  }).toPass();
});
