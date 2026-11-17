# Agent 提交与变更归属

> 本文展开 [`AGENTS.md`](../AGENTS.md) §6.5 与
> [`docs/change-attribution.md`](./change-attribution.md) §6 的 Agent / Harness 契约。
> 规则本身以 AGENTS.md 为准；本文只说明脚本用法、接线方式和失败处理。
>
> 目标：任何 Agent 提交都能回答两个问题——**这个 commit 属于哪个工作项？**
> 以及**它的父需求是谁？** 归属信息必须落在 commit message 里，而不是只存在于
> 本地状态或 Agent 的上下文里。

## 1. 不变量

1. 每个 commit 的 message 必须包含行首开始的 `Refs: <工作项编号>`，
   或 `Nervd-Skip: true`。
2. 工作项优先用 `--workitem`；父需求用 `--req` 或 active workitem 的 parent。
   并行任务必须显式给出两者，不要依赖分支推断。
3. 一个 commit 只做一个任务；跨任务时 `Refs` 列出全部编号，第一个为主。
4. 禁止 `git commit --no-verify`。本项目**不依赖 CI 门禁**：提交规范由
   `agent-commit.sh` 的强制校验 + commit-msg 钩子（建议 `enforce`）保证。
5. commit 标题必须符合 Conventional Commits：
   `^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^)]+\))?!?: .+`；
   不规范的标题会被 `agent-commit.sh` 与 `enforce` 钩子直接拒绝。
6. 禁止对已推送的提交 amend / rebase 补 `Refs`；用新提交或 revert 修正。
7. `.nervd/` 是本地状态，已 gitignore，不提交。
8. Agent 必须使用 `./scripts/agent-commit.sh`，不要直接 `git commit`。

## 2. 标准工作流

```text
读取 active workitem
        │
        ▼
./scripts/agent-commit.sh -m "..."      # 自动补 Refs / Req
        │  （commit-msg hook 默认 fill，兜底再补一次）
        ▼
本地自查
./scripts/check-commit-attribution.sh origin/master...HEAD
        │
        ▼
push / MR
        │
        ▼
CI required check（同一脚本）── 失败则禁止合并
```

### 2.1 提交前读取上下文

```bash
./scripts/read-active-workitem.sh
# IDENTIFIER=TASK-456
# WORKITEM_ID=123456
# PARENT_IDENTIFIER=REQ-123
# PARENT_WORKITEM_ID=100001
# CATEGORY=Task
```

输出是可直接 `eval` 的 `KEY=VALUE` 行；文件缺失时**无输出且 exit 0**，
由调用方决定是否报错。不要在没有上下文时猜测编号。

### 2.2 提交

```bash
# 常规：从 active workitem 自动补 Refs / Req
./scripts/agent-commit.sh -m "feat(iteration): 支持键盘翻页"

# 并行任务：显式指定，优先级最高
./scripts/agent-commit.sh \
  --workitem TASK-202 \
  --req REQ-101 \
  -m "fix(peek): 抽屉打开时保持列表滚动位置"

# 纯格式化 / 依赖升级
./scripts/agent-commit.sh --skip -m "chore(deps): bump pnpm lockfile"

# 先看最终消息，不提交
./scripts/agent-commit.sh --workitem REQ-101 --dry-run -m "feat: ..."

# 透传 git commit 参数（如 --allow-empty / --amend）
./scripts/agent-commit.sh --workitem REQ-101 -m "chore: empty" -- --allow-empty
```

### 2.3 本地检查

```bash
# 最近一个 commit
./scripts/check-commit-attribution.sh

# 分支相对 base 的全部非 merge commit
./scripts/check-commit-attribution.sh origin/master...HEAD

# squash 场景：MR 描述里已有 Refs:
./scripts/check-commit-attribution.sh origin/master...HEAD \
  --allow-mr-refs /path/to/mr-description.txt
```

### 2.4 失败即修复

- 未推送：可以 `git commit --amend` 补 trailer，或用
  `./scripts/agent-commit.sh --workitem ... -m ...` 重新提交。
- 已推送：不要改写历史；新增一个带 `Refs` 的提交，或在 MR 描述中补
  `Refs: ...` 并让 CI 使用 `--allow-mr-refs`。
