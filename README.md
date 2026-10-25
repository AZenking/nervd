<div align="center">

<img src="./public/nervd-logo.png" alt="nervd logo" width="96" height="96" style="border-radius: 20px; box-shadow: 0 8px 24px rgba(0,0,0,0.12);" />

# nervd

**以云效需求为核心维度的一站式 CI/CD 桌面工作台（macOS / Windows 原生）**

[![CI Status](https://github.com/AZenking/nervd/actions/workflows/ci.yml/badge.svg)](https://github.com/AZenking/nervd/actions/workflows/ci.yml)
[![GitHub Pages](https://img.shields.io/badge/Demo-GitHub%20Pages-5e6ad2?logo=github)](https://azenking.github.io/nervd/)
[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows-5e6ad2?logo=apple)](https://github.com/AZenking/nervd/releases)
[![Tauri 2](https://img.shields.io/badge/Tauri-2.0-24C8D8?logo=tauri&logoColor=white)](https://tauri.app)
[![React 19](https://img.shields.io/badge/React-19.1-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

<p align="center">
  <a href="https://azenking.github.io/nervd/">在线交互演示 (GitHub Pages)</a> •
  <a href="#核心特性">核心特性</a> •
  <a href="#版本分支策略与主线构建推进">分支与主线推进</a> •
  <a href="#全键盘交互指南-keyboard-first">键盘操作</a> •
  <a href="#快速上手">快速上手</a> •
  <a href="#系统配置指南">配置指南</a> •
  <a href="#技术架构">技术架构</a>
</p>

</div>

---

## 它解决什么

在企业级敏捷研发中，阿里云效的 **Projex（需求项）**、**Codeup（代码仓库）**、**Flow（流水线）** 三大核心模块数据长期割裂：
- 排查“某个需求当前代码合入到了哪里、构建通过没有、阻塞在哪个环节”，需要在浏览器多标签页之间**反复横跳**。
- 流水线构建运行时间长，缺少及时的原生系统通知，容易打断开发专注度。
- 研发人员需要频繁在云效页面与本地终端之间切换复制分支名、构建号与 Commit SHA。

**nervd** 将**工作项（需求/缺陷/任务）**作为第一公民，把 **需求 → 分支 → Commit → MR → 流水线（云效 Flow / Jenkins）** 全生命周期的追溯链路收敛聚合在单屏中，并支持就地触发、看日志、系统通知与双向状态回写。

```
[ 需求 (Projex) ] ──> [ 分支 (Branch) ] ──> [ 提交 (Commit) ] ──> [ 合并请求 (MR) ] ──> [ 流水线 (Flow) ]
         │                                                                                  │
         └────────────────────────── nervd 单屏极速聚合与联动 ──────────────────────────────┘
```

---

## 在线体验 (Live Demo)

无需下载安装，直接在浏览器中访问基于 [React Bits](https://reactbits.dev/) 动效组件打造的产品介绍页面与全功能在线 Mock 演示：

**[立即访问 nervd 在线工作台 (https://azenking.github.io/nervd/)](https://azenking.github.io/nervd/)**

- **产品介绍落地页**：体验基于 Canvas 粒子网络、金属扫光与解密动效呈现的设计全景。
- **全功能模拟工作台**：点击“开启在线工作台”，随时体验 Master-Detail 双栏联动、全键盘快捷键、分支拓扑图谱与状态原地流转。

---

## 核心特性

### 1. 迭代工作台 (Iteration View)
- **状态生命周期语义分组**：列表严格遵循 `运行中 (Amber) → 失败 (Red) → 空闲/待办 (Slate) → 成功/已完成 (Emerald)` 生命周期排序，组头支持一键折叠与数量统计徽标。
- **全宽无边框裸行 (Border-less Raw Rows)**：告别厚重卡片套叠，左缩进细线清晰体现层级归属。
- **固定 30 条硬分页 (Pagination)**：杜绝长列表无限滚动导致的 DOM 节点膨胀与内存卡顿；支持 `[` / `]` 快捷键换页，前台智能补拉（Backfilling）。
- **行首原地流转 (In-place Popover)**：点击工作项行首状态图标直接弹出流转菜单，就地切换状态，无需进入详情页。
- **浮动批量操作条 (Floating Batch Bar)**：按 `x` 键或悬停勾选，底部平滑滑出批量操作条，支持一键批量流转状态或按 `Esc` 批量取消。

### 2. 需求详情工作台 (Master-Detail Continuous Inspection)
- **极速联动检视心智**：按 `Enter` 展开右侧详情分栏；在分栏开启状态下，使用 `j`/`k` 上下移动光标，右侧详情**毫秒级联动刷新**，无需频繁开合面板。
- **子任务行内极速新建**：子任务/缺陷卡片底部直接提供行内创建输入框，输入标题按回车即时创建。
- **子任务就地钻取与逐层退回**：分栏内点击子任务直接就地钻取为子任务详情，顶部显示“返回父需求”面包屑；按 `Esc` 逐层安全退回。
- **关联仓库卡片 (`LinkedRepoCard`)**：匹配分支规则模板、展示关联 MR 审查状态与 CI 构建状态。
- **可视化分支状态图谱 (`BranchStateDiagram`)**：以需求为根，直观展现基准分支、迭代分支与开发分支的分叉点与领先 (Ahead) / 落后 (Behind) 提交数。

### 3. 集成分支视图 (Integration Branches View)
- **纯查看、零写操作**的高级代码交付视图：零新增写接口，组合只读命令扫描。
- **通配模式匹配**：实时扫描匹配 `release/*`、`integration/*`、`hotfix/*` 分支。
- **双向提交落差**：实时计算集成分支相对 `master` 基准分支的双向落差。
- **需求编号自动反查**：基于配置的正则表达式自动从分支名提取需求编号，点击直接滑出抽屉（Peek View Drawer）就地展现该需求详情。

### 4. 实时构建日志与系统集成 (LogViewer & Notifications)
- **全高构建日志抽屉**：右侧平滑滑出，随日志输出实时向下自动滚动，不遮挡背景中的仓库配置与流水线触发器。
- **macOS 原生系统通知**：流水线构建完成或失败时，通过 Tauri 原生插件发送系统横幅通知。

### 5. 双重受控安全防护 (Security & Keychain)
- **macOS Keychain 凭证存储**：个人访问令牌（PAT）仅存入本机系统级 Keychain，不落盘明文、不进任何遥测。
- **前端与 Rust IPC 双重门控**：默认只读模式（`allowWriteOps=false`），所有写操作按钮使用 `aria-disabled="true"` 并提供 Tooltip 说明；Tauri 后端统一校验拦截非只读调用。

---

## 版本分支策略与主线构建推进

nervd 倡导**以工作项为锚点、主线快速推进、质量门禁前置**的敏捷工程心智。通过端内全生命周期链路感知，让团队在保持主干高频交付的同时，大幅降低多仓库与多分支协同下的合并冲突与信息割裂。

### 1. 版本与分支策略 (Branching & Version Strategy)

```
基准主线 (master / main)  ●───────●───────────────────●───────●────────► (随时可交付 / Tag Release)
                                 ╲                   ╱ ▲
特性分支 (feature/REQ-*)          ●─────●─────●─────●  │
                                   (开发 / 提交 / MR)  │
                                                       │ 门禁检查通过后快速推进合入
集成分支 (release/* / integration/*)  ─────────────────┴────────────────► (阶段性联调 / 预发多需求集成)
```

| 分支类型 | 命名规范 | 职责定位与生命周期 | nervd 端内协同能力 |
|---|---|---|---|
| **主线基准分支** | `master` / `main` | **单一可信源**。始终保持可构建、随时可发布状态。严禁直接推送，必须经由 MR + CI 门禁合入。 | 实时作为落差基准，计算所有特性分支的领先/落后提交数。 |
| **工作项特性分支** | `feature/<id>-<desc>`<br/>`bugfix/<id>`<br/>`hotfix/<id>` | **需求第一公民**。围绕云效 Projex 需求或缺陷独立创建，开发验证完成后通过 MR 申请合入主线或集成分支。 | 需求卡片内一键新建分支、关联 MR 状态流转与分支可视化图谱。 |
| **迭代集成分支** | `release/*`<br/>`integration/*` | **多需求集成窗口**。用于版本发布窗口期的多需求联合集成测试或预发验证。 | 集成分支视图自动通配扫描、双向落差展示、正则提取需求卡片。 |

#### 语义化版本规范 (Semantic Versioning)
项目遵循 `v<Major>.<Minor>.<Patch>` 语义化版本规范：
- **`Patch` (补丁号，如 `v0.2.8` → `v0.2.9`)**：日常缺陷修复、交互与排印优化、安全与依赖更新。
- **`Minor` (次版本号，如 `v0.2.0`)**：向后兼容的核心功能新增（如集成分支视图、代码变更树形 Diff、Jenkins 构建实时日志追踪等）。
- **`Major` (主版本号，如 `v1.0.0`)**：架构断代重构、IPC 契约重大调整或桌面端核心交互范式升级。
- **自动化发布 (Release Trigger)**：主线合并并通过终验后，打上 `v*` Tag 即自动触发 GitHub Actions 多架构矩阵构建（macOS Apple Silicon/Intel DMG + Windows NSIS/MSI 安装包）并生成附带 SHA-256 校验的 Release。

---

### 2. 主线构建推进 (Mainline Build Progression)

构建推进的核心目标是**消除多分支长期隔离导致的“集成地狱”**，让每一个需求的研发成果通过受控门禁最快进入主线：

```
[ 1. 需求派生 ] ──> [ 2. 分支研发 ] ──> [ 3. 关联 MR & CI ] ──> [ 4. 门禁终验 ] ──> [ 5. 主线合入推进 ] ──> [ 6. 状态回写闭环 ]
  • Projex 需求      • 本地提交        • 云效 Flow / Jenkins      • ./scripts/verify.sh  • Fast-forward / Squash   • 需求状态流转
  • 自动提取前缀       • 实时代码 Diff   • 毫秒级构建日志与通知      • 静态类型 + 契约校验   • 主线自动触发构建         • 研发全链路闭环
```

#### 关键推进机制：
1. **前置本地与分支门禁**：
   - 提交与合入前，本地执行 `./scripts/verify.sh`，强制执行 TypeScript 类型校验、Vitest 单元测试全绿、Rust `cargo check` 及核心契约一致性审查。
   - 特性分支关联的流水线（云效 Flow 或 Jenkins Job）在发起 MR 时自动触发，卡片内实时呈现构建进度与控制台步骤高亮。
2. **可视落差监控与主动 Rebase (`BranchStateDiagram`)**：
   - 随主线高频推进，nervd 详情面板内的分支图谱动态计算当前特性分支相对主线的落后提交数（Behind Commits）。
   - 研发人员可直观感知落差，及时将最新主线变更同步/Rebase 至特性分支，将潜在冲突消灭在合入之前。
3. **主线受控合入与二次确认**：
   - 端内提供就地 MR 评审与合并动作，搭配写操作安全双重拦截与两段式确认，防止意外合入未就绪代码。
4. **实时日志抽屉与原生系统通知**：
   - 主线构建流水线触发后，全高 LogViewer 随输出自动滚动追踪构建进度；构建成功或异常时，桌面端立即弹出系统横幅通知，无需反复切屏刷新。
5. **双向生命周期回写**：
   - 构建成功后，通过端内行首或详情顶部的状态流转 Popover，将 Projex 需求即时推进至“已合入 / 待测试 / 已发布”，彻底打通研发与项目管理的最后一公里。

---

## 全键盘交互指南 (Keyboard-First)

nervd 的交互体验深度对齐 Linear 标准操作心智，确保双手无需离开键盘：

| 快捷键 | 作用说明 | 适用场景 |
|---|---|---|
| `j` / `↓` | 光标移动至下一项（视口自动平滑跟随） | 迭代列表 |
| `k` / `↑` | 光标移动至上一项 | 迭代列表 |
| `Enter` | 展开/查看当前选中项的详情分栏 | 迭代列表 |
| `j` / `k` (分栏打开时) | **实时联动检视**：右侧详情随光标移动即时刷新 | 迭代列表 + 详情分栏 |
| `x` | 切换当前行的多选 Checkbox 状态 | 迭代列表 |
| `[` | 翻到上一页（前台自动补拉数据） | 迭代列表 |
| `]` | 翻到下一页 | 迭代列表 |
| `⌘ K` | 调出全局命令面板（搜索工作项、快速换迭代、全局动作） | 全局 |
| `?` (`Shift + /`) | 调出快捷键速查对话框 | 全局 |
| `Esc` | **五级阶梯式退回**（浮层优先 → 多选清空 → 子任务回退 → 关闭分栏 → 返回上页） | 全局 |
| `g o` | 跳转至 **总览大盘 (Overview)** | 单手前缀跳转 |
| `g i` | 跳转至 **当前迭代 (Iteration)** | 单手前缀跳转 |
| `g b` | 跳转至 **集成分支 (Integration Branches)** | 单手前缀跳转 |
| `g s` | 跳转至 **系统设置 (Settings)** | 单手前缀跳转 |

---

## 快速上手

### 方式一：下载桌面端预编译应用（推荐）
从 [Releases 发布页面](https://github.com/AZenking/nervd/releases) 下载适合您操作系统的最新安装包：

- **macOS**：下载 `.dmg` 安装包，拖拽至 `Applications` 文件夹即可直接运行（支持 Apple Silicon 与 Intel 芯片）。
  > [!TIP]
  > **macOS 安全提示（“已损坏，无法打开” 或 “无法验证开发者”）**：
  > 由于未购买 Apple 商业证书签名公证，首次打开若被 Gatekeeper 拦截，请在终端（Terminal）执行以下命令清除隔离属性：
  > ```bash
  > xattr -cr /Applications/nervd.app
  > ```
  > 执行后即可直接双击正常启动。

- **Windows**：下载 `nervd_*_x64-setup.exe`（NSIS 便携安装程序）或 `.msi` 企业安装包，双击按向导完成安装。

### 方式二：在线免安装体验
直接打开 [nervd 在线工作台](https://azenking.github.io/nervd/)，体验由静态 Mock 驱动的完整工作流。

### 方式三：源码编译与本地开发

**环境依赖**：
- Node.js >= 20，`pnpm` >= 10
- Rust 稳定版 (`rustc` / `cargo`)

```bash
# 1. 克隆代码仓库
git clone https://github.com/AZenking/nervd.git
cd nervd

# 2. 安装前端依赖
pnpm install

# 3. 启动本地浏览器端 Mock 预览（无需 Rust/Tauri 环境）
pnpm preview:dev
# 访问 http://localhost:1423

# 4. 启动原生桌面端开发模式（Tauri 2 + 真实后端 IPC）
pnpm dev:app

# 5. 打包生产环境应用（产出 .app 与 .dmg）
pnpm tauri build
```

---

## 系统配置指南

首次启动 nervd 后，前往 **系统设置 (Settings)** 填入连接凭据：

1. **云效个人访问令牌 (PAT)**：
   - 前往云效网页版 → 右上角个人头像 → **个人设置** → **个人访问令牌** → 新建令牌（权限包含 Projex、Codeup 与 Flow 只读/读写权限）。
   - 令牌形如 `agp_...`。
2. **企业组织 ID**：
   - 浏览器访问 `https://devops.aliyun.com/organization/<此段字符串即为组织ID>`。
3. **关联规则配置**：
   - 默认通过分支名、commit message 或 MR 标题提取工作项编号：
     ```regex
     (?:REQ|BUG|TASK)[-_]?(\d+)
     ```
   - 支持根据团队规范自定义前缀与匹配模板。
4. **安全模式开关**：
   - 默认为只读保护模式（`allowWriteOps=false`）。如需在端内直接新建分支、创建 MR 或触发流水线，请在设置中开启写操作授权。

---

## 技术架构

nervd 采用典型的 Tauri 2 双层架构：前端轻量响应，后端 Rust 负责安全与高速 I/O。

```
nervd/
├── src/                          # 前端核心业务层 (React 19 + TypeScript + Zustand)
│   ├── types.ts                  # 冻结共享类型（IPC 契约的 TS 侧定义）
│   ├── components/               # UI 组件库
│   │   ├── nav/                  # inset 侧栏与主导航
│   │   ├── iteration/            # 迭代视图、详情抽屉、关联仓库卡片
│   │   ├── settings/             # 系统设置与凭据管理
│   │   └── ui/                   # 基于 Base UI 与 Tailwind v4 的通用原子组件
│   ├── store/                    # Zustand 全局状态切片 (app / layout / ui)
│   ├── lib/                      # Tauri IPC 包装、关联匹配与工具函数
│   └── styles/theme.css          # CSS-first 双主题设计系统变量 (Linear Light & Dark)
│
├── src-tauri/                    # Rust IPC Core (Tauri 2 后端)
│   ├── src/
│   │   ├── commands/             # 按业务域拆分的 45 个 Tauri IPC 命令（带写操作门控）
│   │   ├── yunxiao.rs            # 云效 ROA REST 客户端（PAT 鉴权）
│   │   ├── credentials.rs        # macOS Keychain 原生凭证存储
│   │   └── poller.rs             # CI 流水线后台轮询器与系统通知分发
│   └── Cargo.toml
│
├── preview/                      # 静态 Mock 预览与产品落地页 (React Bits 动效)
│   ├── landing/                  # 官方风格 React Bits 动画组件库
│   ├── api-mock.ts               # 浏览器内全量 OpenAPI 模拟数据
│   └── vite.config.mts           # 预览专用 Vite 构建配置 (base: './')
│
└── .github/workflows/            # GitHub 自动化工作流
    ├── ci.yml                    # 静态检查、Vitest 单元测试与 Rust 编译验证
    ├── deploy-pages.yml          # GitHub Pages 自动化打包与发布
    └── release.yml               # macOS 原生安装包多架构打包发布
```

---

## 质量门禁与验证

项目提供严密的本地与 CI 终验机制。提交任何代码前须保证验证脚本全部通过：

```bash
export PATH=/opt/homebrew/bin:$PATH && ./scripts/verify.sh
```

验证覆盖：
1. **TypeScript 类型安全**：`tsc --noEmit` 0 报错。
2. **单元测试套件**：Vitest 全部用例绿色通过。
3. **Rust 命令静态审查**：`cargo check` 0 警告与报错。
4. **核心契约防破坏抽查**：确保 7 大核心契约文件（`src/types.ts`、`package.json`、`vite.config.ts` 等）完好无损。
5. **关键产物存在性校验**：确认核心业务组件完整。

---

## 开源协议

本项目采用 [MIT License](LICENSE) 开源协议。
