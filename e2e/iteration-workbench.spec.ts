// 迭代工作台核心交互（用例 ID 对照 docs/e2e-testing.md §4.1）
import { test, expect, activeRow, detailIdentifier, mockCallsOf, LIST } from './fixtures';

test.describe('迭代工作台', () => {
  test('IT-001 状态分组渲染，组头可折叠/展开', async ({ page }) => {
    const rows = page.locator('[data-testid="workitem-row"]');
    const before = await rows.count();
    expect(before).toBeGreaterThan(0);

    const firstGroup = page.locator(`${LIST} button[aria-expanded]`).first();
    await firstGroup.click();
    await expect(firstGroup).toHaveAttribute('aria-expanded', 'false');
    // 折叠组不渲染数据行（其余组仍在，总数下降）
    const collapsed = await rows.count();
    expect(collapsed).toBeLessThan(before);

    await firstGroup.click();
    await expect(firstGroup).toHaveAttribute('aria-expanded', 'true');
    await expect(rows).toHaveCount(before);
  });

  test('IT-003 点击行打开详情分栏', async ({ page }) => {
    const target = page.locator('[data-testid="workitem-row"][data-identifier="REQ-2084"]');
    await target.click();
    await expect(page.getByTestId('split-detail')).toBeVisible();
    await expect(page.getByTestId('split-master')).toBeVisible();
    await expect.poll(() => detailIdentifier(page)).toBe('REQ-2084');
  });

  test('IT-003b j/k 移动光标且 data-active 高亮跟随', async ({ page }) => {
    const first = await activeRow(page).getAttribute('data-identifier');
    expect(first).toBeTruthy();

    await page.keyboard.press('j');
    const second = await activeRow(page).getAttribute('data-identifier');
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);

    await page.keyboard.press('k');
    await expect(activeRow(page)).toHaveAttribute('data-identifier', first as string);
  });

  test('IT-004 Enter 打开分栏，j/k 联动刷新右侧详情', async ({ page }) => {
    // 分栏打开后 data-active 会同时命中「光标行 + 选中行」两行（设计如此），
    // 故联动断言走 store：detail 编号先等于光标行，j 之后随之切换
    const first = await activeRow(page).getAttribute('data-identifier');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('split-detail')).toBeVisible();
    await expect.poll(() => detailIdentifier(page)).toBe(first);

    // 分栏打开状态下移动光标，右侧详情实时切换
    await page.keyboard.press('j');
    await expect.poll(() => detailIdentifier(page)).not.toBe(first);
    await expect(page.getByTestId('split-detail')).toBeVisible();
  });

  test('IT-005 x 多选与浮动批量条，Esc 清空全部多选', async ({ page }) => {
    const bar = page.getByTestId('floating-batch-bar');
    await expect(bar).toHaveCount(0);

    await page.keyboard.press('x');
    await expect(bar).toBeVisible();
    await expect(page.getByTestId('batch-bar-count')).toHaveText(/已选 1 项/);

    await page.keyboard.press('j');
    await page.keyboard.press('x');
    await expect(page.getByTestId('batch-bar-count')).toHaveText(/已选 2 项/);

    await page.keyboard.press('Escape');
    await expect(bar).toHaveCount(0);
  });

  test('IT-006 [ ] 翻页并自动补拉（backfill）', async ({ page }) => {
    const info = page.getByTestId('pagination-info');
    await expect(info).toContainText('第 1 - 30 项');

    const callsBefore = (await mockCallsOf(page, 'list_workitems')).length;
    await page.keyboard.press(']');
    await expect(info).toContainText(/第 31 - \d+ 项/);

    // 第 2 页未填满（30/页）→ 前台自动向接口补拉
    await expect(async () => {
      const calls = await mockCallsOf(page, 'list_workitems');
      expect(calls.length).toBeGreaterThan(callsBefore);
    }).toPass();

    await page.keyboard.press('[');
    await expect(info).toContainText('第 1 - 30 项');
  });
});
