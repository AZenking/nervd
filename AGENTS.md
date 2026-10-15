# nervd 智能助手开发指引 (AGENTS.md)

本文件为参与 **nervd** 项目开发与维护的 AI 智能体（Agents）提供统一的业务定位、设计基线、交互操作流程、前端规范与质量门禁指引。

---

## 1. 项目定位与核心架构

* **项目名称**：nervd
* **核心定位**：以**云效需求（Projex）**为核心维度的一站式 CI/CD 桌面工作台（macOS 原生，基于 Tauri 2）。
* **解决痛点**：
  传统研发流程中，阿里云效的 **Projex（需求项）**、**Codeup（代码仓库）**、**Flow（流水线）**三块数据严重割裂。排查“某需求当前研发进展”需要多标签页反复横跳。
  nervd 以**工作项**为第一公民，把 **需求 → 分支 → Commit → MR → 流水线（云效 Flow / Jenkins）** 全生命周期的追溯链路聚合在单屏中，并支持就地触发、看日志、回写状态与系统通知。
* **技术栈基线**：
  - **跨平台桌面壳**：Tauri 2 (Rust IPC Core)
  - **前端视图层**：React 19 + TypeScript + Zustand
  - **样式与设计系统**：Tailwind CSS v4 (`@tailwindcss/vite` + CSS-first 主题变量)
  - **无障碍交互原语**：`@base-ui/react` (Headless 交互原语)
  - **图形与图表**：Lucide React + `@xyflow/react`

---

## 2. 核心业务模块与设计逻辑

系统划分为五大核心模块，所有业务逻辑与视图状态均围绕“全链路追溯”与“桌面极速响应”组织：

### 2.1 迭代工作台 (Iteration View)
* **状态分组与列表形态**：
  - 工作项列表按状态语义分类（运行中 → 失败 → 空闲 → 成功）分组展示，支持组头一键折叠/展开与数量统计徽标。
  - 列表采用全宽无边框裸行（Border-less Raw Rows），左缩进配合 1px 细虚线体现层级归属。
* **分页机制 (Pagination)**：
  - 固定每页 30 条，消除长列表无限滚动的内存累积与渲染卡顿。
  - 支持键盘 `[` / `]` 翻页；换页未命中已缓存数据时，由前台自动向云效接口补拉（Backfilling），直到填满页面或取尽远端数据。
* **双栏连续检视 (Master-Detail Split)**：
  - 点击行、按 `Enter` 或右键选择“查看详情”就地在右侧展开需求详情分栏。
  - **联动检视心智**：在分栏打开状态下，用户使用 `j`/`k` 上下移动光标，右侧详情**实时联动刷新**，无需反复开合面板，提供极速连续审查体验。
* **行内原地流转 (In-place Popover)**：
  - 行首 `RowStatusDropdown` 原语：点击工作项行首状态图标直接弹出状态流转菜单，就地切换状态，无需进入详情页。
* **多选与浮动批量操作条 (Floating Batch Bar)**：
  - 悬停行首滑出 Checkbox，或通过快捷键 `x` 切换选中当前行。
  - 选中项大于 0 时，屏幕底部居中滑出浮动批量操作条（Floating Batch Bar），支持一键批量流转状态或按 `Esc` 批量取消。

### 2.2 需求详情工作台 (Requirement Details Workbench)
* **双模态架构 (Dual-Mode Rendering)**：
  - **嵌入模态 (`embedded`)**：作为 Master-Detail 右侧面板或侧边抽屉嵌入，顶部自适应收敛为紧凑元数据条（Compact Metadata Bar，包含状态流转 Popover、处理人、类别、父需求跳转、关联仓库数），正文单列呼吸感布局，释放横向视口。
  - **独立工作台模态 (Full Workbench)**：通过“全屏打开”按钮调起，包含完整面包屑导航、大标题、右侧 Linear 式属性列表（`Descriptions` 裸行）及两栏工作台。
* **子任务与缺陷快速管理 (Inline Fast Create & Drill-down)**：
  - **行内快捷新建**：废弃独立 Modal 弹窗，子任务/缺陷卡片底部直接提供行内创建输入行，输入标题按回车即时创建。
  - **行内原地状态流转**：子任务行首 `InlineStatusDropdown` 支持就地更新子任务工作流状态。
  - **子任务就地钻取与逐层退回**：在 Master-Detail 分栏内点击子任务，右侧平滑切换为子任务详情，顶部显示“返回父需求”面包屑；按 `Esc` 逐层退回父需求。
