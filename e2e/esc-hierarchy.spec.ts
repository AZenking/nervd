// Esc 阶梯退回（AGENTS.md §4.2 / 用例 GL-003）：
// 浮层（子任务 Peek 抽屉）→ 多选 → 钻取（返回父需求）→ 分栏，严格逐层退回，不得越级。
// 实现链路：分栏内点击子任务 → ChildDetailDrawer 抽屉（浮层）；
// 抽屉内「在工作台全屏打开」→ embedded 模式下就地切换分栏内容并出现「返回父需求」面包屑。
import { test, expect, rowByIdentifier, detailIdentifier } from './fixtures';

test('GL-003 Esc 严格按层级退回：浮层 → 多选 → 钻取 → 分栏，不越级', async ({ page }) => {
  // ---- Given：分栏打开（REQ-2084 携带子任务 mock 数据）----
  await rowByIdentifier(page, 'REQ-2084').click();
  await expect(page.getByTestId('split-detail')).toBeVisible();
  await expect.poll(() => detailIdentifier(page)).toBe('REQ-2084');
  await expect(page.getByTestId('child-row').first()).toBeVisible();

  // ---- ① 浮层优先：子任务抽屉打开时，Esc 只关抽屉，分栏不动 ----
  await page.getByTestId('child-row').first().click();
  const drawer = page.locator('[role="dialog"]');
  await expect(drawer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(page.getByTestId('split-detail')).toBeVisible(); // 未越级关分栏

  // ---- ② 多选次之：钻取子任务后按 x，Esc 只清多选 ----
  // 钻取：抽屉 →「在工作台全屏打开」→ 分栏就地切到子任务详情
  await page.getByTestId('child-row').first().click();
  await expect(drawer).toBeVisible();
  await drawer.getByRole('button', { name: '在工作台全屏打开' }).click();
  const backToParent = page.locator('[data-testid="split-detail"] [title^="返回父需求"]');
  await expect(backToParent).toBeVisible(); // 已钻取到子任务层级

  await page.keyboard.press('x'); // 多选主列表光标行
  await expect(page.getByTestId('floating-batch-bar')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('floating-batch-bar')).toHaveCount(0);
  await expect(backToParent).toBeVisible(); // 多选清空不影响钻取层

  // ---- ③ 钻取层：第二类 Esc 退回父需求详情 ----
  await page.keyboard.press('Escape');
  await expect(backToParent).toHaveCount(0);
  await expect.poll(() => detailIdentifier(page)).toBe('REQ-2084');

  // ---- ④ 分栏最后：第三下 Esc 关闭分栏，回到全宽列表 ----
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('split-detail')).toHaveCount(0);
  await expect(page.locator('[data-testid="workitem-row"]').first()).toBeVisible();
});
