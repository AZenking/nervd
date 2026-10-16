#!/usr/bin/env bash
# nervd 测试入口（docs/e2e-testing.md §7）
#   1) 单元测试（vitest：src/**/*.test.ts）
#   2) E2E（playwright：自动拉起 preview mock 模式 @ http://localhost:1423）
# 用法: ./scripts/test.sh [--unit|--e2e]
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/bin:$PATH"

MODE="${1:-all}"

run_unit() {
  echo "== 单元测试 (vitest) =="
  pnpm exec vitest run || { echo "❌ vitest 失败" >&2; exit 1; }
}

run_e2e() {
  echo "== E2E (playwright @ preview mock 模式) =="
  # 浏览器位于工作区 .playwright-browsers/（首次执行前先: pnpm test:e2e:browsers）
  pnpm exec playwright test || { echo "❌ playwright 失败" >&2; exit 1; }
}

case "$MODE" in
  --unit) run_unit ;;
  --e2e)  run_e2e ;;
  all)    run_unit; run_e2e ;;
  *) echo "用法: $0 [--unit|--e2e]" >&2; exit 1 ;;
esac

echo "✅ 测试全部通过"