* **交付链路与分支同步图谱**：
  - 关联云效仓库卡片（`LinkedRepoCard`）：展示分支规则模板匹配、开发分支、已关联 MR 及 CI 运行状态。
  - 可视化分支图谱（`BranchStateDiagram`）：以需求为根，真实展示基准分支、迭代分支与开发分支的分叉与超前/落后状态。
* **Activity 讨论流**：
  - 1:1 对齐 Linear Activity 纵向时间轴，展示云效评论、讨论与历史流转记录。

### 2.3 集成分支视图 (Integration Branches View)
* **定位**：**纯查看、零写操作**的高级代码交付视图。
* **数据链路**：仅组合既有只读命令 `list_branches` 与 `compare_branches`，零新增 Rust 写命令。
* **核心能力**：
  - 实时扫描匹配集成分支通配模式（默认 `release/* integration/* temp/* hotfix/*`，400ms 防抖输入）。
  - 实时计算与基准分支（默认 `master`）的双向落差（领先 Ahead / 落后 Behind 提交数）。
  - 自动正则提取分支名中的需求编号（基于 `linkPattern`），点击需求编号通过侧边抽屉（Linear Peek View Drawer）就地展现该需求详情。

### 2.4 总览仪表盘与侧边抽屉 (Overview & Peek Drawer)
* 聚合展示全局迭代周期、绑定的重点云效仓库 CI 卡片、状态分布条形图与最近更新需求列表。
* **Linear Peek View 抽屉**：点击“最近更新”条目或外部关联项时，不打断总览大盘，通过右侧侧边抽屉（`Drawer`）就地滑出详情，保留底层上下文；抽屉内支持“全屏打开”进入独立工作台。
* **实时构建日志抽屉 (LogViewer)**：
  - 右侧全高大抽屉，随日志生成实时自动向下滚动，不遮挡背景中的仓库配置与构建触发器。

### 2.5 系统设置与凭据安全 (Settings & Security)
* **实时自动保存 (Auto-Save)**：
  - 废弃显式保存栏与手动提交按钮。所有配置项（连接凭据、追溯规则、分支模板、CI 绑定、安全策略）输入后防抖自动保存。
  - 页头右上角常驻 `SettingsAutoSaveStatus` 状态指示（已自动保存、保存中…、未保存、存在错误）。
* **工作区只读徽标与安全说明**：
  - 移除侵入式全宽黄色只读横幅；只读提示以轻量徽标落在侧栏工作区行，点击直达安全设置。
  - 设置中明确两级防护：macOS Keychain 凭据安全存储与 Rust Core 强制双重门控。

---

## 3. UI 参照与设计系统规范 (Deep Linear Alignment)

 nervd 设计唯一权威规范依据为根目录 [`DESIGN.md`](./DESIGN.md)。

### 3.1 双主题色彩系统 (Linear Light & Dark LCH-based)
项目全面支持 **深色模式 (Dark，默认)** 与 **浅色模式 (Light)**，侧栏底部一键切换：

| 语义 Token | 深色模式 (Dark Default) | 浅色模式 (Light) | 用途说明 |
|---|---|---|---|
| `--canvas` / `--background` | `#121215` (冷黑) | `#ffffff` (纯白) | 主工作台画布底色 |
| `--surface` / `--card` | `#18181c` (中黑) | `#ffffff` | 浮层、卡片与弹出面板底色 |
| `--sidebar` | `#0b0b0e` (极黑) | `#f7f8f8` ~ `#f9f9f9` | 左侧边栏底色，靠明度差形成视觉落差 |
| `--hairline` / `--border` | `rgba(255, 255, 255, 0.08)` | `#e8e9eb` | 1px 细线切割，界面结构严禁依赖厚重投影 |
| **动作强调色 (Primary)** | **`#5e6ad2`** | **`#5e6ad2`** | **Linear Violet** 唯一动作色，按压态 `#4a56c0` |
| 状态·成功 (Ok) | Emerald (`#30a46c`) | Emerald (`#30a46c`) | 构建成功、需求已完成、已合入 |
| 状态·失败 (Fail) | Red (`#e5484d`) | Red (`#e5484d`) | 构建失败、阻塞、缺陷未修复 |
| 状态·进行中/排队 (Run) | Amber (`#d9730d`) | Amber (`#d9730d`) | 运行中、等待排队、构建中 |

