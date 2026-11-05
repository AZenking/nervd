---
version: 2
name: nervd Design
description: HeroUI v3 官方主题契约（视觉实现基线）+ nervd 覆盖层 + nervd 布局形态与组件分工规范。
upstream_contract: https://heroui.com/react/DESIGN.md
contract_collected: 2026-11-05
modes:
  - light
  - dark
source_of_truth: src/styles/theme.css
---

# nervd 设计规范

> **文档组成**
> - **第一部分**：HeroUI v3 官方「视觉实现契约」逐字收录（2026-11-05 自 https://heroui.com/react/DESIGN.md 收录，仅标题层级下调一级，内容未改动）。
> - **第二部分**：nervd 覆盖层 —— 在上游契约之上的品牌与产品约定，`src/styles/theme.css` 为唯一事实源。
> - **第三部分**：nervd 布局与形态规范（页面骨架、组件分工、截断与全文提示）。
>
> **冲突裁决顺序**：已安装 `@heroui` 版本的 theme CSS → `src/styles/theme.css`（nervd 覆盖）→ 本文档文字描述。
>
> 原 alpha「Linear Analysis」规范已于 2026-11-05 全量移除，由本契约体系取代。

---

# 第一部分 · HeroUI v3 视觉实现契约（上游逐字收录）

> 上游元数据：`name: HeroUI Default Theme` · `library: @heroui/react` · `styles: @heroui/styles` · `modes: light / dark` · `source: https://github.com/heroui-inc/heroui/blob/v3/packages/styles/themes/default/variables.css`

## HeroUI Default Theme

Use this file as the visual implementation contract when building a product with HeroUI v3. It describes the default HeroUI theme for designers and coding agents. The theme CSS remains the source of truth.

### Setup

Install `@heroui/react` and import HeroUI after Tailwind CSS:

```css
@import "tailwindcss";
@import "@heroui/styles";
```

Apply the semantic canvas colors at the application root:

```tsx
<body className="bg-background text-foreground">{children}</body>
```

Use `class="light"` or `data-theme="light"` for light mode and `class="dark"` or `data-theme="dark"` for dark mode. The `default` theme is the light theme.

### Design Direction

- Build calm, modern interfaces with a clear content hierarchy.
- Prefer whitespace, typography, and surface levels over decoration.
- Use one strong accent for primary actions and reserve status colors for meaning.
- Compose interfaces from HeroUI components before creating custom primitives.
- Keep interactions accessible, keyboard friendly, and visibly focused.
- Let semantic tokens adapt the interface between light and dark modes.

### Colors

Use semantic HeroUI tokens and Tailwind utilities in product code. Raw values are included for design handoff and visual QA only. Do not branch component code by color mode.

| Role | Tailwind utilities | CSS variables | Light | Dark | Purpose |
| --- | --- | --- | --- | --- | --- |
| Canvas | `bg-background text-foreground` | `--background`, `--foreground` | `oklch(0.9702 0 0)`, `oklch(0.2103 0.0059 285.89)` | `oklch(12% 0.005 285.823)`, `oklch(0.9911 0 0)` | Page background and primary content |
| Surface | `bg-surface text-surface-foreground` | `--surface`, `--surface-foreground` | white, foreground | `oklch(0.2103 0.0059 285.89)`, foreground | Cards and non-floating containers |
| Secondary surface | `bg-surface-secondary` | `--surface-secondary` | `oklch(0.9524 0.0013 286.37)` | `oklch(0.257 0.0037 286.14)` | Nested or lower-emphasis regions |
| Tertiary surface | `bg-surface-tertiary` | `--surface-tertiary` | `oklch(0.9373 0.0013 286.37)` | `oklch(0.2721 0.0024 247.91)` | Stronger surface separation |
| Overlay | `bg-overlay text-overlay-foreground` | `--overlay`, `--overlay-foreground` | white, foreground | `oklch(0.2103 0.0059 285.89)`, foreground | Popovers, menus, dialogs, and tooltips |
| Backdrop | `bg-backdrop` | `--backdrop` | black at 50% | black at 60% | Content dimming behind overlays |
| Muted content | `text-muted` | `--muted` | `oklch(0.5517 0.0138 285.94)` | `oklch(70.5% 0.015 286.067)` | Supporting text and secondary icons |
| Neutral action | `bg-default text-default-foreground` | `--default`, `--default-foreground` | `oklch(94% 0.001 286.375)`, eclipse | `oklch(27.4% 0.006 286.033)`, snow | Neutral controls and selected states |
| Accent | `bg-accent text-accent-foreground` | `--accent`, `--accent-foreground` | `oklch(0.6204 0.195 253.83)`, snow | same as light | Primary actions, focus, and emphasis |
| Success | `bg-success text-success-foreground` | `--success`, `--success-foreground` | `oklch(0.7329 0.1935 150.81)`, eclipse | same as light | Positive outcomes and completed states |
| Warning | `bg-warning text-warning-foreground` | `--warning`, `--warning-foreground` | `oklch(0.7819 0.1585 72.33)`, eclipse | `oklch(0.8203 0.1388 76.34)`, eclipse | Caution and attention |
| Danger | `bg-danger text-danger-foreground` | `--danger`, `--danger-foreground` | `oklch(0.6532 0.2328 25.74)`, snow | `oklch(0.594 0.1967 24.63)`, snow | Errors and destructive actions |
| Field | `bg-field text-field-foreground` | `--field-background`, `--field-foreground` | white, eclipse | eclipse, foreground | Inputs and interactive fields |
| Border | `border-border` | `--border` | `oklch(90% 0.004 286.32)` | `oklch(28% 0.006 286.033)` | Component boundaries |
| Separator | `border-separator` | `--separator` | `oklch(92% 0.004 286.32)` | `oklch(25% 0.006 286.033)` | Quiet structural dividers |

