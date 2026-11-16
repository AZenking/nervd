# 分支模板策略

> 本文件描述 nervd 分支轨道（Track/局点）的选择、默认、命名与治理规则。
> 数据事实源：`nervd.db` 的 `branch_tracks` / `workitem_repo_bindings` / `branch_track_topology`。

## 1. 轨道是什么

一条轨道 = `(scope, baseline 模板, 需求分支模板, 默认标记)`。

- `scope=global`：跨迭代长期有效的规则；
- `scope=iteration`：只属于某个迭代的交付 lane；
- `default`：未显式绑定时使用的轨道，每个 scope 至多一个。

## 2. 选择优先级

```text
1. 显式 workitem × repo 绑定
2. 该迭代的默认轨道
3. 该迭代 sort_order 第一条
4. 全局默认轨道
5. 全局 sort_order 第一条
```

显式绑定永远最高；默认只是 fallback。

## 3. Baseline 规则

```text
标准迭代：iteration/{iteration}
多 lane  ：iteration/{iteration}/{track}
```

- iteration scope 的 baseline 默认应含 `{iteration}`；
- 固定 `iteration/xxx` 只用于明确的长生命周期产品线，UI 给出警告；
- `release/*` 是发布线，不作为迭代默认基线，UI 给出警告；
- `source_branch` 必须是 baseline 的真实切出点；release 轨道不要无脑写 `master`。

## 4. 需求分支规则

```text
普通需求：feature/{identifier}
缺陷分支：bugfix/{identifier}
发布/热修：release/{slug}_{identifier} 或 hotfix/{identifier}
```

模板只负责基础名；人工后缀（`_keyaccount`、`-saas`、`-scan-queue`）属于团队命名约定。
如果后缀需要自动化生成，再引入 `{slug}` 占位符。

占位符：

| Token | 含义 | 可用字段 |
|---|---|---|
| `{iteration}` | 迭代名 | baseline / 子分支 pattern |
| `{track}` | 轨道名 | baseline / 子分支 pattern |
| `{identifier}` | 工作项编号 | 需求分支 / 子分支 pattern |
| `{parentIdentifier}` | 父需求编号 | 仅子分支 pattern |
| `{iterationEnd}` | 迭代结束日 `YYYYMMDD` | release/hotfix 命名、baseline |
| `{date}` | `{iterationEnd}` 兼容别名 | 同 `{iterationEnd}` |
| `{yyyy}` / `{MM}` / `{dd}` | 迭代结束日的年/月/日 | release/hotfix 命名 |

## 5. 默认轨道

- 每个 scope 至多一个 `is_default`；
- 保存模板不会重置默认；
- 删除默认轨道后回退 `sort_order` 第一条；
- UI 显示「默认」徽标，并提供「设为默认」。

## 6. 子分支拓扑

| childPattern | 行为 |
|---|---|
| `null` | legacy：子分支 = 需求分支模板按子项编号展开；缺陷 MR 默认指向父需求分支 |
| `''` | 不建子分支，子项共用需求分支 |
| 自定义 | 显式 pattern / 基点 / MR 目标 |

需要独立评审/回滚的 task/bug 才配子分支；需求级集成交付靠 commit `Refs` 归属。

## 7. 当前配置决策（2026-11-13）

- Benz-20261016 迭代：`chery`（默认）、`foton`（新增）、`Nationwide（长线）`；
- `Nationwide（长线）` 使用固定 `iteration/nationwide-warranty`，保留警告；
- `大客户版本优化`、`全国联保`、`yeePay` 保留固定 baseline，分别作为各自迭代默认；
- `release/20261029` 保留在迭代 scope，标注为发布线，不作为默认；
- 原 NULL 绑定已归入标准迭代主线；
- 未自动删除/合并重复固定 baseline；后续确认长期线后再收敛。

## 8. 治理检查

1. 实际 lane = 模板 lane；
2. 一条 lane 只有一个 canonical baseline；
3. 默认显式；
4. 固定 baseline 有长期线或 release 理由；
5. 活跃工作项有显式绑定。

## 9. UI 变量选择器

分支模板编辑器（全局模板 / 迭代专属模板 / 子分支拓扑）提供可点击变量：

- 迭代基准：`{iteration}`、`{track}`、`{iterationEnd}`、`{yyyy}`、`{MM}`、`{dd}`
- 需求开发分支：`{identifier}`、`{iterationEnd}`、`{yyyy}`、`{MM}`、`{dd}`
- 子分支 pattern：`{identifier}`、`{parentIdentifier}`、`{iteration}`、`{track}`、`{iterationEnd}`、`{yyyy}`、`{MM}`、`{dd}`

行为：

- 点击变量插入到当前光标位置；无光标时追加到末尾；
- 插入后恢复焦点，光标停在变量之后；
- 实时用示例值展开预览；
- 未知变量、缺失必需变量给出提示；
- `{parentIdentifier}` 仅出现在子分支拓扑，避免在需求/基准模板中展开为空。

## 10. 时间模板（迭代结束日）

- `{iterationEnd}`：迭代结束日 `YYYYMMDD`，稳定，推荐用于 release 基线 / release 分支；
- `{yyyy}` / `{MM}` / `{dd}`：同一迭代结束日的年 / 月 / 日；
- `{date}`：`{iterationEnd}` 的兼容别名；
- 不建议用“创建当天”的日期做持久模板：`resolveRepoBranchRule` 会随日期重算，导致分支名漂移；如确需“当天”，需要额外的 branch anchor 持久化（后续功能）。

示例：

```text
release/{iterationEnd}          → release/20261029
release/{yyyy}-{MM}-{dd}        → release/2026-10-29
hotfix/{iterationEnd}           → hotfix/20261029
hotfix/{identifier}-{iterationEnd} → hotfix/BUG-303-20261029
```

## 11. `{template}` 兼容说明

- 新 UI / 文档 / 预设不再提供 `{template}`，统一使用 `{track}`；
- 后端 `expandBranchPattern` 仍识别 `{template}` 作为旧配置兼容别名；
- `branch_tracks` 中已有的 `{template}` 已迁移为 `{track}`；
- 旧配置如果仍出现 `{template}`，UI 会给出“已废弃，请改用 {track}”警告。
