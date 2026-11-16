#!/bin/sh
# 读取当前 Agent 工作项上下文。
#
# 用法：
#   read-active-workitem.sh [repo-root]
#
# 输出（可直接 eval 或 grep，文件缺失时无输出且 exit 0）：
#   IDENTIFIER=<工作项编号，如 REQ-101>
#   WORKITEM_ID=<云效内部 ID>
#   PARENT_IDENTIFIER=<父需求编号>
#   PARENT_WORKITEM_ID=<父需求内部 ID>
#   CATEGORY=<Req|Bug|Task>
#
# 读取顺序：
#   1. <repo-root>/.nervd/active-workitem.json（现代格式，gitignored）
#   2. <git-dir>/nervd-active-workitem（旧格式，4 行纯文本）
#
# 路径含空格安全；repo-root 缺省为当前目录，用 git 顶层目录解析。
set -u

SCRIPT_DIR=$(CDPATH= cd -P -- "$(dirname -- "$0")" && pwd -P) || exit 2
. "$SCRIPT_DIR/lib-attribution.sh"

usage() {
    cat <<'EOF'
用法: read-active-workitem.sh [repo-root]

读取 <repo-root>/.nervd/active-workitem.json，并输出 KEY=VALUE 行：
  IDENTIFIER / WORKITEM_ID / PARENT_IDENTIFIER / PARENT_WORKITEM_ID / CATEGORY

兼容旧格式 <git-dir>/nervd-active-workitem（4 行纯文本）。
文件缺失时无输出并 exit 0。
EOF
}

case ${1:-} in
    -h | --help)
        usage
        exit 0
        ;;
esac

if [ "$#" -gt 1 ]; then
    printf 'read-active-workitem: 参数过多（最多一个 repo-root）\n' >&2
    usage >&2
    exit 2
fi

_root=$(attribution_resolve_root "${1:-.}") || {
    printf 'read-active-workitem: 目录不存在: %s\n' "${1:-.}" >&2
    exit 2
}

attribution_load_active "$_root"
attribution_print_active
exit 0