#!/usr/bin/env bash
# nervd 集成终验 —— fleet mission 合并后由主会话执行
# 用法: ./scripts/verify.sh [--full]
#   默认: 前端三套 tsc + vitest + cargo check + cargo test --lib
#         + clippy（建议级）+ 契约哈希 + 关键产物非空
#   --full: 追加 vite build + tauri build
set -euo pipefail
cd "$(dirname "$0")/.."

# 终端环境 node/pnpm 可能位于 /opt/homebrew/bin，统一补齐 PATH
export PATH=/opt/homebrew/bin:$PATH

fail() { echo "[ERROR] $1" >&2; exit 1; }

echo "== 1/9 TypeScript 类型检查（src）=="
./node_modules/.bin/tsc --noEmit || fail "tsc 报错（src）"

echo "== 2/9 TypeScript 类型检查（preview）=="
# preview/ 与 src/ 类型环境不同（含 mock、Vite 配置），用独立 project 覆盖
./node_modules/.bin/tsc -p preview/tsconfig.json --noEmit || fail "tsc 报错（preview）"

echo "== 3/9 TypeScript 类型检查（e2e / 工具链）=="
# e2e 用例、playwright/vitest 配置此前不属于任何 tsconfig，是类型黑洞
./node_modules/.bin/tsc -p tsconfig.e2e.json --noEmit || fail "tsc 报错（e2e / 工具链）"

echo "== 4/9 单元测试 (vitest) =="
./node_modules/.bin/vitest run || fail "vitest 失败"

echo "== 5/9 Rust 编译检查 (cargo check) =="
(cd src-tauri && cargo check -q 2>&1 | tail -20) || fail "cargo check 报错"

echo "== 6/9 Rust 库测试 (cargo test --lib) =="
# 只跑 lib 单测：tests/effort_e2e.rs 需要外部 mock 服务，不属默认门禁（由专门脚本拉起）
(cd src-tauri && cargo test --lib -q 2>&1 | tail -30) || fail "cargo test --lib 失败"

echo "== 7/9 Rust clippy（阻断）=="
if ! cargo clippy --version >/dev/null 2>&1; then
  echo "   未安装 clippy，跳过"
else
  (cd src-tauri && cargo clippy --all-targets --message-format=short -- -D warnings) || fail "clippy 报错"
  echo "   clippy 0 告警"
fi

echo "== 8/9 冻结契约哈希校验 =="
# 旧方案 `git diff HEAD -- <files>` 在 CI 干净检出下恒为空，已废弃。
# 现以内容哈希为准：契约文件被改动（无论是否提交）都会被检出。
if [ ! -f scripts/contracts.sha256 ]; then
  fail "缺少 scripts/contracts.sha256，请先运行 ./scripts/update-contracts.sh 生成基线"
fi

contracts_rc=0
if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 -c scripts/contracts.sha256 >/dev/null 2>&1 || contracts_rc=$?
elif command -v sha256sum >/dev/null 2>&1; then
  sha256sum -c scripts/contracts.sha256 >/dev/null 2>&1 || contracts_rc=$?
else
  fail "找不到 shasum / sha256sum，无法校验契约基线"
fi

if [ "$contracts_rc" -ne 0 ]; then
  # 打印具体是哪个契约文件不匹配，便于定位
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 -c scripts/contracts.sha256 2>&1 | grep -E 'FAILED|No such file' >&2 || true
  else
    sha256sum -c scripts/contracts.sha256 2>&1 | grep -E 'FAILED|No such file' >&2 || true
  fi
  cat >&2 <<'EOF'
[ERROR] 冻结契约文件被修改（内容哈希与基线不一致）。
        冻结范围：src/types.ts、docs/ipc-contract.md。
        若本次修改确属预期：
          1. 运行 ./scripts/update-contracts.sh 更新基线；
          2. 在 PR 描述中说明契约变更理由与影响面。
        未预期的修改请立即还原。
EOF
  exit 1
fi
echo "   契约内容与基线一致"

echo "== 9/9 关键产物存在性与非空校验 =="
# -s：文件存在且大小 > 0（空文件不再能蒙混过关）
for f in src-tauri/src/yunxiao.rs src-tauri/src/commands/mod.rs src-tauri/src/credentials.rs src-tauri/src/poller.rs \
         src-tauri/src/lib.rs src-tauri/tauri.conf.json src-tauri/Cargo.toml \
         src/lib/api.ts src/lib/link.ts src/store/app.ts \
         src/App.tsx src/main.tsx src/styles/theme.css index.html; do
  [ -s "$f" ] || fail "缺少或为空: $f"
done

# 关键组件按真实文件名校验，避免 `find -name "*Shell*"` 误命中 Shell.test.tsx
for c in Shell.tsx PipelineCard.tsx LogViewer.tsx WriteOpButton.tsx SettingsView.tsx StatusBadge.tsx; do
  [ -s "src/components/$c" ] || fail "缺少或为空: src/components/$c"
done
echo "   产物齐全且非空"

if [ "${1:-}" = "--full" ]; then
  echo "== 附加: vite build =="
  pnpm exec vite build || fail "vite build 报错"
  echo "== 附加: tauri build =="
  pnpm tauri build || fail "tauri build 报错"
fi

echo "全部通过"