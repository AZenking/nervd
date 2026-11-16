#!/bin/sh
# check-commit-attribution.sh 回归测试（POSIX sh，临时 git 仓库）。
set -u

TEST_DIR=$(CDPATH= cd -P -- "$(dirname -- "$0")" && pwd -P) || exit 2
CHECK="$TEST_DIR/check-commit-attribution.sh"
TMP=$(mktemp -d "${TMPDIR:-/tmp}/nervd-test-check-attribution.XXXXXX") || exit 1
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

assert_contains() {
    case $RUN_OUTPUT in
        *"$2"*) pass "$1" ;;
        *) fail "$1" "missing [$2] in [$RUN_OUTPUT]" ;;
    esac
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

commit_msg() {
    # commit_msg <repo> <git commit args...>
    _repo=$1
    shift
    (cd "$_repo" && git commit -q --allow-empty "$@")
}

commit_as_alice() {
    # commit_as_alice <repo> <git commit args...>
    _repo=$1
    shift
    (cd "$_repo" &&
        GIT_AUTHOR_NAME=Alice \
            GIT_AUTHOR_EMAIL=alice@example.com \
            GIT_COMMITTER_NAME=Alice \
            GIT_COMMITTER_EMAIL=alice@example.com \
            git commit -q --allow-empty "$@")
}

check() {
    _repo=$1
    shift
    run "$_repo" sh "$CHECK" "$@"
}

# ---------------------------------------------------------------------------
# 1. 主仓库：合规 / 违规 / allow-mr-refs / 空 range / 非法 range。
REPO="$TMP/check repo with space"
init_repo "$REPO" || {
    printf 'FAIL: 无法初始化测试仓库\n'
    exit 1
}

commit_msg "$REPO" -m 'chore: base' -m 'Refs: REQ-1'
BASE=$(git -C "$REPO" rev-parse HEAD)

commit_msg "$REPO" -m 'feat: good' -m 'Refs: TASK-2'
GOOD=$(git -C "$REPO" rev-parse HEAD)

check "$REPO" "$BASE..HEAD"
assert_status '合规 commit：exit 0' 0
assert_contains '合规 commit：通过提示' '通过'

check "$REPO"
assert_status '默认 range：exit 0' 0

commit_as_alice "$REPO" -m 'fix: missing attribution'
BAD_SHORT=$(git -C "$REPO" rev-parse --short HEAD)

check "$REPO" "$GOOD..HEAD"
assert_status '缺 Refs：exit 1' 1
assert_contains '缺 Refs：输出短 SHA' "$BAD_SHORT"
assert_contains '缺 Refs：输出作者' 'Alice'
assert_contains '缺 Refs：输出修复提示' 'Refs:'
assert_contains '缺 Refs：提示提交前自检' '自检'

check "$REPO"
assert_status '默认 range 命中违规：exit 1' 1

MR_OK="$TMP/mr desc with space.txt"
printf 'squash body\n\nRefs: REQ-9\n' >"$MR_OK"
check "$REPO" "$GOOD..HEAD" --allow-mr-refs "$MR_OK"
assert_status '--allow-mr-refs 命中：exit 0' 0
assert_contains '--allow-mr-refs：说明放行来源' 'MR 描述'

check "$REPO" "$GOOD..HEAD" "--allow-mr-refs=$MR_OK"
assert_status '--allow-mr-refs=file：exit 0' 0

MR_BAD="$TMP/mr without refs.txt"
printf 'squash body without trailer\n' >"$MR_BAD"
check "$REPO" "$GOOD..HEAD" --allow-mr-refs "$MR_BAD"
assert_status '--allow-mr-refs 无 Refs：exit 1' 1

check "$REPO" "$GOOD..HEAD" --allow-mr-refs "$TMP/not-exist.txt"
assert_status '--allow-mr-refs 文件缺失：exit 2' 2

check "$REPO" 'HEAD..HEAD'
assert_status '空 range：exit 0' 0
assert_contains '空 range：提示无需检查' '没有非 merge commit'

check "$REPO" 'origin/does-not-exist..HEAD'
assert_status '非法 range：exit 2' 2
assert_contains '非法 range：说明无法解析' '无法解析 range'

check "$REPO" HEAD "$GOOD"
assert_status '多个 range 参数：exit 2' 2

check "$REPO" --bogus
assert_status '未知选项：exit 2' 2

# 单独验证 Nervd-Skip 通过。
PREV=$(git -C "$REPO" rev-parse HEAD)
commit_msg "$REPO" -m 'chore: skip attribution' -m 'Nervd-Skip: true'
check "$REPO" "$PREV..HEAD"
assert_status 'Nervd-Skip commit：exit 0' 0

# 2. 空仓库：默认 range 应 exit 0 并提示。
EMPTY="$TMP/empty repo"
init_repo "$EMPTY" || exit 1
check "$EMPTY"
assert_status '空仓库：exit 0' 0
assert_contains '空仓库：提示还没有 commit' '还没有 commit'

# 3. 只有根提交：默认 range 自动退化，不应因 HEAD~1 不存在而报错。
SINGLE="$TMP/single commit repo"
init_repo "$SINGLE" || exit 1
commit_msg "$SINGLE" -m 'feat: root' -m 'Refs: REQ-1'
check "$SINGLE"
assert_status '根提交默认 range：exit 0' 0

# 4. merge commit 被忽略（merge 自身无 Refs，但非 merge 提交合规）。
MERGE="$TMP/merge repo"
init_repo "$MERGE" || exit 1
commit_msg "$MERGE" -m 'chore: merge base' -m 'Refs: REQ-1'
MBASE=$(git -C "$MERGE" rev-parse HEAD)
(cd "$MERGE" && git checkout -q -b feature)
commit_msg "$MERGE" -m 'feat: feature' -m 'Refs: TASK-2'
(cd "$MERGE" && git checkout -q main)
(cd "$MERGE" && git merge -q --no-ff feature -m "Merge branch 'feature'")

PARENTS=$(git -C "$MERGE" log -1 --format=%P)
case $PARENTS in
    *' '*) pass 'merge 场景：确实创建了 merge commit' ;;
    *) fail 'merge 场景：确实创建了 merge commit' "parents=[$PARENTS]" ;;
esac

check "$MERGE" "$MBASE..HEAD"
assert_status 'merge commit 无 Refs：exit 0（--no-merges）' 0
assert_contains 'merge commit 无 Refs：非 merge 提交通过' '通过'

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
exit 0