- squash merge：确保 MR 描述包含 `Refs:`；这是 squash 后唯一的归属来源。

## 3. active workitem

### 3.1 现代格式

路径：`<repo-root>/.nervd/active-workitem.json`（gitignored）。

字段与 Rust `ActiveWorkitem`（camelCase）一致：

```json
{
  "repoId": 42,
  "workitemId": "123456",
  "identifier": "TASK-456",
  "category": "Task",
  "parentWorkitemId": "100001",
  "parentIdentifier": "REQ-123",
  "updatedAt": 1700000000
}
```

- `identifier`：提交里使用的编号（`REQ-101` / `TASK-202` / `BUG-303`）。
- `parentIdentifier`：父需求编号；缺省时不写 `Req:`。
- `category`：`Req | Bug | Task`，仅供展示，不参与 trailer 生成。
- 文件可以是 pretty-print；`read-active-workitem.sh` 用 sed 压平后提取，
  不依赖 jq。
- 缺少 `identifier` 但有 `workitemId` 时，`agent-commit.sh` 会回退使用
  `workitemId` 并打印警告；这是兼容路径，正常应写 `identifier`。

### 3.2 旧格式兼容

旧工具把上下文写在 `<git-dir>/nervd-active-workitem`，4 行纯文本：

```text
REQ-999
888888
REQ-100
777777
```

依次为：`identifier` / `workitemId` / `parentIdentifier` / `parentWorkitemId`。
`read-active-workitem.sh` 在 JSON 不存在或没有有效字段时回退读取；
`agent-commit.sh` 复用同一逻辑。

legacy 文件位于当前 worktree 的 git dir（linked worktree 下是
`.git/worktrees/<name>/`），不会跨 worktree 共享；并行 Agent 请优先使用
每 worktree 自己的 `.nervd/active-workitem.json`。

### 3.3 开始处理生成的脚手架

在 nervd 中点击「开始处理」后，除 `.nervd/active-workitem.json` 外还会生成
（每次覆盖）：

```text
<repo-root>/.nervd/
├── agent-task.md                 # 任务上下文、本地分支/HEAD/工作区、推荐命令、归属规则
├── .gitignore                    # 内容为 *，仅忽略 .nervd 自身
├── active-workitem.json
└── scripts/
    ├── lib-attribution.sh
    ├── agent-commit.sh
    ├── read-active-workitem.sh
    └── check-commit-attribution.sh
```

Agent 可直接执行 `./.nervd/scripts/agent-commit.sh ...`；脚本由 nervd 二进制内嵌，
随应用版本更新。生成失败只记日志，不影响当前工作项写入。

### 3.3 路径与仓库根

```bash
# 显式给仓库根；路径含空格也可以
./scripts/read-active-workitem.sh "/path/with space/nervd"

# 缺省从当前目录解析 git 顶层目录；在子目录调用同样有效
cd src-tauri && ../scripts/read-active-workitem.sh
```

脚本使用 `git -C <root> rev-parse --show-toplevel` 解析根；非 git 目录
回退为绝对路径，因此 `.nervd` 也可以在没有 git 元数据的目录里读取。

## 4. agent-commit.sh

### 4.1 用法

```text
agent-commit.sh -m <message> [--workitem ID] [--req ID] [--skip] [--dry-run]
                [-- <extra git commit args>]
```

| 选项 | 说明 |
|---|---|
| `-m, --message <msg>` | 提交消息；可重复，按 git 习惯用空行拼接 |
| `--workitem <ID>` | 显式工作项编号，优先级最高 |
| `--req <ID>` | 显式父需求编号；缺省取 active 的 `parentIdentifier` |
| `--skip` | 追加 `Nervd-Skip: true`；**不自动推断工作项** |
| `--dry-run` | 只打印最终消息，不执行 `git commit` |
| `--` | 其后参数原样透传给 `git commit`（如 `--allow-empty`） |

### 4.2 工作项解析顺序

```text
--workitem
    > .nervd/active-workitem.json（或旧格式）
        > 当前分支名中最后一个 [A-Za-z][A-Za-z0-9]{1,15}[-_][0-9]+
```

