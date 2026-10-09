# nervd

以**云效需求**为维度的一站式 CI/CD 桌面工作台（macOS）。

## 它解决什么

云效的 Projex（需求）、Codeup（代码）、Flow（流水线）三块数据割裂，回答"这个需求走到哪了"
要在三个页面间反复横跳。nervd 以工作项为中心，把 分支 → commit → MR → 流水线运行
的追溯链路放在一屏里，并支持就地触发流水线、看日志、收通知、回写状态。

## 技术栈

- **Tauri 2**（Rust 后端）+ **React 19 + TypeScript** + zustand
- UI：**shadcn/ui（Base UI 底层）+ Tailwind CSS v4**，v0 基准中性主题 + inset 侧栏信息架构
- 云效 OpenAPI（ROA REST，`devops.cn-hangzhou.aliyuncs.com`）直连，个人访问令牌（PAT）鉴权
- 凭证存 macOS Keychain；写操作按 `allowWriteOps` 门控（只读令牌可安全使用）

## 快速开始

```bash
pnpm install
pnpm tauri dev      # 开发
pnpm tauri build    # 产出 .app / .dmg
```

首次启动在设置页填入：

1. **个人访问令牌**：云效网页 → 个人设置 → 个人访问令牌 → 生成（形如 `agp_...`）
2. **组织 ID**：`devops.aliyun.com/organization/<这串就是>`
3. 默认项目空间、关联正则、要追溯的仓库

## 架构

```
src/types.ts          冻结共享类型（IPC 契约的 TS 侧）
src/lib/              invoke 包装 + 需求↔代码 关联匹配
src/store/            zustand 全局状态（app 业务 / layout 布局 / ui 视图）
src/components/       新 UI（nervd-new-ui v0 基准）：
  nav/                inset 侧栏（主导航 / 迭代分组 / 用户区）
  iteration/          迭代视图 / 工作项详情 / 环境与策略
src-tauri/src/
  yunxiao.rs          云效 ROA REST 客户端（PAT 鉴权）
  commands.rs         22 个 Tauri 命令（写操作门控）
  credentials.rs      Keychain PAT + settings.json
  poller.rs           流水线轮询 → 事件 + 系统通知
docs/yunxiao-api.md   云效 API 离线参考（提取自 aliyun CLI 元数据）
docs/ipc-contract.md  IPC 契约（并发构建的分区依据）
```

## UI 基准与占位说明

主界面按 `nervd-new-ui.zip`（v0 生成）重构：inset 侧栏 + 迭代视图 + 需求详情 +
环境与策略。其中 **迭代壳、分支来源关系、缺陷关联与子工作项的端内新增为占位**
（云效暂无对应 IPC）；**子任务展示为真实数据**（`GetWorkitemRelations
relationType=SUB`，点击子项可跳详情）。其余（工作项、追溯、CI 状态、
Jenkins 实例与绑定、建分支/MR/回写状态、日志）均为真实功能。

浏览器内免 Tauri 预览（静态 mock 数据）：

```bash
pnpm preview:dev      # http://localhost:1423
```

## 关联规则

需求与代码的关联采用 **ID 规则**：分支名 / commit message / MR 标题中包含工作项编号
（默认 `(?:REQ|BUG|TASK)[-_]?(\d+)`，可在设置中改）即视为关联。

## 安全说明

- PAT 仅存本机 Keychain，不落盘明文、不进任何遥测
- 默认只读：`allowWriteOps=false` 时所有写操作按钮置灰，API 侧同样拒绝（双重门控）