Hover, focus, soft, inverse, and secondary or tertiary border colors are derived with `color-mix()`. Use utilities such as `bg-accent-hover`, `bg-accent-soft`, `text-accent-soft-foreground`, `border-border-secondary`, and `border-separator-secondary` instead of recreating those formulas.

### Typography

HeroUI inherits the application's font family and uses Tailwind's type scale. Preserve the component defaults unless the product has its own type system.

- Use concise, descriptive headings in sentence case.
- Use `text-foreground` for primary content and `text-muted` for supporting content.
- Keep body copy readable with a comfortable line height and constrained line length.
- Use tabular numbers for changing metrics, prices, counters, and aligned numeric data.
- Avoid all-caps labels except for short, established conventions.

### Layout

The spacing base is `--spacing: 0.25rem`, giving the system a 4px rhythm through Tailwind spacing utilities.

- Use consistent Tailwind gaps and padding rather than one-off values.
- Keep related controls and content visually grouped.
- Constrain wide reading layouts and size containers to their content.
- Avoid doubling parent and child padding in the same direction.
- Align sibling cards, controls, labels, and metrics to shared visual anchors.

### Shapes

The base radius is `--radius: 0.5rem` (8px). The default field radius is `--field-radius: calc(var(--radius) * 1.5)` (12px).

| Utility | Formula | Default value |
| --- | --- | --- |
| `rounded-xs` | `calc(var(--radius) * 0.25)` | 2px |
| `rounded-sm` | `calc(var(--radius) * 0.5)` | 4px |
| `rounded-md` | `calc(var(--radius) * 0.75)` | 6px |
| `rounded-lg` | `calc(var(--radius) * 1)` | 8px |
| `rounded-xl` | `calc(var(--radius) * 1.5)` | 12px |
| `rounded-2xl` | `calc(var(--radius) * 2)` | 16px |
| `rounded-3xl` | `calc(var(--radius) * 3)` | 24px |
| `rounded-4xl` | `calc(var(--radius) * 4)` | 32px |

Use the scale consistently. Inner media and nested surfaces should have a visibly related, usually smaller, radius than their parent.

### Elevation and Depth

- Use `shadow-surface` for cards and raised page content.
- Use `shadow-overlay` for floating layers such as dialogs, menus, and popovers.
- Use `shadow-field` for form controls when the component applies it.
- Dark mode intentionally removes surface and field shadows and gives overlays a subtle inset edge.
- Do not stack custom shadows on HeroUI components that already provide elevation.

### Components