- 分支名包含多个编号时取**最后一个**，例如
  `feature/req-101-task-202` → `TASK-202`。
- 分支名中的编号统一转大写：`feature/req-101` → `REQ-101`，与云效工作项
  编号一致。
- `--skip` 表示明确不归属当前任务：不会从 active / 分支自动推断。
  如确需同时写 `Refs`，显式给 `--workitem`（会写 `Refs` + `Nervd-Skip`）。
- 无工作项且未 `--skip`：打印示例并 **exit 2**，不会产生 commit。

### 4.3 消息与 trailer 规则

| 输入 | 行为 |
|---|---|
| 消息已有行首 `Refs:` | **原样提交**，不再追加 `Refs`/`Req`/`Nervd-Skip` |
| 消息已有行首 `Nervd-Skip:` | **原样提交**，不再追加任何 trailer |
| 普通消息 + 有工作项 | 空行后追加 `Refs: <id>` |
| 有 `--req` 或 active parent | 再追加 `Req: <req>`；消息已有行首 `Req:` 则不重复 |
| `--skip` | 再追加 `Nervd-Skip: true` |

`Refs` / `Req` / `Nervd-Skip` 必须是**行首**（前面不能有空格），
`check-commit-attribution.sh` 按行首匹配。

跨任务提交（不推荐）：直接在消息里写
`Refs: TASK-1, TASK-2`，脚本检测到行首 `Refs:` 后会原样提交，第一个为主。
`--workitem` 只接受一个编号，不会替你把多个编号拆成多行。

### 4.3.1 标题格式（强制）

在补 trailer 之前，脚本会先校验**第一行标题**：

```text
^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([A-Za-z0-9._/-]+\))?!?: .+
```

- `type` 必须是小写枚举值，`scope` 可选，`!` 表示破坏性变更；
- `subject` 用中文动宾结构，说明交付产物，不加句号；
- `Merge ...` / `Revert ...` 由脚本与钩子放行（git 原生格式）；
- 不符合时：`agent-commit.sh` 直接 `exit 2`；commit-msg 钩子在 `enforce` 模式拒绝、`fill` 模式仅警告；
- `Nervd-Skip` 只豁免归属，不豁免标题格式。

示例：

```text
feat(cashier): 接入易宝支付并支持结果查询
fix(attribution): 修正子任务仓库继承
chore(deps): 升级 tauri 到 2.1
```

多行消息通过临时文件 + `git commit -F` 写入，不会丢换行或正文。
脚本不会 stage 文件，提交前仍需 `git add`（或用 `-- --allow-empty` 做空提交）。
脚本不会调用 `--no-verify`；在 `--` 后传 `--no-verify` 或 `-n` 会直接
exit 2。

### 4.4 退出码

| 码 | 含义 |
|---|---|
| `0` | 提交成功（或 `--dry-run` 打印成功） |
| `2` | 用法错误、无工作项上下文、禁止的透传参数、非 git 目录 |
| 其他 | `git commit` 自身的失败码（如无暂存内容为 1） |

提交成功后脚本打印短 SHA 与最终 trailer 摘要；`--dry-run` 只打印最终
消息（stdout），方便粘贴检查。

## 5. check-commit-attribution.sh

### 5.1 用法

```text
check-commit-attribution.sh [<range>] [--allow-mr-refs <file>]
```

- 默认 range：`HEAD~1..HEAD`。只有一个位置参数且不是选项时作为 range。
- 用 `git rev-list --no-merges <range>` 枚举 commit，merge commit 不检查。
- 每个 commit 必须有行首 `Refs:` 或 `Nervd-Skip:`。
- 只有一个 commit 的仓库（根提交）默认 range 自动退化为 `HEAD`，
  避免 `HEAD~1` 不存在导致误报。
- 空仓库、空 range（`HEAD..HEAD`）→ exit 0 并提示无需检查。
- 不联网、不依赖 jq。

### 5.2 squash / MR 描述

```bash
./scripts/check-commit-attribution.sh origin/master...HEAD \
  --allow-mr-refs /tmp/mr-description.txt
```

