# nervd 功能测试用例与 E2E 测试指南

> 目标读者：为 nervd 编写功能测试用例 / E2E 测试的工程师与 Agent。
> 本文回答两个问题：**① 按功能怎么拆测试用例；② 在这个 Tauri 项目里 E2E 怎么落地。**

## ✅ 实施状态（2026-10-16）

本文方案已落地为可运行基建：

```bash
./scripts/test.sh            # 单测(vitest) + E2E(playwright) 一键全跑
./scripts/test.sh --unit     # 仅单元测试（13 条）
./scripts/test.sh --e2e      # 仅 E2E（25 条，自动拉起 preview mock 模式）
pnpm test:e2e:browsers       # 首次执行前安装 chromium 到 .playwright-browsers/
```

- **单元层**：`vitest.config.ts` + `src/lib/link.test.ts` + `src/store/app.test.ts`（乐观更新回滚闭环）
- **E2E 层**：`playwright.config.ts`（浏览器固定装在 `.playwright-browsers/`，不写系统缓存）+ `e2e/` 下 9 个 spec 25 条用例，覆盖五大模块的 P0/P1 功能点（见 §4 映射表）
- **可控 mock**：`preview/api-mock.ts` 内建 `__nervd_mock` 协议（`fail` / `delay` / `callsOf` / `reset`），22 个命令挂钩
- **质量门禁**：`scripts/verify.sh` 第 2 步已加入 vitest；E2E 走 `scripts/test.sh`（需要浏览器二进制，不进默认门禁）

---

## 1. 方法论：从「功能规约」到「测试用例」

### 1.1 用例的源头是规约，不是代码

nervd 的功能规约已经存在于 `AGENTS.md`（模块定义、快捷键矩阵、Esc 阶梯、写操作门控）。每条用例都应该能回溯到规约中的一句话；规约没写的行为不进 P0 用例。用例统一采用三段式：

```
Given  前置状态（视图、数据、模式）
When   用户操作（按键 / 点击 / 输入）
Then   可观察结果（DOM 文本、store 状态、网络调用记录）
```

### 1.2 按功能形态分类，决定断言方式

nervd 的功能可归为四类，每类的「怎么测」不同：

| 功能形态 | 典型例子 | 断言策略 |
|---|---|---|
| **渲染型** | 状态分组排序（运行中→失败→空闲→成功）、骨架屏、徽标计数 | 断言 DOM 结构与文本顺序 |
| **交互型** | `j`/`k` 光标、`Enter` 分栏、`[`/`]` 翻页、`g` 序列、Esc 阶梯 | 模拟按键 → 断言 `data-active`、视图切换、滚动跟随 |
| **状态机型（乐观更新）** | 状态就地流转、失败回滚 | **关键**：给 mock 注入延迟/失败，断言"网络悬挂时 UI 已变"与"失败后回滚 + Toast" |
| **门控型（安全负向）** | 只读模式写操作拦截 | 点击后**断言没有 IPC 调用发生** + Toast 告警，而非只看按钮样式 |

> 门控型用例最容易写成"检查按钮变灰"的假测试。真正的断言是：**操作发生后 `__nervd_mock.callsOf('update_workitem')` 长度为 0**。

### 1.3 快捷键功能用「按键矩阵」穷举

每個快捷键功能产出一张矩阵，行 = 按键序列，列 = 前置条件（焦点在输入框 / 浮层打开 / 多选激活…），格 = 预期行为。Shell 的实现顺序（`src/components/Shell.tsx` ② 浮层让路 → ③ g 序列 → ④ ? → ⑤ Esc）与 `AGENTS.md` §4.2 的 Esc 阶梯优先级就是现成的矩阵行。

### 1.4 用例登记模板

每条用例落库时使用统一字段（可直接作为 spec 的 `test('…')` 标题）：

```
ID: NAV-001 | 模块: 迭代工作台 | 优先级: P0
Given: 迭代视图已加载列表
When: 按 j 三次
Then: data-active 行从第 1 行移到第 4 行，页面滚动跟随
断言层: DOM
```

---

