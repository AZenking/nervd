#!/usr/bin/env bash
# 重新生成冻结契约内容基线 scripts/contracts.sha256
#
# 背景：旧方案用 `git diff HEAD -- <files>` 判断冻结文件是否被改，在 CI 干净检出下
# 与 HEAD 比对永远为空（等于空转），且改动一旦提交就再也查不出来。
# 现改为「内容哈希基线」：校验对象是文件内容，而非相对某个 commit 的差异。
#
# 冻结范围（真正的跨端共享契约）：
#   - src/types.ts        前端类型契约（Rust 序列化字段的镜像）
#   - docs/ipc-contract.md IPC 命令 / 字段契约文档
# 说明：package.json / pnpm-lock.yaml / vite.config.ts / tsconfig.json 属工程配置，
# 变更频率与契约不同，已从冻结清单移除，改由代码评审把关。
#
# 用法：修改契约后执行本脚本更新基线，并在 PR 描述中说明契约变更理由。
set -euo pipefail
cd "$(dirname "$0")/.."

CONTRACT_FILES=(src/types.ts docs/ipc-contract.md)
BASELINE="scripts/contracts.sha256"

for f in "${CONTRACT_FILES[@]}"; do
  [ -f "$f" ] || { echo "[ERROR] 缺少契约文件: $f" >&2; exit 1; }
done

# macOS 自带 shasum；Linux 发行版一般只有 sha256sum
if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "${CONTRACT_FILES[@]}" > "$BASELINE"
elif command -v sha256sum >/dev/null 2>&1; then
  sha256sum "${CONTRACT_FILES[@]}" > "$BASELINE"
else
  echo "[ERROR] 找不到 shasum / sha256sum，无法生成契约基线" >&2
  exit 1
fi

echo "[OK] 已更新契约基线 ${BASELINE}："
cat "$BASELINE"
echo "请确认变更符合预期，并在 PR 描述中说明契约变更理由。"