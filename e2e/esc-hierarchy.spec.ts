// macOS 操作对齐 / 用例 GL-003：
// 遵循 AGENTS.md §4.2 的阶梯式 Esc 退回顺序：浮层 > 多选 > 钻取 > 抽屉 > 整页。
// 实现链路：列表打开 Peek 抽屉 → 点击子任务弹出 ChildDetailDrawer（浮层）；
// 子抽屉「在工作台全屏打开」→ Peek 就地切换为子任务并出现「返回父需求」按钮（钻取层）。
// Esc 在钻取层先退回父需求详情且不关闭抽屉；无钻取层时才关闭 Peek 抽屉。
import { test, expect, rowByIdentifier, detailIdentifier } from './fixtures';

test('GL-003 Esc 按阶梯逐层退回：浮层 > 多选 > 钻取 > 抽屉', async ({ page }) => {
  const peek = page.locator('[data-workspace-peek-drawer][role="dialog"]');
  const batchBar = page.getByTestId('floating-batch-bar');
  // Peek 抽屉本身也有同名「全屏打开」按钮，子抽屉用「非 Peek 的 dialog」排除
  const childDrawer = page
    .locator('[role="dialog"]:not([data-workspace-peek-drawer])')
    .filter({ has: page.getByRole('button', { name: '在工作台全屏打开' }) });

  // ---- ① 多选优先：主列表按 x 选中光标行后，Esc 仅清空多选，不导航 ----
  await page.keyboard.press('x');
  await expect(batchBar).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(batchBar).toHaveCount(0);
  await expect(peek).toHaveCount(0);

  // ---- Given：打开 Peek 抽屉（REQ-2084 携带子任务 mock 数据）----
  await rowByIdentifier(page, 'REQ-2084').click();
  await expect(peek).toBeVisible();
  await expect.poll(() => detailIdentifier(page)).toBe('REQ-2084');
  // 详情默认停在「描述」页签，切到「子工作项」页签才能看到可钻取子项
  await peek.getByRole('tab', { name: /子工作项/ }).click();
  await expect(peek.getByTestId('child-row').first()).toBeVisible();

  // ---- ② 浮层优先：子任务抽屉打开时，Esc 只关最顶层浮层，Peek 抽屉保持 ----
  await peek.getByTestId('child-row').first().click();
  await expect(childDrawer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(childDrawer).toHaveCount(0);
  await expect(peek).toBeVisible();

  // ---- ③ 钻取优先：子抽屉内「在工作台全屏打开」钻取到子任务后，Esc 退回父需求且不关抽屉 ----
  await peek.getByTestId('child-row').first().click();
  await expect(childDrawer).toBeVisible();
  await childDrawer.getByRole('button', { name: '在工作台全屏打开' }).click();

  const backToParent = peek.locator('[title^="返回父需求"]');
  await expect(backToParent).toBeVisible();
  await expect.poll(() => detailIdentifier(page)).toBe('BENZ-6214');

  await page.keyboard.press('Escape');
  await expect(backToParent).toHaveCount(0); // 钻取层级已退回
  await expect(peek).toBeVisible(); // 抽屉未被越级关闭
  await expect.poll(() => detailIdentifier(page)).toBe('REQ-2084');

  // ---- ④ 抽屉优先：无钻取层时 Esc 关闭 Peek 抽屉，回到全宽列表 ----
  await page.keyboard.press('Escape');
  await expect(peek).toHaveCount(0);
  await expect(page.locator('[data-testid="workitem-row"]').first()).toBeVisible();
});