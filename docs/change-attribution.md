# 变更归属与动态回写（Change Attribution）

> 契约扩展文档。冻结契约 `src/types.ts` / `docs/ipc-contract.md` 未修改；新增类型在
> `src/types/attribution.ts`、`src/types/branch-topology.ts`，新增命令记录在本文档。

## 1. 目标

把「需求 → 任务/缺陷 → 分支 → 提交 → MR → 构建」从按工作项字符串匹配，升级为
**仓库中心的事件索引 + 多级归属**，并把可读摘要回写到关联工作项动态。

核心原则：**commit 是最小归属单位，branch 只是容器，需求是汇总，Task/Bug 是工作日志。**

## 2. 数据模型

SQLite（`nervd.db`，additive，无破坏性迁移）：

- `code_events`：commit / mr / build 事件索引；唯一键 `(repo_id, kind, external_id)`。
- `event_workitems`：事件 → 工作项归属；`relation ∈ primary/related/rollup`，`confidence ∈ explicit/branch/target/inherited/manual`。
- `workitem_identifiers`：编号 → 工作项解析缓存（TTL 1h）。
- `workitem_identifier_people`：编号 → 负责人 / 创建人 / 协同人索引（写回范围判定用，随解析顺带写入）。
- `repo_sync_state`：每仓库/分支增量游标。
- `activity_posts`：回写记账与重试。
- `attribution_policy`：子项/需求回写策略。
- `repo_local_bindings`：本地仓库路径、钩子模式。
- `branch_track_topology`：按 `track_id` 的子分支模式 / 基点 / MR 目标。

事件 ID 规则：

```
commit:{repoId}:{sha}
mr:{repoId}:{localId}
build:{provider}:{repoId}:{runId}
```

## 3. 归属规则

1. 解析顺序：trailer（`Refs:` / `Workitem:` / `Req:` / `Task:` / `Bug:`）→ 正文 `linkPattern` → 分支名。
2. `primary`：显式引用中优先最深层级（Task/Bug > Req），同层第一个；无显式引用取分支 owner。
3. `related`：其余显式引用 + 分支 owner + MR 目标分支 owner。
4. `rollup`：primary 是 Task/Bug 且父需求可解析时，父需求记 rollup。
5. 无 primary 的事件进入「待归属」；不丢。前端「待归属变更 / 指派」入口已下线（只保留后端数据与命令），启动时清理一次历史手动归属记录。
6. **回写范围按「我」过滤**（2026-11-16）：只回写负责人是当前用户的工作项。
   - 直接引用（primary / related）的工作项：负责人必须是我；
   - 父需求汇总（rollup）：负责人是我 **或** 我是协同人 / 创建人（`participant` / `creator`）；
   - 负责人未知（编号还没解析出人员索引）时跳过，等下一轮补解析；
   - 没有识别到当前用户（无 PAT / 平台用户接口失败）时 fail-closed：不拉候选、不发任何评论。
   - 人员索引存 `workitem_identifier_people(identifier, role, person_id, person_name)`，
     由编号解析（`workitems:search` 响应里的 `assignedTo` / `creator` / `participants`）顺带写入，
     不额外发请求；升级后历史编号由同步收尾的定向补解析（每轮最多 20 个）补齐。

## 4. 动态回写（滚动评论）

- **每个工作项只维护一条「交付进展 · <编号>」摘要评论**：首次创建，之后优先在原评论上原地更新。
- 评论内嵌 `<!-- nervd:summary -->` 标记用于找回同一条评论；正文由该工作项最近变更重新生成
  （最多 20 条），内容指纹不变时跳过更新。正文示例：

  ```text
  交付进展 · TASK-202

  汇总：3 个提交 · 1 个 MR · 1 次构建

  最近变更：
  - 11-16 16:58 · 提交 7a3f8b1 feat(cash-register): 接入易宝 B 扫 C 参数 [提交](https://codeup.aliyun.com/.../commit/7a3f8b1...)
  - 11-16 16:57 · MR !687 已合入（feature/MANT-24 → iteration/MAN-20261127） [MR](https://codeup.aliyun.com/.../change/687)
  - 11-16 16:30 · 构建 #4521 失败 [构建](https://jenkins.../4521/)
  ```

  - 提交链接由 `repoId → 仓库 pathWithNamespace` 拼装（缺失时不输出链接）；
  - MR / 构建链接取自事件 `payload.webUrl`。
