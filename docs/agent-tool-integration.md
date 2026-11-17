# Agent 工具集成调研（开始处理 → Harness / MCP Server）

> 状态：**调研与方案设计**，未落地实现。
> 调研日期：2026-11-17 · 目标版本：nervd 1.2.0 · 对照 Harness：DeepSeek Harness (DSH) `0.2.2-rc.3`（Desktop 版，已实测其 CLI）。

## 0. 结论速览

1. **功能一（开始处理 → Harness 处理）**：现状只做到「写上下文 + 复制一条 `codex` 命令」，没有真正把任务交给 Harness。建议在设置中新增「Agent 工具」分区，把“启动什么、怎么启动、启动成什么形态”做成可配置项，并把「开始处理」升级为三级执行形态：
   - **L1 复制命令**（现状，保留）
   - **L2 打开终端执行**（低成本、人可观察）
   - **L3 后台运行 + 运行面板**（`dsh --profile headless --json` 事件流，结构化、可取消、可续跑）
   - 长期形态：以 **ACP（`dsh --profile acp`）** 作为正式集成协议，替代对 headless 文本/NDJSON 的解析。
2. **功能二（MCP 支持，被 Harness 调用）**：nervd 作为 **MCP Server**，把自身只读/受控写能力沉淀成 `mcp__nervd__*` 工具，供 Harness（DSH 的 `dsh-mcp-client` / `dsh-mcp-manager`）调用。推荐 **本机回环 Streamable HTTP**（`http://127.0.0.1:<port>/mcp` + Bearer Token），并附一份「一键生成 DSH 配置片段」；stdio 包装器作为兼容 Claude Code / Codex 的后续项。
3. 两个功能在架构上互补且可合并为一条主链路：**nervd 启动 Harness 会话时，把自身的 MCP Server 注入该会话**（ACP `session/new` 支持 stdio/HTTP MCP server），Harness 一边处理子任务，一边通过 MCP 回读需求、回写状态、触发流水线。
4. 主要风险不在前端：**进程生命周期、凭据（headless 不读 GUI 保存的密钥）、本机端口暴露面、冻结契约**。建议按 M1（配置 + 命令/终端）→ M2（headless 运行面板）→ M3（MCP 只读 → 写）分三期。

---

## 1. 需求拆解

### 1.1 功能一：子任务「开始处理」时，由对应 Harness 处理问题

用户期望：在子任务上点「开始处理」，不只是把工作项编号写进 `.nervd/active-workitem.json`，而是**把“这个子任务”交给一个可配置的 Agent Harness 去处理**（读需求、改代码、跑验证、按归属规则提交）。

要点：

- “对应的 Harness”意味着**可配置/可多选**（DSH、Codex CLI、Claude Code、自定义命令），而不是写死 `codex`。
- “能够进行问题处理”意味着**要有任务上下文投递机制**：现有 `.nervd/agent-task.md` 已经是一份现成、结构化的任务说明，适合作为 Prompt 载体。
- 必须与现有写门控、归属规则（`agent-commit.sh` / commit-msg 钩子 / `Refs:`）保持一致，不能绕开。

### 1.2 功能二：MCP 支持，用来被 Harness 工具调用

用户期望：nervd 的能力（云效需求、分支、CI、变更归属）以 **MCP 工具**的形式暴露，Harness 在会话中可以直接调用，而不必让模型去猜 API 或抓页面。

要点：

- 方向是 **nervd = MCP Server，Harness = MCP Client**（“被 harness 工具的调用”）。
- 需要工具分级：默认只读；写操作（改状态、建分支、触发构建、写 active-workitem）必须额外开关 + 审计。
- 需要能被 DSH 直接注册：DSH 侧工具名形如 `mcp__nervd__get_workitem`，来源于 `dsh-mcp-client` 的 `serverName`。

### 1.3 边界

- 不做「nervd 内嵌一个 LLM Agent 循环」：AI 能力（拆解/总结/生成）继续走现有 `commands/ai.rs`，与本集成是两条线。
- 不在本期引入远程 MCP / 多用户；仅本机单用户回环。
- 不改 Harness 自身实现；只做「启动 + 投递上下文 + 接收事件 + 提供 MCP」。

---

## 2. 现状盘点（代码证据）

### 2.1 「开始处理」当前链路

