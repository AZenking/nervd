// e2e 公共 fixture 与选择器助手（docs/e2e-testing.md §3.3–3.4）
// 选择器三层策略：data-testid（关键交互点）→ 语义锚点（aria）→ store 断言兜底。
import { test as base, expect, type Page } from '@playwright/test';

/** 迭代工作项列表容器（语义锚点） */
export const LIST = 'section[aria-label="迭代工作项"]';

/** 当前光标行（j/k 移动的目标） */
export const activeRow = (page: Page) =>
  page.locator('[data-testid="workitem-row"][data-active="true"]');

/** 按编号定位工作项行 */
export const rowByIdentifier = (page: Page, identifier: string) =>
  page.locator(`[data-testid="workitem-row"][data-identifier="${identifier}"]`);

/** 读取 ui store 当前视图（g 序列 / 导航断言用） */
export const uiView = (page: Page) =>
  page.evaluate(() => (window as any).__nervd_ui.getState().view as string);

/** 读取 ui store 布尔状态（commandOpen / shortcutsOpen 等） */
export const uiFlag = (page: Page, key: 'commandOpen' | 'shortcutsOpen' | 'aboutOpen') =>
  page.evaluate((k) => Boolean((window as any).__nervd_ui.getState()[k]), key);

/** 读取 app store 详情面板当前编号（分栏联动断言用） */
export const detailIdentifier = (page: Page) =>
  page.evaluate(
    () => ((window as any).__nervd_app.getState().detail?.workitem?.identifier ?? null) as string | null,
  );

// ---- 可控 mock（preview/api-mock.ts 的 __nervd_mock 协议）----

export const mockReset = (page: Page) =>
  page.evaluate(() => (window as any).__nervd_mock?.reset());

/** 注入一次性失败：cmd 下一次调用抛错（乐观回滚用例） */
export const mockFail = (page: Page, cmd: string, message?: string) =>
  page.evaluate(
    ({ cmd, message }) => (window as any).__nervd_mock.fail(cmd, message),
    { cmd, message },
  );

/** 注入延迟：验证乐观即时呈现 */
export const mockDelay = (page: Page, cmd: string, ms: number) =>
  page.evaluate(({ cmd, ms }) => (window as any).__nervd_mock.delay(cmd, ms), { cmd, ms });

/** 读取调用记录（只读门控负向断言 / backfill 断言） */
export const mockCallsOf = (page: Page, cmd: string) =>
  page.evaluate(
    (cmd) => (window as any).__nervd_mock?.callsOf(cmd) ?? [],
    cmd,
  ) as Promise<Array<{ cmd: string; args: unknown[]; at: number }>>;

/**
 * 应用就绪 fixture：进入首页 → 等初始补拉（backfill）填满第 1 页（30 条）后进入稳态 →
 * 清零 mock 调用记录，保证各用例计数基线干净。
 * 「第 1 - 30 项」出现 = 初始数据流停止，避免列表在断言期间因新数据到达而重新分组漂移。
 */
export const test = base.extend({
  app: [
    async ({ page }, use) => {
      await page.goto('/#workbench');
      await page.waitForFunction(() => (window as any).__nervd_app?.getState().booting === false);
      await page.keyboard.press('g');
      await page.keyboard.press('i');
      await expect(page.locator(LIST)).toBeVisible();
      await expect(page.getByTestId('pagination-info')).toContainText('第 1 - 30 项', { timeout: 20_000 });
      await mockReset(page);
      await use(page);
    },
    { auto: true },
  ],
});
export { expect };
