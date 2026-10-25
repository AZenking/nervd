#!/usr/bin/env bash
# nervd 集成终验 —— fleet mission 合并后由主会话执行
# 用法: ./scripts/verify.sh [--full]
#   默认: tsc --noEmit + cargo check
#   --full: 追加 vite build + tauri build
set -euo pipefail
cd "$(dirname "$0")/.."

fail() { echo "[ERROR] $1" >&2; exit 1; }

echo "== 1/5 TypeScript 类型检查 =="
pnpm exec tsc --noEmit || fail "tsc 报错"

echo "== 2/5 单元测试 (vitest) =="
pnpm exec vitest run || fail "vitest 失败"

echo "== 3/5 Rust cargo check =="
(cd src-tauri && cargo check -q 2>&1 | tail -20) || fail "cargo check 报错"

echo "== 4/5 契约符合性抽查 =="
# 冻结文件不得被任务改动（相对当前分支 HEAD，package.json 仅允许更新 version 版本号）
if ! git diff -I '"version":' --quiet HEAD -- package.json || \
   ! git diff --quiet HEAD -- src/types.ts docs/ipc-contract.md pnpm-lock.yaml vite.config.ts tsconfig.json tsconfig.node.json; then
  fail "冻结文件被修改: $(git diff --name-only HEAD -- src/types.ts docs/ipc-contract.md pnpm-lock.yaml vite.config.ts tsconfig.json tsconfig.node.json | tr '\n' ' ')"
fi
echo "   冻结文件完好"

echo "== 5/5 关键产物存在性 =="
for f in src-tauri/src/yunxiao.rs src-tauri/src/commands/mod.rs src-tauri/src/credentials.rs src-tauri/src/poller.rs \
         src/lib/api.ts src/lib/link.ts src/store/app.ts \
         src/App.tsx src/main.tsx src/styles/theme.css; do
  [ -f "$f" ] || fail "缺少 $f"
done
# 组件清单
for c in Shell PipelineCard LogViewer WriteOpButton SettingsView StatusBadge; do
  find src/components/ -name "*$c*" | grep -q . || fail "缺少组件 $c"
done
echo "   产物齐全"

if [ "${1:-}" = "--full" ]; then
  echo "== 附加: vite build =="
  pnpm exec vite build || fail "vite build 报错"
  echo "== 附加: tauri build =="
  pnpm tauri build || fail "tauri build 报错"
fi

echo "全部通过"