| 环节 | 位置 | 行为 |
| --- | --- | --- |
| 入口按钮 | [`start-processing.tsx:52`](../src/components/iteration/start-processing.tsx) | 候选仓库 = 需求关联 ∩ 本地绑定；无交集回退全部绑定；弹出仓库选择 |
| 写上下文 | [`start-processing.tsx:109`](../src/components/iteration/start-processing.tsx) → [`commands/local_repo.rs:235`](../src-tauri/src/commands/local_repo.rs) | `set_active_workitem` 写 `.nervd/active-workitem.json`（写门控 `ensure_write`） |
| 生成脚手架 | [`local_repo.rs:994`](../src-tauri/src/local_repo.rs) | 生成 `.nervd/agent-task.md` + `.nervd/scripts/{agent-commit,read-active-workitem,check-commit-attribution,lib-attribution}.sh` + 局部 `.gitignore` |
| 用户下一步 | toast 文案 | 明确写「可直接交给 Agent」，但**不启动任何进程** |

结论：功能一的「上下文准备」已经完整，「启动 Harness」缺位；`agent-task.md` 正好是 Prompt 的天然载体。

### 2.2 现有 Agent 命令生成（纯前端）

[`agent-launch.ts`](../src/lib/agent-launch.ts)：

- `buildAgentPrompt(ctx)`：拼中文任务提示，含 `--workitem/--req` 提交参数（[:35](../src/lib/agent-launch.ts)）。
- `buildCodexLaunchCommand(repoPath, ctx)`：`cd '<repo>' && codex '<prompt>'`（[:46](../src/lib/agent-launch.ts)）。
- 注释已写明边界：**不启动进程、不读写文件、不调用 IPC，只生成文本交剪贴板**——因为 Tauri 当前无进程启动权限。

[`children-card.tsx:288`](../src/components/iteration/requirement/children-card.tsx)：子任务行「复制 Codex 命令」按钮；`codex` 为硬编码。

结论：功能一需要把「命令模板」抽象成配置（Harness 类型 + 可执行文件 + 参数模板 + 工作目录策略），并新增「执行」能力。

### 2.3 设置页结构

- 分区唯一清单 [`settings/sections.ts:37`](../src/components/settings/sections.ts)（9 个：外观、云效连接、仓库与分支、构建集成、变更追溯、AI 助手、安全与权限、诊断、关于）。
- 分区内容映射 [`SettingsView.tsx:97`](../src/components/SettingsView.tsx)；分区类型 [`store/ui.ts:103`](../src/store/ui.ts)。
- 现有「AI 助手」是 **LLM 推理配置**（provider/baseUrl/model/key/Prompt），不是 Agent 工具集成。
- 可借鉴的持久化先例：`commands/ai.rs` 用独立 `ai_settings.json` + 独立命令组（[`ai.rs:56`](../src-tauri/src/commands/ai.rs)），**不必动 `Settings` 冻结结构**。

### 2.4 后端能力边界

| 能力 | 现状 | 对集成的影响 |
| --- | --- | --- |
| 进程启动 | 仅 Rust 内部 `std::process::Command` 调 `git/jenkins`；前端无 shell 插件 | 需要新增专用命令（不要开放通用 shell） |
| 本地 HTTP 服务 | 无 | MCP Server 需新增（回环） |
| IPC 规模 | 92 个 Tauri 命令 | MCP 工具可直接映射，无需重写业务 |
| 写门控 | `ensure_write`（[`common.rs:27`](../src-tauri/src/commands/common.rs)） | MCP 写工具必须复用同一门控 |
| 凭据 | macOS Keychain（`dev.nervd.app`） | MCP Token 适合放 Keychain |
| 持久化 | SQLite `nervd.db` + 少量 json（`ai_settings.json`） | Agent 配置、运行记录、MCP 审计可落 SQLite |
| 能力声明 | [`capabilities/default.json`](../src-tauri/capabilities/default.json) 仅 core/opener/notification/dialog | 若用 `tauri-plugin-shell` 需加权限；更建议自定义命令 |

### 2.5 缺口表

