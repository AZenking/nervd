#!/bin/sh
# Agent 首选提交入口：自动补齐 Ref: / Req: 归属 trailer。
#
# 用法：
#   agent-commit.sh -m <message> [--workitem ID] [--req ID] [--skip] [--dry-run]
#                   [-- <extra git commit args>]
#
# 工作项优先级：--workitem > .nervd/active-workitem.json（旧格式兼容）> 分支名。
# 消息已含 ^Refs: 或 ^Nervd-Skip: 时原样提交，不再追加任何 trailer。
# 无工作项且未 --skip 时打印示例并 exit 2；禁止 --no-verify。
set -u

SCRIPT_DIR=$(CDPATH= cd -P -- "$(dirname -- "$0")" && pwd -P) || exit 2
. "$SCRIPT_DIR/lib-attribution.sh"

_usage() {
    cat <<'EOF'
用法: agent-commit.sh -m <message> [选项] [-- <额外 git commit 参数>]

选项:
  -m, --message <msg>   提交消息（可重复，按 git 习惯用空行拼接）
  --workitem <ID>       显式工作项编号，如 REQ-101 / TASK-202（优先级最高）
  --req <ID>            显式父需求编号；缺省时取 active workitem 的 parent
  --skip                追加 Nervd-Skip: true（格式化 / 依赖升级等非业务提交）；
                        不自动推断工作项，需要同时归属时显式给 --workitem
  --dry-run             只打印最终提交消息，不执行 git commit
  -h, --help            显示帮助
  --                    其后参数原样透传给 git commit（如 --allow-empty）

说明:
  - 工作项解析顺序：--workitem > active workitem > 当前分支名最后一个编号。
  - 分支名中的编号会转大写（feature/req-101 -> REQ-101）。
  - 消息已含 ^Refs: 或 ^Nervd-Skip: 时原样提交（标题仍需合规）。
  - 禁止 --no-verify；提交标题必须是 Conventional Commits，否则直接拒绝。
EOF
}

_die() {
    printf 'agent-commit: %s\n' "$*" >&2
    exit 2
}

_append_message() {
    if [ "$_have_message" -eq 1 ]; then
        _message="$_message

$1"
    else
        _message=$1
    fi
    _have_message=1
}

_have_message=0
_message=
_workitem=
_workitem_set=0
_req=
_req_set=0
_skip=0
_dry_run=0

while [ "$#" -gt 0 ]; do
    case $1 in
        -h | --help)
            _usage
            exit 0
            ;;
        -m | --message)
            [ "$#" -ge 2 ] || _die "$1 需要提交消息"
            _append_message "$2"
            shift 2
            ;;
        --message=*)
            _append_message "${1#*=}"
            shift
            ;;
        --workitem)
            [ "$#" -ge 2 ] || _die "--workitem 需要工作项编号"
            _workitem=$2
            _workitem_set=1
            shift 2
            ;;
        --workitem=*)
            _workitem=${1#*=}
            _workitem_set=1
            shift
            ;;
        --req)
            [ "$#" -ge 2 ] || _die "--req 需要父需求编号"
            _req=$2
            _req_set=1
            shift 2
            ;;
        --req=*)
            _req=${1#*=}
            _req_set=1
            shift
            ;;
        --skip)
            _skip=1
            shift
            ;;
        --dry-run)
            _dry_run=1
            shift
            ;;
        --)
            shift
            break
            ;;
        -*)
            _die "未知选项: $1（透传给 git 的参数请放在 -- 之后）"
            ;;
        *)
            _die "未知位置参数: $1（透传给 git 的参数请放在 -- 之后）"
            ;;
    esac
done

[ "$_have_message" -eq 1 ] || _die "缺少 -m <message>"
[ -n "$_message" ] || _die "提交消息不能为空"
if [ "$_workitem_set" -eq 1 ] && [ -z "$_workitem" ]; then
    _die "--workitem 值不能为空"
