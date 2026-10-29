#!/usr/bin/env bash
# ==============================================================================
# nervd 自动化构建 Changelog 脚本
#
# 用法:
#   ./scripts/changelog.sh            # 自动提取当前版本号并更新根目录 CHANGELOG.md
#   ./scripts/changelog.sh --preview  # 在终端预览即将发布的版本日志（不写入文件）
#   ./scripts/changelog.sh v0.4.0     # 指定 tag 渲染
#
# 原理:
#   优先使用本机高性能 `git-cliff`；若未安装则自动 fallback 到 `npx -y git-cliff`。
#   基于 Conventional Commits 与项目 cliff.toml 配置生成规范的 Markdown 日志。
# ==============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."
export PATH=/opt/homebrew/bin:$PATH

# 1. 检测 git-cliff 命令执行方式
if command -v git-cliff >/dev/null 2>&1; then
  CLIFF_CMD="git-cliff"
else
  CLIFF_CMD="npx -y git-cliff"
fi

# 2. 从 package.json 获取当前版本号
APP_VERSION=$(node -e "console.log(require('./package.json').version)")
TARGET_TAG="v${APP_VERSION}"

MODE="generate"
if [ "${1:-}" = "--preview" ] || [ "${1:-}" = "-p" ]; then
  MODE="preview"
elif [ -n "${1:-}" ]; then
  TARGET_TAG="$1"
fi

if [ "$MODE" = "preview" ]; then
  echo "== 预览即将发布的版本日志 (${TARGET_TAG}) =="
  $CLIFF_CMD --unreleased --tag "$TARGET_TAG"
else
  echo "== 正在根据提交历史自动构建 CHANGELOG.md (${TARGET_TAG}) =="
  $CLIFF_CMD --tag "$TARGET_TAG" -o CHANGELOG.md
  echo "[OK] CHANGELOG.md 生成成功！"
fi