| # | 缺口 | 影响功能 |
| --- | --- | --- |
| G1 | 无「Harness 工具」配置模型（目前硬编码 `codex`） | 一 |
| G2 | 无进程启动/取消/事件回传 | 一 |
| G3 | 无 Harness 可执行文件探测（`which` / 版本） | 一 |
| G4 | 无本地 MCP Server / 工具 schema / 鉴权 | 二 |
| G5 | 无 MCP 调用审计与写开关 | 二 |
| G6 | 无「把 MCP 地址注入 Harness 会话」的通道 | 一 + 二 |
| G7 | `types.ts` / `docs/ipc-contract.md` 冻结，需走架构决策 | 一 + 二 |

---

## 3. Harness（DSH）侧事实（0.2.2-rc.3，本机实测）

### 3.1 入口模式

| 命令 | 用途 |
| --- | --- |
| `dsh --profile headless "job"` | 一次性任务，答案走 stdout，诊断走 stderr，进程退出 |
| `dsh --profile acp` | ACP（Agent Client Protocol）stdio 服务，供受信程序驱动 |
| `dsh --profile sdk` | JSON-RPC stdio SDK 服务 |
| `dsh web` / Desktop | 交互式 GUI |

本机实测 headless `--help`（`dsh` 未进 PATH，但 Desktop 包自带运行时）：

```sh
ELECTRON_RUN_AS_NODE=1 "/Applications/DSH NEXT.app/Contents/MacOS/DSH NEXT" \
  "/Applications/DSH NEXT.app/Contents/Resources/app.asar/node_modules/@deepseek-ai/dsh/lib/bin.js" \
  --profile headless --help
# → 0.2.2-rc.3；支持 --json / --session-id / --permission-mode / --approval-policy ask|never / --add-dir
```

### 3.2 headless 模式的可用能力（对功能一关键）

- `--json`：stdout 输出 NDJSON 事件流（`session` → `status` / `text` / `thinking` / `tool_call` / `tool_result` → `final`），适合做运行面板。
- `--session-id`：续跑同一持久会话（首轮从 `session` 事件里拿 id）。
- `--permission-mode <preset>` + `--approval-policy ask|never`：无人值守必须显式给策略（`never` 表示拒绝一切需人工审批的调用）。
- `--add-dir`：`workspace-write` 下额外授权目录（例如共享 `.git` 元数据以允许提交/跑钩子）。
- 退出码：完成 0，中止/失败 1；判定成功要同时看退出码 + `final.reason`。
- **凭据边界（重要）**：随附 headless profile **不使用 GUI 保存的凭据**，密钥走「启动环境 → 工作目录 `.env` → `$DSH_HOME/.env`」。这意味着功能一在 DSH 上开箱即用之前，用户需要准备 `DEEPSEEK_API_KEY`（nervd 应在探测阶段明确提示，而不是等运行失败）。

### 3.3 ACP（长期推荐形态）

- 一个 stdio 连接可承载多会话；`session/new`、`session/prompt`、`session/cancel`、`session/update`、`session/request_permission`。
- `session/new` **接受 stdio 或 Streamable HTTP 的 MCP 服务器**并在发布前校验——正好可以让 nervd 把自己的 MCP Server 只注入“nervd 启动的会话”。
- 局限：不含 DSH 专用呈现（计划/todo/终端视图）；`session/load`、fork、附加目录不支持。

### 3.4 MCP 侧（功能二的关键约束）

- `dsh-mcp-client`：单服务器桥；`transport: stdio | streamable-http`；工具暴露为 `mcp__<serverName>__<tool>`；支持 `${credential:REF}` 模板（避免密钥进配置）。
- `dsh-mcp-manager`：全局服务器集合，Settings 可增删改；插件也可 `ctx.mcpManager.register(...)`（跨应用**不适用**于 nervd）。
- 没有 MCP 时也可用「配置型 bundle」（只含 patch，插入一条 `dsh-mcp-client`）交付，`failOnStartupError` 可让配置问题显性化。
- MCP Prompt 模板不支持；资源（resources）由 `dsh-mcp-resources` 统一发现/读取。

### 3.5 对 nervd 的含义

1. 功能一**不必**绑定 DSH：三种工具（DSH / Codex / Claude Code）都以「可执行文件 + 参数模板 + 工作目录」表达即可；DSH 额外支持 `--json` 结构化事件。
2. 功能二若想零配置接入 DSH，最顺的路径是 **Streamable HTTP + 用户设置里生成配置片段**（或配置型 bundle），而不是要求用户手写 YAML。
3. `dsh` 未进 PATH 是常态（Desktop 安装即用），所以**不能假设 `which dsh` 成功**；探测逻辑要覆盖“bundled runtime 路径”。

