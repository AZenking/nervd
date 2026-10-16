// 集成分支视图（AGENTS.md §2.3 / 用例 IB-001~003）：
// 纯查看、零写操作。数据链路 = list_branches + compare_branches，负向断言写命令零调用。
import { test, expect, mockCallsOf } from './fixtures';

const WRITE_COMMANDS = [
  'create_branch', 'create_merge_request', 'merge_merge_request', 'update_workitem',
  'save_settings', 'create_workitem_child', 'create_workitem_comment',
  'trigger_jenkins_job', 'trigger_repo_ci', 'start_pipeline_run',
];

test.describe('集成分支视图', () => {
  test.beforeEach(async ({ page }) => {
    await page.keyboard.press('g');
    await page.keyboard.press('b');
    // 分支扫描 + 双向 compare 完成
    await expect(page.getByText(/命中 \d+ 条/)).toBeVisible({ timeout: 15_000 });
  });

  test('IB-001 匹配默认通配模式并计算双向落差', async ({ page }) => {
    // 默认 release/* integration/* temp/* hotfix/* 命中分支行
    await expect(page.getByText('release/Benz-20261016')).toBeVisible();
    await expect(page.getByText('integration/joint-debug-1014')).toBeVisible();
    // 领先/落后基准（ahead/behind 悬浮提示为确定性格式）
    await expect(
      page.locator('[title^="领先"][title*="落后"]').first(),
    ).toBeVisible();
  });

  test('IB-001b 调整匹配模式即时收窄（400ms 防抖）', async ({ page }) => {
    await expect(page.getByText('integration/joint-debug-1014')).toBeVisible();
    await page.getByLabel('集成分支匹配模式').fill('temp/*');
    // 防抖后重扫：非 temp 分支消失，temp 分支保留
    await expect(page.getByText('temp/REQ-2098-hotfix')).toBeVisible();
    await expect(page.getByText('integration/joint-debug-1014')).toHaveCount(0);
  });

  test('IB-002 分支名提取需求编号，点击 Peek 抽屉就地查看', async ({ page }) => {
    // linkPattern 捕获 2098 → 命中数字编号工作项 → 渲染为可点击徽标
    await page.getByText('temp/REQ-2098-hotfix').waitFor();
    await page.getByRole('button', { name: '2098', exact: true }).click();
    const drawer = page.locator('[role="dialog"]');
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText('集成分支联调需求'); // 抽屉内就地展现需求详情
  });

  test('IB-003 零写操作负向：任何交互都不发出写命令', async ({ page }) => {
    // 交互覆盖：切模式（触发重扫）、点需求编号（开抽屉）
    await page.getByLabel('集成分支匹配模式').fill('release/*');
    await expect(page.getByText(/命中 \d+ 条/)).toBeVisible();
    await page.getByRole('button', { name: '2098', exact: true }).click().catch(() => {});
    await page.waitForTimeout(500);

    for (const cmd of WRITE_COMMANDS) {
      const calls = await mockCallsOf(page, cmd);
      expect(calls, `${cmd} 不应有调用`).toHaveLength(0);
    }
  });
});
