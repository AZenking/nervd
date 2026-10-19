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
  "allowWriteOps": false,                 // 写操作总开关（只读凭证时保持 false）
  "workitemRepos": {                      // 需求覆盖；键为稳定 workitemId，[] 表示显式不关联仓库
    "workitem-uuid": [2709413, 2709414]
  },
  "branchRuleTemplates": [{               // 本机可复用分支规则模板
    "id": "site-b", "name": "B 局点", "sourceBranch": "test",
    "baselineBranchPattern": "iteration/{iteration}/site-b",
    "workitemBranchPattern": "feature/{identifier}"
  }],
  "workitemRepoBranchTemplates": {         // 需求 → 仓库 → 分支模板，需求创建分支时逐仓库套用
    "workitem-uuid": { "2709413": "site-b" }
  },
  "jenkinsConnections": [{                // 仅保存非敏感连接资料
    "id": "jenkins-prod", "name": "生产 Jenkins",
    "baseUrl": "https://jenkins.example.com", "username": "ci-user"
  }],
  "repoCiBindings": {                      // 每个仓库一个当前 CI 绑定
    "2709413": { "provider": "jenkins", "connectionId": "jenkins-prod", "jobFullName": "team/build", "parameters": { "ENVIRONMENT": "test", "BRANCH": "feature/REQ-123" }, "environmentParameter": "ENVIRONMENT", "branchParameter": "BRANCH" },
    "2709414": { "provider": "flow", "pipelineId": 12345, "pipelineName": "release" }
  }
}
```
- `workitemRepos` 只用于 `Req`；Bug/Task 继续扫描 `watchedRepos`。没有该需求的键时回退到 `watchedRepos`，空数组覆盖默认值。
- `branchRuleTemplates` 在迭代页维护并保存在本机；模板含源分支、迭代基准分支命名模板和需求开发分支命名模板。基准分支名支持 `{iteration}`、`{template}`，需求分支名支持 `{identifier}`。
- `workitemRepoBranchTemplates` 在需求页逐个仓库选择模板，键为稳定 `workitemId`，内层键为仓库 ID，值为模板 ID。创建真实迭代需求分支时，先检查模板基准；缺失时从模板源分支创建迭代基准，再从迭代基准创建需求分支。MR 默认以需求分支为源、迭代基准为目标。此配置保存在本机。
- 每个 Jenkins API Token 存在 macOS Keychain：service=`dev.nervd.app`，account=`jenkins:<connectionId>`；Token 不写入 `settings.json`。Jenkins 通过用户名与 API Token 做 HTTP Basic 认证。
- 未配置 PAT 或 organizationId 时，UI 显示**引导页**（SettingsView）。

## 3. Rust 模块布局（rust-backend）

```
src-tauri/src/
├── lib.rs          // Builder、manage(AppState)、generate_handler!（全部命令）
├── main.rs         // 薄透传（模板已有，不动）
├── yunxiao.rs      // YunxiaoClient：ROA REST 客户端
├── commands/       // 按设置、仓库、工作项、Flow、CI 拆分 #[tauri::command]
├── jenkins.rs      // Jenkins Remote Access API 客户端
├── credentials.rs  // keyring 读写 PAT/Jenkins Token + settings.json 读写
└── poller.rs       // Flow/Jenkins 构建轮询 → 事件 + 系统通知
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
| `save_workitem_repos` | `workitemId: String, repoIds: Option<Vec<i64>>` | `Settings` | 需求仓库覆盖；空数组为显式空列表，`null` 删除覆盖并回退默认 |
| `save_branch_rule_templates` | `templates: Vec<BranchRuleTemplate>` | `Settings` | 保存本机可复用分支模板；移除模板时清理需求仓库上的关联 |
| `save_workitem_repo_branch_template` | `workitemId: String, repoId: i64, templateId: Option<String>` | `Settings` | 为需求的一个仓库选择或清除分支模板 |
| `save_repo_ci_binding` | `repoId: i64, binding: Option<RepoCiBinding>` | `Settings` | 本机保存/清除仓库的 Jenkins Job 与构建参数 |
| `save_pat` | `pat: String` | `bool` | 写 keyring，重建 client |
| `delete_pat` | — | `bool` | |
| `check_connection` | — | `Vec<OrgSummary>` | 调 ListOrganizations 验证 PAT+orgId |
| `list_iterations` | — | `Vec<IterationSummary>`（`{id,name,title,state,startDate,endDate}`，state 为 TODO/DOING/ARCHIVED 映射后的中文） | 云效项目迭代列表：`GET /oapi/v1/projex/organizations/{org}/projects/{spaceIdentifier}/sprints?page=1&perPage=100`（实测 2026-10：不带 `/projects/{space}` 的 sprints 路径 404；响应为裸数组，57 个迭代实测可取全）。不可用返回错误，前端回退占位迭代 |
| `list_workitems` | `category: String, spaceIdentifier: String, nextToken: Option<String>` | `WorkitemPage`（items 增补 `relatedTo: string[]` 关联人姓名、`sprintId/sprintName` 所属迭代（search 行 `sprint:{id,name}` 扁平化），供前端按当前迭代与处理人/关联人/状态过滤） | 实测：body 不接受 `sprintId`（传了被忽略），迭代过滤由前端按行内 sprint 字段完成 |
| `get_workitem` | `workitemId: String` | `Value` | 详情 |
| `get_workitem_workflow_statuses` | `workitemId: String` | `Vec<WorkitemStatusOption>` | 读取该工作项类型在线的状态选项 |
| `update_workitem` | `workitemId: String, subject?: String, statusId?: String` | `Value` | **写操作**；更新子工作项名称和/或状态 |
| `list_workitem_types` | `category: String` | `Vec<WorkitemTypeOption>`（`{id,name,category,defaultType}`） | 项目内该类别（Task/Bug…）的工作项类型；oapi/v1 `GET projects/{space}/workitemTypes?category=`，创建子任务时选择类型 |
| `create_workitem_child` | `parentWorkitemId: String, subject: String, workitemTypeId: String` | 子项行（同 `list_workitem_children` items 形态） | **写操作**；在需求下创建子工作项：oapi/v1 `POST workitems`，body `{spaceId, subject, workitemTypeId, parentId, sprint?}`（spaceId 取父详情 space.id，迭代继承父项；处理人不传，云效默认创建人） |
| `list_workitem_children` | `workitemId: String` | `{items: WorkitemChild[]}` | 查找子工作项；行内含 `statusId` 供状态编辑 |
| `list_workitem_comments` | `workitemId: String` | `Vec<Value>` | |
| `list_repos` | `search: Option<String>, page: Option<i64>` | `Vec<RepoSummary>` | |
| `list_branches` | `repoId: i64, search: Option<String>, page?: i64, perPage?: i64` | `Vec<Value>` | 云效分支列表支持搜索和分页（每页最多 100） |
| `compare_branches` | `repoId: i64, fromBranch: String, toBranch: String` | `Value` | 只读比较云效两个分支的提交差异 |
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
| `save_jenkins_token` | `connectionId: String, token: String` | `bool` | Keychain 保存 Jenkins API Token |
| `delete_jenkins_token` | `connectionId: String` | `bool` | 仅在 Jenkins 实例已从设置移除后删除 Token |
| `test_jenkins_connection` | `connection: JenkinsConnection, token?: String` | `String` | 验证 Jenkins 连通及认证；可用未保存的 Token 测试 |
| `get_jenkins_job` | `connectionId: String, jobFullName: String` | `JenkinsJobInfo` | 查询 Job；支持 `folder/subfolder/job` |
| `list_jenkins_jobs` | `connectionId: String` | `Vec<JenkinsJobSummary>` | 列出该实例下可触发的 Jenkins Job，展开文件夹 |
| `get_jenkins_job_parameters` | `connectionId: String, jobFullName: String` | `Vec<JenkinsJobParameter>` | 读取 Job 参数定义、默认值和可选值 |
| `get_repo_ci_snapshot` | `repoId: i64, maxResults?: i64` | `RepoCiSnapshot` | 查询仓库当前绑定的 Flow/Jenkins Job 状态和近期构建 |
| `trigger_jenkins_job` | `repoId: i64, connectionId: String, jobFullName: String, parameters: Record<String, String>` | `Value` | **写操作**；按选择的环境、分支和其他 Job 参数触发 Jenkins 构建 |
| `trigger_repo_ci` | `repoId: i64` | `Value` | **写操作**；按仓库当前 CI 绑定触发；Jenkins 使用本机记住的参数 |
| `get_repo_ci_logs` | `repoId: i64, runId: String` | `String` | 读取当前绑定 Job 的指定构建日志 |
| `get_repo_ci_log_chunk` | `repoId: i64, runId: String, startOffset: u64` | `{text, nextOffset, hasMore}` | 增量读取 Jenkins 构建日志；依据 progressiveText 的偏移与是否仍有新内容持续追读 |
| `get_repo_ci_stages` | `repoId: i64, runId: String` | `Vec<JenkinsPipelineStage>` | 查询流水线构建主体步骤（Jenkins Stage View `wfapi/describe` 或云效运行阶段）；支持步骤名、状态与耗时 |

