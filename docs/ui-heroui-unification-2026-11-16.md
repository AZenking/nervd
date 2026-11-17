# HeroUI v3 规范化统一报告（2026-11-16）

> **目标**：消除「自造组件替代 HeroUI」「在调用点改写 HeroUI 组件样式」「绕过 `src/components/ui/*` 包装层」三类问题，让全站组件来源、密度、圆角、状态语义只有一个事实源。
> **判据**：`DESIGN.md` v2（HeroUI v3 上游契约 + nervd 覆盖层）、`src/styles/theme.css`、`@heroui/react@3.2.7`。
> **方法**：6 路并行只读审计（按目录分工）→ 主会话收口 `ui/*` 与 `theme.css` → 6 路并行整改（文件所有权隔离）→ 全量门禁 + e2e 基线对照。

## 0. 结果总览

| 指标（非测试 ts/tsx） | 整改前 | 整改后 |
|---|---:|---:|
| 原生 `<button>` | 39 | **10**（全部为已论证豁免：行主点击区 / treeitem / 导航行 / 面包屑 render / 命令面板行） |
| 业务层裸表单控件（`input/select/textarea/label`） | 6 | **0** |
| 直接 `import from '@heroui/react'` 的业务文件 | 59（167 符号） | **3**（`command-menu` 的 `Header`、`workitem-filter-menu` 的 `Dropdown` 选中态、`ScheduleLogDrawer` 的 `Disclosure`，均有注释说明） |
| HeroUI 组件上的尺寸/圆角/字号覆盖 | 246 | **68**（剩余为 `text-xs` 层级排版选择与 `font-mono` 标识符，非组件形态覆盖；`h-* / rounded-* / shadow-*` 已清零） |
| 裸调色板类（`gray-*` 等）/ `Button rounded-full` | 0 | 0 |

**门禁**：`./scripts/verify.sh` 9/9 全绿（三套 `tsc` 0 错误、`vitest` **110 文件 / 662 用例**、`cargo check`、`cargo test --lib` 97、clippy 0 告警、冻结契约哈希一致、产物校验）；`vite build` 通过。

**e2e 基线对照**（HEAD `9dc1b93` 干净 worktree vs 当前工作树）：HEAD 23 失败 / 25 通过 → 当前 24 失败 / 24 通过，差异为 `overview-peek` 由失败转通过、`attribution` 新增 2 例失败（该 spec 与「变更 Tab」属开工前既有的 attribution 未提交 WIP，需求详情已重构掉该 Tab，与本次 UI 统一无关）。

## 1. 根因层修复（`theme.css` 为唯一事实源）

此前 246 处调用点覆盖，本质是 theme 层缺口导致的「逐点补偿」。本次在 `src/styles/theme.css` 一次性收口：

| 覆盖项 | 上游默认 | nervd 统一值 | 消除的调用点补偿 |
|---|---|---|---|
| `.card` / `.modal__dialog` / `.popover` 圆角 | `min(32px, --radius-3xl)` = 24px | `--radius-lg` = 8px | 45 处 `Card className="rounded-lg…"` |
| `--surface-shadow` | 浅色双层投影 | `none`（明暗一致） | 27 处 `shadow-none` |
| `--separator` | 与 `--border` 差一档灰 | `var(--border)` | `bg-border` / `bg-separator` 混用 |
| `.menu-item` | `min-h-9` + 24px 圆角 + 14px | 32px + 6px + 13px | `dropdown-menu` 逐项 `h-8 rounded-md px-2 text-[13px]` |
| `.table__*` 密度 | cell 16/12px、14px 字 | 12/8px、12px 字，行 hover/选中语义化 | `px-3 py-2.5 text-xs` 逐格重写（2 个表格文件 21 处） |
| `.input` / `.textarea` / `.label` | 36px / 16px / 14px | 32px / 64px 保底 / 13px | `h-8 text-[13px]`、`min-h-16` |
| `.alert` | 16/12px 内距 + 16px gap + 24px 圆角 | 10/8px + 8px + 8px | 6 处 `rounded-md px-2.5 py-2 shadow-none` |
| `.kbd` | 14px sans | 等宽（§2.3）+ `kbd--xs` 紧凑档 | `font-mono!`、`h-5! px-1.5! text-[11px]!` |
| `.toggle-button-group` | 无容器圆角 | `--radius-md` | 分段控件容器手写圆角 |
| Tabs / Accordion 规则 | — | 移入 `@layer components`，去 `!important` 与裸 `rgba()` | `whitespace-nowrap` / `w-fit` 双写 |

