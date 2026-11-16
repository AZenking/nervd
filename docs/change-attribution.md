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
5. 无 primary 的事件进入「待归属」；不丢。

## 4. 动态回写

- 子项：`off` / `batch`（默认）/ `per_event`；提交批次、MR、构建终态。
- 需求：`off` / `milestone`（默认）/ `daily`；只记里程碑与风险，不逐条 commit。
- 回写由前端执行：Markdown → `sanitizeForYunxiao` → `markdownToHtml` → `create_workitem_comment`。
- 幂等：`activity_posts(event_id, workitem_id)` 唯一键 + 评论内 `<!-- nervd:evt:<id> -->`。
- `allowWriteOps=false` 时保持 pending；失败退避 1m/5m/15m，最多 3 次。

## 5. 新增命令

| 命令 | 说明 |
|---|---|
| `sync_attribution` | 仓库中心增量同步 |
| `get_attribution_status` | 同步状态 |
| `list_workitem_changes` | 工作项时间线（含 rollup） |
| `list_unattributed_changes` | 待归属队列 |
| `assign_change_workitem` | 手动指派（仅本地） |
| `resolve_workitem_identifiers` | 编号解析 |
| `list_activity_candidates` | 待回写候选 |
| `mark_activity` | 回写记账 |
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
- `scripts/check-commit-attribution.sh`：本地/CI 检查，缺 `Refs` 或 `Nervd-Skip` 失败。
- commit-msg 钩子：默认 `fill`，缺 `Refs` 自动补；`enforce` 可阻断；`--no-verify` 由 CI 兜底。
- 详见 `docs/agent-commit.md`。

## 7. 边界

- 首次同步回填 30 天/最多 500 条/分支，只索引不回写历史。
- 每轮每仓库最多 20 个分支、每分支最多 100 条提交；失败退避。
- 分支删除/force-push/rebase：历史按 SHA 保留，不删除旧事件。
- 跨组织/跨空间编号解析失败 → 待归属，不阻塞同步。
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
- **跨组织/跨空间编号**：解析失败进入待归属，不阻塞同步。