---

## 4. 功能一方案：开始处理 → Harness

### 4.1 形态选型

| 方案 | 交互 | 成本 | 风险 | 建议 |
| --- | --- | --- | --- | --- |
| A. 复制命令（现状） | 用户自己粘终端 | 0 | 无 | 保留为兜底 |
| B. 打开终端执行 | `open -a Terminal` + 临时脚本 / AppleScript | 低（1 命令） | 脚本注入、终端不可控 | M1 |
| C. 后台 headless 运行 | Rust spawn + NDJSON 解析 + 运行面板 | 中 | 进程/凭据/事件格式 | M2 |
| D. ACP 客户端 | Rust 实现 JSON-RPC 客户端 | 高 | 协议演进 | M4 |

推荐：**B 与 C 并存，按「Harness 工具」的 `runMode` 配置**；D 作为 M2 之后的收敛方向（免去解析 NDJSON、可精确取消/续跑）。

### 4.2 配置数据模型（建议新增 `src/types/agent.ts`，避免动冻结的 `types.ts`）

```ts
export type AgentRunMode = 'copy' | 'terminal' | 'headless';

export interface AgentTool {
  id: string;                 // 'dsh' | 'codex' | 'claude' | 'custom-...'
  label: string;              // 展示名，如 "DeepSeek Harness"
  kind: 'dsh' | 'codex' | 'claude' | 'custom';
  /** 可执行文件；留空表示自动探测（PATH / Desktop bundled runtime） */
  command: string;
  /** 参数模板，支持 {prompt} / {repo} / {taskFile} / {sessionId} 占位符 */
  argsTemplate: string;
  /** 是否用 stdin 投递 prompt（长 prompt 更稳，避免命令行长度/转义问题） */
  promptViaStdin: boolean;
  /** dsh 专用：--permission-mode / --approval-policy 默认值 */
  permissionMode?: string;
  approvalPolicy?: 'ask' | 'never';
  runMode: AgentRunMode;      // 默认 'copy'
  enabled: boolean;
}

export interface AgentSettings {
  defaultToolId: string | null;
  /** 开始处理时：直接执行 / 先确认 / 仅复制 */
  onStartProcessing: 'execute' | 'confirm' | 'copy';
  tools: AgentTool[];
  /** 运行期最大并发/超时（分钟） */
  maxConcurrentRuns: number;
  runTimeoutMinutes: number;
}
```

持久化：`agent_settings.json`（与 `ai_settings.json` 同目录同模式），命令组 `get_agent_settings` / `save_agent_settings`。

Prompt 组装：优先读仓库内 `.nervd/agent-task.md`（已含任务、上下文、推荐命令、归属规则），不足时用前端 `buildAgentPrompt` 的 fallback；并追加一句“如需读取需求原文/回写状态，请使用 MCP 工具 `mcp__nervd__*`”。

### 4.3 运行链路（M2）

```
用户点「开始处理」
  └─ set_active_workitem（现状，写 active-workitem.json + 脚手架）
      └─ 读 agent settings → 选 defaultTool
          ├─ copy     → 生成命令 → 剪贴板（现状 + 模板化）
          ├─ terminal → 生成临时脚本（0700）→ open -a Terminal / iTerm
          └─ headless → invoke('agent_start', { repoId, workitemId, toolId })
                         └─ Rust: spawn(command, args, cwd=repo, env 白名单)
                              ├─ stdout NDJSON → emit('agent://run/{runId}/event')
                              ├─ stderr → 日志（截断、脱敏）
                              └─ 退出 → emit('agent://run/{runId}/exit') + SQLite 落库
```

UI：复用 `LogViewer` 的「右侧大抽屉 + 自动跟随」心智，新增「Agent 运行」抽屉：头部显示工作项/仓库/工具/状态，正文按 `tool_call` / `tool_result` 分组折叠，底部「取消 / 续跑（session-id）/ 复制命令」。

### 4.4 IPC 契约草案（新增，append 到 `docs/ipc-contract.md`）

