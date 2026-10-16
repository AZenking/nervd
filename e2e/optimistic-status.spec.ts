// 行首状态就地流转（乐观更新）—— 用例 IT-007、IT-008
// 注意：流转成功后行会移入新状态分组（列表重排），断言必须按 data-identifier 钉住行，
// 不能跟随 data-active 光标行。
import { test, expect, activeRow, rowByIdentifier, mockDelay, mockFail } from './fixtures';
import type { Page } from '@playwright/test';

/** 把光标移到状态不等于 avoid 的行（最多尝试 8 次 j） */
async function moveToRowWithStatusNot(page: Page, avoid: string) {
  for (let i = 0; i < 8; i++) {
    const status = await activeRow(page)
      .locator('[data-testid="row-status-trigger"]')
      .getAttribute('data-status');
    if (status !== avoid) return;
    await page.keyboard.press('j');
  }
  throw new Error(`未找到状态非「${avoid}」的行`);
}

test.describe('行首状态就地流转（乐观更新）', () => {
  test('IT-007 网络悬挂时 UI 立即呈现新状态', async ({ page }) => {
    await moveToRowWithStatusNot(page, '已完成');
    const identifier = await activeRow(page).getAttribute('data-identifier');
    const trigger = rowByIdentifier(page, identifier as string).locator('[data-testid="row-status-trigger"]');
    await mockDelay(page, 'update_workitem', 4000); // 网络悬挂 4s

    await trigger.click();
    await page.getByRole('menuitem', { name: '已完成' }).click();

    // 后端尚未返回（挂起 4s），该行已切换为「已完成」——乐观即时呈现
    await expect(trigger).toHaveAttribute('data-status', '已完成', { timeout: 2_000 });
    await page.evaluate(() => (window as any).__nervd_mock?.reset());
  });

  test('IT-008 流转失败自动回滚并报错 Toast', async ({ page }) => {
    await moveToRowWithStatusNot(page, '已完成');
    const identifier = await activeRow(page).getAttribute('data-identifier');
    const row = rowByIdentifier(page, identifier as string);
    const trigger = row.locator('[data-testid="row-status-trigger"]');
    const before = (await trigger.getAttribute('data-status')) ?? '';
    await mockFail(page, 'update_workitem', '云效 403'); // 下一次 update_workitem 必失败

    await trigger.click();
    await page.getByRole('menuitem', { name: '已完成' }).click();

    // 失败 → 错误 Toast + 该行状态回滚为旧值
    await expect(
      page.locator('[data-slot="toast"]').filter({ hasText: '状态流转失败' }),
    ).toBeVisible();
    await expect(trigger).toHaveAttribute('data-status', before);
  });
});
