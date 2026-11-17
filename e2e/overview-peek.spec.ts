// 总览仪表盘与 Peek 抽屉（AGENTS.md §2.4 / 用例 OV-001）
import { test, expect, uiView } from './fixtures';

test('OV-001 最近更新点击 Peek 抽屉就地展开，全屏打开进入独立工作台', async ({ page }) => {
  await page.keyboard.press('g');
  await page.keyboard.press('o');
  await expect.poll(() => uiView(page)).toBe('overview');

  // 当前迭代区块的最近更新列表直接可见
  await expect(page.getByText('最近更新')).toBeVisible();

  // 迭代统计默认折叠：先展开再断言状态分布（折叠态下图表仍在 DOM 中但 aria-hidden/不可见）
  const statsSection = page.getByRole('region', { name: '迭代统计' });
  const statsToggle = statsSection.getByRole('button').first();
  await expect(statsToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(statsSection.locator('[data-slot="collapsible-content"]')).toBeHidden();
  await statsToggle.click();
  await expect(statsToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(statsSection.getByText(/^状态分布/).first()).toBeVisible();

  // 点击最近更新表格首行「详情」→ 右侧抽屉滑出（不打断底层大盘）
  // 最近更新已改为 Table 裸行（行 onAction 等价），故按行内详情按钮定位首条
  await page.getByRole('button', { name: '详情' }).first().click();
  const drawer = page.locator('[role="dialog"]');
  await expect(drawer).toBeVisible();

  // 抽屉内「在工作台全屏打开」→ 独立需求工作台
  await page.getByRole('button', { name: '在工作台全屏打开' }).click();
  await expect.poll(() => uiView(page)).toBe('requirement');

  // 完整页面使用导航后退，Esc 仅用于临时界面
  await page.keyboard.press('Meta+[');
  await expect.poll(() => uiView(page)).toBe('overview');
});