**写操作门控**：`settings.allowWriteOps == false` 时，写操作命令直接返回
`Err("WRITE_DISABLED: 请在设置中开启写操作（需要写权限的个人令牌）")`。前端依此
错误码前缀置灰按钮。

## 5. TS 数据层（ts-datalayer）

### 本机配置与追溯/CI 类型

- `Settings.workitemRepos: Record<workitemId, repoId[]>`：仅 Req 覆盖默认仓库；属性存在且为空数组时表示显式不关联仓库。缺键回退 `watchedRepos`。
- `Settings.branchRuleTemplates: BranchRuleTemplate[]`：本机可复用分支模板，每项为 `{id, name, sourceBranch, baselineBranchPattern, workitemBranchPattern}`；旧设置缺少该字段时按空数组读取。
- `Settings.workitemRepoBranchTemplates: Record<workitemId, Record<repoId, templateId>>`：需求关联仓库的模板选择；按仓库分别套用。删除需求仓库关联或模板时同步清理对应选择。旧设置缺少该字段时按空对象读取。
- `Settings.jenkinsConnections: JenkinsConnection[]`：`{id, name, baseUrl, username}`；`SettingsView` 增补 `hasToken`，该字段由 Keychain 状态派生，不写入 JSON。
- `Settings.repoCiBindings: Record<repoId, RepoCiBinding>`：每个仓库一个绑定，Flow 为 `{provider:'flow', pipelineId, pipelineName}`，Jenkins 为 `{provider:'jenkins', connectionId, jobFullName, parameters?, environmentParameter?, branchParameter?}`。需求详情的构建选择只接入 Jenkins；勾选“记住本次选择”后，Job、环境/分支参数名和值保存在本机，后续打开预填。
- `TraceResult.repositories: RepositoryTraceResult[]`：每项含 `repoId`、命中的 `branches`、`commits` 和 `mergeRequests`，需求详情按仓库分别展示。
- `RepoCiSnapshot`：`{provider, name, status?, runs: CiRunSummary[]}`；Jenkins `CiRunSummary.parameters` 来自该次构建在 Jenkins 上报的实际参数，用于显示构建分支和环境；近期构建属于当前仓库 Job，不表示由某个需求触发。
- Jenkins 轮询事件 `JenkinsBuildEvent`：`{connectionId, jobFullName, runId, status, repoIds}`。

