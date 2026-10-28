import { test, expect, rowByIdentifier, uiView } from './fixtures';

test('Mac navigation goes back/forward without Escape leaving a full page', async ({ page }) => {
  await page.keyboard.press('g'); await page.keyboard.press('o');
  await expect.poll(() => uiView(page)).toBe('overview');
  await page.keyboard.press('Meta+[');
  await expect.poll(() => uiView(page)).toBe('iteration');
  await page.keyboard.press('Meta+]');
  await expect.poll(() => uiView(page)).toBe('overview');
  await page.keyboard.press('Meta+,');
  await expect.poll(() => uiView(page)).toBe('full-settings');
  await page.keyboard.press('Escape');
  expect(await uiView(page)).toBe('full-settings');
});

test('selection modifiers and Escape keep the preview intact until deselected', async ({ page }) => {
  const rows = page.getByTestId('workitem-row');
  await rows.nth(0).click();
  await expect(page.getByTestId('split-detail')).toBeVisible();
  await rows.nth(2).click({ modifiers: ['Shift'] });
  await expect(page.getByTestId('floating-batch-bar')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('floating-batch-bar')).toHaveCount(0);
  await expect(page.getByTestId('split-detail')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('split-detail')).toHaveCount(0);
});

test('double-click opens the full workbench and Back restores the iteration', async ({ page }) => {
  await rowByIdentifier(page, 'REQ-2084').dblclick();
  await expect.poll(() => uiView(page)).toBe('requirement');
  await page.keyboard.press('Meta+[');
  await expect.poll(() => uiView(page)).toBe('iteration');
  await expect(rowByIdentifier(page, 'REQ-2084')).toBeVisible();
});

test('find falls back to command search without introducing a search field', async ({ page }) => {
  await page.keyboard.press('Meta+f');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.type('g o');
  expect(await uiView(page)).toBe('iteration');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Back restores the second page and selected preview after opening a full workbench', async ({ page }) => {
  await page.keyboard.press(']');
  await expect(page.getByTestId('pagination-info')).toContainText('第 31');
  const row = page.getByTestId('workitem-row').first();
  const id = await row.getAttribute('data-identifier');
  await row.click();
  await expect(page.getByTestId('split-detail')).toBeVisible();
  await page.getByRole('button', { name: '在工作台全屏打开', exact: true }).click();
  await expect.poll(() => uiView(page)).toBe('requirement');
  await page.keyboard.press('Meta+[');
  await expect.poll(() => page.evaluate(() => (window as any).__nervd_ui.getState().listContext.pageIndex)).toBe(2);
  await expect(rowByIdentifier(page, id!)).toBeVisible();
});

test('reload restores the last full page', async ({ page }) => {
  await page.keyboard.press('g'); await page.keyboard.press('b');
  await expect.poll(() => uiView(page)).toBe('integration');
  await page.reload();
  await page.waitForFunction(() => (window as any).__nervd_app?.getState().booting === false);
  await expect.poll(() => uiView(page)).toBe('integration');
});
