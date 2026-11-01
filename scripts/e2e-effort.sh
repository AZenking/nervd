#!/bin/zsh
# 工时登记链路 E2E：起 mock 云效 → 跑集成测试 → 记录文件与 golden 字节比对。
# 重跑两次结果必须一致（mock 响应由请求内容派生，无时间戳/随机数）。
# 用法：./scripts/e2e-effort.sh
set -e
cd "$(dirname "$0")/.."

MOCK_DIR=/tmp/nervd-e2e
if [ ! -x "$MOCK_DIR/.venv/bin/python" ]; then
  python3 -m venv "$MOCK_DIR/.venv"
  "$MOCK_DIR/.venv/bin/pip" -q install flask
fi
cp scripts/mock_yunxiao.py "$MOCK_DIR/mock_yunxiao.py" 2>/dev/null || true

pkill -f mock_yunxiao.py 2>/dev/null || true
sleep 0.5
rm -f "$MOCK_DIR/recorded.json"
"$MOCK_DIR/.venv/bin/python" "$MOCK_DIR/mock_yunxiao.py" "$MOCK_DIR/recorded.json" &
MOCK_PID=$!
trap 'kill $MOCK_PID 2>/dev/null || true' EXIT
sleep 1

( cd src-tauri && cargo test --test effort_e2e --quiet )
diff -u src-tauri/tests/fixtures/effort_e2e_golden.json "$MOCK_DIR/recorded.json"
echo "E2E 通过：记录与 golden 字节一致"