| 命令 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `agent_detect_tools` | — | `AgentToolProbe[]`（`{id, resolvedPath, version, ok, note}`） | 探测 PATH / Desktop bundled runtime / 自定义路径 |
| `agent_start` | `repoId: i64, workitemId: String, toolId: String` | `{ runId: String }` | 写操作门控；校验工具白名单与仓库绑定 |
| `agent_cancel` | `runId: String` | `bool` | 优先 SIGTERM，超时 SIGKILL |
| `agent_list_runs` | `limit?: i64` | `AgentRun[]` | SQLite 运行历史 |
| `agent_run_events` | `runId: String, afterSeq: i64` | `{ events, nextSeq, done }` | 断线重连补读（事件同时落库） |

事件名：`agent://run/{runId}/event`、`agent://run/{runId}/exit`（Tauri event / Channel）。

### 4.5 安全与工程约束

- **命令白名单**：只允许 `AgentTool` 中登记的可执行文件 + 参数数组（不经 shell 拼接）；`argsTemplate` 渲染后仍以 argv 传递。
- 工作目录必须是**已绑定本地仓库**的根路径（复用 `local_repo` 的 canonicalize + 边界检查）。
- 环境变量清洗：不继承父进程全部 env；只透传 `PATH`、`HOME`、`LANG`，以及用户显式配置的 `DEEPSEEK_API_KEY` 等（如需）。
- 运行与取消都要过写门控（`ensure_write`）：它会产生提交/改文件。
- 进程退出时清理子进程组（`setsid` + 组 kill），应用退出（`RunEvent::ExitRequested`）时统一收尾，避免僵尸。
- headless 凭据检查前置：`agent_detect_tools` 对 DSH 额外检查 `DEEPSEEK_API_KEY` / `$DSH_HOME/.env`，缺失时在设置页给出「需在 `.env` 准备密钥」的明确提示。

---

## 5. 功能二方案：nervd 作为 MCP Server

### 5.1 传输选型

| 方案 | Harness 接入 | 通用性 | 成本 | 建议 |
| --- | --- | --- | --- | --- |
| **Streamable HTTP（本机回环）** | DSH `transport: streamable-http` 直连 | DSH / 任意 HTTP MCP 客户端 | 中（Rust 加 HTTP 服务） | ✅ 首选 |
| stdio 包装器 | `command: nervd-mcp` | 兼容 Claude Code / Codex | 中高（需旁路进程 + 与应用通信） | 后续兼容项 |
| 配置型 DSH bundle | 插件安装即接入 | 仅 DSH | 低（但需随 DSH 版本维护） | 作为便捷分发 |

推荐主路径：**回环 HTTP + Token**。好处：nervd 是常驻应用，端口只在本机；Harness 侧配置可复制；无需为每个 Harness 维护二进制。

### 5.2 架构

```
Harness (DSH) ── mcp__nervd__* ──▶ http://127.0.0.1:48731/mcp  (Bearer Token)
                                        │
                                  nervd Rust 内置 MCP Server
                                        ├─ JSON-RPC: initialize / tools/list / tools/call / resources/*
                                        ├─ 工具实现 → 直接复用现有 92 个 Tauri 命令的业务函数（不经过前端）
                                        ├─ 写门控 ensure_write + MCP 独立写开关
                                        └─ 审计：mcp_audit(ts, tool, args_digest, ok, err) → SQLite
```

- 生命周期：随应用启动（设置开启时），端口占用自动顺延或报错；关闭设置即停监听。
- Token：Keychain `dev.nervd.app / mcp_server_token`；设置页「重新生成」；请求头 `Authorization: Bearer <token>`；校验 `Host`/`Origin`，拒绝非回环来源。
- 超时：`tools/call` 30s（CI 日志类可放宽，或改为资源分页）；并发上限 4。

### 5.3 工具清单（映射现有能力）

只读（默认开启）：

| MCP 工具 | 映射 |
| --- | --- |
| `nervd_list_workitems` | `list_workitems` |
| `nervd_get_workitem` | `get_workitem` |
| `nervd_get_workitem_context` | **新增聚合工具**：详情 + 子任务 + 评论 + 关联仓库 + 本地分支现场（一次调用替代多轮） |
| `nervd_list_children` / `nervd_list_comments` | `list_workitem_children` / `list_workitem_comments` |
| `nervd_get_workflow_statuses` | `get_workitem_workflow_statuses` |
| `nervd_list_repos` / `nervd_list_branches` / `nervd_compare_branches` | 同名命令 |
| `nervd_list_merge_requests` | `list_merge_requests` |
| `nervd_list_pipelines` / `nervd_get_pipeline_run` / `nervd_get_job_logs` | 同名命令 |
| `nervd_get_repo_ci_snapshot` / `nervd_get_ci_logs` | `get_repo_ci_snapshot` / `get_repo_ci_log_chunk` |
| `nervd_get_attribution_status` | `get_attribution_status` |
| `nervd_get_task_context` | 读 `.nervd/agent-task.md` + `active-workitem.json` |

