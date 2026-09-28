# nervd IPC 契约 v1（并发任务的唯一事实源）

> 所有 mission 任务**必须**遵循本文件。命令名、类型名、字段名、CSS 变量名、文件路径
> 均为契约，不得擅自改名。发现契约缺陷时：小缺口按最合理方式补齐并在 PR 说明里标注，
> 大缺口停下来在任务报告里说明。

产品：nervd —— 以云效需求（Projex 工作项）为维度的 CI/CD 桌面工作台。
技术：Tauri 2 + React 19 + TS + zustand。**只支持 macOS（MVP）**。

## 1. 文件所有权（任务分区，严格互斥）

| 分区 | 路径 | 任务 |
|---|---|---|
| R | `src-tauri/**` | rust-backend |
| D | `src/lib/**`, `src/store/**` | ts-datalayer |
| U | `src/components/**`, `src/App.tsx`, `src/main.tsx` | ui-views |
| S | `src/styles/**`, `index.html`, `public/**` | theme-css |
| 冻结 | `src/types.ts`（本契约随仓库提交，只读）, `docs/**`, `package.json`, `pnpm-lock.yaml`, `vite.config.ts`, `tsconfig*.json` | 主会话所有，任务不得修改 |

## 2. 凭证与设置模型

- 个人访问令牌 PAT（形如 `agp_...`）存 **macOS Keychain**：service=`dev.nervd.app`, account=`yunxiao_pat`（keyring crate）。
- 非敏感设置存 `app_data_dir/settings.json`（Tauri path API 解析）：
```jsonc
{
  "organizationId": "60de7a68...",        // 必填，云效组织 ID
  "defaultSpaceIdentifier": "8fb83deb...", // 默认项目空间（可空）
  "linkPattern": "(?:REQ|BUG|TASK)[-_]?(\\d+)", // 分支/commit 提取工作项编号的正则
  "watchedRepos": [2709413],              // 追溯扫描的仓库 ID 列表
  "allowWriteOps": false                  // 写操作总开关（只读凭证时保持 false）
}
```
- 未配置 PAT 或 organizationId 时，UI 显示**引导页**（SettingsView）。

## 3. Rust 模块布局（rust-backend）

```
src-tauri/src/
├── lib.rs          // Builder、manage(AppState)、generate_handler!（全部命令）
├── main.rs         // 薄透传（模板已有，不动）
├── yunxiao.rs      // YunxiaoClient：ROA REST 客户端
├── commands.rs     // 全部 #[tauri::command]
├── credentials.rs  // keyring 读写 PAT + settings.json 读写
└── poller.rs       // 流水线运行轮询 → 事件 + 系统通知
```

### YunxiaoClient 要点
- Base URL：`https://devops.cn-hangzhou.aliyuncs.com`（只此一个 region）。
- 鉴权：一律加 query `accessToken=<PAT>`。
- 只封装契约内 API（见 §4），错误统一 `String`（含 HTTP 状态 + 响应体截断 300 字符）。
- 所有命令 `async fn` + `Result<T, String>`；并发安全：`AppState { client: Mutex<Option<YunxiaoClient>> }` 重建于 save_credentials / save_settings 后。
- reqwest 默认 TLS 即可；禁用任意重定向陷阱：`Client::builder().timeout(30s)`。

### 云效 API 端点速查（来自本地 aliyun CLI 元数据，ROA 风格）
| 用途 | METHOD PATH |
|---|---|
| 组织列表 | GET `/organizations/list` |
| 工作项列表 | GET `/organization/{orgId}/listWorkitems`（query: category=Req|Bug|Task, spaceType=Project, spaceIdentifier, maxResults, nextToken） |
| 工作项详情 | GET `/organization/{orgId}/workitems/{workitemId}` |
| 更新工作项 | POST `/organization/{orgId}/workitems/update`（body JSON） |
| 工作项状态流水 | GET `/organization/{orgId}/workitems/workflow/listWorkflowStatus` |
| 评论列表 | GET `/organization/{orgId}/workitems/{workitemId}/commentList` |
| 仓库列表 | GET `/repository/list`（query: organizationId, page, perPage, search） |
| 分支列表 | GET `/repository/{repoId}/branches`（query: organizationId, page, pageSize, search） |
| 建分支 | POST `/repository/{repoId}/branches`（query: organizationId；body: {branchName, ref}） |
| commit 历史 | GET `/repository/{repoId}/commits`（query: organizationId, page, pageSize, sha?） |
| MR 列表 | GET `/repository/{repoId}/merge_requests`（query: organizationId, page, pageSize, state?） |
| 建 MR | POST `/repository/{repoId}/merge_requests`（body: {title, sourceBranch, targetBranch, description?, workItemIds?}） |
| MR 详情 | GET `/api/v4/projects/{repoId}/merge_requests/{localId}/detail` |
| 合并 MR | POST `/api/v4/projects/{repoId}/merge_requests/{localId}/merge` |
| 流水线列表 | GET `/organization/{orgId}/pipelines`（query: maxResults, nextToken） |
| 运行列表 | GET `/organization/{orgId}/pipelines/{pipelineId}/pipelineRuns`（query: maxResults, nextToken） |
| 运行详情 | GET `/organization/{orgId}/pipelines/{pipelineId}/pipelineRuns/{runId}` |
| 触发运行 | POST `/organizations/{orgId}/pipelines/{pipelineId}/run`（body: 可选 params JSON） |
| 停止运行 | PUT `/organization/{orgId}/pipelines/{pipelineId}/pipelineRuns/{runId}/stop` |
| Job 日志 | GET `/organization/{orgId}/pipeline/{pipelineId}/pipelineRun/{runId}/job/{jobId}/logs` |

