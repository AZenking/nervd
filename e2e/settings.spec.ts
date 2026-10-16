// 系统设置：自动保存 / 只读徽标 / 写权限开关全链路（AGENTS.md §2.5、§5 / 用例 ST-001~003、RD-002）
import { test, expect, uiView, mockCallsOf } from './fixtures';

test.describe('设置自动保存（Auto-Save）', () => {
  test('ST-001 输入防抖自动保存：未保存 → 已自动保存', async ({ page }) => {
    await page.keyboard.press('g');
    await page.keyboard.press('s');
    await expect.poll(() => uiView(page)).toBe('full-settings');

    const org = page.locator('#org');
    await expect(org).toBeVisible();
    const original = (await org.inputValue()) || '60de7a68';
    const callsBefore = (await mockCallsOf(page, 'save_settings')).length;

    // 输入变更 → 状态指示翻为「未保存」，无立即保存
    await org.fill(original + 'e2e');
    await expect(page.getByText('未保存').or(page.getByText('保存中…'))).toBeVisible();

    // 800ms 防抖后自动保存发出，指示回到「已自动保存」
    await expect(async () => {
      const calls = await mockCallsOf(page, 'save_settings');
      expect(calls.length).toBeGreaterThan(callsBefore);
    }).toPass({ timeout: 5_000 });
    await expect(page.getByText('已自动保存')).toBeVisible();

    // 还原现场，避免污染后续用例的 mock settings
    await org.fill(original);
    await expect(async () => {
      const calls = await mockCallsOf(page, 'save_settings');
      expect(calls.length).toBeGreaterThan(callsBefore + 1);
    }).toPass({ timeout: 5_000 });
  });

  test('ST-002 侧栏只读徽标直达安全设置分区', async ({ page }) => {
    await page.getByRole('button', { name: '只读', exact: true }).click();
    await expect.poll(() => uiView(page)).toBe('full-settings');
    // 直达「安全」分区：写操作开关可见
    await expect(page.getByRole('switch', { name: /允许写操作/ })).toBeVisible();
  });
});

test('ST-003 + RD-002 开启写权限后子任务行内快速创建全链路', async ({ page }) => {
  // ① 只读徽标 → 安全分区 → 开启写操作开关（立即保存）
  // 注意：#allow-write-ops 是 Base UI Switch 的隐藏原生 checkbox（不可点），
  // 可见的可点击元素是 role="switch"
  await page.getByRole('button', { name: '只读', exact: true }).click();
  const switchEl = page.getByRole('switch', { name: /允许写操作/ });
  await expect(switchEl).toBeVisible();
  await switchEl.click();
  await expect(async () => {
    const calls = await mockCallsOf(page, 'save_settings');
    const last = calls.at(-1);
    expect(last?.args?.[0]).toMatchObject({ allowWriteOps: true });
  }).toPass({ timeout: 5_000 });
  // 等保存真正落盘（指示器回到「已自动保存」）再导航——否则会撞上脏草稿离开守卫
  await expect(page.getByText('已自动保存')).toBeVisible({ timeout: 5_000 });

  // ② 回到迭代 → 打开 REQ-2084 详情 → 行内新建子任务
  await page.keyboard.press('g');
  await page.keyboard.press('i');
  await page.locator('[data-testid="workitem-row"][data-identifier="REQ-2084"]').click();
  await expect(page.getByTestId('split-detail')).toBeVisible();

  await page.getByRole('button', { name: /新建子任务/ }).click();
  const input = page.getByPlaceholder('输入子任务名称，按 ↵ 快速创建…');
  await expect(input).toBeVisible();
  await input.fill('E2E 冒烟子任务');
  await input.press('Enter');

  // ③ create_workitem_child 发出且携带标题，新行即时出现
  await expect(async () => {
    const calls = await mockCallsOf(page, 'create_workitem_child');
    expect(calls.some((c) => JSON.stringify(c.args).includes('E2E 冒烟子任务'))).toBe(true);
  }).toPass({ timeout: 5_000 });
  await expect(page.getByTestId('child-row').filter({ hasText: 'E2E 冒烟子任务' })).toBeVisible();
});