- **Buttons:** Use semantic variants. `primary` is the main action, `secondary` is an alternative, `tertiary` is dismissive or low emphasis, `outline` is a bordered low-emphasis action, `ghost` is an unbordered low-emphasis action, `danger` is destructive, and `danger-soft` is a quieter destructive action. Prefer one primary action per context and reach for an existing variant instead of restyling a button.
- **Cards and surfaces:** Use `Card`, `Surface`, and semantic surface utilities. Create hierarchy with surface levels and spacing before adding borders.
- **Forms:** Use HeroUI field components so background, foreground, placeholder, border, focus, radius, validation, and disabled states stay consistent.
- **Status:** Use success, warning, and danger only for their semantic meanings. Pair color with text or an accessible label.
- **Overlays:** Use HeroUI `Modal`, `Popover`, `Dropdown`, and `Tooltip` components so focus management, dismissal, and keyboard behavior remain accessible.
- **Compound components:** Compose exported parts instead of replacing component behavior with custom divs. Preserve labels, roles, and keyboard interactions.

### Interaction

- Use HeroUI and React Aria states, including `data-hovered`, `data-pressed`, `data-focus-visible`, `data-disabled`, and `data-invalid`.
- Every interactive element needs a visible focus indicator. The default focus color is the accent, with a 2px ring offset.
- The default disabled opacity is `0.5`; disabled controls use a not-allowed cursor.
- Use motion to clarify state changes, not as decoration. Respect reduced-motion preferences.
- Keep icon-only and touch controls large enough to target and give them accessible labels.

### Do

- Use HeroUI components and their documented variants before writing custom primitives.
- Use semantic tokens as implementation handles and raw values only for reference or migration.
- Use the same token in light and dark modes and let CSS resolve the current value.
- Establish hierarchy with content order, spacing, type, and surface level.
- Reserve accent for meaningful emphasis and keep status colors semantic.
- Use separators sparingly; prefer spacing for ordinary grouping.
- Keep active, selected, loading, invalid, and disabled states visible and accessible.

### Don't

- Don't hardcode colors, shadows, radii, or spacing when a HeroUI token or Tailwind utility exists.
- Don't use raw neutral palette classes such as `gray-*` where a semantic surface or content token applies.
- Don't use color alone to communicate state or hierarchy.
- Don't mix unrelated radius, padding, or elevation systems in one view.
- Don't make static content look interactive with hover or pressed effects.
- Don't overuse cards, borders, badges, icons, accent color, or nested heavy surfaces.
- Don't bypass HeroUI interaction behavior with inaccessible custom markup.

### Source of Truth

- Default theme variables: https://github.com/heroui-inc/heroui/blob/v3/packages/styles/themes/default/variables.css
- Tailwind token mappings: https://github.com/heroui-inc/heroui/blob/v3/packages/styles/themes/shared/theme.css
- Component documentation: https://heroui.com/docs/react/components
- Colors: https://heroui.com/docs/react/getting-started/colors
- Theming: https://heroui.com/docs/react/getting-started/theming
- Design principles: https://heroui.com/docs/react/getting-started/design-principles

When this file and the current package disagree, follow the installed HeroUI version and its theme CSS.

---

# 第二部分 · nervd 覆盖层（theme.css 为唯一事实源）

> 本节是 nervd 在上游契约之上的**产品级覆盖**。未在本节出现的 token 一律沿用第一部分上游默认值；本节数值改动必须先改 `src/styles/theme.css`，再回填本表。

## 2.1 色彩覆盖（Linear Violet 体系）

HeroUI 默认 accent 为蓝色；nervd 将整套强调色覆盖为 **Linear Violet**，并补充 Linear 灰阶与状态信号。**代码按语义 token 消费，禁止按明暗分支写死色值；原始值仅供设计核对。**