## 2. 测试分层：什么功能放在哪一层测

```
        ┌─────────────────────────────┐
        │ L4 桌面 E2E 冒烟 (tauri-driver)│  真实 IPC + Rust 门控 + Keychain，仅 3~5 条
        ├─────────────────────────────┤
        │ L3 Web E2E (Playwright)      │  ★ 主力层：键盘流、视图流、批量流、门控负向
        │    跑 preview mock 模式:1423  │
        ├─────────────────────────────┤
        │ L2 Store/Hook 单测 (Vitest)   │  乐观更新回滚、useKeyboardListNavigation、
        │                             │  useBatchSelection —— 纯逻辑，快且准
        ├─────────────────────────────┤
        │ L1 纯函数单测 (Vitest)        │  src/lib/link.ts 正则、format、
        │                             │  iteration-templates 分支名生成
        └─────────────────────────────┘
```

**选层判据**：

- 只依赖输入输出、不碰 React → L1（例：`link.ts` 从分支名提取需求编号）。
- 状态变迁逻辑（乐观更新的记录/回滚路径）→ L2，用 `vi.mock('@/lib/api')` 直接控制 resolve/reject；E2E 再补一条端到端验证。
- 用户可感知的操作流（按键、点击、浮层、Toast）→ L3。
- 依赖 Rust 侧行为（`allowWriteOps` 的 IPC 层二次拦截、Keychain、系统通知）→ L4，只测"前端被绕过时后端仍拒绝"这一件事。

---

## 3. E2E 架构：跑在 preview 接缝上

### 3.1 为什么是 preview 模式

项目已有一条天然测试接缝：

- `src/lib/api.ts` 是**唯一**的 Tauri IPC 边界（全部 `invoke` 调用）。
- `preview/vite.config.mts` 在构建时把 `/src/` 内对 `lib/api` 的引用整体重定向到 `preview/api-mock.ts`，使 `Shell` 可在纯浏览器（`http://localhost:1423`）渲染，无需 Tauri 运行时。
- `preview/main.tsx` 已暴露 `window.__nervd_app` / `window.__nervd_ui`（Zustand store hooks），可直接读写应用状态。

因此 Playwright 只需 `webServer` 拉起 `pnpm preview:dev`，即可获得：**确定性数据、零真实云效网络、毫秒级启动、CI 友好**。这一层覆盖 L3 全部用例。

### 3.2 把静态 mock 升级为「可控 mock」（已实现）

`preview/api-mock.ts` 顶部内建 `gate()` 包装器，挂在各导出函数首行：记录调用 → 附加延迟 → 注入一次性失败。命令名与 `src/lib/api.ts` 的真实 invoke 名保持一致（顺带成为 IPC 契约的回归检查）：

```ts
// preview/api-mock.ts（已实现，节选）
async function gate(cmd: string, args: unknown[] = []): Promise<void> {
  mockCalls.push({ cmd, args, at: Date.now() });
  const ms = mockDelays.get(cmd);
  if (ms) await sleep(ms);
  const message = mockFailures.get(cmd);
  if (message != null) { mockFailures.delete(cmd); throw new Error(message); }
}

(window as any).__nervd_mock = {
  fail(cmd, message) { ... },   // 注入一次性失败（乐观回滚用例）
  delay(cmd, ms) { ... },       // 注入延迟（乐观即时呈现 / 骨架屏）
  callsOf(cmd) { ... },         // 读取调用记录（只读门控负向断言）
  reset() { ... },
};

// 各导出函数首行挂 gate（在既有 sleep 与状态变更之前，保证失败先于副作用抛出）：
export async function updateWorkitem(workitemId: string, update: {...}): Promise<unknown> {
  await gate('update_workitem', [workitemId, update]);
  // …原有静态实现
}
```

### 3.3 选择器策略（已落地）

关键交互点已补齐 `data-testid`（组件文件非冻结契约，允许改动）：

