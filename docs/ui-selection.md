# nervd UI 选型调研（2026-09）

> 结论先行：**推荐「`@base-ui/react` headless 原语 + 保留现有 theme.css」**（方案 A）。
> 若后续 UI 复杂度明显上探（命令面板、大数据表、多步表单），再演进到 **shadcn/ui + Tailwind v4**（方案 B）。
> 不建议引入 antd / MUI / HeroUI / Mantine 这类带视觉主见的组件库。

## 1. 现状盘点

| 项 | 现状 |
|---|---|
| 技术栈 | Tauri 2（WKWebView）+ React 19.1 + Vite 8 + TypeScript + zustand |
| UI 现状 | **零组件库**：10 个组件 ≈650 行 TSX + 365 行手写 `theme.css` |
| 设计基调 | "Hangar Control" 工业控制台：深空石墨 `--bg-*`、信号琥珀 `--accent`、IBM Plex 13px 密排，token 化已就位 |
| 已手搓控件 | input / 原生 select / checkbox / button / 单条 toast / `title` 属性当 tooltip |
| 主要缺口 | Dialog/确认弹窗、DropdownMenu/Popover、可搜索 Combobox、toast 队列与动画、表单校验、真正的 Tooltip |

核心判断：**nervd 的痛点集中在"交互原语"（弹层、浮层、焦点管理），而不是"复合组件"（Table/Form/DatePicker）**，且已有一套完成度很高的定制视觉——这是选型的决定性约束。

## 2. 2026-09 生态事实（npm registry 实测，ego-browser 抓取）

| 候选 | 最新版 | React peer | 周下载 | 定位 |
|---|---|---|---|---|
| **Base UI** `@base-ui/react` | 1.8.0 | ^17 \|\| ^18 \|\| ^19 | **1650 万** | headless 原语，Radix 原班人马重写 |
| Radix UI `radix-ui` | 1.6.7 | ^16.8–^19 | 1607 万 | headless 原语（上一代） |
| shadcn/ui | 代码分发（非 npm 依赖） | React 19 ✓ | — | Tailwind v4 + 组件源码进仓库 |
| antd | 6.6.5 | >=18 | 420 万 | 企业级全家桶，CSS-in-JS |
| @heroui/react | 3.2.6 | >=19 | 71 万 | Tailwind v4 + React Aria |
| @mantine/core | 9.6.3 | ^19.2 | 276 万 | 全家桶 + hooks |
| @mui/material | 9.4.0 | ^17–^19 | 1158 万 | Material Design |
| tailwindcss | 4.3.3 | — | — | CSS 引擎（方案 B 前置） |

关键动向（[shadcn 2026-07 官方公告](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default)）：

- **shadcn/ui 新项目默认底层从 Radix 切换为 Base UI**；社区新建项目选 Base UI 与 Radix 的比例约 2:1。
- Radix 未被弃用、继续支持，但原班人马的重心已在 Base UI——新项目没有理由再从 Radix 起步。
- 注意包名陷阱：`@base-ui-components/react` 是 1.0 前的旧包（latest 停在 `1.0.0-rc.0`），**stable 版本在 `@base-ui/react`**。
- [antd 6.0](https://github.com/ant-design/ant-design/issues/55804) 已发布（React 19 支持、[v5→v6 迁移指南](https://ant.design/docs/react/migration-v6)）；[HeroUI v3](https://heroui.com/en/docs/react/releases/v3-0-0) 重构为 Tailwind v4 + React Aria。

## 3. 结合 nervd 的逐项评估

| 维度 | Base UI（A） | shadcn/ui（B） | antd 6 | Mantine 9 | MUI 9 | HeroUI 3 |
|---|---|---|---|---|---|---|
| 契合现有工业主题 | ★★★ 完全保留 | ★★☆ 需迁 Tailwind 并映射 token | ★☆☆ 需大量 token 覆盖 | ★☆☆ | ☆☆☆ Material 主见最强 | ★☆☆ |
| 补齐当前缺口 | ★★★ 恰好是原语集 | ★★★ 原语+复合全有 | ★★★ | ★★★ | ★★★ | ★★★ |
| 包体/运行时开销 | ★★★ ~几十 KB、零运行时 | ★★★ 按需 + Tailwind | ★☆☆ cssinjs 运行时 | ★★☆ | ★☆☆ | ★★☆ |
| React 19 | ★★★ 原生支持 | ★★★ | ★★☆ 支持 | ★★★ | ★★☆ | ★★★ |
| 改动半径 | **最小**：加依赖+逐点替换 | 大：引 Tailwind、迁 365 行 CSS、10 组件重写 class | 大 | 大 | 大 | 大 |
| 长期生态 | 上升期（shadcn 新默认） | 当前主流 | 存量巨大 | 稳定 | 存量巨大 | 年轻 |

淘汰理由摘要：

- **antd 6**：组件最全、中文文档最好，但它的价值在 Table/Form/DatePicker 这类复合件——nervd 用不上；代价是 recognizable 的 antd 视觉 + CSS-in-JS 运行时 + 与石墨/琥珀工业风冲突。
- **MUI**：Material 审美与"工业控制台"方向相反。
- **Mantine / HeroUI**：能力足够但没有决定性优势，且都要放弃或重做现有主题。

## 4. 建议路线

### 方案 A（现在就做，推荐）：Base UI 原语 + 现有 CSS

```bash
pnpm add @base-ui/react
```

逐点替换，视觉零回归，token 直接复用 `--bg-* / --ink-* / --sig-* / --accent`：

| 现状 | 替换为 |
|---|---|
| `WriteOpButton` 的 `title` 硬提示 | Base UI `Tooltip`（含延迟/浮层/可达性） |
| 触发流水线等写操作无确认 | `Dialog`（写操作门控的二次确认） |
| `SettingsView` / `WorkitemDetail` 原生 `<select>` | `Select`（仓库多、组织多时可搜索） |
| 单条 `ToastHost` | Toast 队列 + 进出场动画 |
| 后续若需右键/更多操作 | `Menu` / `Popover` |

工作量：每项半小时级，可渐进合入，不动 `theme.css` 架构。

### 方案 B（触发条件到达时再启动）：shadcn/ui + Tailwind v4

触发信号：需要 Command Palette（⌘K）、DataTable、复杂校验表单、亮/暗双主题。

- 组件源码复制进仓库，天然契合"定制设计"（改的就是自己的代码）；
- Tailwind v4 的 `@theme` 可直接引用现有 CSS 变量完成迁移；
- 底层已是 Base UI，与方案 A 同源，**A→B 平滑，无沉没成本**；
- 代价：引入 Tailwind 工具链、preflight 重置、10 个组件的 class 迁移（约 1–2 天）。

### 何时重新评估 antd/Mantine

若 nervd 未来转向"标准管理后台"形态（大型可筛选表格、日期区间、多步向导为主），复合组件的价值会反超定制视觉——届时再评估，当前不构成理由。

## 5. 信息来源

- [shadcn/ui · July 2026 — Base UI as the Default](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default)（ego-browser 实读）
- npm registry / api.npmjs.org 实测版本与周下载（2026-09-28）
- [Ant Design 6.0发布公告](https://github.com/ant-design/ant-design/issues/55804) · [v5→v6 迁移](https://ant.design/docs/react/migration-v6)
- [HeroUI v3 发布说明](https://heroui.com/en/docs/react/releases/v3-0-0)