- **回写范围仅限代码记录**（commit / mr / build）：子任务只写自己的代码记录；父需求只写里程碑或每日代码汇总；**工作项状态流转不写动态**，由云效原生状态字段与子任务自身历史承载。
- **只回写「我的」工作项**：候选查询按 `viewer`（当前用户 id / 姓名 / 别名）过滤，别人的需求与子任务不会产生动态。
- **没有新的回写候选时不发任何请求**，因此不会产生「无变更新」的动态。
- **本地暂停开关**：`localStorage['nervd-attribution-writeback-paused']`，默认暂停；暂停时不读取策略/候选、
  不发任何评论请求。恢复入口：设置 → 变更归属 → 回写策略 →「动态回写」。
- 子项：`off` / `batch`（默认）/ `per_event`；提交批次、MR、构建终态触发更新。
- 需求：`off` / `milestone`（默认）/ `daily`；milestone 只渲染 MR 合入/关闭与构建失败；
  daily 只汇总已翻篇的本地日期。
- 回写由前端执行：Markdown → `sanitizeForYunxiao` → `markdownToHtml` → 创建或更新评论。
- 更新端点按序尝试：`PUT .../workitems/{id}/comments/{commentId}` →
  `POST .../workitems/commentUpdate` → 旧 ROA `POST /organization/{org}/workitems/commentUpdate`
  （PAT 走 accessToken）。实测云效 PAT 只支持创建/查询评论，更新端点 404 或要求 AK；
  探测到不支持后自动降级为「每轮聚合新增一条摘要评论」，不再反复失败。
- 幂等：`activity_posts(event_id, workitem_id)` 唯一键 + 评论内容指纹。
- `allowWriteOps=false` 时保持 pending；失败退避 1m/5m/15m，最多 3 次。

## 5. 新增命令

| 命令 | 说明 |
|---|---|
| `sync_attribution` | 仓库中心增量同步；`force=true` 忽略编号负缓存并强制重新解析，`full=true` 忽略游标回填最近窗口 |
| `get_attribution_status` | 同步状态 |
| `list_workitem_changes` | 工作项时间线（含 rollup） |
| `list_unattributed_changes` | 待归属队列 |
| `assign_change_workitem` | 手动指派（仅本地） |
| `resolve_workitem_identifiers` | 编号解析 |
| `list_activity_candidates` | 待回写候选；入参 `viewer: { id?, name?, aliases? }`，按负责人过滤（无身份返回空） |
| `mark_activity` | 回写记账 |
| `update_workitem_comment` | 原地更新既有评论（多端点兼容） |
| `get_activity_policy` / `save_activity_policy` | 回写策略 |
| `list_local_repo_bindings` / `save_local_repo_binding` / `delete_local_repo_binding` | 本地仓库绑定 |
| `pick_repo_directory` | 选择目录（dialog 插件） |
| `inspect_local_repo` | git 只读探测 |
| `sync_local_repo` | 本地提交入索引 |
| `get_active_workitem` / `list_active_workitems` | 按仓库读取 / 汇总当前工作项 |
| `set_active_workitem` | 写入或清除当前工作项（受 `allowWriteOps` 门控） |
| `install_commit_msg_hook` / `uninstall_commit_msg_hook` | 钩子安装（默认 fill） |
| `get_branch_track_topology` / `save_branch_track_topology` | 分支拓扑 |

修改的命令：

- `list_repository_commits`：新增 `refName` / `start` / `end`（缺省保持默认分支行为）。
- `create_merge_request`：新增 `workItemIds`（逗号分隔字符串）/ `reviewerIds`。

## 6. Agent / Harness 契约

