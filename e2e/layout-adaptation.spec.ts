// 布局自适应（LA-010~LA-030）：
// LA-010/011 1360×860 双栏渲染：拖动 split-master/split-detail 间分隔线改变 master 宽度（不重载数据、
//            不动光标），双击分隔线恢复默认 360；
// LA-020    800×640 打开工作项详情进入单栏详情态（存在「返回列表」入口），返回后筛选/分页/多选/
//            滚动位置保持；Esc 阶梯在单栏下同样生效；
// LA-030    跨 760 阈值：1360 打开详情 → 缩到 800 单栏详情态保留且「返回列表」可用 → 回 1360 恢复双栏。
import { test, expect, activeRow, rowByIdentifier, detailIdentifier, mockCallsOf, LIST } from './fixtures';

/** split-master 当前渲染宽度（px） */
const masterWidth = (page: import('@playwright/test').Page) =>
  page.getByTestId('split-master').boundingBox().then((box) => box?.width ?? 0);

test.describe('布局自适应：分栏宽度接入（1360×860）', () => {
  test.use({ viewport: { width: 1360, height: 860 } });

  test('LA-010 拖动分隔线改变 master 宽度：不重载数据、不动光标', async ({ page }) => {
    await activeRow(page).click();
    const master = page.getByTestId('split-master');
    await expect(master).toBeVisible();
    await expect(page.getByTestId('split-detail')).toBeVisible();

    const initialWidth = await masterWidth(page);
    expect(initialWidth).toBeGreaterThan(0);
    const activeId = await activeRow(page).getAttribute('data-identifier');
    const callsBefore = (await mockCallsOf(page, 'list_workitems')).length;

    // 拖动分隔线右移 80px（命中区窄，用中心点起落）
    const sep = page.getByTestId('list-pane-separator');
    const box = await sep.boundingBox();
    expect(box).not.toBeNull();
    const y = box!.y + box!.height / 2;
    const startX = box!.x + box!.width / 2;
    await page.mouse.move(startX, y);
    await page.mouse.down();
    await page.mouse.move(startX + 80, y, { steps: 10 });
    await page.mouse.up();

    await expect.poll(() => masterWidth(page)).toBeGreaterThan(initialWidth + 40);
    // 拖动只改展示宽度：不重发列表请求、光标行保持
    expect((await mockCallsOf(page, 'list_workitems')).length).toBe(callsBefore);
    await expect(activeRow(page).first()).toHaveAttribute('data-identifier', activeId ?? '');
  });

  test('LA-011 双击分隔线恢复默认宽度 360', async ({ page }) => {
    await activeRow(page).click();
    const master = page.getByTestId('split-master');
    await expect(master).toBeVisible();

    const sep = page.getByTestId('list-pane-separator');
    const box = await sep.boundingBox();
    expect(box).not.toBeNull();
    const y = box!.y + box!.height / 2;
    const startX = box!.x + box!.width / 2;
    await page.mouse.move(startX, y);
    await page.mouse.down();
    await page.mouse.move(startX + 80, y, { steps: 10 });
    await page.mouse.up();
    await expect.poll(() => masterWidth(page)).toBeGreaterThan(360 + 40);

    await sep.dblclick();
    await expect.poll(() => masterWidth(page)).toBeCloseTo(360, 1);
  });
});

test.describe('布局自适应：窄窗口单栏切换（800×640）', () => {
  test.use({ viewport: { width: 800, height: 640 } });

  test('LA-020 单栏详情态与「返回列表」现场恢复', async ({ page }) => {
    const scroll = page.locator('.workspace-scroll').first();

    // 现场注入：多选当前光标行 + 列表滚动偏移（键盘路径，避免 click 自带滚动干扰断言）
    await page.keyboard.press('x');
    await expect(page.getByTestId('floating-batch-bar')).toBeVisible();
    await scroll.evaluate((el) => { el.scrollTop = 240; });
    // 以注入后的实况偏移为基准（浏览器滚动锚定在选中态重渲染时可能带来个位像素修正）
    const scrollBefore = await scroll.evaluate((el) => el.scrollTop);
    expect(scrollBefore).toBeGreaterThan(200);

    // Enter 打开光标行详情 → 单栏详情态：无 master/detail 分栏，仅全宽详情 + 返回列表入口
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('split-master')).toHaveCount(0);
    await expect(page.getByTestId('split-detail')).toHaveCount(0);
    const back = page.getByTestId('back-to-list');
    await expect(back).toBeVisible();

    // 返回列表：多选 / 分页 / 滚动位置全部保持
    await back.click();
    await expect(page.locator(LIST)).toBeVisible();
    await expect(page.getByTestId('floating-batch-bar')).toBeVisible();
    await expect(page.getByTestId('pagination-info')).toContainText('第 1 - 30 项');
    await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBe(scrollBefore);

    // Esc 阶梯在单栏下同样生效：多选优先被清空
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('floating-batch-bar')).toHaveCount(0);
  });
});

test('LA-030 跨 760 阈值切换：详情态保留，往返不重置现场', async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 860 });
  await rowByIdentifier(page, 'REQ-2084').click();
  await expect(page.getByTestId('split-master')).toBeVisible();
  await expect(page.getByTestId('split-detail')).toBeVisible();
  await expect.poll(() => detailIdentifier(page)).toBe('REQ-2084');

  // 宽 → 窄：切换为单栏详情态，被打开的工作项与返回入口保留
  await page.setViewportSize({ width: 800, height: 640 });
  await expect(page.getByTestId('split-master')).toHaveCount(0);
  const back = page.getByTestId('back-to-list');
  await expect(back).toBeVisible();
  await expect.poll(() => detailIdentifier(page)).toBe('REQ-2084');

  // 窄 → 宽：恢复双栏，详情仍打开，返回列表入口退场
  await page.setViewportSize({ width: 1360, height: 860 });
  await expect(page.getByTestId('split-master')).toBeVisible();
  await expect(page.getByTestId('split-detail')).toBeVisible();
  await expect(back).toHaveCount(0);
  await expect.poll(() => detailIdentifier(page)).toBe('REQ-2084');
  await expect(page.getByTestId('workitem-row').first()).toBeVisible();
});
