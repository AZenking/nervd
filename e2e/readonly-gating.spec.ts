// 只读门控负向用例（AGENTS.md §5.1 / 用例 IT-009）：
// 核心断言不是按钮变灰，而是「点击后没有任何写 IPC 调用发生」。
import { test, expect, mockCallsOf } from './fixtures';

test('IT-009 只读模式下写操作被拦截且无 IPC 调用（负向）', async ({ page }) => {
  // preview 默认 allowWriteOps=false；「涉及仓库」tab 有 Flow 绑定仓库的写入口
  await page.getByRole('tab', { name: '涉及仓库' }).click();

  const btn = page.getByRole('button', { name: '触发流水线验证' }).first();
  await expect(btn).toBeVisible();
  // 严禁原生 disabled（会吞 hover/focus）：必须是 aria-disabled，保留 Tooltip
  await expect(btn).toHaveAttribute('aria-disabled', 'true');
  await expect(btn).not.toHaveAttribute('disabled');

  // 注意：Playwright 把 aria-disabled 视为 "not enabled"，普通 click 会永远等待；
  // 真实用户可以点击该按钮（这正是设计意图——点击出引导 Toast），故 force 点击
  await btn.click({ force: true });
  await expect(
    page.locator('[data-slot="toast"]').filter({ hasText: '当前处于只读模式' }),
  ).toBeVisible();

  // 核心负向断言：写命令从未发出
  const calls = await mockCallsOf(page, 'trigger_repo_ci');
  expect(calls).toHaveLength(0);
});
