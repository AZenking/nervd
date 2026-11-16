#!/bin/sh
# 检查提交是否带变更归属 trailer（Refs: 或 Nervd-Skip:）。
#
# 用法：
#   check-commit-attribution.sh [<range>] [--allow-mr-refs <file>]
#
# 默认 range = HEAD~1..HEAD；无参数时检查最近一个非 merge commit。
# 只使用 git rev-list / git log，不联网、不依赖 jq。
#
# 退出码：
#   0  全部通过，或 range 内没有非 merge commit
#   1  存在缺少 Refs: / Nervd-Skip: 的 commit
#   2  用法错误、range 无法解析、MR 描述文件不可读
set -u

SCRIPT_DIR=$(CDPATH= cd -P -- "$(dirname -- "$0")" && pwd -P) || exit 2
. "$SCRIPT_DIR/lib-attribution.sh"

_usage() {
    cat <<'EOF'
用法: check-commit-attribution.sh [<range>] [--allow-mr-refs <file>]

  <range>                 git rev-list 范围，如 origin/master...HEAD
                          缺省 HEAD~1..HEAD
  --allow-mr-refs <file>  squash 场景：commit 缺 Refs 时，若该文件内容含
                          "Refs:" 则放行（通常是 MR / PR 描述文件）

每个非 merge commit 必须包含以行首开始的：
  Refs: <工作项编号>
或
  Nervd-Skip: true

退出码: 0 通过；1 归属缺失；2 用法 / range / 文件错误。
EOF
}

_range=
_range_set=0
_range_explicit=0
_allow_file=
_allow_set=0

while [ "$#" -gt 0 ]; do
    case $1 in
        -h | --help)
            _usage
            exit 0
            ;;
        --allow-mr-refs)
            [ "$#" -ge 2 ] || attribution_die "--allow-mr-refs 需要文件路径"
            _allow_file=$2
            _allow_set=1
            shift 2
            ;;
        --allow-mr-refs=*)
            _allow_file=${1#*=}
            _allow_set=1
            shift
            ;;
        --)
            shift
            while [ "$#" -gt 0 ]; do
                [ "$_range_set" -eq 0 ] || attribution_die "只能指定一个 range"
                _range=$1
                _range_set=1
                _range_explicit=1
                shift
            done
            ;;
        -*)
            attribution_die "未知选项: $1"
            ;;
        *)
            [ "$_range_set" -eq 0 ] || attribution_die "只能指定一个 range"
            _range=$1
            _range_set=1
            _range_explicit=1
            shift
            ;;
    esac
done

if [ "$_allow_set" -eq 1 ]; then
    [ -n "$_allow_file" ] || attribution_die "--allow-mr-refs 文件路径不能为空"
    [ -f "$_allow_file" ] || attribution_die "MR 描述文件不存在: $_allow_file"
    [ -r "$_allow_file" ] || attribution_die "MR 描述文件不可读: $_allow_file"
fi

git rev-parse --show-toplevel >/dev/null 2>&1 || attribution_die "当前目录不在 git 仓库内"

if [ "$_range_set" -eq 0 ]; then
    _range='HEAD~1..HEAD'
fi

# 空仓库（尚无 commit）没有可检查对象。
if ! git rev-parse --verify -q HEAD >/dev/null 2>&1; then
    printf 'check-commit-attribution: 仓库还没有 commit（range=%s），无需检查\n' "$_range"
    exit 0
fi

# 根提交没有 HEAD~1；默认 range 自动退化为 HEAD，避免误报。
if [ "$_range_explicit" -eq 0 ] &&
    ! git rev-parse --verify -q 'HEAD~1' >/dev/null 2>&1; then
    _range=HEAD
fi

if ! _commits=$(git rev-list --no-merges "$_range" 2>/dev/null); then
    attribution_die "无法解析 range: ${_range}（git rev-list 失败）"
fi

if [ -z "$_commits" ]; then
    printf 'check-commit-attribution: range 内没有非 merge commit（range=%s），无需检查\n' "$_range"
    exit 0
fi

_allow_has_refs=0
if [ "$_allow_set" -eq 1 ]; then
    if grep -q 'Refs:' "$_allow_file"; then
        _allow_has_refs=1
    fi
fi

_total=0
_violations=0
_mr_allowed=0

# shellcheck disable=SC2086  # git rev-list 只输出 16 进制 SHA，无空格/通配符
for _sha in $_commits; do
    _total=$((_total + 1))
    _msg=$(git log -1 --format=%B "$_sha" 2>/dev/null) || _msg=

    _ok=0
    if printf '%s\n' "$_msg" | grep -q '^Refs:'; then
        _ok=1
    fi
    if [ "$_ok" -eq 0 ] && printf '%s\n' "$_msg" | grep -q '^Nervd-Skip:'; then
        _ok=1
    fi
    if [ "$_ok" -eq 0 ] && [ "$_allow_has_refs" -eq 1 ]; then
        _ok=1
        _mr_allowed=$((_mr_allowed + 1))
    fi

    if [ "$_ok" -eq 1 ]; then
        continue
    fi

    _violations=$((_violations + 1))
    _short=$(git log -1 --format=%h "$_sha" 2>/dev/null) || _short=$_sha
    _author=$(git log -1 --format=%an "$_sha" 2>/dev/null) || _author=unknown

    printf '✗ %s  %s\n' "$_short" "$_author"
    printf '  缺少 `Refs: <工作项编号>` 或 `Nervd-Skip: true` trailer。\n'
    printf '  修复（未推送）：git commit --amend 补 trailer，或用\n'
    printf '    ./scripts/agent-commit.sh --workitem REQ-123 --req REQ-100 -m "..."\n'
    printf '  修复（已推送）：不要 amend / rebase，新增一个带 Refs 的提交或在 MR 描述写 Refs:。\n'
    printf '  squash 场景：让 MR 描述包含 `Refs: ...`，CI 加 --allow-mr-refs <描述文件>。\n\n'
done

if [ "$_violations" -gt 0 ]; then
    printf 'check-commit-attribution: 失败：%d/%d 个非 merge commit 缺少归属 trailer（range=%s）\n' \
        "$_violations" "$_total" "$_range"
    printf '注意：--no-verify 能绕过本地钩子，但仍应使用本检查做提交前自检。\n'
    exit 1
fi

if [ "$_mr_allowed" -gt 0 ]; then
    printf 'check-commit-attribution: 通过（%d 个非 merge commit，range=%s；%d 个缺 Refs 的 commit 由 MR 描述放行）\n' \
        "$_total" "$_range" "$_mr_allowed"
else
    printf 'check-commit-attribution: 通过（%d 个非 merge commit，range=%s）\n' \
        "$_total" "$_range"
fi
exit 0