| 语义 | Tailwind / CSS 变量 | 浅色 | 深色 | 用途 |
| --- | --- | --- | --- | --- |
| 品牌强调（accent = primary） | `--primary` / `--accent` | `#5e6ad2`（两主题一致） | 同浅色 | 主操作、行内链接、焦点环、选中指示 |
| 按压强调 | `--primary-active` | `#4a56c0` | 同浅色 | 主按钮按压态 |
| 画布 | `--canvas` / `--background` | `#ffffff` | `#121215` | 主工作台画布 |
| 桌面底 | `--canvas-soft` | `#f7f8f8` | `#0b0b0e` | 次级背景、空态、页脚带 |
| 浮层/卡片面 | `--surface` / `--card` / `--popover` | `#ffffff` | `#18181c` | 卡片、面板、弹层 |
| 侧栏面 | `--sidebar` | `#ffffff` | `#121215` | 导航侧栏（2026-11 校正：旧文档误记 `#f7f8f8` / `#0b0b0e`） |
| 细线 | `--hairline` / `--border` / `--line` | `#e8e9eb` | `rgba(255,255,255,0.08)` | 1px 结构线；`--line-strong` / `--input` 为加强变体 |
| 墨色主 | `--ink` / `--foreground` | `#26282d` | `#f7f8f8` | 标题、正文、数值 |
| 墨层次 | `--ink-secondary` / `--ink-muted` / `--ink-faint` | `#6b7075` / `#8a8f98` / `#b7bcc2` | `#8a8f98` / `#62666d` / `#44474e` | 次级文案 / 标签 / 占位 |
| 状态·进行中 | `--sig-run`（= warning） | `#d9730d` | 同浅色 | 运行中、排队、构建中 |
| 状态·成功 | `--sig-ok`（= success） | `#30a46c` | 同浅色 | 成功、已完成、已合入 |
| 状态·失败 | `--sig-fail`（= danger / destructive） | `#e5484d` | 同浅色 | 失败、阻塞、缺陷 |
| 状态·空闲 | `--sig-idle` | `#8a8f98` | 同浅色 | 待办、未开始（取 ink-muted 保证非文本 3:1 对比） |

补充约定：

- **贴纸色**（`--sticker-*`：sky / purple / pink / orange / teal / green / brown / brand-indigo）**只做装饰与状态点**，状态文字一律用墨色（对比度优先）；sig-idle 已按此规范取 `ink-muted`。
- **身份色** `--avatar-*`（indigo / sky / emerald / amber / rose / purple / teal，7 hue 明暗双档）：仅用于 `UserAvatar` 首字母身份区分，**不作状态语义**；文字主色对底 ≥4.5:1，底色/描边由 color-mix 从主色派生（`bg-(--avatar-*)/15` · `border-(--avatar-*)/30`）。
- 状态语义闭环由 `StatusIcon` 原语统一渲染，排序遵从生命周期：**运行中（Amber）→ 失败（Red）→ 空闲（Slate）→ 成功（Emerald）**（`STATUS_TONE_ORDER`）。
- 文本选区：`--accent-dim`（紫 10% / 20% 透明度）。

## 2.2 圆角刻度（覆盖上游 calc 公式）

nervd 在 `@theme inline` 中以**固定值**覆盖 HeroUI 的 `calc(var(--radius) * n)` 公式，实际渲染以下表为准：

| Token | 值 | 说明 |
| --- | --- | --- |
| `--radius`（基准） | `0.625rem` = 10px | Linear 控件基准 |
| `rounded-xs` / `rounded-sm` | 4px | 内联小徽标、极小组件 |
| `rounded-md` | 6px | 输入框、菜单项、列表行、按钮紧凑档 |
| `rounded-lg` | 8px | 卡片、面板、弹窗、统计/内容容器 |
| `rounded-xl` | 12px | 大容器、侧栏行、品牌图标框 |
| `rounded-2xl` ~ `rounded-4xl` | 16 / 24 / 32px | 预留档位 |

## 2.3 排版与密度

- **正文基准 14px / 1.55**（`body` 全局）——产品是桌面高密度工作台。
- **页面标题统一 h1 规格**：26px / 700 / −0.625px / 1.23（theme.css 全局 `h1`，含设置/详情页大标题）。
- 区块标题：h2 15px semibold（`SectionHeader`）/ h3 13px medium；eyebrow 标签 12px / 600。
- 字体栈：`--font-sans` = Inter（含 PingFang SC / Microsoft YaHei 回退）；`--font-mono` = SF Mono 系（标识符、分支名、SHA、运行号、`kbd`、统计数字，一律 `font-mono tabular-nums`）；`--font-log` = 日志/终端专用等宽族。
- 12px 档与上游契约一致：正文活动集中在 12–15px，标题靠字重（600/700）表达层级，不用颜色和装饰。

## 2.4 明暗模式与切换

- **默认跟随系统**（`prefers-color-scheme`）；无系统偏好时**回退深色**（客户端基准视觉）。
- 通过 `data-theme` / `.dark` 类切换（与上游约定一致）；侧栏底部一键切换。
- 切换动效：View Transitions **圆形遮罩扩散**（antfu.me 风格，亮↔暗互为遮罩层）。
- 全局尊重 `prefers-reduced-motion`：所有动画/过渡降级至 0.01ms。

## 2.5 状态动效 token