```
src/lib/api.ts    // Tauri 命令的 invoke 包装，函数名 = 命令名 camelCase，参数对象化
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
├── TracePane.tsx          // Req 按仓库展示分支/commit/MR 与当前 CI Job；Bug/Task 保留全局流水线
├── RepoCiCard.tsx         // 仓库当前 Flow/Jenkins Job：状态、近期构建、触发与日志
├── PipelineCard.tsx       // 单条运行：状态色条、耗时、触发人、日志按钮
├── LogViewer.tsx          // 等宽日志查看（可滚动，自动滚底）
├── WriteOpButton.tsx      // 写操作按钮：allowWriteOps=false 时置灰 + tooltip
├── SettingsView.tsx       // PAT/orgId/项目空间/默认仓库、Jenkins 实例、仓库 CI 绑定与写开关
└── StatusDot.tsx          // 状态点：running=amber 脉冲, success=green, fail=red, 其他=灰
```

- 事件监听（`@tauri-apps/api/event`）：`pipeline-run-finished`（payload：`{pipelineId, runId, status, pipelineName}`）以及 `jenkins-build-finished`（payload：`{connectionId, jobFullName, runId, status, repoIds}`）→ 系统通知由 Rust 侧发，前端刷新相关仓库并 toast。
- TracePane 对 Req 使用 `workitemRepos[workitemId]`（若键存在）或回退 `watchedRepos`，按仓库拉分支 + 近页 commits + MR，用 `extractWorkItemKeys(branchName/commitMessage/MR title)` 匹配当前工作项编号；Bug/Task 继续扫描 `watchedRepos`。
- CI 构建记录属于仓库绑定的当前 Job，不标记为需求专属构建。Jenkins 触发使用默认参数；Flow 与 Jenkins 均通过 `allowWriteOps` 门控。
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
