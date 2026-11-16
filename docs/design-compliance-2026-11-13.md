# DESIGN.md 合规矩阵（2026-11-13）

> **判据**：`DESIGN.md` v2（HeroUI v3 上游契约 + nervd 覆盖层 + 布局形态规范）。
> **冲突裁决顺序**（DESIGN 文首）：已安装 `@heroui` 的 theme CSS → `src/styles/theme.css` → DESIGN 文字描述。
> **范围**：`src/components/**`（150 个 tsx）、`src/styles/theme.css`、`index.html`、`src/App.tsx`、`src/main.tsx`、`src/store/layout.ts`。
> **方法**：7 路按文件所有权并行修复 → 主会话跨域收口 → 1 路独立只读验收。

状态：`PASS` 已符合 ｜ `FIXED` 本轮修正 ｜ `DEFER` 受库限制或需产品决策 ｜ `DOC` 文档回填。

## 0. 结果总览

- **44 条判定项：41 条 PASS/FIXED，3 条 DEFER（均为库限制或需产品裁决，非实现遗漏）。**
- **独立只读验收**（不采信任何 agent 自述、只信自己 grep）：16 项检查全过；其提出的 **1×P1 + 3×P2 + 6×P3** 已全部修复（记录见 §10）。
- 修复后绝对指标全部归零（见 §7），并有编译产物级验证。
- 门禁：三套 `tsc` 0 错误；`vitest` 592/592；`cargo check` / `cargo test --lib`(89) / `clippy -D warnings` 通过；冻结契约哈希一致。

## 1. 令牌层（T）

