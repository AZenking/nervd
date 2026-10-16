// 总览仪表盘与 Peek 抽屉（AGENTS.md §2.4 / 用例 OV-001）
import { test, expect, uiView } from './fixtures';

test('OV-001 最近更新点击 Peek 抽屉就地展开，全屏打开进入独立工作台', async ({ page }) => {
  await page.keyboard.press('g');
  await page.keyboard.press('o');
  await expect.poll(() => uiView(page)).toBe('overview');

  // 状态分布与最近更新区域渲染
  await expect(page.getByText('状态分布')).toBeVisible();
  await expect(page.getByText('最近更新')).toBeVisible();

  // 点击最近更新条目 → 右侧抽屉滑出（不打断底层大盘）
  // 最近更新行 = 以编号文本开头的幽灵按钮（REQ-/BUG-/TASK-/纯数字）
  await page.getByRole('button').filter({ hasText: /^(?:REQ-|BUG-|TASK-|2098)/ }).first().click();
  const drawer = page.locator('[role="dialog"]');
  await expect(drawer).toBeVisible();

  // 抽屉内「在工作台全屏打开」→ 独立需求工作台
  await page.getByRole('button', { name: '在工作台全屏打开' }).click();
  await expect.poll(() => uiView(page)).toBe('requirement');

  // Esc 逐层退回总览
  await page.keyboard.press('Escape');
  await expect.poll(() => uiView(page)).toBe('overview');
});