## 4. Tauri 命令清单（camelCase 自动映射；参数均为 owned String/基本类型）

| 命令 | 参数 | 返回（serde_json::Value 或具体类型） | 说明 |
|---|---|---|---|
| `get_settings` | — | `Settings`（PAT 永不返回，只返回 `hasPat: bool`） | |
| `save_settings` | `settings: Settings` | `Settings` | 重建 client |
| `save_pat` | `pat: String` | `bool` | 写 keyring，重建 client |
| `delete_pat` | — | `bool` | |
| `check_connection` | — | `Vec<OrgSummary>` | 调 ListOrganizations 验证 PAT+orgId |
| `list_workitems` | `category: String, spaceIdentifier: String, nextToken: Option<String>` | `WorkitemPage` | |
| `get_workitem` | `workitemId: String` | `Value` | 详情 |
| `list_workitem_comments` | `workitemId: String` | `Vec<Value>` | |
| `list_repos` | `search: Option<String>, page: Option<i64>` | `Vec<RepoSummary>` | |
| `list_branches` | `repoId: i64, search: Option<String>` | `Vec<Value>` | |
| `create_branch` | `repoId: i64, branchName: String, refName: String` | `Value` | **写操作** |
| `list_repository_commits` | `repoId: i64, page: Option<i64>` | `Vec<Value>` | |
| `list_merge_requests` | `repoId: i64, state: Option<String>` | `Vec<Value>` | |
| `create_merge_request` | `repoId: i64, title: String, sourceBranch: String, targetBranch: String, description: Option<String>` | `Value` | **写操作** |
| `merge_merge_request` | `repoId: i64, localId: i64` | `Value` | **写操作** |
| `list_pipelines` | `maxResults: Option<i64>` | `Vec<PipelineSummary>` | |
| `list_pipeline_runs` | `pipelineId: i64, maxResults: Option<i64>` | `Vec<PipelineRunSummary>` | |
| `get_pipeline_run` | `pipelineId: i64, runId: i64` | `Value` | |
| `start_pipeline_run` | `pipelineId: i64` | `Value` | **写操作** |
| `stop_pipeline_run` | `pipelineId: i64, runId: i64` | `Value` | **写操作** |
| `get_job_logs` | `pipelineId: i64, runId: i64, jobId: i64` | `String` | 日志文本 |
| `update_workitem_status` | `workitemId: String, statusIdentifier: String` | `Value` | **写操作**（POST workitems/update） |

**写操作门控**：`settings.allowWriteOps == false` 时，写操作命令直接返回
`Err("WRITE_DISABLED: 请在设置中开启写操作（需要写权限的个人令牌）")`。前端依此
错误码前缀置灰按钮。

## 5. TS 数据层（ts-datalayer）

```
src/lib/api.ts    // 上述 22 个命令的 invoke 包装，函数名 = 命令名 camelCase，参数对象化
src/store/app.ts  // zustand store：settings、workitems 缓存、当前选中、watch 状态
```

- `api.ts`：`export async function listWorkitems(p: {category: Category, spaceIdentifier: string, nextToken?: string}): Promise<WorkitemPage>` 等，全部 `import { invoke } from '@tauri-apps/api/core'`。
- `store/app.ts` 至少暴露：
  - `settings: Settings | null`, `hasPat: boolean`, `connectionOk: 'unknown'|'ok'|'fail'`
  - `selected: { workitemId: string } | null`
  - `traces: Record<string, TraceResult>`（workitemId → 追溯结果缓存）
  - actions：`loadSettings()`, `saveSettings(s)`, `verify()`, `select(id)`