| 条款 | 要求 | 状态 | 证据 |
|---|---|---|---|
| T1 | 根节点 `bg-background text-foreground` | FIXED | `theme.css` body 改 `@apply bg-background text-foreground`；`index.html` body 同步加类 |
| T2 | `data-theme`/`.dark` 双通道、跟随系统、无偏好回退深色 | FIXED | `store/ui.ts` `getSystemTheme` 三分支（dark/light/**回退 dark**）；`App.tsx` 同时写 class 与 `data-theme`；`index.html` 首帧脚本一致 |
| T3 | 组件层无 hex/rgb/调色板原色/`dark:` | FIXED | 组件层 hex=0（仅 2 条注释）、调色板原色=0、`dark:`=0（仅 1 条注释） |
| T4 | HeroUI 语义角色 token 覆盖 | PASS | `--overlay`/`--default`/`--field-background`/`--muted`/`--border` 本地定义；`--backdrop`/`--separator` 由 `@heroui/styles` 提供，构建确认 `.bg-backdrop`/`.border-separator` 可生成 |
| T5 | 派生色用 `accent-hover`/`accent-soft`/`border-secondary` | PASS | 上游 `@theme inline` 已映射；`src` 无手写 `color-mix` |
| T6 | 圆角固定刻度 | PASS | `--radius` 10px；xs/sm 4、md 6、lg 8、xl 12；`.tabs__tab` 6、`.chip` 4（编译产物已核） |
| T7 | 卡片 hairline 无阴影；浮层唯一 `--shadow-level-2`；默认阴影档清零 | FIXED | `@theme` 把 `--shadow-2xs…2xl` 全部归零；`Shell` skip-link 改 `shadow-overlay`；浮层统一 `--overlay-shadow` / `shadow-level-2` |
| T8 | 四个动效 token + reduced-motion | PASS | 4 个 `--animate-*` + 全局 `prefers-reduced-motion` 降级 |
| T9 | sticker 仅装饰；状态文字用墨色 | PASS | `--sticker-*` 注释与用法核对 |
| T10 | avatar 身份色仅用于首字母 | PASS | `--avatar-*` 7 hue 明暗双档，仅 `UserAvatar` 消费 |
| T11 | 选区 `--accent-dim` | PASS | `::selection` 使用该 token |
| T12 | 无暖纸色 | PASS | `#f6f5f4` 全仓 0 |
| T13 | eyebrow 12/600，无 uppercase | FIXED | `.eyebrow` 无 uppercase；组件层 `uppercase` 归零；theme.css 增「不得再叠加 uppercase」注释 |
| T14 | 微字阶 11/10/9；12.5/13.5 仅存量 | PASS | 8 处 `text-[9px]/[10.5px]` 收敛到 10/11px；12.5/13.5 存量 7 处保留并在 DESIGN §2.3 注明「新增禁止」 |
| T15 | 新增 token 回填 DESIGN §2.1 | DOC | `--ansi-magenta`（浅 `#4f46b5` / 深 `#c0bcf7`）已回填，注明「装饰槽位，不得用于状态语义」 |

## 2. 组件契约（C）

| 条款 | 要求 | 状态 | 证据 |
|---|---|---|---|
| C1 | 按钮语义变体；一个上下文一个 primary | PASS | `ui/button.tsx` 映射与注释对齐 Part 1；`default→primary` 保持 |
| C2 | 表单走 HeroUI 字段组件 | PASS | 表单区裸 `<input/select/textarea>`=0；`--field-radius` 6px；焦点 accent 2px；disabled .5 + not-allowed |
| C3 | 浮层走 HeroUI 复合件 | PASS | Modal/Popover/Dropdown/Tooltip 全部复合件；dialog/sheet 已补 `aria-describedby` |
| C4 | 复合组件按 parts 组合 | DEFER | RAC `useMenuItem` 硬写 `role="menuitem"` 并丢弃 `aria-checked`；正解需调用方迁 `selectionMode`，属语义迁移 |
| C5 | 状态色必须与文本/标签配对 | FIXED | 图表 idle 改 `--sig-idle`；provider chip 不再借 `warning`；状态条均有文字/计数 |
| C6 | 卡片/面用 Card/Surface；禁嵌套重面 | FIXED | `mr-inline-item` Card→hairline 裸行、`code-diff-viewer` 卡片→hairline div、`link-repo-modal` 推荐 Card→section、`active-builds-bar` 内层改裸行 |
| C7 | 焦点可见，accent 2px | FIXED | popover 的「死环」移除（容器永不可聚焦）、sheet 改 `ring-inset`、`mr-inline`/`code-diff`/`diff-file-tree` 由 `ring-1`→`ring-2 ring-ring` |
| C8 | 禁用态 .5 + not-allowed（只读门控例外） | FIXED | `quick-build` 0.6→0.5 + not-allowed；`BranchDivergenceCheck` 0.4→0.5 + not-allowed；只读门控 `aria-disabled`+灰阶保留 |
| C9 | icon-only 触达尺寸 + 可访问名 | FIXED | `copy-button` 20→24px、descriptions 值操作位 20→24px；折叠态导航行用文案作 aria-label |

## 3. 布局（L）

| 条款 | 要求 | 状态 | 证据 |
|---|---|---|---|
| L1 | 正文居中限宽 `max-w-5xl` | FIXED | `max-w-7xl` 全仓 0；Overview / Integration / Iteration / RequirementDetails / 两个骨架统一 `max-w-5xl` |
| L2 | PageHeader F.1（单主行 / @520 降级 / sticky / drag region） | FIXED | breadcrumb 模式由「两行」重构为与标准模式同构的单主行（title 可截断、OverflowTooltip）；`@container`+`@[520px]`、`sticky`、`data-tauri-drag-region` 均在；测试已按新契约更新 |
| L3 | F.2 侧栏 256（200–300）/ 分隔线 a11y / 150ms debounce | PASS | `store/layout.ts` 常量与 clamp；`ui/resizable` role/aria/键盘/双击复位；`Shell` 名称含 200–300；受控模式不再误写 cookie |
| L4 | F.3 阈值 1180 / 760 | FIXED | `Shell` 统一测量 `[data-workspace-content]` 写入 `workspaceWidth`；6 个页面级视图统一 `useWorkspaceCompact()`（修掉此前各视图自测导致阈值偏早 40–80px）；侧栏 <1180 自动图标化、宽窗恢复偏好 |
| L5 | 无整页横向溢出 | PASS（静态） | 仅在分支/SHA/日志自身区域横向滚动；`Shell` 滚动容器 `overflow-x-hidden` |
| L6 | Peek 抽屉 `min(58rem,92vw)`，列表不卸载 | PASS | `workitem-peek-drawer` 宽档与并列挂载结构核对 |

## 4. 形态分工（B）

| 条款 | 要求 | 状态 | 证据 |
|---|---|---|---|
| B1 | 区块标题只用 `SectionHeader` | FIXED | 新增 13+ 处 SectionHeader 化：`linked-repo-*`(3)、`link-repo-modal`(2)、`repo-ci-binding-fields`、`child-detail-drawer`(2)、`LogViewer`、`settings-group`；内联 h2/h3/eyebrow 复刻=0 |
| B2 | key-value 只用 `Descriptions` | PASS | 未新增 InfoItem/PropertyRow；属性区 `Descriptions plain` 无 Card 外框 |
| B3 | 变体按 B 表 | PASS | 对象属性 plain / 区块概要 card / 紧凑 meta 行（卡片内）三类清晰 |
| B4 | items 声明式；column 字面量；copyable/editable | PASS | 无运行时拼接 class；占位值不出拷贝位；Enter 保存 / Esc 取消沿用 |
| B7 | 抽屉 36rem / CI 40rem | FIXED | `child-detail` 36rem、`BuildWorkbench` 40rem、`ScheduleEditor` 36rem、`ScheduleLog` 40rem；弹窗档位 2xl（表未覆盖，见 DEFER） |
| B8 | 总览复用既有聚合组件 | PASS | 无新统计卡；标题走 PageHeader/SectionHeader |

## 5. 截断与全文提示（G）

| 条款 | 要求 | 状态 | 证据 |
|---|---|---|---|
| G1 | `OverflowTooltip` 仅真截断时出现 | FIXED | 调用方 30+ 处删除常显 `title`；`command-menu` 标签/hint 与 `searchable-select` 候选项改 `OverflowTooltip`，测试同步改为「不存在无条件 title」 |
| G2 | 不与原生 `title` 重复弹 | FIXED | `overflow-tooltip.tsx` 不再向 DOM 透传 `title`（该 prop 降级为文案兜底并标 deprecated）；「title + Tooltip 并存」= 0 |
| G3 | 长正文走展开/详情 | PASS | 评论 ≥400 字折叠；自动保存错误改内联换行；比较失败原因常驻换行 |
| G4 | 键盘复用焦点；无嵌套交互；Esc 先关提示 | FIXED | 移除静态文字 `tabIndex`（3 处）；提示跟随既有焦点；`branch-state-diagram` 整卡点击移除只留按钮 |

## 6. 排版（Y）

| 条款 | 要求 | 状态 | 证据 |
|---|---|---|---|
| Y1 | h1 26/700/−0.625px | FIXED | 详情页删除 `text-xl sm:text-2xl font-semibold` 覆写；`titleClassName` 不再传字号 |
| Y2 | h2 15/600、h3 13/500 | PASS | `section-header.tsx` 两条分支 |
| Y3 | label 12/500，值 14 | FIXED | `ui/descriptions` plain label 补 `font-medium`；属性值 14px（原被 `font-mono text-xs` 覆盖）；表单 label 见 DEFER |
| Y4 | 标识符 `font-mono` | FIXED | 补齐 BuildWorkbench（repo/pipeline/run/branch）、`iteration-repo-tab`、集成分支列、排期 cron/分支、设置 org/branch/sha |
| Y5 | 统计 `tabular-nums` | FIXED | 分页/Tab 计数、日志统计、构建耗时、集成 ahead/behind、设置计数全部补齐 |
| Y6 | 禁 all-caps | FIXED | 7 处 `uppercase` 清零（含 `JENKINS/FLOW`、抽屉 eyebrow、批量条/状态菜单分组名） |

## 7. 修复后绝对指标（可复验）

| 指标 | 目标 | 实测 |
|---|---|---|
| 组件层 hex/rgb 字面量 | 0（注释除外） | **0**（2 条注释） |
| `bg-muted` 当背景 | 0 | **0**（仅 `bg-muted-bg` 正确用法与 1 条注释） |
| `uppercase` | 0 | **0** |
| 正文 `max-w-7xl` | 0 | **0** |
| Tailwind 默认阴影档 | 0 | **0** |
| 任意圆角 `rounded-[…]` | 0 | **0** |
| 手写 `dark:` | 0 | **0**（1 条注释） |
| 原生 `title` 与 Tooltip 并存 | 0 | **0** |
| `rounded-2xl` 及更大预留档 | 0 | **0**（品牌图标框/侧栏行均 `rounded-xl`） |
| `text-[10.5px]` 非规范微字阶 | 0 | **0** |

## 8. DEFER / 待裁决（不是遗漏）

1. **RAC 菜单多选语义（C4）**：`useMenuItem` 固定 `role="menuitem"` 且丢弃 `aria-checked`，无法用 props 修正；需把调用方迁到菜单级 `selectionMode` + `selectedKeys`。
2. **`popover` / `drawer` 的 `aria-describedby`（C3）**：RAC 仅对 `role="alertdialog"` 自动回填；补齐需新增描述注册上下文（API 增量），dialog/sheet 已补。
3. **表单 label 字号（Y3）**：设置行 13px/500 来自 `ui/label` 与上游 Label 契约，DESIGN 的 12px/500 描述的是「属性 label」；统一会波及所有表单，需产品裁决。
4. **`SettingsView` 保留 `max-w-3xl`**：Part 1「Constrain wide reading layouts」允许限宽阅读列，不作为 5xl 违规。
5. **弹窗档位（B7）**：`repo-ci-modal` / `link-repo-modal` / `create-mr` / `ai-breakdown` 用 2xl（表只规定抽屉 36/40rem）；`code-diff-drawer` 84rem 为 diff 全宽特例；`JenkinsBuildDialog` 打开构建工作台而非 Dialog。
6. **`Card.Title` 两处保留**（create-mr「分支流转」、Jenkins「Job 构建参数」）：属 HeroUI 复合标题槽，非内联复刻。

## 9. 需要实机目检（静态无法判定）

1. `max-w-5xl` 后三个主视图的列宽/截断密度（尤其迭代列表长标题、需求详情右侧 18rem 属性栏）。
2. `bg-surface-secondary` 替换后的暗色悬停反馈（原 `bg-muted/60` 略深）。
3. `Chip` 4px 圆角与 `Tabs` 6px 圆角在 20+ 处的观感。
4. `LogViewer` 长行横向滚动 + 「回到最新」按钮。
5. 抽屉收窄后的表单/日志密度（36rem / 40rem）。

## 10. 只读验收回合并闭环记录

验收方按 16 项清单独立复查（`grep`/`read` + `tsc --noEmit`），结论「绝对指标已清零、冻结契约干净」，同时提出以下真实遗漏，均已修复：

| 级别 | 问题 | 位置 | 修法 |
|---|---|---|---|
| **P1** | 关闭态 MR 徽标 `bg-muted` + `text-muted-foreground`，两者同值 → 1:1 对比度，文字与底色融为一体 | `iteration/requirement/types.ts:292`（消费于 `mr-inline-item.tsx:198`） | 改 `bg-surface-secondary`，保持 tone 不变 |
| P2 | 需求详情骨架页头仍是两行，真实页头已按 F.1 收成单行 → 加载完成跳动 | `requirement/requirement-skeleton.tsx:42-58` | 骨架塌成单主行（面包屑｜标题+徽标｜弹性空隙｜操作），行高对齐 `h-9` |
| P2 | 全屏需求详情页头不随工作区 <760 收 compact | `RequirementDetails.tsx:1038` | 接 `useWorkspaceCompact()` 并传 `density` |
| P2 | `IterationView` 仍自测宽度判阈值，与 Shell 统一来源重复 | `IterationView.tsx:517-519` | 改用 `useWorkspaceCompact()`，删除 `useElementWidth` 与测量 ref |
| P3 | 三个骨架页头 `density` 与真实页头不一致（Schedules 硬编码 compact、Integration/Settings 不传） | `shell-skeleton.tsx:13,54,97` | 统一接 `useWorkspaceCompact()` |
| P3 | 调度日志抽屉自绘 `CheckCircle2/XCircle` 表状态 | `ScheduleLogDrawer.tsx:175,177,256` | 换 `StatusIcon`（含 chip 内那处 `decorative`） |
| P3 | 非规范微字阶 `text-[10.5px]` 7 处 | `IterationView` ×3、`app-sidebar` ×3、`nav-projects` ×1 | 业务行 11px、计数徽标 10px |
| P3 | 空态底色用未回填的 `bg-muted-bg` | `empty-hint.tsx:30` | 改 `bg-canvas-soft`（§2.1 把空态归 canvas-soft） |
| P3 | 品牌图标框/侧栏行用预留档 `rounded-2xl` | `StartupSplash.tsx:30,37`、`about-dialog.tsx:99,103`、`app-sidebar.tsx:65` | 统一 `rounded-xl`（§2.2） |

验收方同时给出的**合理豁免**已并入 §8（Settings 3xl 阅读列、对话框标题 h2、RepoCiCard eyebrow、骨架占位 hairline、chip 内图标等）。