`--allow-mr-refs` 的语义：某个 commit 缺 `Refs` 时，如果文件内容**任意位置**
含 `Refs:`，该 commit 视为通过。它只用于 squash merge / MR 描述兜底，
普通分支提交不要把 MR 描述文件当作万能通行证。

### 5.3 退出码与输出

| 码 | 含义 |
|---|---|
| `0` | 全部通过（或 range 内没有非 merge commit） |
| `1` | 至少一个 commit 缺归属 trailer |
| `2` | 用法错误、range 无法解析、MR 描述文件不存在/不可读、非 git 目录 |

违规时输出短 SHA、作者、缺失的 trailer 类型和修复提示。CI 日志中可直接
定位到 commit。

示例：

```text
✗ 8abf3e8  Alice
  缺少 `Refs: <工作项编号>` 或 `Nervd-Skip: true` trailer。
  修复（未推送）：...
  修复（已推送）：...
```

## 6. commit-msg hook（fill / enforce / off）

nervd 应用负责安装钩子；脚本本身不修改 `.git/hooks/`。钩子模式：

| 模式 | 行为 |
|---|---|
| `fill`（默认） | 缺 `Refs` 时自动补，不阻断；补不到就放行 |
| `enforce` | 缺 `Refs` / `Nervd-Skip` 时阻断提交 |
| `off` | 不干预 |

`fill` 的参考逻辑（**示意，不是要手动创建的交付文件**）：

```sh
#!/bin/sh
# .git/hooks/commit-msg（mode=fill）
msg_file=$1
grep -q '^Refs:' "$msg_file" && exit 0
grep -q '^Nervd-Skip:' "$msg_file" && exit 0

root=$(git rev-parse --show-toplevel) || exit 0
active=$(sh "$root/scripts/read-active-workitem.sh" "$root") || exit 0
[ -n "$active" ] || exit 0
eval "$active"
[ -n "${IDENTIFIER:-}" ] || exit 0

{
    printf '\nRefs: %s\n' "$IDENTIFIER"
    [ -n "${PARENT_IDENTIFIER:-}" ] && printf 'Req: %s\n' "$PARENT_IDENTIFIER"
} >>"$msg_file"
exit 0
```

注意：

- 钩子是**便利层**，不是安全边界。`--no-verify`、`git commit --no-verify`
  或直接写 commit 对象都能绕过。
- `fill` 不阻断，所以缺上下文时不会替 Agent 猜编号；CI 仍会失败。
- `enforce` 也不能替代 CI：钩子只在本机、只在该 clone 生效。
- 自动补的 `Refs` 可能来自过期的 active 文件；并行任务必须显式传参。

## 7. CI 接线

CI 必须对每次 push / MR 运行同一个检查脚本，并把它设为**合并前置条件**。
不要加 `|| true`，不要只打印警告。

### 7.1 GitHub Actions

```yaml
name: attribution
on:
  pull_request:
  push:
    branches: [master, main]

jobs:
  attribution:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Check commit attribution
        env:
          BASE_REF: ${{ github.base_ref }}
          BEFORE_SHA: ${{ github.event.before }}
        run: |
          set -eu
          if [ -n "${BASE_REF:-}" ]; then
            git fetch --no-tags origin "refs/heads/${BASE_REF}:refs/remotes/origin/${BASE_REF}"
            ./scripts/check-commit-attribution.sh "origin/${BASE_REF}...HEAD"
          elif [ -n "${BEFORE_SHA:-}" ] && [ "${BEFORE_SHA}" != "0000000000000000000000000000000000000000" ]; then
            ./scripts/check-commit-attribution.sh "${BEFORE_SHA}..HEAD"
          else
            ./scripts/check-commit-attribution.sh HEAD~1..HEAD
          fi
```

然后在 GitHub 分支保护里把 `attribution` job 设为 required check。
`fetch-depth: 0` 或显式 fetch base 是必须的，否则浅克隆会让 range 为空。

**squash 的两种做法（二选一）：**

1. **推荐：让 squash commit 自己保留 `Refs`。** GitHub 仓库设置里把
   “Squash commit message”设为 *Pull request title and description*，
   并在 MR 描述里写 `Refs:`；上面的严格检查即可通过，不需要放行参数。