| testid | 位置 | 用途 |
|---|---|---|
| `workitem-row`（+ `data-identifier`） | IterationView 列表行 | 行定位 / 光标断言 |
| `split-master` / `split-detail` | 分栏左右容器 | 分栏开合断言 |
| `floating-batch-bar` / `batch-bar-count` | 浮动批量条 | 多选状态断言 |
| `row-status-trigger`（+ `data-status`） | 行首状态下拉 | 乐观更新断言 |
| `child-row`（+ `data-identifier`） | 子任务行 | 钻取入口 |
| `pagination-info` | 列表底部分页统计 | 翻页 / backfill 断言 |
| `write-op-button` / `write-op-gated` | WriteOpButton 只读态 | 门控断言 |

配套约定：

1. 结构性锚点直接用语义选择器：`section[aria-label="迭代工作项"]`、行 `data-active`、组头 `aria-expanded`、Toast `[data-slot="toast"]`。
2. **store 断言兜底**：`window.__nervd_ui.getState().view`（视图切换）、`__nervd_app.getState().detail`（分栏联动）。注意 `useBatchSelection` 的多选是组件局部 state，**必须**走 DOM 断言（浮动条计数）。
3. 两个实战教训（写新用例必读）：
   - 分栏打开时 `data-active` 会同时命中**光标行 + 选中行**两行（设计如此），联动断言请走 store 或按 `data-identifier` 钉行；
   - 状态流转会让行**移入新分组**（列表重排），乐观更新断言必须按 `data-identifier` 钉住行，不能跟随光标。

### 3.4 Playwright 配置与文件组织（已落地）

```
playwright.config.ts        # 根配置：webServer 拉起 preview:dev @1423，浏览器装在 .playwright-browsers/
vitest.config.ts            # 单测配置：jsdom + @ alias
e2e/
  fixtures.ts               # app 就绪 fixture（等第 1 页填满稳态）+ 选择器/store/mock 助手
  iteration-workbench.spec.ts   # IT-001/003/004/005/006（分组、光标、分栏联动、多选、翻页补拉）
  iteration-toolbar.spec.ts     # IT-010/011 + TH-001（类别切换、右键菜单、全屏工作台、主题切换）
  esc-hierarchy.spec.ts         # GL-003（Esc 阶梯：浮层→多选→钻取→分栏）
  optimistic-status.spec.ts     # IT-007/008（乐观即时呈现、失败回滚）
  readonly-gating.spec.ts       # IT-009（只读门控负向断言）
  integration-branches.spec.ts  # IB-001/002/003（通配扫描、需求编号 Peek、零写操作负向）
  overview-peek.spec.ts         # OV-001（最近更新 → Peek 抽屉 → 全屏工作台）
  settings.spec.ts              # ST-001/002/003 + RD-002（自动保存防抖、只读徽标、写权限开关全链路、行内创建）
  shell-nav.spec.ts             # GL-001/002（g 序列、⌘K 让路、? 面板）
src/lib/link.test.ts            # L1：追溯规则纯函数
src/store/app.test.ts           # L2：乐观更新回滚闭环
scripts/test.sh                 # 测试入口（--unit / --e2e / 默认全跑）
```

关键配置（`playwright.config.ts`）：

```ts
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.resolve('.playwright-browsers'); // 沙箱/CI 友好

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:1423' },
  webServer: {
    command: 'pnpm preview:dev',
    url: 'http://localhost:1423',
    reuseExistingServer: !process.env.CI,   // 本地复用，CI 内独占
  },
});
```

```ts
// e2e/fixtures.ts
import { test as base, expect, type Page } from '@playwright/test';

const LIST = `section[aria-label="迭代工作项"]`;

export const test = base.extend<{ app: Page }>({
  app: [async ({ page }, use) => {
    await page.goto('/');
    await expect(page.locator(LIST)).toBeVisible();   // 应用就绪信号
    await page.evaluate(() => (window as any).__nervd_mock?.reset());
    await use(page);
  }, { auto: true }],
});
export { expect };

export const activeRow = (page: Page) => page.locator(`${LIST} button[data-active=true]`);
```

---

## 4. 功能 → 用例映射总表（P0 优先落地）

### 4.1 迭代工作台