| Token | 用途 |
| --- | --- |
| `--animate-sig-pulse` | RUNNING 状态点呼吸灯（Amber 光环扩散） |
| `--animate-detail-enter` | 需求详情分栏自右侧满幅滑入（280ms） |
| `--animate-content-fade` | 详情切项内容浅淡入 + 微浮（180ms，j/k 连续切项） |
| `--animate-step-check` | 首启向导步骤节点对勾弹入（200ms） |

## 2.6 阴影与已知偏差

- 浮层阴影唯一档位：`--shadow-level-2`（三层近透明合成，`barely-there`）——弹层、菜单、命令面板、Toast 专用；页内卡片一律 hairline 无阴影。全仓 `shadow-level-*` 用法已收敛至该档位（2026-11-05 修复原 level-1/level-3 未定义用法）。
- 裸调色板类已于 2026-11-05 **全仓清零**。两处历史保留项的最终处置：
  - avatar 首字母身份色 → 新增 `--avatar-*` 身份调色板（7 hue，明暗双档文字主色，底/框由 color-mix 派生，见 2.1 补充约定）承载。
  - 缺陷严重度「一般」→ 采用 informational 蓝 `--sticker-sky`（贴纸色的"状态点/装饰"设计槽位），四档梯度：致命 danger → 严重 warning → 一般 sky → 轻微 success；如需换档位语义只改该一个 class。

## 2.7 维护规则

1. **theme.css 是唯一事实源**：token 变更先改代码，再回填 2.1–2.5 表格。
2. 上游契约（第一部分）更新时重新收录并在 front matter `contract_collected` 注明日期；冲突时以已安装 `@heroui` 版本为准。
3. 新增界面严禁硬编码色值 / 阴影 / 圆角，一律走语义 token 与既有工具类。

---

# 第三部分 · nervd 布局与形态规范

> 一句话原则：**"区块"用 SectionHeader、"属性"用 Descriptions、列表用 Table、总览指标用既有 overview 聚合组件——各管一摊，不互相客串。**
> 视觉 token（色彩 / 字体 / 圆角 / 阴影）以上方第一部分（HeroUI 契约）与第二部分（nervd 覆盖层）为准；本节只管**布局形态与组件分工**。

## A. 三层参照体系

| 层 | 参照 | 落地件 |
|---|---|---|
| 信息架构 | **Linear 式工作台**：页头贴左全宽 + 正文居中限宽（max-w-5xl）+ 常驻侧栏（浅白深墨双主题，见 2.1 色彩覆盖表）、hover 属性行、键盘优先 | `PageHeader` / `app-sidebar` / `Collapsible` 区块 |
| 详情组件 | **antd Descriptions 模式**：items 声明式、响应式列数、label 列对齐、copyable/editable 值插槽 | `src/components/ui/descriptions.tsx` |
| 视觉 token | **HeroUI v3 契约**（第一部分）+ **nervd 覆盖层**（第二部分，theme.css 为唯一事实源） | `Button / Table / Drawer / Tooltip` 等基础件 |

## B. 形态分工（决策表）

新页面 / 新详情**先查本表再选形态**，评审对照本表：

| 信息性质 | 形态 | 组件 | 现有示例 |
|---|---|---|---|
| 总览聚合指标 | 既有 overview 聚合组件（周期横幅 / 健康分布 / 交付状态 / 进行中构建条） | `overview/cycle-header-banner` · `health-distribution` · `delivery-status` · `active-builds-bar` | OverviewView（原 `ui/stat` Stat/StatBand 已于 2026-11 退役删除，勿再引用） |
| 区块内概要、构建详情 | `Descriptions` card | `ui/descriptions` | 迭代概要、CI 构建详情 |
| 对象属性（标题下方元信息） | `Descriptions` plain | `ui/descriptions` | 需求属性区、子任务/缺陷详情抽屉 |
| 抽屉 / 弹窗内完整详情 | `Descriptions` plain（与页面属性区同语言） | `ui/descriptions` | 子任务详情抽屉 |
| 卡片内元信息行（紧凑场景） | 内联 meta 行，可选挂 `CopyButton` | `ui/copy-button` | PipelineCard 运行行 |
| 区块标题 | 统一 `SectionHeader`（h2 15px / h3 13px） | `section-header` | **禁止再内联复刻**（OverviewView 的 SectionHead 已清理） |
| 列表 / 表格 | `Table` + `TableEmptyRow` | `ui/table` | 最近运行、涉及仓库、关联仓库 |
| 表单 | `Field` + `FieldLabel` + `Input/Select` | `ui/field` | 设置页、Jenkins 构建弹窗 |
| 弹窗 / 抽屉容器 | `Dialog` / `Drawer`（详情抽屉 36rem、CI 详情 40rem） | `ui/dialog` / `ui/drawer` | — |

