#!/usr/bin/env bash
# ==============================================================================
# nervd 内部轻量化本地发版打包脚本 (方案 A: GitHub Releases + DMG 分发)
# 用法:
#   ./scripts/release-local.sh
# 说明:
#   1. 自动执行 verify.sh 检查 TypeScript、Rust 与契约完整性；
#   2. 执行 pnpm tauri build 编译 macOS 原生产物并生成 .dmg 安装包；
#   3. 整理打包产物至 dist-release/ 目录并生成 SHA256 校验和；
#   4. 输出 GitHub Release 发布说明与一键放行指引。
# ==============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

export PATH=/opt/homebrew/bin:$PATH

fail() { echo "❌ $1" >&2; exit 1; }
info() { echo "👉 $1"; }
ok()   { echo "✅ $1"; }

# 1. 提取当前版本号
APP_VERSION=$(node -e "console.log(require('./src-tauri/tauri.conf.json').version)")
ARCH=$(uname -m)

echo "=================================================="
echo "  🚀 nervd 客户端本地发版打包 (v${APP_VERSION} - ${ARCH})"
echo "=================================================="

# 2. 预先门禁校验
info "步骤 1/4: 执行项目契约与编译校验 (verify.sh)..."
./scripts/verify.sh || fail "项目校验失败，请先修复报错！"
ok "预检通过"

# 3. 编译打包
info "步骤 2/4: 执行 Tauri 原生打包 (pnpm tauri build)..."
pnpm tauri build || fail "tauri build 编译失败！"
ok "原生打包成功"

# 4. 归档发版产物
info "步骤 3/4: 整理发版交付物至 dist-release/..."
mkdir -p dist-release
rm -rf dist-release/*

# 查找 dmg 产物
DMG_SRC=$(find src-tauri/target/release/bundle/dmg -name "*.dmg" -maxdepth 1 2>/dev/null | head -n 1 || true)
if [ -n "$DMG_SRC" ] && [ -f "$DMG_SRC" ]; then
  DEST_DMG="dist-release/nervd_${APP_VERSION}_${ARCH}.dmg"
  cp "$DMG_SRC" "$DEST_DMG"
  
  # 计算 SHA256 校验和
  shasum -a 256 "$DEST_DMG" | awk '{print $1}' > "${DEST_DMG}.sha256"
  DMG_SIZE=$(du -h "$DEST_DMG" | awk '{print $1}')
  ok "已生成 DMG 安装包: ${DEST_DMG} (${DMG_SIZE})"
else
  fail "未找到生成的 DMG 产物，请检查 tauri.conf.json bundle.targets 配置"
fi

# 5. 输出 GitHub Releases 发布指引
echo ""
echo "=================================================="
echo "  🎉 编译完成！可直接发布到 GitHub Releases"
echo "=================================================="
echo ""
echo "📦 产物目录: $(pwd)/dist-release"
echo "   - 安装镜像: nervd_${APP_VERSION}_${ARCH}.dmg (${DMG_SIZE})"
echo "   - 校验文件: nervd_${APP_VERSION}_${ARCH}.dmg.sha256"
echo ""
echo "📌 发布步骤:"
echo "   1. 浏览器打开 GitHub 仓库发版页面:"
echo "      https://github.com/AZenking/nervd/releases/new"
echo "   2. Tag 填写: v${APP_VERSION}，标题填写: nervd v${APP_VERSION}"
echo "   3. 将 dist-release/ 下的文件拖拽上传至 Attach binaries"
echo "   4. 点击 'Publish release' 即可完成发布！"
echo ""
echo "💡 提示（同事首次打开若遇 Gatekeeper 拦截）:"
echo "   在终端中运行以下命令即可一键解除隔离:"
echo "   xattr -cr /Applications/nervd.app"
echo "=================================================="