### 3.2 排印系统与等宽字体 (Typography)
1. **主字体栈**：`Inter`, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif。主要文字活动在紧凑字阶（13~15px），大字号附带负字距（如 24px 配 `-0.25px`）。
2. **等宽字体栈 (`--font-mono`)**：
   - 配置：`ui-monospace, "SF Mono", Menlo, Monaco, Consolas, monospace`。
   - **强制适用范围**：
     - 工作项编号（`REQ-101`、`TASK-202`）
     - 分支名称（`feature/req-101`）
     - Commit SHA 哈希值（`7a3f8b1`）
     - 流水线构建运行号（`#142`）
     - 键盘快捷键标识（`kbd`）
     - 表格统计数字（`tabular-nums font-mono`）

### 3.3 空间、容器与骨架屏规范 (Border-less & Precise Skeletons)
1. **无边框画布 (Border-less Canvas)**：
   - 列表区全宽裸行展现，拒绝外层套多重 Card 框中框。
   - 悬停使用微弱背景变化 `hover:bg-muted/60`，激活态使用 `bg-accent text-accent-foreground`。
2. **圆角梯级**：
   - 按钮/卡片/弹窗：`rounded-md` (8px)
   - 输入框/徽标/小组件：`rounded-sm` (6px)
   - 拒绝大圆角胶囊 Pill 按钮。
3. **精准骨架屏 (Precise Skeletons)**：
   - 加载态严禁用一根大灰条糊弄。必须使用与真实列表行高完全一致的骨架（`WorkitemSkeletonRows` / `RequirementDetailsSkeleton`），模拟真实图标、文本与徽标布局，杜绝加载完成时的界面跳动。

### 3.4 状态语义闭环 (`StatusIcon`)
- 所有状态图标统一由 `StatusIcon` 原语渲染。
- 排序与分组严格遵从生命周期：**运行中 (Amber) → 失败 (Red) → 空闲/待办 (Slate) → 成功/已完成 (Emerald)**。
- 列表行首已展示状态图形时，行尾禁止出现重复文字徽标。

---

## 4. 全键盘交互与操作流程规范 (Keyboard-First Workbench)

nervd 的交互体验严格遵循 Linear 风格的标准操作心智，确保双手无需离开键盘：

```
                    ┌────────────────────────┐
                    │      键盘工作流        │
                    └───────────┬────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
  [ 光标移动与检视 ]      [ 批量操作与流转 ]       [ 单手前缀跳转 ]
  • j / ↓ : 下一项        • x : 选中/取消多选     • g o : 总览
  • k / ↑ : 上一项        • Esc : 取消多选        • g i : 当前迭代
  • Enter : 展开分栏详情  • 底部浮动批量操作条    • g b : 集成分支
  • 分栏下 j/k 实时联动   • 行首 Popover 就地变更 • g s : 系统设置
```

### 4.1 核心键盘快捷键
* **列表移动**：
  - `j` / `↓`：光标移动至下一项，跟随滚动（`block: 'nearest'`）。
  - `k` / `↑`：光标移动至上一项。
  - **连续检视**：分栏打开时，`j`/`k` 移动光标即时触发右侧详情刷新。
* **选择与流转**：
  - `Enter`：打开选中项详情分栏。
  - `x`：切换当前光标所在行的多选 Checkbox 状态。
* **翻页**：
  - `[`：上一页。
  - `]`：下一页。
* **全局命令与速查**：
  - `⌘K`：调出全局命令面板（支持搜索工作项、快速换迭代、触发全局动作）。
  - `?`（`Shift + /`）：调出快捷键速查对话框。

### 4.2 阶梯式 Esc 退回机制 (Hierarchical Dismissal)
按 `Esc` 键时，按照严格的层级优先级依次退回，不得越级跳关：
1. **第一优先级（浮层优先）**：若有右键菜单 / 下拉菜单 / 弹窗打开，`Esc` 仅关闭最顶层浮层。
2. **第二优先级（多选优先）**：若当前有多选条目（`selectedIds.size > 0`），`Esc` 清空全部多选。
3. **第三优先级（钻取优先）**：若在详情分栏中钻取了子工作项，`Esc` 退回父需求详情。
4. **第四优先级（分栏优先）**：若处于 Master-Detail 详情分栏，`Esc` 关闭分栏退回全宽列表。
5. **第五优先级（整页优先）**：若处于独立详情全屏页或系统设置页，`Esc` 或 `⌘←` 返回上一级并恢复前序滚动位置。

### 4.3 单手前缀跳转序列 (G-Sequence Navigation)
支持标准 `g` 系列按键序列（1.5 秒判定窗口，焦点在输入框/浮层时自动让路）：
* `g o`：跳转至 **总览（Overview）**
* `g i`：跳转至 **当前迭代（Iteration）**
* `g b`：跳转至 **集成分支（Integration Branches）**
* `g s`：跳转至 **系统设置（Settings）**

