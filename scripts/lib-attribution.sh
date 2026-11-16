#!/bin/sh
# nervd 变更归属脚本共享函数（POSIX sh，无 jq 依赖）。
#
# 供以下脚本 source 使用：
#   scripts/read-active-workitem.sh
#   scripts/agent-commit.sh
#   scripts/check-commit-attribution.sh
#
# 约定：
#   - 所有函数只依赖 sh / sed / grep / tr / git；
#   - 单次调用不并发，内部临时变量统一使用 _attr_ 前缀；
#   - 读取 active workitem 后写入 ATTRIBUTION_* 全局变量，调用方按需读取。

# ---------------------------------------------------------------------------
# 基础工具
# ---------------------------------------------------------------------------

attribution_warn() {
    printf 'nervd-attribution: %s\n' "$*" >&2
}

attribution_die() {
    printf 'nervd-attribution: %s\n' "$*" >&2
    exit 2
}

# attribution_resolve_root [dir]
# 打印仓库根目录。优先 git 顶层目录；非 git 目录回退到绝对路径。
# dir 不存在时返回 1。
attribution_resolve_root() {
    _attr_dir=${1:-.}
    [ -d "$_attr_dir" ] || return 1
    if _attr_root=$(git -C "$_attr_dir" rev-parse --show-toplevel 2>/dev/null); then
        printf '%s\n' "$_attr_root"
    else
        (CDPATH= cd -P -- "$_attr_dir" 2>/dev/null && pwd -P)
    fi
}

# attribution_git_dir <root>
# 打印绝对 git dir（兼容 worktree）；失败返回 1。
attribution_git_dir() {
    if _attr_gd=$(git -C "$1" rev-parse --absolute-git-dir 2>/dev/null); then
        printf '%s\n' "$_attr_gd"
        return 0
    fi
    _attr_gd=$(git -C "$1" rev-parse --git-dir 2>/dev/null) || return 1
    case $_attr_gd in
        /*) printf '%s\n' "$_attr_gd" ;;
        *) (CDPATH= cd -P -- "$1" 2>/dev/null && CDPATH= cd -P -- "$_attr_gd" 2>/dev/null && pwd -P) ;;
    esac
}

# ---------------------------------------------------------------------------
# active workitem 读取
# ---------------------------------------------------------------------------

# attribution_json_string <file> <key>
# 用 sed 从 JSON 中提取字符串字段；字段缺失 / null 时输出空。
# JSON 先压平为一行，允许 pretty-print 的键值跨行。
attribution_json_string() {
    [ -f "$1" ] || return 1
    _attr_json_flat=$(tr -d '\r' < "$1" | tr '\n\t' '  ')
    printf '%s\n' "$_attr_json_flat" |
        sed -n 's/.*"'"$2"'"[[:space:]]*:[[:space:]]*"\([^"\\]*\)".*/\1/p' |
        head -n 1
}