- 关联匹配（ID 规则）放 `src/lib/link.ts`：
  `extractWorkItemKeys(text: string, pattern: string): string[]`（正则捕获组，全局匹配，去重）。

## 6. 组件树（ui-views）

```
src/main.tsx               // 挂 App，import './styles/theme.css'
src/App.tsx                // 连接 store：无 PAT/orgId → SettingsView，否则 Shell
src/components/
├── Shell.tsx              // 三栏：Sidebar | WorkitemPane | TracePane；顶栏 org/profile 状态
├── Sidebar.tsx            // 类别切换（Req/Bug/Task）+ 列表 + 搜索 + 分页
├── WorkitemDetail.tsx     // 详情：标题/状态/处理人/描述(纯文本)/评论
├── TracePane.tsx          // 追溯：分支 → commit → MR → 流水线运行 四段时间线
├── PipelineCard.tsx       // 单条运行：状态色条、耗时、触发人、日志按钮
├── LogViewer.tsx          // 等宽日志查看（可滚动，自动滚底）
├── WriteOpButton.tsx      // 写操作按钮：allowWriteOps=false 时置灰 + tooltip
├── SettingsView.tsx       // PAT/orgId/项目空间/关联正则/仓库勾选/写开关 + 连接测试
└── StatusDot.tsx          // 状态点：running=amber 脉冲, success=green, fail=red, 其他=灰
```

- 事件监听（`@tauri-apps/api/event`）：`pipeline-run-finished`（payload：`{pipelineId, runId, status, pipelineName}`）→ 系统通知已由 Rust 侧发，前端只更新列表并 toast。
- TracePane 匹配逻辑：对 `watchedRepos` 每个仓库拉分支 + 近页 commits + MR，用 `extractWorkItemKeys(branchName/commitMessage/MR title)` 对当前工作项编号命中。
- 工作项「编号」用列表返回的 `identifier`（如 `REQ-1234`）与详情 `subject` 等字段；正则默认 `(?:REQ|BUG|TASK)[-_]?(\d+)` 对 `identifier` 全量文本匹配。

## 7. 设计系统（theme-css）

**方向：工业任务控制台（Hangar Control）** —— 深色、致密、等宽数据、信号色克制。

```css
:root {
  /* 底色层级 */
  --bg-0: #0B0E13;        /* 窗体底 */
  --bg-1: #11151D;        /* 面板 */
  --bg-2: #181D28;        /* 悬浮/嵌套 */
  --bg-3: #202634;        /* 选中/激活 */
  /* 线与字 */
  --line: #262D3D;
  --ink-0: #E8ECF4;       /* 主文字 */
  --ink-1: #9AA4B8;       /* 次级 */
  --ink-2: #5C6678;       /* 弱化 */
  /* 信号色 */
  --sig-run: #FFB454;     /* 运行中·琥珀 */
  --sig-ok: #4ADE80;      /* 成功·绿 */
  --sig-fail: #F87171;    /* 失败·红 */
  --sig-idle: #6B7280;    /* 空闲·灰 */
  --accent: #FF8A3D;      /* 主操作·熔橙 */
  /* 字体 */
  --font-ui: 'IBM Plex Sans', sans-serif;
  --font-mono: 'IBM Plex Mono', monospace;
  /* 尺寸 */
  --rail-w: 208px; --pane-gap: 1px;
}
```

- `index.html`：`<title>nervd</title>`；`public/` 不动。
- `theme.css` 顶部 `@import '@fontsource/ibm-plex-sans/400.css'` 等字重（400/500/600 + mono 400/500）。
- 全局：无默认圆角狂魔——圆角统一 `3px`；边框 1px `--line`；面板标题 11px 大写字距 0.08em；数据一律 mono。
- 背景：`--bg-0` 上叠加极淡的工程网格（`repeating-linear-gradient`，透明度 ≤ 3%）。
- 顶栏 36px 高，含产品名（mono 小写 `nervd` + 状态灯）。

## 8. 验收（mission 内各自执行，主会话终验）

- rust-backend：`cargo check` 通过（在 src-tauri 下）。
- ts-datalayer：`pnpm exec tsc --noEmit` 通过（依赖 types.ts 与既有 deps，不得新增 npm 包）。
- ui-views：`pnpm exec tsc --noEmit` 通过。
- theme-css：`pnpm exec vite build` 通过。