受控写（需 `allowWriteOps` + `mcpAllowWrite`，默认关闭）：

| MCP 工具 | 映射 | 备注 |
| --- | --- | --- |
| `nervd_start_processing` | `set_active_workitem` | 与功能一同源；返回仓库路径 / 提交参数 |
| `nervd_update_workitem_status` | `update_workitem` | |
| `nervd_create_child` | `create_workitem_child` | |
| `nervd_create_comment` | `create_workitem_comment` | |
| `nervd_create_branch` / `nervd_create_merge_request` | 同名命令 | |
| `nervd_trigger_repo_ci` / `nervd_trigger_jenkins_job` | 同名命令 | 二次确认策略：MCP 侧不支持交互确认，需设置项明确告知 |
| `nervd_open_workitem` | 前端 `useUi` 导航 | 让 Harness 把用户“带回”工作台 |

资源（MCP resources）：

- `nervd://workitem/{id}`、`nervd://repo/{id}/ci`、`nervd://pipeline/{id}/run/{runId}`（日志走分页读取，避免超大响应）。

> 命名：DSH 侧实际暴露为 `mcp__nervd__get_workitem` 等；nervd 文档与设置页应展示 **完整前缀**，避免用户误解。

### 5.4 在 Harness 侧注册

三种方式，按用户熟悉度：

1. **设置页生成片段**（默认）：给出一段可直接粘进 DSH Settings → MCP 的条目（`transport: streamable-http, url, headers.Authorization`），以及 `serverName: nervd` 的说明。
2. **配置型 bundle**：提供一个只含 `cordis.patch.yml` 的 `nervd-mcp` bundle（`@deepseek-ai/dsh-mcp-client` + `failOnStartupError: true`），用户 `dsh plugin` 安装。
3. **ACP 注入**（M2+）：nervd 启动 `dsh --profile acp` 时，在 `session/new` 里挂载 nervd 的 MCP Server，做到「只有 nervd 启动的会话才拥有 nervd 工具」。

推荐先做 1，再视使用频率做 2/3。

### 5.5 安全

- 只监听 `127.0.0.1`，端口可配；启动时打印实际端口（并写入设置页状态区）。
- Token 必填且不可为空；校验失败统一 401，避免探测。
- 写工具默认不可用：需 `settings.allowWriteOps && settings.mcpAllowWrite` 双开关，并在审计面板逐条可见。
- 所有调用落审计（工具名、参数摘要、耗时、结果码），参数中的疑似密钥做脱敏。
- 不暴露“任意 HTTP 代理 / 任意 SQL / 任意命令”类工具——只暴露业务动作。

---

## 6. 设置页设计

在 `sections.ts` 新增分区 `agent`（分组「工作区」，排序放在「AI 助手」之后），`SettingsView` 增加 `agent: <AgentSection />`，`store/ui.ts` 的 `SettingsSection` 联合类型加 `'agent'`。

页面结构（复用 `SettingsGroup` / `SettingsRow` / 自动保存草稿）：

1. **集成总开关**：启用 Agent 工具集成；默认 Harness。
2. **Harness 工具**：卡片列表（DSH / Codex / Claude Code / 自定义）——可执行文件、参数模板、`runMode`、探测状态徽标（已找到 / 未安装 / 版本过低）、「测试启动」。
3. **开始处理行为**：`直接执行 / 先确认 / 仅复制`；是否自动打开运行面板；超时与并发。
4. **MCP 服务**：开关、监听地址（只读展示 `127.0.0.1`）、端口、Token（重新生成 / 复制）、工具白名单（只读/写分组）、「生成 DSH 配置片段」、「MCP 审计日志」入口。
5. **安全说明**：写工具需双开关；MCP 仅本机；审计保留时长。

