#!/bin/sh
# agent-commit.sh 回归测试（POSIX sh，临时 git 仓库）。
set -u

TEST_DIR=$(CDPATH= cd -P -- "$(dirname -- "$0")" && pwd -P) || exit 2
AGENT="$TEST_DIR/agent-commit.sh"
TMP=$(mktemp -d "${TMPDIR:-/tmp}/nervd-test-agent-commit.XXXXXX") || exit 1
trap 'rm -rf "$TMP"' 0 1 2 3 15

PASS=0
FAIL=0

pass() {
    PASS=$((PASS + 1))
    printf 'PASS: %s\n' "$1"
}

fail() {
    FAIL=$((FAIL + 1))
    printf 'FAIL: %s\n' "$1"
    if [ "$#" -ge 2 ]; then
        printf '      %s\n' "$2"
    fi
}

RUN_STATUS=0
RUN_OUTPUT=
run() {
    _run_dir=$1
    shift
    RUN_OUTPUT=$(cd "$_run_dir" && "$@" 2>&1)
    RUN_STATUS=$?
}

assert_status() {
    if [ "$RUN_STATUS" -eq "$2" ]; then
        pass "$1"
    else
        fail "$1" "exit=$RUN_STATUS expected=$2 output=$RUN_OUTPUT"
    fi
}

assert_eq() {
    if [ "$2" = "$3" ]; then
        pass "$1"
    else
        fail "$1" "expected [$3] got [$2]"
    fi
}

assert_contains() {
    case $RUN_OUTPUT in
        *"$2"*) pass "$1" ;;
        *) fail "$1" "missing [$2] in [$RUN_OUTPUT]" ;;
    esac
}

assert_msg_contains() {
    case $2 in
        *"$3"*) pass "$1" ;;
        *) fail "$1" "commit message missing [$3]: [$2]" ;;
    esac
}

assert_msg_not_contains() {
    case $2 in
        *"$3"*) fail "$1" "commit message unexpectedly contains [$3]: [$2]" ;;
        *) pass "$1" ;;
    esac
}

assert_msg_line_count() {
    _count=$(printf '%s\n' "$2" | grep -c "$3")
    if [ "$_count" -eq "$4" ]; then
        pass "$1"
    else
        fail "$1" "line count for [$3] = $_count, expected $4; message=[$2]"
    fi
}

assert_count_unchanged() {
    _now=$(commit_count)
    if [ "$_now" -eq "$2" ]; then
        pass "$1"
    else
        fail "$1" "commit count changed: $2 -> $_now"
    fi
}

init_repo() {
    _repo=$1
    mkdir -p "$_repo" || return 1
    if git init -q -b main "$_repo" 2>/dev/null; then
        :
    else
        git init -q "$_repo" || return 1
        git -C "$_repo" symbolic-ref HEAD refs/heads/main || return 1
    fi
    mkdir -p "$TMP/empty-hooks"
    git -C "$_repo" config user.name 'Agent F Test'
    git -C "$_repo" config user.email 'agent-f@example.com'
    git -C "$_repo" config commit.gpgsign false
    git -C "$_repo" config core.hooksPath "$TMP/empty-hooks"
}