| ID | 用例 | 断言层 |
|---|---|---|
| IT-001 P0 | 列表按 运行中→失败→空闲→成功 分组排序，组头带计数徽标 | DOM 顺序 |
| IT-002 P1 | 组头点击折叠/展开，`aria-expanded` 正确翻转 | DOM |
| IT-003 P0 | `j`/`k` 移动 `data-active` 光标行，`Enter` 打开分栏 | DOM |
| IT-004 P0 | 分栏打开时 `j`/`k` 联动刷新右侧详情（标题跟随变化） | DOM |
| IT-005 P0 | `x` 选中当前行 → 底部浮动批量条滑出并显示计数；再 `x` 取消；`Esc` 清空全部 | DOM |
| IT-006 P0 | `[`/`]` 翻页：页码指示从「第 1 - 30 项」变「第 31 - 60 项」，未命中缓存触发补拉（`callsOf('list_workitems')` 增长） | DOM + mock |
| IT-007 P0 | 行首状态 Popover 就地流转：网络悬挂（`delay('update_workitem', 2000)`）时 UI 立即变更为新状态 | DOM |
| IT-008 P0 | 流转失败（`fail('update_workitem', '云效 403')`）：状态回滚 + 错误 Toast | DOM |
| IT-009 P0 | 只读模式（preview 默认 `allowWriteOps:false`）：写按钮 `aria-disabled="true"`，点击后 Toast 告警且 `callsOf('update_workitem')` 为空 | DOM + mock |

### 4.2 需求详情工作台

| ID | 用例 |
|---|---|
| RD-001 P0 | 分栏内点击子任务 → 钻取为子任务详情，出现"返回父需求"面包屑，`Esc` 逐层退回 |
| RD-002 P1 | 子任务行内输入标题回车即时创建（`callsOf('create_workitem')` 记录参数） |
| RD-003 P1 | "全屏打开"进入独立工作台模态（`__nervd_ui.getState().view === 'requirement'`），`Esc`/`⌘←` 返回且滚动位置恢复 |
| RD-004 P2 | 关联仓库卡片、分支图谱节点渲染（`@xyflow/react` 节点数 > 0） |

### 4.3 集成分支 / 总览 / 设置 / 全局

| ID | 用例 |
|---|---|
| IB-001 P1 | 通配模式输入 400ms 防抖后扫描，分支行显示 ahead/behind |
| IB-002 P1 | 分支名中的需求编号可点击，Peek 抽屉就地展示详情，不打断列表 |
| IB-003 P1 | **零写操作负向**：本视图任何交互后，所有写命令（`update_*`/`save_*`/`create_*`）调用记录为 0 |
| OV-001 P1 | 总览"最近更新"点击 → Peek 抽屉；抽屉内"全屏打开"进入工作台 |
| ST-001 P1 | 设置输入防抖自动保存：停止输入后 `callsOf('save_settings')` 恰好 +1，状态指示从"保存中…"变"已自动保存" |
| ST-002 P1 | 只读徽标点击直达安全设置分区 |
| GL-001 P1 | `g o`/`g i`/`g b`/`g s` 前缀跳转（1.5s 窗口；焦点在输入框时让路） |
| GL-002 P1 | `⌘K` 命令面板开合；`?` 速查面板 |
| GL-003 P0 | **Esc 阶梯**（见 §5 专项） |

---

## 5. Spec 实例（已落地于 `e2e/`，以下为演进版示例）

> 下面代码与仓库内实际 spec 同源；实际版本以 `e2e/*.spec.ts` 为准（含按 `data-identifier` 钉行等实战修正）。

### 5.1 Esc 阶梯退回（GL-003，最能体现"按功能写用例"）