设计约束（DESIGN.md）：只用语义 token、无边框行、`rounded-md` 输入框、等宽字体用于端口/命令片段、`aria-disabled` 而不是原生 disabled 的只读按钮。

---

## 7. 实施计划与工作量

| 里程碑 | 内容 | 预估 | 依赖 |
| --- | --- | --- | --- |
| **M1** | 设置分区「Agent 工具」+ `agent_settings.json` + 工具探测 + 命令模板化（copy / terminal）+ 开始处理入口联动 + vitest | 2–3 人日 | 新增 `types/agent.ts`（不动 `types.ts`） |
| **M2** | `agent_start/cancel/list_runs/events` + headless NDJSON 解析 + 运行抽屉 + 退出清理 + 审计表 | 4–6 人日 | `docs/ipc-contract.md` 增补 |
| **M3a** | 回环 MCP Server（Streamable HTTP）+ 只读工具 + Token/审计 + 设置页 MCP 分组 + DSH 配置片段 | 5–8 人日 | 新增依赖（axum 或 tiny_http） |
| **M3b** | 写工具 + 双开关 + 审计面板 | 3–5 人日 | M3a |
| **M4** | ACP 客户端替代 headless 解析；MCP 注入 ACP 会话 | 8+ 人日 | M2/M3 |

建议先做 M1：没有进程能力也能立刻把“复制命令”升级成“多种 Harness + 终端直达”，用户价值明确、风险最低。

---

## 8. 风险与开放问题

| 风险 | 说明 | 缓解 |
| --- | --- | --- |
| headless 凭据不可用 | DSH headless 不读 GUI 密钥；`DEEPSEEK_API_KEY` 需在 env / `.env` | 探测阶段即提示；设置页给出配置指引；支持用户指定 env 变量名 |
| `dsh` 不在 PATH | Desktop 安装不写 PATH | 探测内置 runtime（`ELECTRON_RUN_AS_NODE` + app.asar 路径）；也支持自定义命令 |
| NDJSON 格式漂移 | `--json` 事件随版本演进 | 版本探测 + 未知事件降级为原文；长期转 ACP |
| 进程泄漏 | 取消/退出/崩溃路径多 | 独立进程组 + 应用退出统一收割 + 启动时清理孤儿 |
| 端口暴露 | 本机其他进程可访问 127.0.0.1 | Token + Origin 校验 + 默认仅只读 + 审计 |
| 冻结契约 | `src/types.ts`、`docs/ipc-contract.md`、`package.json` 等 | 新增 `src/types/agent.ts`；契约增补走架构决策 + `scripts/contracts.sha256` 更新 |
| 工具命名误解 | DSH 侧 `mcp__nervd__x`，nervd 侧展示 `x` | 文档/UI 统一展示全名与示例 |
| 写操作无交互确认 | MCP/headless 都无法弹窗确认 | 双开关 + 审计 + 敏感工具默认关闭 |
| 依赖新增 | HTTP 服务需新 crate | 优先 `tiny_http`（无 async 侵入）或 `axum`（需 tokio net 特性） |

---

## 9. 需要拍板的决策

1. 「Agent 设置」是**新增独立分区**，还是并入现有「AI 助手」分区？（本方案按独立分区设计）
2. Harness 是否仅 DSH，还是同时要 Codex / Claude Code 一等公民支持？
3. 功能一目标形态：**打开终端**（可观察、可交互）优先，还是**后台运行 + 面板**优先？
4. MCP 是否允许写操作？若允许，是否需要“每次调用在 nervd 内二次确认”（会阻塞 Harness，需明确取舍）。
5. 是否接受新增本机回环端口（vs 仅提供 stdio 包装器）？
6. 是否把「开始处理」的 MCP 工具（`nervd_start_processing`）也暴露给外部 Harness，还是只允许 nervd 自身启动的会话使用？

---

## 10. 参考

- DSH headless：`@deepseek-ai/dsh-headless` README（一次性任务、`--json` 事件、`--session-id`、凭据来源）
- DSH ACP：`@deepseek-ai/dsh-acp` README（session 生命周期、MCP 挂载、权限请求）
- DSH MCP：`@deepseek-ai/dsh-mcp-client` / `@deepseek-ai/dsh-mcp-manager` README（传输、命名、`${credential:REF}`）
- 本仓库：`docs/ipc-contract.md`、`docs/change-attribution.md`、`AGENTS.md` §6