### 字号与字体体系

- 区块标题：15px semibold（`SectionHeader` h2）/ 13px medium（h3）
- 属性 label：`text-xs text-muted-foreground`（12px/500）；值：`text-sm text-foreground`
- 编号 / 分支 / 运行号等标识符：`font-mono`
- 概要数字：`font-mono tabular-nums`

## C. Descriptions 使用要点

- `items` 声明式配置；`column` 支持响应式断点对象（如 `{ xs: 1, sm: 2, lg: 4 }`），类名为**字面量静态映射**，禁止运行时拼接（Tailwind v4 扫描器约束）
- `copyable`：值有拷贝价值时才开（编号 / 分支 / 环境 / 流水线名 / 运行号）；占位值（"未记录"、"未绑定"）自动隐藏拷贝位
- `editable`：Enter 保存 / Esc 取消；保存失败的提示由调用方处理
- 变体按上表场景选，不按个人喜好；`bordered`（antd 经典单列分栏）预留，暂无调用点

## D. 视觉参照（Pinterest 实例链接）

搜集于 2026-10（按 Linear 气质基准重编，已剔除 Notion 参照簇）。**目检为准**（基于 pin 元数据筛选）：

### D.1 气质基准（整体参照）

- **Linear 官方**（品类气质基准：信息密集但克制、键盘优先）：<https://www.pinterest.com/pin/21532904465456323/>

### D.2 统计带组件化（Tremor 思路）

- Tremor（统计带 / 图表组件化思路，overview 聚合组件的形态来源）：<https://www.pinterest.com/pin/245798092157509142/>

### D.3 token 层参照（Tailwind 后台模板）

- TailAdmin 开源模板：<https://www.pinterest.com/pin/167759154866881659/>
- Techwind 浅色极简后台：<https://www.pinterest.com/pin/360710251422516287/>

### D.4 页面形态参照（任务 / 迭代管理面板）

- Task Management Dashboard：<https://www.pinterest.com/pin/890164682619712814/>
- Squadly 任务管理 UI Kit：<https://www.pinterest.com/pin/1041246376334529583/>

## E. 维护规则

1. 新增详情 / 概要 / 区块前先查 B 节决策表；不确定形态时优先与既有同类页面对齐
2. 总览/概要指标复用 `overview/` 既有聚合组件形态（`cycle-header-banner`、`health-distribution`、`delivery-status`、`active-builds-bar` 等），不再重建统计卡片（原 `ui/stat` Stat/StatBand 已退役删除）；区块标题不允许内联复刻 `SectionHeader`
3. key-value 展示一律走 `Descriptions`，不再新增 `InfoItem` / `PropertyRow` 类一次性组件（两者已退役）
4. 拷贝位统一用 `ui/copy-button`，反馈为图标切换，不弹全局 toast
5. **禁用暖纸色系（Notion 遗留，如 `#f6f5f4` 类），新增界面一律冷灰 + Linear Violet 体系**
6. 参照链接失效或需要补充时更新 D 节，注明搜集日期
7. 上游 HeroUI 契约更新时重新收录第一部分并注明日期（见 2.7）

## F. 页面布局规范（统一页头 / 可拖动分栏 / 窄窗口适配）

> 布局原则参照 Apple HIG（macOS 适配、渐进式收窄、可预期恢复）；以下尺寸为 nervd 产品约定，HIG 不规定具体数值。
> 落地件：`page-header.tsx`（统一页头）、`ui/resizable.tsx`（分隔线）、`store/layout.ts`（布局偏好）、`Shell.tsx`（容器自适应编排）。

### F.1 统一页头（PageHeader）

所有页面（总览 / 最近查看 / 迭代 / 需求详情 / 集成分支 / 定时任务 / 设置）统一排列：

```
主行：navigation（侧栏入口/返回/面包屑）｜ title（可截断）｜ scope（当前范围，可截断）｜ 弹性空隙 ｜ actions（主要操作）+ secondaryActions
次行：toolbar（筛选与分类控件）
```