- `.nervd/active-workitem.json`：当前工作项上下文，gitignored。
- `scripts/agent-commit.sh`：Agent 首选提交入口，自动补 `Refs`/`Req`。
- 「开始处理」（`set_active_workitem`）在写入 active-workitem 后，会在同一仓库生成 Agent 脚手架（尽力而为，失败只记日志）：
  - `.nervd/agent-task.md`：任务上下文快照（编号 / 内部 ID / 类别 / 父需求 / 仓库路径 /
    本地当前分支 / HEAD / 工作区状态 / 推荐命令 / 归属规则），每次开始处理覆盖；
  - `.nervd/scripts/`：内嵌随二进制分发的 `lib-attribution.sh`、`agent-commit.sh`、
    `read-active-workitem.sh`、`check-commit-attribution.sh`（chmod 755），版本与 nervd 同步；
  - `.nervd/.gitignore`：内容为 `*`，只忽略 `.nervd` 自身，不改项目根 `.gitignore`。
- 生成的脚本为 POSIX sh，Windows 不支持；`.nervd/` 每次开始处理覆盖，用户手改会被替换。
- `scripts/check-commit-attribution.sh`：本地/CI 检查，缺 `Refs` 或 `Nervd-Skip` 失败。
- commit-msg 钩子：默认 `fill`，缺 `Refs` 自动补；`enforce` 可阻断；`--no-verify` 由 CI 兜底。
- 详见 `docs/agent-commit.md`。

## 7. 边界

- 首次同步回填 30 天/最多 500 条/分支，只索引不回写历史。
- 每轮每仓库最多 20 个分支、每分支最多 100 条提交；失败退避。
- 分支删除/force-push/rebase：历史按 SHA 保留，不删除旧事件。
- 编号解析顺序：TTL 缓存 → 本地 `.nervd/active-workitem.json` 映射 → 默认项目空间搜索 → 其余项目空间回退（最多 20 个）；仍失败进入待归属，不阻塞同步。
- 本地仓库路径错误、git 未安装：本地功能降级，远程同步仍可用。
- 活动工作项按仓库记录：每个绑定仓库各自持有 `.nervd/active-workitem.json`；
  未指定 `repo_id` 时不再回退到「第一个绑定」，汇总读取走 `list_active_workitems`。
- `set_active_workitem` 与清除操作统一校验 `allowWriteOps`，只读模式下由 Rust 核心层拒绝。
## 8. 当前边界（v1）

- **构建事件尚未入索引**：`code_events` 已支持 `kind='build'` 与 `build:{provider}:{repoId}:{runId}` ID 规则，但 poller 暂未写入；时间线当前只展示提交与 MR。
- **分支拓扑已持久化，但尚未接入生产解析**：设置页可配置 `childPattern / childBase / childMrTarget`，`resolveChildBranchTopology` 已就绪；`RequirementDetails` 的建分支 / 发 MR 仍走 `resolveChildMrBranches` 回退逻辑，下一轮接入。
- **MR 原生关联未做真实云效冒烟**：`create_merge_request` 已传 `workItemIds` / `reviewerIds`，实际效果取决于云效开放平台版本；Phase 0 需用真实 PAT 验证。
- **分支过滤**：只扫描名称命中 `linkPattern` 的分支；无编号分支上的提交不会入索引（可在后续改为“所有分支 + 待归属”）。
- **本地同步**：`read_local_commits` 单次最多 100 条；`sync_local_repo` 会同时尝试远端（有 PAT 时），首次可能比 2 秒慢。
- **跨项目空间编号**：默认项目空间未命中时会回退本地 active-workitem 映射与其余项目空间搜索（最多 20 个、单轮最多 20 个编号）；仍失败进入待归属，不阻塞同步。手动「立即同步」使用 `force=true` 跳过 1 小时负缓存，并以 `full=true` 回填最近窗口，让已索引但未归属的事件重新计算。
- **待归属/手动指派 UI 已下线**：`init_conn` 启动时一次性清空 `event_workitems.confidence='manual'` 及其 `activity_posts` 记账（不触碰云效评论与事件索引）。