2. **兜底：用 PR 描述放行。** 仅在团队接受“该 PR 内所有 commit 都可依赖
   描述里的 `Refs:`”时使用，把上面的严格检查步骤**替换**为：

   ```yaml
   - name: Write PR body
     if: github.event_name == 'pull_request'
     run: jq -r '.pull_request.body // ""' "$GITHUB_EVENT_PATH" > "$RUNNER_TEMP/mr-body.txt"

   - name: Check commit attribution (allow MR body)
     if: github.event_name == 'pull_request'
     run: |
       set -eu
       BASE_REF="${{ github.base_ref }}"
       git fetch --no-tags origin "refs/heads/${BASE_REF}:refs/remotes/origin/${BASE_REF}"
       ./scripts/check-commit-attribution.sh "origin/${BASE_REF}...HEAD" \
         --allow-mr-refs "$RUNNER_TEMP/mr-body.txt"
   ```

   `jq` 只出现在 CI 示例里；`scripts/*.sh` 本身不依赖 jq。不要先跑严格
   步骤再跑放行步骤——严格步骤失败后 job 已经终止。

### 7.2 云效 Codeup / Flow

在 Flow 流水线的「自定义任务 / 命令行」步骤中执行。变量名以 Codeup
控制台为准，下面用 `TARGET_BRANCH` 表示 MR 目标分支：

```sh
set -eu

git fetch --no-tags origin \
  "+refs/heads/${TARGET_BRANCH}:refs/remotes/origin/${TARGET_BRANCH}"

./scripts/check-commit-attribution.sh "origin/${TARGET_BRANCH}...HEAD"
```

squash / 合并请求场景，先用 Flow 的 MR 信息步骤（或 OpenAPI）把描述写到
文件，再传：

```sh
./scripts/check-commit-attribution.sh "origin/${TARGET_BRANCH}...HEAD" \
  --allow-mr-refs "$MR_DESCRIPTION_FILE"
```

把该步骤设为合并请求的卡点 / 必过检查；不要只在定时流水线里跑。
Codeup 的 `git clone` 可能较浅，务必先 fetch 目标分支。

### 7.3 Jenkins

多分支 Job / GitHub Branch Source 可用 `CHANGE_TARGET`；其他来源请替换为
实际目标分支变量：

```groovy
pipeline {
  agent any
  stages {
    stage('Commit attribution') {
      steps {
        sh '''
          set -eu
          BASE="${CHANGE_TARGET:-master}"
          git fetch --no-tags origin \
            "+refs/heads/${BASE}:refs/remotes/origin/${BASE}"
          ./scripts/check-commit-attribution.sh "origin/${BASE}...HEAD"
        '''
      }
    }
  }
}
```

squash 场景：

```groovy
sh '''
  set -eu
  BASE="${CHANGE_TARGET:-master}"
  ./scripts/check-commit-attribution.sh "origin/${BASE}...HEAD" \
    --allow-mr-refs "$WORKSPACE/mr-description.txt"
'''
```

`mr-description.txt` 由 MR 插件或 webhook 步骤生成；不要假设 Jenkins 默认
有该文件。若使用 GitHub App，记得把该 stage 的状态设为 required。

## 8. 并行 Agent 与 git worktree

推荐一个任务一个 worktree，一个 worktree 只有一个写入者：

```bash
git worktree add ../nervd-task-202 -b feature/req-101-task-202 main
cd ../nervd-task-202

# 每个 worktree 自己的 .nervd，不要从主 worktree 复制
mkdir -p .nervd
cat > .nervd/active-workitem.json <<'JSON'
{"identifier":"TASK-202","parentIdentifier":"REQ-101","category":"Task"}
JSON

./scripts/agent-commit.sh --workitem TASK-202 --req REQ-101 \
  -m "fix(peek): ..."
```

建议：

1. **并行任务必须显式传 `--workitem` / `--req`**，不要依赖共享的 active
   文件或分支推断。
2. `.nervd/` 在 worktree 根目录，天然隔离；不要把它放到共享目录。
3. 同一 worktree 不要同时跑两个 Agent（index.lock / 暂存区冲突）。
4. 分支名带编号只是辅助推断；任务与父需求仍以显式参数为准。
5. 任务完成后 `git worktree remove <path>`，避免残留 active 状态被复用。
6. 一个 commit 只包含一个任务；跨任务拆 commit，`Refs` 第一个为主。