- **降级顺序**：空间不足时先截断标题与范围名称（`min-w-0` + `truncate`），再把次要操作收入「更多」菜单（页头根 `@container`，阈值 `@[520px]`），主要操作永不收纳。
- **吸顶**：`sticky` prop 输出 `STICKY_PAGE_HEADER_CLASS`，筛选/分类随页头固定，正文独立滚动；嵌入详情用 `density="compact"`（紧凑间距，顶部留白仍 ≥28px 避让红绿灯）。
- **窗口拖拽**：页头空白区 `data-tauri-drag-region`，交互控件 `data-no-drag`（见 `use-window-drag.ts`）。
- 设置页首次配置全屏页（无侧栏自定义 titlebar）为唯一例外，不接入 SidebarTrigger。

### F.2 可拖动分栏

| 区域 | 默认宽度 | 宽度限制 | 持久化 |
|---|---:|---:|---|
| 导航侧栏 | 256px | 200–300px | `nervd-layout` |

- 分隔线（`PaneSeparator`）：1px 可见线（`bg-border`）+ 8px 透明命中区；`role="separator"` + `aria-valuenow/min/max`，可访问名称含尺寸范围（当前仅用于导航侧栏）。
- 键盘：方向键 ±8px（Shift ×4）、Home/End 到上下限、双击恢复默认；聚焦时隔离页面单键快捷键（j/k 让路），⌘ 组合键放行。
- 拖动结束 150ms debounce 持久化；**窗口收窄只做展示期钳制，绝不写回已保存偏好**。
- 拖动不重载数据、不改变选择 / 光标 / 导航状态；列表与详情独立滚动。
- 工作项列表已取消独立分栏：列表常驻全宽渲染，详情检视统一经右侧 Peek 抽屉（`WorkitemPeekDrawer`，宽 `min(58rem, 92vw)`）就地滑出，列表现场（滚动/筛选/分页/多选/光标）不卸载。

### F.3 窄窗口适配（阈值均为产品约定）

| 条件 | 行为 |
|---|---|
| 应用容器 < **1180px** | 侧栏自动收为图标栏；页头 / 侧栏入口可**临时展开**（会话态，不写偏好） |
| 工作区（扣除侧栏）≥ **760px** | 全宽列表 + Peek 抽屉详情（列表现场保留） |
| 工作区 < **760px** | 页头 compact 密度；详情仍走 Peek 抽屉（抽屉占满可用宽度），无需「返回列表」 |
| 浏览器 < **768px** | 沿用移动侧栏抽屉（Sheet） |
| macOS 桌面 | 窗口最小 **800×640**，默认 1360×860 |

- 自动收放（容器宽度驱动）与用户主动开合（`sidebar_state` cookie）**分别管理**；放大窗口后自动恢复用户偏好。
- 布局切换不增加导航历史，不清空筛选、分页、多选、详情及滚动位置；列表滚动经 onScroll 即时保存、重挂载后一次性恢复。
- 普通内容换行；分支名、commit SHA、日志仅在自身区域横向滚动（truncate / `overflow-x-auto`），任何形态不得出现整页横向溢出。

## G. 截断文本与全文提示

- **关键短文本实际截断时才显示全文 Tooltip**：工作项、迭代、仓库、流水线、Job 等对象名称，以及分支、路径、环境、选择器当前值和候选项，统一复用 `OverflowTooltip`。未截断时不重复提示。
- **技术值保留精确信息**：提示中展示完整原值，已有复制入口继续保留；不把内容中的手工省略号当成 CSS 溢出检测依据。
- **长正文提供展开或详情入口**：描述、评论、发布说明和长摘要不作为大段 Tooltip 展示；错误原因和安全说明优先换行或可展开，不能只靠悬停读全。
- **辅助信息按需处理**：固定标签、装饰文案、附近已经完整展示的重复内容无需统一添加 Tooltip。已有语义提示应合并全文信息，避免嵌套提示及原生 `title` 重复弹出。
- **键盘复用已有焦点**：按钮、链接、列表行及选择项的全文提示跟随原有焦点；程序聚焦的列表行和采用 `aria-activedescendant` 的候选项也应支持。不给每段静态文字增加 Tab 停靠点，不生成嵌套交互元素；Esc 先关闭提示，保留焦点和下层页面状态。
- **响应式检测**：同时支持单行横向溢出与多行纵向裁切，容器大小和文本变化后重新判断；多行模式不能被默认单行 `truncate` 覆盖。
