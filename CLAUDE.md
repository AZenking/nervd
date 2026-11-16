# Claude Code 工作约定

本仓库的 Agent 规范以 [AGENTS.md](./AGENTS.md) 为唯一事实源，请先完整阅读，尤其是 §6.5。

## 提交（强制）

- 必须使用 `./scripts/agent-commit.sh`，禁止直接 `git commit`；
- 标题必须符合 Conventional Commits：

```text
<type>(<scope>): <subject>
type = feat | fix | docs | style | refactor | perf | test | build | ci | chore | revert
```

- 必须带 `Refs: <工作项编号>`（脚本会自动补）；父需求用 `--req` 或 active workitem；
- 没有 active 上下文时不要猜编号：向用户确认，或用 `--workitem TASK-xxx --req REQ-xxx`；
- 禁止 `--no-verify`。

## 示例

```bash
./scripts/agent-commit.sh -m "feat(cashier): 接入易宝支付并支持结果查询" \
  --workitem MANT-24 --req REQ-100

# 先检查最终消息，不提交
./scripts/agent-commit.sh -m "fix(attribution): 修正子任务仓库继承" --dry-run
```

不规范的标题会被脚本和 `enforce` 模式的 commit-msg 钩子直接拒绝。