```ts
// e2e/esc-hierarchy.spec.ts
import { test, expect, activeRow } from './fixtures';

test('Esc 严格按层级退回：多选 → 钻取 → 分栏，不越级', async ({ page }) => {
  // Given：分栏已打开（Enter），且已钻取子任务，且有多选
  await page.keyboard.press('Enter');                         // 打开分栏
  await expect(page.getByTestId('split-detail')).toBeVisible();
  await page.getByTestId('child-row').first().click();        // 钻取子任务
  await expect(page.getByTestId('split-detail')).toContainText('返回父需求');
  await page.keyboard.press('x');                             // 激活多选
  await expect(page.getByTestId('floating-batch-bar')).toBeVisible();

  // When/Then ① 多选优先：第一下 Esc 清空多选，分栏仍在
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('floating-batch-bar')).toBeHidden();
  await expect(page.getByTestId('split-detail')).toBeVisible();

  // ② 钻取次之：第二下 Esc 退回父需求
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('split-detail')).not.toContainText('返回父需求');

  // ③ 分栏最后：第三下 Esc 关闭分栏回到全宽列表
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('split-detail')).toBeHidden();
  await expect(activeRow(page)).toBeVisible();
});
```

### 5.2 乐观更新：即时呈现 + 失败回滚（IT-007/008）

```ts
// e2e/optimistic-status.spec.ts
import { test, expect, activeRow } from './fixtures';

test('网络悬挂时 UI 立即呈现新状态', async ({ page }) => {
  await page.evaluate(() => (window as any).__nervd_mock.delay('update_workitem', 3000));
  const row = activeRow(page);
  const oldStatus = await row.getByTestId('row-status-label').textContent();

  await row.getByTestId('row-status-trigger').click();
  await page.getByRole('menuitem').filter({ hasText: '已完成' }).click();

  // 网络尚未返回，UI 已变更（乐观 <50ms 呈现）
  await expect(row.getByTestId('row-status-label')).not.toHaveText(oldStatus ?? '');
  await expect(page.getByTestId('toast')).toBeHidden();       // 尚无成功 Toast
});

test('流转失败自动回滚并报错', async ({ page }) => {
  await page.evaluate(() => (window as any).__nervd_mock.fail('update_workitem', '云效 403'));
  const row = activeRow(page);
  const oldStatus = await row.getByTestId('row-status-label').textContent();

  await row.getByTestId('row-status-trigger').click();
  await page.getByRole('menuitem').filter({ hasText: '已完成' }).click();

  await expect(page.getByTestId('toast')).toContainText(/403|失败/);
  await expect(row.getByTestId('row-status-label')).toHaveText(oldStatus ?? ''); // 回滚
});
```

### 5.3 只读门控负向（IT-009）

```ts
test('只读模式下写操作被拦截且无 IPC 调用', async ({ page }) => {
  const btn = page.getByTestId('write-op-trigger').first();
  await expect(btn).toHaveAttribute('aria-disabled', 'true');   // 非 disabled，可悬停
  await btn.click();
  await expect(page.getByTestId('toast')).toContainText(/只读|设置/);
  const calls = await page.evaluate(() => (window as any).__nervd_mock.callsOf('update_workitem'));
  expect(calls).toHaveLength(0);                                // 核心：没有写调用
});
```

### 5.4 g 序列跳转（GL-001，store 断言）

```ts
test('g 前缀序列跳转四大视图', async ({ page }) => {
  const view = () => page.evaluate(() => (window as any).__nervd_ui.getState().view);
  await page.keyboard.press('g'); await page.keyboard.press('o');
  expect(await view()).toBe('overview');
  await page.keyboard.press('g'); await page.keyboard.press('b');
  expect(await view()).toBe('integration');
  // 焦点在输入框时让路
  await page.getByTestId('global-search').click();
  await page.keyboard.press('g'); await page.keyboard.press('i');
  expect(await view()).toBe('integration');                     // 未跳转
});
```

### 5.5 L2 单测：乐观更新回滚逻辑（Vitest）