fi
if [ "$_req_set" -eq 1 ] && [ -z "$_req" ]; then
    _die "--req 值不能为空"
fi

# 防止通过 trailer 注入额外行。
case $_workitem in
    *'
'*)
        _die "工作项编号不能包含换行"
        ;;
esac
case $_req in
    *'
'*)
        _die "父需求编号不能包含换行"
        ;;
esac

# 提交标题严格按 Conventional Commits 校验：Agent 必须一次写对，不靠事后修补。
_validate_subject() {
    _subject_line=$(printf '%s\n' "$_message" | sed -n '1p')
    case $_subject_line in
        Merge\ * | Revert\ *) return 0 ;;
    esac
    if printf '%s\n' "$_subject_line" |
        grep -Eq '^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([A-Za-z0-9._/-]+\))?!?: .+'; then
        return 0
    fi
    cat >&2 <<FORMAT_ERR
agent-commit: 提交标题不符合 Conventional Commits 规范，拒绝提交。

  当前标题: ${_subject_line:-（空）}

  期望格式:
    <type>(<scope>): <subject>
    type = feat | fix | docs | style | refactor | perf | test | build | ci | chore | revert

  示例:
    feat(cashier): 接入易宝支付并支持结果查询
    fix(attribution): 修正子任务仓库继承
    chore(deps): 升级 tauri 到 2.1

  说明: 格式错误不能靠 --skip 绕过；--skip 只表示本次提交不归属工作项。
FORMAT_ERR
    exit 2
}

_validate_subject

# 额外 git 参数只能是 flag 类；禁止 --no-verify / -n，避免绕过钩子。
for _extra_arg in "$@"; do
    case $_extra_arg in
        --no-verify | -n)
            _die "禁止 --no-verify / -n：禁止绕过本地 commit-msg 钩子与提交规范"
            ;;
        -m | --message | --message=* | -m?*)
            _die "额外 git 参数不能再传 -m/--message（消息已由 -m 指定）"
            ;;
    esac
done

_root=$(git rev-parse --show-toplevel 2>/dev/null) || _die "当前目录不在 git 仓库内"
_branch=$(git -C "$_root" symbolic-ref --short HEAD 2>/dev/null) || _branch=

attribution_load_active "$_root"

_workitem_source=
if [ "$_workitem_set" -eq 1 ]; then
    _workitem_source=explicit
elif [ -n "$ATTRIBUTION_IDENTIFIER" ]; then
    _workitem=$ATTRIBUTION_IDENTIFIER
    _workitem_source=active
elif [ -n "$ATTRIBUTION_WORKITEM_ID" ]; then
    _workitem=$ATTRIBUTION_WORKITEM_ID
    _workitem_source=active-id
    attribution_warn "active workitem 缺少 identifier，回退使用 workitemId=$ATTRIBUTION_WORKITEM_ID"
else
    if _from_branch=$(attribution_branch_identifier "$_root" 2>/dev/null); then
        _workitem=$_from_branch
        _workitem_source=branch
    fi
fi

_req_source=
if [ "$_req_set" -eq 1 ]; then
    _req_source=explicit
elif [ -n "$ATTRIBUTION_PARENT_IDENTIFIER" ]; then
    _req=$ATTRIBUTION_PARENT_IDENTIFIER
    _req_source=active-parent
elif [ -n "$ATTRIBUTION_PARENT_WORKITEM_ID" ]; then
    _req=$ATTRIBUTION_PARENT_WORKITEM_ID
    _req_source=active-parent-id
fi

# --skip 表示明确不归属当前任务：不自动从 active / 分支推断工作项。
# 显式 --workitem 仍然生效（可同时写 Refs 与 Nervd-Skip）。
if [ "$_skip" -eq 1 ] && [ "$_workitem_set" -eq 0 ]; then
    _workitem=
    _workitem_source=skip
    _req=
    _req_source=
fi

_message_mode=append
if attribution_message_has_refs "$_message"; then
    _message_mode=existing-refs
    _final_message=$_message