git_dir() {
    git -C "$1" rev-parse --absolute-git-dir 2>/dev/null ||
        {
            _gd=$(git -C "$1" rev-parse --git-dir 2>/dev/null) || return 1
            case $_gd in
                /*) printf '%s\n' "$_gd" ;;
                *) (CDPATH= cd -P -- "$1" && CDPATH= cd -P -- "$_gd" && pwd -P) ;;
            esac
        }
}

commit_count() {
    git -C "$REPO" rev-list --count HEAD 2>/dev/null || printf '0\n'
}

last_msg() {
    git -C "$REPO" log -1 --format=%B
}

agent() {
    run "$REPO" sh "$AGENT" "$@"
}

write_active() {
    _id=$1
    _parent=${2:-}
    mkdir -p "$REPO/.nervd"
    if [ -n "$_parent" ]; then
        cat >"$REPO/.nervd/active-workitem.json" <<JSON
{"repoId":1,"workitemId":"10","identifier":"$_id","category":"Task","parentWorkitemId":"20","parentIdentifier":"$_parent","updatedAt":1700000000}
JSON
    else
        cat >"$REPO/.nervd/active-workitem.json" <<JSON
{"repoId":1,"workitemId":"10","identifier":"$_id","category":"Task","updatedAt":1700000000}
JSON
    fi
}

write_legacy() {
    _gd=$(git_dir "$REPO") || return 1
    printf '%s\n%s\n%s\n%s\n' "$1" "$2" "$3" "$4" >"$_gd/nervd-active-workitem"
}

clear_context() {
    rm -rf "$REPO/.nervd"
    _gd=$(git_dir "$REPO") || _gd=
    if [ -n "$_gd" ]; then
        rm -f "$_gd/nervd-active-workitem"
    fi
    (cd "$REPO" && git checkout -q main 2>/dev/null) || true
}

# ---------------------------------------------------------------------------
REPO="$TMP/repo with space"
init_repo "$REPO" || {
    printf 'FAIL: 无法初始化测试仓库\n'
    exit 1
}
(cd "$REPO" && git commit -q --allow-empty -m 'chore: init' -m 'Nervd-Skip: true') || {
    printf 'FAIL: 无法创建初始提交\n'
    exit 1
}

# 1. 无任何上下文：拒绝提交，exit 2，不产生 commit。
BEFORE=$(commit_count)
agent -m 'fix: no context'
assert_status '无上下文：exit 2' 2
assert_contains '无上下文：给出 --workitem 示例' '--workitem'
assert_contains '无上下文：给出 --skip 示例' '--skip'
assert_count_unchanged '无上下文：不产生 commit' "$BEFORE"

# 2. 显式 --workitem + --req。
agent -m 'feat: explicit' --workitem TASK-123 --req REQ-100 -- --allow-empty
assert_status '显式工作项：exit 0' 0
MSG=$(last_msg)
assert_msg_contains '显式工作项：Refs' "$MSG" 'Refs: TASK-123'
assert_msg_contains '显式工作项：Req' "$MSG" 'Req: REQ-100'
assert_msg_line_count '显式工作项：Refs 只出现一次' "$MSG" '^Refs:' 1
assert_msg_line_count '显式工作项：Req 只出现一次' "$MSG" '^Req:' 1

# 2b. --workitem=ID / --req=ID 等号形式。
agent -m 'feat: equals form' --workitem=TASK-124 --req=REQ-101 -- --allow-empty
assert_status '等号形式：exit 0' 0
MSG=$(last_msg)
assert_msg_contains '等号形式：Refs' "$MSG" 'Refs: TASK-124'
assert_msg_contains '等号形式：Req' "$MSG" 'Req: REQ-101'

# 3. active JSON 自动补 Refs/Req。
write_active TASK-456 REQ-123
agent -m 'fix: active json' -- --allow-empty
assert_status 'active JSON：exit 0' 0
MSG=$(last_msg)
assert_msg_contains 'active JSON：Refs' "$MSG" 'Refs: TASK-456'
assert_msg_contains 'active JSON：Req' "$MSG" 'Req: REQ-123'

# 3b. 从子目录调用：仍以仓库根定位 active 文件。
mkdir -p "$REPO/sub dir"
run "$REPO/sub dir" sh "$AGENT" -m 'fix: from subdir' -- --allow-empty
assert_status '子目录调用：exit 0' 0
MSG=$(last_msg)
assert_msg_contains '子目录调用：Refs' "$MSG" 'Refs: TASK-456'
assert_msg_contains '子目录调用：Req' "$MSG" 'Req: REQ-123'

# 4. 显式 --workitem 优先于 active。
write_active TASK-111 REQ-111
agent -m 'fix: explicit wins' --workitem TASK-999 --req REQ-888 -- --allow-empty
assert_status '显式优先：exit 0' 0
MSG=$(last_msg)
assert_msg_contains '显式优先：使用显式 Refs' "$MSG" 'Refs: TASK-999'
assert_msg_not_contains '显式优先：不写 active Refs' "$MSG" 'TASK-111'
assert_msg_contains '显式优先：使用显式 Req' "$MSG" 'Req: REQ-888'

# 5. 旧格式 4 行文件兼容。
clear_context
write_legacy 'TASK-777' '777' 'REQ-700' '700'
agent -m 'fix: legacy active' -- --allow-empty
assert_status '旧格式 active：exit 0' 0
MSG=$(last_msg)
assert_msg_contains '旧格式 active：Refs' "$MSG" 'Refs: TASK-777'
assert_msg_contains '旧格式 active：Req' "$MSG" 'Req: REQ-700'

# 6. 分支名推断（取最后一个编号，统一大写）。
clear_context
(cd "$REPO" && git checkout -q -b feature/req-777)
agent -m 'feat: branch fallback' -- --allow-empty
assert_status '分支推断：exit 0' 0
MSG=$(last_msg)
assert_msg_contains '分支推断：req-777 -> REQ-777' "$MSG" 'Refs: REQ-777'
assert_msg_line_count '分支推断：无 Req' "$MSG" '^Req:' 0

# 6b. 分支名有多个编号：取最后一个。
(cd "$REPO" && git checkout -q -b feature/req-100-task-200)
agent -m 'feat: branch last id' -- --allow-empty
assert_status '分支多编号：exit 0' 0
MSG=$(last_msg)
assert_msg_contains '分支多编号：取最后一个并大写' "$MSG" 'Refs: TASK-200'
assert_msg_not_contains '分支多编号：不取第一个' "$MSG" 'REQ-100'

# 7. 消息已有 Refs：原样提交，不重复、不再补 Req。
agent -m 'fix: existing refs' -m 'Refs: REQ-42' -- --allow-empty
assert_status '已有 Refs：exit 0' 0
MSG=$(last_msg)
assert_msg_line_count '已有 Refs：不重复' "$MSG" '^Refs:' 1
assert_msg_contains '已有 Refs：保留原值' "$MSG" 'Refs: REQ-42'
assert_msg_line_count '已有 Refs：不追加 Req' "$MSG" '^Req:' 0

# 8. 消息已有 Nervd-Skip：原样提交，不补 Refs。
agent -m 'chore: existing skip' -m 'Nervd-Skip: true' -- --allow-empty
assert_status '已有 Skip：exit 0' 0
MSG=$(last_msg)
assert_msg_line_count '已有 Skip：保留一次' "$MSG" '^Nervd-Skip:' 1
assert_msg_line_count '已有 Skip：不补 Refs' "$MSG" '^Refs:' 0

# 9. --skip（无上下文）。
clear_context
agent --skip -m 'chore(deps): bump' -- --allow-empty
assert_status '--skip 无上下文：exit 0' 0
MSG=$(last_msg)
assert_msg_contains '--skip：写入 Nervd-Skip: true' "$MSG" 'Nervd-Skip: true'
assert_msg_line_count '--skip：不写 Refs' "$MSG" '^Refs:' 0
assert_msg_line_count '--skip：不写 Req' "$MSG" '^Req:' 0

# 10. --skip 抑制自动推断（active 存在也不归属）。
write_active TASK-555 REQ-555
agent --skip -m 'chore(fmt): format only' -- --allow-empty
assert_status '--skip + active：exit 0' 0
MSG=$(last_msg)
assert_msg_contains '--skip + active：写入 Skip' "$MSG" 'Nervd-Skip: true'
assert_msg_line_count '--skip + active：不自动写 Refs' "$MSG" '^Refs:' 0

# 11. --dry-run：只打印消息，不产生 commit。
clear_context
BEFORE=$(commit_count)
agent -m 'chore: dry run' --workitem REQ-9 --dry-run
assert_status '--dry-run：exit 0' 0
EXPECTED_DRY=$(printf 'chore: dry run\n\nRefs: REQ-9')
assert_eq '--dry-run：仅输出最终消息' "$RUN_OUTPUT" "$EXPECTED_DRY"
assert_count_unchanged '--dry-run：不产生 commit' "$BEFORE"

# 12. 多行消息保留（单个 -m 内含换行，经临时文件传给 git commit -F）。
MULTILINE_MSG=$(printf 'fix: multiline\n\nbody line 1\nbody line 2')
agent -m "$MULTILINE_MSG" --workitem REQ-10 -- --allow-empty
assert_status '多行消息：exit 0' 0
MSG=$(last_msg)
assert_msg_contains '多行消息：保留第一行' "$MSG" 'body line 1'
assert_msg_contains '多行消息：保留第二行' "$MSG" 'body line 2'
assert_msg_contains '多行消息：补 Refs' "$MSG" 'Refs: REQ-10'

# 13. 禁止 --no-verify / -n。
BEFORE=$(commit_count)
agent -m 'fix: bypass' --workitem REQ-1 -- --no-verify
assert_status '拒绝 --no-verify：exit 2' 2
assert_contains '拒绝 --no-verify：说明原因' '禁止 --no-verify'
assert_count_unchanged '拒绝 --no-verify：不产生 commit' "$BEFORE"

agent -m 'fix: bypass' --workitem REQ-1 -- -n
assert_status '拒绝 -n：exit 2' 2
assert_count_unchanged '拒绝 -n：不产生 commit' "$BEFORE"

# 14. 显式 --req 覆盖 active parent。
write_active TASK-2 REQ-OLD
agent -m 'fix: req override' --workitem TASK-2 --req REQ-NEW -- --allow-empty
assert_status '--req 覆盖：exit 0' 0
MSG=$(last_msg)
assert_msg_contains '--req 覆盖：使用显式 Req' "$MSG" 'Req: REQ-NEW'
assert_msg_not_contains '--req 覆盖：不写 active parent' "$MSG" 'REQ-OLD'

# 15. 消息已有 Req：不重复追加。
agent -m 'fix: keep req' -m 'Req: REQ-KEEP' --workitem TASK-3 -- --allow-empty
assert_status '已有 Req：exit 0' 0
MSG=$(last_msg)
assert_msg_contains '已有 Req：补 Refs' "$MSG" 'Refs: TASK-3'
assert_msg_line_count '已有 Req：不重复' "$MSG" '^Req:' 1
assert_msg_contains '已有 Req：保留原值' "$MSG" 'Req: REQ-KEEP'
assert_msg_not_contains '已有 Req：不写 active parent' "$MSG" 'REQ-OLD'

# 16. 无上下文但消息已有 Refs：仍可提交。
clear_context
agent -m 'fix: refs only' -m 'Refs: REQ-55' -- --allow-empty
assert_status '无上下文 + 已有 Refs：exit 0' 0
MSG=$(last_msg)
assert_msg_contains '无上下文 + 已有 Refs：保留 Refs' "$MSG" 'Refs: REQ-55'

# 17. 多个 -m 按空行拼接。
agent -m 'fix: multi m' -m 'second paragraph' --workitem REQ-11 -- --allow-empty
assert_status '多个 -m：exit 0' 0
MSG=$(last_msg)
assert_msg_contains '多个 -m：保留第二段' "$MSG" 'second paragraph'
assert_msg_contains '多个 -m：补 Refs' "$MSG" 'Refs: REQ-11'

# 18. 非 Conventional Commits 标题：拒绝提交，且 --skip 也不能绕过。
clear_context
BEFORE=$(commit_count)
agent -m 'update cashier' --workitem TASK-9
assert_status '非法标题：exit 2' 2
assert_contains '非法标题：提示 Conventional Commits' 'Conventional Commits'
assert_count_unchanged '非法标题：不产生 commit' "$BEFORE"

agent --skip -m 'update cashier'
assert_status '非法标题 + --skip：仍 exit 2' 2
assert_count_unchanged '非法标题 + --skip：不产生 commit' "$BEFORE"

agent -m 'fix legacy style' --workitem TASK-9
assert_status '缺少 type：exit 2' 2
assert_count_unchanged '缺少 type：不产生 commit' "$BEFORE"

# 19. 合法标题（scope / breaking change）通过。
agent -m 'feat(cashier)!: 接入易宝支付' --workitem TASK-9 -- --allow-empty
assert_status '合法 scoped 标题：exit 0' 0
MSG=$(last_msg)
assert_msg_contains '合法标题：补 Refs' "$MSG" 'Refs: TASK-9'
assert_msg_contains '合法标题：保留 breaking 标记' "$MSG" 'feat(cashier)!:'

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
exit 0