# attribution_load_active <root>
# 读取 <root>/.nervd/active-workitem.json；缺失/无有效字段时回退旧格式
# <git-dir>/nervd-active-workitem（4 行：identifier / workitemId /
# parentIdentifier / parentWorkitemId）。
#
# 结果写入：
#   ATTRIBUTION_IDENTIFIER
#   ATTRIBUTION_WORKITEM_ID
#   ATTRIBUTION_PARENT_IDENTIFIER
#   ATTRIBUTION_PARENT_WORKITEM_ID
#   ATTRIBUTION_CATEGORY
#   ATTRIBUTION_SOURCE        json | legacy | 空
attribution_load_active() {
    ATTRIBUTION_IDENTIFIER=
    ATTRIBUTION_WORKITEM_ID=
    ATTRIBUTION_PARENT_IDENTIFIER=
    ATTRIBUTION_PARENT_WORKITEM_ID=
    ATTRIBUTION_CATEGORY=
    ATTRIBUTION_SOURCE=

    _attr_active_json="$1/.nervd/active-workitem.json"
    if [ -f "$_attr_active_json" ]; then
        ATTRIBUTION_IDENTIFIER=$(attribution_json_string "$_attr_active_json" identifier)
        ATTRIBUTION_WORKITEM_ID=$(attribution_json_string "$_attr_active_json" workitemId)
        ATTRIBUTION_PARENT_IDENTIFIER=$(attribution_json_string "$_attr_active_json" parentIdentifier)
        ATTRIBUTION_PARENT_WORKITEM_ID=$(attribution_json_string "$_attr_active_json" parentWorkitemId)
        ATTRIBUTION_CATEGORY=$(attribution_json_string "$_attr_active_json" category)
        if [ -n "$ATTRIBUTION_IDENTIFIER" ] || [ -n "$ATTRIBUTION_WORKITEM_ID" ]; then
            ATTRIBUTION_SOURCE=json
            return 0
        fi
    fi

    _attr_git_dir=$(attribution_git_dir "$1" 2>/dev/null) || _attr_git_dir=
    _attr_legacy=
    if [ -n "$_attr_git_dir" ]; then
        _attr_legacy="$_attr_git_dir/nervd-active-workitem"
    fi
    if [ -n "$_attr_legacy" ] && [ -f "$_attr_legacy" ]; then
        _attr_line_no=0
        while IFS= read -r _attr_line || [ -n "$_attr_line" ]; do
            _attr_line=$(printf '%s\n' "$_attr_line" | tr -d '\r')
            _attr_line_no=$((_attr_line_no + 1))
            case $_attr_line_no in
                1) ATTRIBUTION_IDENTIFIER=$_attr_line ;;
                2) ATTRIBUTION_WORKITEM_ID=$_attr_line ;;
                3) ATTRIBUTION_PARENT_IDENTIFIER=$_attr_line ;;
                4) ATTRIBUTION_PARENT_WORKITEM_ID=$_attr_line ;;
            esac
        done < "$_attr_legacy"
        if [ -n "$ATTRIBUTION_IDENTIFIER" ] || [ -n "$ATTRIBUTION_WORKITEM_ID" ]; then
            ATTRIBUTION_SOURCE=legacy
        else
            ATTRIBUTION_IDENTIFIER=
            ATTRIBUTION_WORKITEM_ID=
            ATTRIBUTION_PARENT_IDENTIFIER=
            ATTRIBUTION_PARENT_WORKITEM_ID=
        fi
    fi
    return 0
}

# attribution_print_active
# 输出 KEY=VALUE 行（可直接 eval / grep）；没有上下文时什么都不输出。
attribution_print_active() {
    [ -n "$ATTRIBUTION_SOURCE" ] || return 0
    printf 'IDENTIFIER=%s\n' "$ATTRIBUTION_IDENTIFIER"
    printf 'WORKITEM_ID=%s\n' "$ATTRIBUTION_WORKITEM_ID"
    printf 'PARENT_IDENTIFIER=%s\n' "$ATTRIBUTION_PARENT_IDENTIFIER"
    printf 'PARENT_WORKITEM_ID=%s\n' "$ATTRIBUTION_PARENT_WORKITEM_ID"
    printf 'CATEGORY=%s\n' "$ATTRIBUTION_CATEGORY"
}

# ---------------------------------------------------------------------------
# 分支 / 提交消息
# ---------------------------------------------------------------------------

# attribution_branch_identifier <root>
# 从当前分支名提取最后一个工作项编号（如 feature/req-101 → REQ-101）。
# 分支名中的编号统一转大写，与云效工作项编号（REQ-101 / TASK-202）一致。
attribution_branch_identifier() {
    _attr_branch=$(git -C "$1" symbolic-ref --short HEAD 2>/dev/null) || return 1
    [ -n "$_attr_branch" ] || return 1
    _attr_owner=$(printf '%s\n' "$_attr_branch" |
        grep -oE '[A-Za-z][A-Za-z0-9]{1,15}[-_][0-9]+' |
        tail -n 1)
    [ -n "$_attr_owner" ] || return 1
    printf '%s\n' "$_attr_owner" | tr '[:lower:]' '[:upper:]'
}

attribution_message_has_refs() {
    printf '%s\n' "$1" | grep -q '^Refs:'
}

attribution_message_has_req() {
    printf '%s\n' "$1" | grep -q '^Req:'
}

attribution_message_has_skip() {
    printf '%s\n' "$1" | grep -q '^Nervd-Skip:'
}