// 全局键盘层（AGENTS.md §4 / 用例 GL-001、GL-002）：
// g 前缀序列跳转、⌘K 命令面板让路、? 快捷键速查。
import { test, expect, uiView, uiFlag } from './fixtures';

test.describe('g 前缀序列跳转（1.5s 判定窗口）', () => {
  test('GL-001 g o / g i / g b / g s 切换四大视图', async ({ page }) => {
    await page.keyboard.press('g');
    await page.keyboard.press('o');
    await expect.poll(() => uiView(page)).toBe('overview');

    await page.keyboard.press('g');
    await page.keyboard.press('i');
    await expect.poll(() => uiView(page)).toBe('iteration');

    await page.keyboard.press('g');
    await page.keyboard.press('b');
    await expect.poll(() => uiView(page)).toBe('integration');

    await page.keyboard.press('g');
    await page.keyboard.press('s');
    await expect.poll(() => uiView(page)).toBe('full-settings');

    await page.keyboard.press('g');
    await page.keyboard.press('i');
    await expect.poll(() => uiView(page)).toBe('iteration');
  });
});

test.describe('全局快捷键让路规则', () => {
  test('GL-002a ⌘K 命令面板打开时单键序列让路', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    await expect.poll(() => uiFlag(page, 'commandOpen')).toBe(true);

    // 面板打开期间 g 序列不得触发视图跳转
    await page.keyboard.press('g');
    await page.keyboard.press('o');
    expect(await uiView(page)).toBe('iteration');

    await page.keyboard.press('Escape');
    await expect.poll(() => uiFlag(page, 'commandOpen')).toBe(false);
  });

  test('GL-002b ? 打开快捷键速查面板，Esc 关闭', async ({ page }) => {
    await page.keyboard.press('?');
    await expect.poll(() => uiFlag(page, 'shortcutsOpen')).toBe(true);
    await page.keyboard.press('Escape');
    await expect.poll(() => uiFlag(page, 'shortcutsOpen')).toBe(false);
  });
});