## 9. 失败处理表

| 症状 | 原因 | 处理 |
|---|---|---|
| `agent-commit: 未找到工作项上下文` | 无 active、分支无编号、也没传 `--workitem` | 显式传 `--workitem` / `--req`；确认不是猜编号 |
| `check` 列出某个短 SHA | 该 commit 缺 `Refs:` / `Nervd-Skip:` | 未推送可 amend；已推送新增提交或 revert，不要改写历史 |
| squash 后 CI 报缺 Refs | squash commit 只保留标题，MR 描述没写 `Refs:` | 在 MR 描述补 `Refs:`；CI 加 `--allow-mr-refs` |
| 用了 `--no-verify` 导致缺 trailer | 钩子被绕过 | 停止使用；新增带 trailer 的提交，并改用 enforce 钩子 |
| CI 提示 range 为空 / 看不到 commit | 浅克隆、没 fetch base | `fetch-depth: 0` 或显式 fetch 目标分支 |
| `无法解析 range` | base ref 不存在或拼写错误 | 先 `git fetch`，再确认 `origin/<base>` |
| `Refs:` 写了但不正确 | active 文件过期、分支推断错 | 修正 active；未推送 amend；已推送在 MR 说明并用新提交修正 |
| 编号在云效不存在 / 跨空间解析失败 | 脚本只校验格式，不解析存在性 | 不阻塞提交；由应用「待归属」队列处理，不要猜编号 |
| 一个 commit 含多个任务 | 提交粒度过大 | 拆分；无法拆时 `Refs` 列出全部，第一个为主 |
| `--allow-mr-refs` 误放行 | 文件里任意 `Refs:` 都会被视为通过 | 只在 squash/MR 检查使用；普通 push 不要传 |

## 10. 边界与已知限制

- `read-active-workitem.sh` 用 sed 提取扁平字符串字段，不是完整 JSON 解析器；
  字段值包含转义双引号时不会正确解析。工作项编号/类别是简单字符串，
  该限制可接受；解析失败会表现为无上下文，`agent-commit.sh` 会 exit 2，
  不会静默猜编号。
- 分支编号提取使用 `grep -oE`（macOS / Linux / Git Bash 均支持），
  非 POSIX 但符合本项目三平台基线。
- 所有脚本只做**格式/位置**校验，不联网验证工作项是否存在；
  「待归属」由应用侧同步与解析负责。
- 本地 commit-msg hook 与 `agent-commit.sh` 都是便利层；唯一不可绕过的
  门禁是 CI 上的 `check-commit-attribution.sh`（以及分支保护 / 合并卡点）。
- 脚本不自动 stage、不自动 push、不修改 `.git/hooks/`。
- `--allow-mr-refs` 是 squash 兜底，不应成为常规放行手段。

## 11. 验收命令

```bash
# shellcheck 可选；未安装则跳过
command -v shellcheck >/dev/null && shellcheck scripts/*.sh || true

# POSIX 语法检查
sh -n scripts/read-active-workitem.sh scripts/agent-commit.sh scripts/check-commit-attribution.sh

# 回归测试（各自创建临时 git 仓库并清理）
sh scripts/test-read-active-workitem.sh
sh scripts/test-agent-commit.sh
sh scripts/test-check-attribution.sh
```

测试覆盖：

- `test-read-active-workitem.sh`：JSON / 子目录 / eval / JSON 优先 / 旧格式 /
  CRLF / 缺失文件 / 非 git 目录。
- `test-agent-commit.sh`：无上下文 exit 2 / 显式工作项 / active JSON / 旧格式 /
  分支推断 / 已有 Refs 不重复 / 已有 Skip / `--skip` / `--dry-run` /
  多行消息 / 拒绝 `--no-verify` / `--req` 覆盖 / 多个 `-m`。
- `test-check-attribution.sh`：合规通过 / 缺 Refs 失败且输出 SHA+作者 /
  默认 range / 根提交退化 / merge 忽略 / `--allow-mr-refs` / 空 range /
  非法 range / 空仓库。