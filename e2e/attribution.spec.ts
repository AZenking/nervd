// 变更归属（ATT-001…002）：需求详情「变更」Tab 的提交 / MR / 构建渲染与待归属指派。
//
// 数据来源：preview/attribution-api-mock.ts（isTauriRuntime() = true，sync hook 走 mock）。
// 导航：沿用 fixtures 的迭代视图就绪基线；REQ-2048 的 wi-2048 是 preview 详情数据，
// 但它不在 list_workitems 的演示行内，因此通过 ui store 的 openWorkitem（点击行 /
// 命令面板的同一入口）打开，避免依赖分页与状态分组顺序。
import { test, expect, detailIdentifier, type Page } from './fixtures';

const REQ_2048 = {
  workitemId: 'wi-2048',
  identifier: 'REQ-2048',
  subject: '支持需求链路一键回溯',
} as const;

const changeTimeline = (page: Page) => page.getByTestId('change-timeline');

const eventCard = (page: Page, kind: 'commit' | 'mr' | 'build') =>
  page.locator(`[data-testid="change-event-card"][data-kind="${kind}"]`);

/** 打开 REQ-2048 详情并切到「变更」Tab，等到时间线容器可见。 */
async function openChangesTab(page: Page) {
  await page.evaluate((crumb) => {
    (window as any).__nervd_ui.getState().openWorkitem(crumb.workitemId, crumb);
  }, REQ_2048);
  await expect.poll(() => detailIdentifier(page)).toBe('REQ-2048');

  const tab = page.getByRole('tab', { name: '变更' });
  await expect(tab).toBeVisible();
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await expect(changeTimeline(page)).toBeVisible();
}

test.describe('变更归属', () => {
  test('ATT-001 变更 Tab 渲染提交 / MR / 构建与归属徽标', async ({ page }) => {
    await openChangesTab(page);
    const timeline = changeTimeline(page);

    await expect(eventCard(page, 'commit')).toHaveCount(1);
    await expect(eventCard(page, 'mr')).toHaveCount(1);
    await expect(eventCard(page, 'build')).toHaveCount(1);

    // 提交卡片：短 SHA、提交说明与显式归属徽标
    const commit = eventCard(page, 'commit');
    await expect(commit).toContainText('a1b2c3d');
    await expect(commit).toContainText('feat(login): add captcha validation');
    await expect(commit).toContainText('显式归属');

    // TASK-202 是提交事件的归属编号，当前卡片只渲染归属徽标、不渲染目标编号，
    // 该编号在同批 MR 卡片标题中可见；此处按整条时间线断言其确实出现在「变更」面板。
    await expect(timeline).toContainText('TASK-202');

    // MR 卡片：!128 + 已合入 + 分支推断徽标
    const mr = eventCard(page, 'mr');
    await expect(mr).toContainText('!128');
    await expect(mr).toContainText('已合入');
    await expect(mr).toContainText('分支推断');

    // 构建卡片：#4521 + 失败状态（mock status = FAIL）+ 分支推断徽标
    const build = eventCard(page, 'build');
    await expect(build).toContainText('#4521');
    await expect(build).toContainText(/FAIL|失败/);
    await expect(build).toContainText('分支推断');
  });

  test('ATT-002 待归属变更渲染并可指派到 TASK-202', async ({ page }) => {
    await openChangesTab(page);

    const unassigned = page.getByTestId('unattributed-changes');
    await expect(unassigned).toBeVisible();
    await expect(unassigned).toContainText('待归属变更');

    const row = unassigned.getByTestId('unattributed-row').filter({ hasText: 'deadbee' });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('feature/REQ-2048');

    await row.getByRole('button', { name: '指派' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('指派变更归属');

    await dialog.locator('#attribution-assign-input').fill('TASK-202');
    await dialog.getByRole('button', { name: '确认指派' }).click();

    // 成功后条目移出待归属队列，并给出归属 toast
    await expect(unassigned).toHaveCount(0);
    await expect(dialog).toHaveCount(0);
    await expect(
      page.locator('[data-slot="toast"]').filter({ hasText: /已归属/ }),
    ).toHaveCount(1);
  });
});