elif attribution_message_has_skip "$_message"; then
    _message_mode=existing-skip
    _final_message=$_message
else
    if [ -z "$_workitem" ] && [ "$_skip" -eq 0 ]; then
        cat >&2 <<EOF
agent-commit: 未找到工作项上下文，拒绝提交。

  当前分支: ${_branch:-（detached HEAD，无法推断）}
  active:   ${_root}/.nervd/active-workitem.json
  来源:     ${ATTRIBUTION_SOURCE:-不存在或无法解析}

请任选其一：
  1) 显式指定（推荐；并行任务必须同时给 --workitem 和 --req）：
     ./scripts/agent-commit.sh --workitem TASK-123 --req REQ-100 -m "feat: ..."
     最终会追加：Refs: TASK-123 / Req: REQ-100
  2) 先写入 active workitem（.nervd/ 已 gitignore）：
     ${_root}/.nervd/active-workitem.json
  3) 非业务提交（格式化 / 依赖升级）：
     ./scripts/agent-commit.sh --skip -m "chore(deps): ..."

提示：不要猜测编号，也不要直接 git commit。
EOF
        exit 2
    fi

    _trailers=
    if [ -n "$_workitem" ]; then
        _trailers="Refs: $_workitem"
    fi
    if [ -n "$_workitem" ] && [ -n "$_req" ] &&
        ! attribution_message_has_req "$_message"; then
        if [ -n "$_trailers" ]; then
            _trailers="$_trailers
Req: $_req"
        else
            _trailers="Req: $_req"
        fi
    fi
    if [ "$_skip" -eq 1 ]; then
        if [ -n "$_trailers" ]; then
            _trailers="$_trailers
Nervd-Skip: true"
        else
            _trailers="Nervd-Skip: true"
        fi
    fi

    if [ -n "$_trailers" ]; then
        _final_message=$(printf '%s\n\n%s' "$_message" "$_trailers")
    else
        _final_message=$_message
    fi
fi

if [ "$_dry_run" -eq 1 ]; then
    printf '%s\n' "$_final_message"
    exit 0
fi

_tmp=$(mktemp "${TMPDIR:-/tmp}/nervd-agent-commit.XXXXXX") || _die "mktemp 失败"
trap 'rm -f "$_tmp"' 0
trap 'rm -f "$_tmp"; exit 130' 1 2 3 15

printf '%s\n' "$_final_message" >"$_tmp" || _die "写入临时文件失败: $_tmp"

if [ "$#" -gt 0 ]; then
    git -C "$_root" commit -F "$_tmp" "$@" || exit $?
else
    git -C "$_root" commit -F "$_tmp" || exit $?
fi

_sha=$(git -C "$_root" rev-parse --short HEAD 2>/dev/null) || _sha=?
printf '[nervd] 提交完成: %s\n' "$_sha"
case $_message_mode in
    existing-refs)
        printf '[nervd] message 已含 Refs:，未追加 trailer\n'
        ;;
    existing-skip)
        printf '[nervd] message 已含 Nervd-Skip:，未追加 trailer\n'
        ;;
    *)
        if [ -n "$_workitem_source" ]; then
            printf '[nervd] Refs 来源: %s\n' "$_workitem_source"
        fi
        if [ -n "$_req" ] && [ -n "$_req_source" ]; then
            printf '[nervd] Req 来源: %s\n' "$_req_source"
        fi
        ;;
esac
printf '[nervd] trailer 摘要:\n'
# 以实际提交后的 message 为准，包含 commit-msg 钩子可能追加的内容。
_committed_msg=$(git -C "$_root" log -1 --format=%B 2>/dev/null) || _committed_msg=$_final_message
_trailer_lines=$(printf '%s\n' "$_committed_msg" |
    grep -E '^(Refs|Req|Nervd-Skip):' || true)
if [ -n "$_trailer_lines" ]; then
    printf '%s\n' "$_trailer_lines" | sed 's/^/  /'
else
    printf '  （无）\n'
fi

exit 0