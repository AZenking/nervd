#!/bin/sh
# read-active-workitem.sh 回归测试（POSIX sh，临时 git 仓库）。
set -u

TEST_DIR=$(CDPATH= cd -P -- "$(dirname -- "$0")" && pwd -P) || exit 2
READ="$TEST_DIR/read-active-workitem.sh"
TMP=$(mktemp -d "${TMPDIR:-/tmp}/nervd-test-read.XXXXXX") || exit 1
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

assert_output() {
    if [ "$RUN_OUTPUT" = "$2" ]; then
        pass "$1"
    else
        fail "$1" "expected [$2] got [$RUN_OUTPUT]"
    fi
}

assert_contains() {
    case $RUN_OUTPUT in
        *"$2"*) pass "$1" ;;
        *) fail "$1" "missing [$2] in [$RUN_OUTPUT]" ;;
    esac
}

assert_empty() {
    if [ -z "$RUN_OUTPUT" ]; then
        pass "$1"
    else
        fail "$1" "expected empty output, got [$RUN_OUTPUT]"
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

write_json() {
    mkdir -p "$1/.nervd"
    cat >"$1/.nervd/active-workitem.json" <<'JSON'
{
  "repoId": 42,
  "workitemId": "123456",
  "identifier": "TASK-456",
  "category": "Task",
  "parentWorkitemId": "100001",
  "parentIdentifier": "REQ-123",
  "updatedAt": 1700000000
}
JSON
}

# ---------------------------------------------------------------------------
REPO="$TMP/repo with space"
init_repo "$REPO" || {
    printf 'FAIL: 无法初始化测试仓库\n'
    exit 1
}
mkdir -p "$REPO/sub dir"

write_json "$REPO"
EXPECTED=$(printf 'IDENTIFIER=TASK-456\nWORKITEM_ID=123456\nPARENT_IDENTIFIER=REQ-123\nPARENT_WORKITEM_ID=100001\nCATEGORY=Task')

run "$REPO" sh "$READ" "$REPO"
assert_status 'JSON：exit 0' 0
assert_output 'JSON：字段顺序与值' "$EXPECTED"

run "$REPO/sub dir" sh "$READ"
assert_status '子目录调用：exit 0' 0
assert_output '子目录调用：自动解析仓库根' "$EXPECTED"

if eval "$RUN_OUTPUT" 2>/dev/null &&
    [ "${IDENTIFIER:-}" = 'TASK-456' ] &&
    [ "${PARENT_IDENTIFIER:-}" = 'REQ-123' ] &&
    [ "${CATEGORY:-}" = 'Task' ]; then
    pass '输出可直接 eval'
else
    fail '输出可直接 eval' "IDENTIFIER=${IDENTIFIER:-} PARENT_IDENTIFIER=${PARENT_IDENTIFIER:-}"
fi

# JSON 优先于旧格式。
GD=$(git_dir "$REPO") || GD=
if [ -n "$GD" ]; then
    printf 'REQ-OLD\n1\nREQ-OLDPARENT\n2\n' >"$GD/nervd-active-workitem"
    run "$REPO" sh "$READ" "$REPO"
    assert_status 'JSON 优先于旧格式：exit 0' 0
    case $RUN_OUTPUT in
        *'IDENTIFIER=TASK-456'*) pass 'JSON 优先于旧格式：取 JSON 值' ;;
        *) fail 'JSON 优先于旧格式：取 JSON 值' "got [$RUN_OUTPUT]" ;;
    esac
else
    fail '定位 git dir' 'git rev-parse 失败'
fi

# 旧格式 4 行 + CRLF。
rm -rf "$REPO/.nervd"
if [ -n "$GD" ]; then
    printf 'REQ-999\r\n888888\r\nREQ-100\r\n777777\r\n' >"$GD/nervd-active-workitem"
    run "$REPO" sh "$READ" "$REPO"
    assert_status '旧格式：exit 0' 0
    EXPECTED_LEGACY=$(printf 'IDENTIFIER=REQ-999\nWORKITEM_ID=888888\nPARENT_IDENTIFIER=REQ-100\nPARENT_WORKITEM_ID=777777\nCATEGORY=')
    assert_output '旧格式：4 行字段 + CRLF 清理' "$EXPECTED_LEGACY"
fi

# 缺失文件：空输出 + exit 0。
if [ -n "$GD" ]; then
    rm -f "$GD/nervd-active-workitem"
fi
run "$REPO" sh "$READ" "$REPO"
assert_status '缺失 active 文件：exit 0' 0
assert_empty '缺失 active 文件：无输出'

# 非 git 目录（无 .nervd）也应为空输出 exit 0。
NONGIT="$TMP/plain dir"
mkdir -p "$NONGIT"
run "$NONGIT" sh "$READ" "$NONGIT"
assert_status '非 git 目录：exit 0' 0
assert_empty '非 git 目录：无输出'

# 非 git 目录 + .nervd JSON：回退绝对路径。
write_json "$NONGIT"
run "$NONGIT" sh "$READ" "$NONGIT"
assert_status '非 git 目录 + JSON：exit 0' 0
assert_contains '非 git 目录 + JSON：可读取' 'IDENTIFIER=TASK-456'

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
exit 0