## 2. 组件层补齐（`src/components/ui/*`）

新增薄封装（全部 `Object.assign` 组合 HeroUI parts，零自绘 CSS）：

`table.tsx`（+`TableEmptyRow`）、`alert.tsx`、`surface.tsx`、`pagination.tsx`、`accordion.tsx`、`toolbar.tsx`、`progress-bar.tsx`、`toggle-button.tsx`、`toggle-button-group.tsx`、`radio-group.tsx`、`tag-group.tsx`、`time-field.tsx`。

改造既有包装层：

- `button.tsx`：新增 `size="2xs"`（20px）与 `size="inline"`（贴合行高）两档；圆角交回 theme.css，删除双写。
- `kbd.tsx`：新增 `size="xs"`，等宽由 theme 注入。
- `input / textarea / label / separator / skeleton / spinner / copy-button / avatar / popover / dropdown-menu / empty`：删除强改 HeroUI 的尺寸、圆角、底色、字号；`Spinner` 可访问名改中文；`Empty` 以 `EmptyState` 为基座。
- `dropdown-menu`：补 `selectionMode / selectedKeys / onSelectionChange` 下沉到 Menu。
- `StatusBadge`：导出 `TONE_TO_COLOR` 作为全仓唯一状态色映射。
- 删除死代码/重复实现：`ui/toggle.tsx`、`ui/toggle-group.tsx`、`ui/avatar` 的 `AvatarBadge/Group/GroupCount`、`ui/scroll-area` 的 `ScrollBar`、`nav/nav-group.tsx`、`overview/{active-builds-bar,health-distribution,segmented-progress-bar}`（DESIGN 已同步退役说明）。

## 3. 业务层整改要点（按领域）

- **迭代工作台 / 需求详情**：11 处原生按钮 → `Button`/`CopyButton`/`Collapsible`；状态点 6 处 → `StatusIcon`；自造 MR 徽标 → `Chip`；自造 checkbox → `Checkbox`；自造菜单 → `DropdownMenu`；`IterationView` 的 tone→裸色板函数删除，改用 `Chip color` 语义档。
- **设置 / 定时任务**：孤儿 `<label>` 清零（`SettingsRow` 有 `htmlFor` 才渲染 `Label`）；`ListBox` 承载复合行的 P0 语义冲突解除（行内交互移出 option）；`Pagination`、`Alert`、`EmptyHint`、`CopyButton` 收口；Kbd `!important` 清零。
- **总览 / 集成分支 / 快速构建**：14 处直连组件收口；表格槽位重写清零；6 处 `Card.Title` 重复配方删除；第三套两段式确认 → `WriteOpButton confirm="inline"`；P0 键盘不可见按钮补 `group-focus-within`；3 个死组件删除。
- **壳层 / 导航 / 弹窗**：9 个文件收口；`about-dialog` 自绘进度条 → `ProgressBar`；`LogViewer` 第一个报错按钮 → `variant="danger-soft"`；`nav-group` 死代码删除。
- **构建工作台 / 分支规则**：6 个文件收口；模板列表 `div divide-y` → `Table`；`PreviewLine` → `Descriptions plain`；5 处 `Alert` 当区块标题 → `SectionHeader`；`BranchPatternField` 三段 `role="alert"` → `Field.Error` 并补 `aria-invalid/aria-describedby`；`RepoCiCard` 自造错误条 → `Alert`、`disabled` 吞 Tooltip → `aria-disabled`。

## 4. 已知遗留（有意保留 / 需产品决策）

1. `command-menu` 的手写 combobox（约 200 行）：ARIA 完整、IME 已处理，重写为 `ComboBox` 收益低于回归风险；本轮仅把裸 `<input>` 换成 `ui/input`。
2. `workitem-filter-menu` 的 `Dropdown` 选中态（`selectionMode` + `ItemIndicator`）尚未迁移；`ui/dropdown-menu` 已具备能力，待交互回归后切换。
3. `ScheduleLogDrawer` 的 `Disclosure` 未换 `ui/collapsible`（后者未导出 Trigger/Panel parts）。
4. 10 处原生 `<button>` 为已论证豁免（行主点击区、`role=treeitem`、导航行、面包屑 `render`、命令面板行）：改用 `Button` 会破坏 ARIA 语义，均已确认带 `focus-visible` 环。
5. `ui/sheet.tsx` 仍在（仅移动端侧栏使用）；是否并入 `ui/drawer` 待定。
6. e2e 并非本轮引入：HEAD 已 23 失败（多为 `split-detail` 等已被 Peek 抽屉取代的旧断言），建议单独一轮 e2e 维护。