---

## 5. 安全受控写操作规范 (Write Operations Defense)

nervd 面向企业真实云效与仓库，所有写操作必须通过前端组件与后端 IPC 核心双重门控：

### 5.1 只读门控原则 (`WriteOpButton` & `WriteOpGatedTrigger`)
* **严禁使用原生 HTML `disabled`**：
  原生 `disabled` 会吞掉鼠标悬停和焦点事件，导致 Tooltip 无法展示，用户无法得知为何无法点击。
* **必须使用 `aria-disabled="true"` + 灰阶样式**：
  只读状态下应用 `READONLY_BTN_CLASS`，保留 Tooltip 悬停说明；点击时触发 Toast 告警，并提供“前往设置”快捷按钮。

### 5.2 确认交互分层防线
为避免“弹窗套弹窗（Modal Inception）”的糟糕体验，二次确认分为两种场景：
1. **工具栏与独立按钮**：`confirm="dialog"`（默认），弹出 `AlertDialog` 二次确认。
2. **Dialog / 向导内部（如构建参数弹窗内）**：`confirm="inline"`，采用**两段式确认**。第一次点击进入倒计时确认态（4 秒无操作自动复位），第二次点击方才真正提交。

### 5.3 乐观即时更新与失败回滚 (Optimistic Update)
* 修改工作项状态时，必须使用 `useApp.updateWorkitemStatusOptimistic`。
* 前端 UI <50ms 内即刻呈现新状态，后台异步发起云效 API 请求。
* 若接口失败，自动回滚至旧状态并弹出明确的 Toast 报错。

### 5.4 核心层二次强制拦截
即使前端通过 DOM 篡改绕过了按钮门控，Tauri 后端（Rust IPC 命令层）也会统一校验 `allowWriteOps` 配置，非写模式下直接抛出权限异常。

---

## 6. Agent 协作规范与质量门禁

在处理 nervd 项目的任务时，Agent 必须遵循以下工作准则：

### 6.1 推荐 Skills 调用规范

| 任务场景 | 推荐使用 Skill | 说明与职责 |
|---|---|---|
| **前端样式 / UI 组件开发** | **`modern-web-guidance`** | **HTML/CSS/JS 开发前强制执行**。遵循现代 Web 标准、Tailwind v4 语法、Base UI 无障碍原语与 React 19 最佳实践。 |
| **页面交互走查 / UI 验收** | **`ego-browser`** | 配合 `pnpm preview:dev`（运行于 `http://localhost:1423`），免启动 Tauri 进行浏览器视觉核对、多视图走查与截图留痕。 |
| **DOM / 网络 / 运行时排查** | **`chrome-devtools`** | 针对控制台报错、网络请求异常、布局坍塌、计算样式（`getComputedStyle`）进行深度调试。 |
| **无障碍 / 快捷键 / 焦点流** | **`a11y-debugging`** | 校验键盘导航（`j`/`k`、`Tab`、`⌘K`）、`focus-visible` 焦点环、屏幕阅读器标签及对比度（WCAG 2.1 AA）。 |
| **渲染卡顿 / 内存泄漏排查** | **`memory-leak-debugging`** | 当长列表无限滚动、高频 CI 轮询或详情抽屉多次开闭出现卡顿时诊断排查。 |
| **首屏与视图切换优化** | **`debug-optimize-lcp`** | 优化迭代列表大量工作项首屏渲染时间与加载骨架屏过渡。 |

### 6.2 冻结契约保护
以下核心契约文件严禁未经架构决策破坏性修改：
- `src/types.ts`
- `docs/ipc-contract.md`
- `package.json` / `pnpm-lock.yaml`
- `vite.config.ts` / `tsconfig.json`

### 6.3 每次变更必跑验证
由于终端环境中 node/pnpm 可能位于 `/opt/homebrew/bin`，执行验证脚本时须保证 PATH 完整。
提交任何代码前必须执行：
```bash
export PATH=/opt/homebrew/bin:$PATH && ./scripts/verify.sh
# 或全量打包验证：
export PATH=/opt/homebrew/bin:$PATH && ./scripts/verify.sh --full
```
验证通过标准：
1. TypeScript 静态类型检查 0 错误（`tsc --noEmit`）
2. Rust 后端命令检查 0 报错（`cargo check`）
3. 冻结契约未发生非预期变动
4. 核心关键产物完整