```ts
// src/store/app.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useApp } from './app';
import * as api from '@/lib/api';

beforeEach(() => { vi.clearAllMocks(); useApp.getState().resetForTest?.(); });

describe('updateWorkitemStatusOptimistic', () => {
  it('API 失败时回滚 items 并返回 false', async () => {
    vi.spyOn(api, 'getWorkitemWorkflowStatuses').mockResolvedValue([{ id: 's2', name: '已完成' }] as any);
    vi.spyOn(api, 'updateWorkitem').mockRejectedValue(new Error('403'));
    const before = useApp.getState().items;
    const ok = await useApp.getState().updateWorkitemStatusOptimistic(before[0].workitemId, '已完成');
    expect(ok).toBe(false);
    expect(useApp.getState().items[0].status).toBe(before[0].status);   // 已回滚
  });
});
```

---

## 6. L4 桌面冒烟：tauri-driver

Web 层 mock 了 IPC，"Rust 核心层二次拦截"（`AGENTS.md` §5.4）只有真实桌面能验证。用官方 `tauri-driver`（WebDriver 实现）+ WebdriverIO，仅保留 3~5 条冒烟：

1. 应用启动 → 迭代列表渲染（真实云效或脱机回退）。
2. 前端 DOM 篡改强行触发写命令 → 后端抛权限异常。
3. Keychain PAT 保存/删除往返。
4. 系统通知触发。

macOS 下 `browserName: 'safari'`，Linux `'wry'`，Windows 走 Edge Chromium 选项；配置细节以 [Tauri E2E 官方文档](https://v2.tauri.app/develop/tests/) 为准。此层慢且脆，只做 nightly，不进 PR 门禁。

---

## 7. 落地路线（冻结契约注意事项）

> `package.json` / `pnpm-lock.yaml` / `vite.config.ts` / `tsconfig.json` 为冻结契约（`AGENTS.md` §6.2，`scripts/verify.sh` 会硬性校验）。

**当前状态（2026-10-16）：步骤 0–4 已完成。** `package.json` / `pnpm-lock.yaml` 的变更（新增 `@playwright/test`、`vitest`、`jsdom` 三个 devDependencies 与 `test*` 脚本）已获授权落地，但**在持有者 review 并 commit 之前，`verify.sh` 第 4 步冻结契约门禁会持续报告这两个文件**——这是门禁的设计行为，commit 后自动恢复。

| 步骤 | 内容 | 状态 |
|---|---|---|
| 0 | 解锁 `package.json`，新增 devDeps `@playwright/test`、`vitest`、`jsdom` | ✅ 已完成（待 commit 基线化） |
| 1 | 补关键交互点 `data-testid`；`preview/api-mock.ts` 升级 `gate` 协议 | ✅ 已完成 |
| 2 | 建 `e2e/` 目录 + config + fixtures + 首批 P0 用例（§4 表） | ✅ 13 条全绿 |
| 3 | Vitest 层：`src/lib` 纯函数 + `src/store/app` 乐观逻辑 | ✅ 13 条全绿 |
| 4 | 门禁：`scripts/verify.sh` 追加 vitest；独立 `scripts/test.sh` 承载 e2e | ✅ 已完成 |

**DoD**：P0 用例全绿进 PR 门禁；每条用例标题携带规约 ID（如 `GL-003`）保证可回溯；新功能合入必须附带对应用例，否则门禁不放行。

**后续待补（P1/P2）**：⌘K 命令面板内部搜索与跳转、LogViewer 实时构建日志抽屉（自动滚动）、分支图谱（BranchStateDiagram）节点断言、Activity 评论发表（写权限开启后的正向链路）、迭代切换（SearchableSelect）、筛选菜单（处理人/关联人/状态）、设置其余分区（追溯规则 / CI 绑定 / AI）、L4 tauri-driver 桌面冒烟（Rust 层写拦截 + Keychain）。

## 8. 可选增强

- **视觉回归**：`expect(page).toHaveScreenshot()` 固定深/浅双主题截图，守护 `DESIGN.md` 设计系统（骨架屏行高一致性尤其值得盯）。
- **IPC 契约回归**：mock 命令名与 `src/lib/api.ts` 的 invoke 名同源，可加一条单测比对两边的命令名集合，防止漂移。
- **a11y 专项**：`@axe-core/playwright` 挂到 fixtures，跑 WCAG 2.1 AA 扫描（配合 `AGENTS.md` 推荐的 `a11y-debugging` 流程）。
