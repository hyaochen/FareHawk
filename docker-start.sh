#!/bin/sh
set -eu

# FareHawk 啟動腳本 - 同時啟動 Web UI 和 Telegram Bot

echo "============================================"
echo "  FareHawk - 便宜機票搜尋器"
echo "============================================"

# 初始化資料庫（如果不存在）
echo "[啟動] 初始化資料庫..."
npx prisma db push --skip-generate 2>/dev/null || true

# 啟動 Web UI (Next.js + Playwright 爬蟲)
echo "[啟動] 啟動 Web UI (port 3003)..."
cd /app/web && NODE_ENV=production npx next start -H 0.0.0.0 -p 3003 &
WEB_PID=$!

# 等待 Web 服務就緒
echo "[啟動] 等待 Web 服務就緒..."
sleep 5
for i in 1 2 3 4 5 6 7 8 9 10; do
    if wget -q --spider http://localhost:3003 2>/dev/null; then
        echo "[啟動] Web 服務已就緒"
        break
    fi
    echo "[啟動] 等待中... ($i/10)"
    sleep 3
done

# 啟動 Telegram Bot + 排程器
echo "[啟動] 啟動 Telegram Bot + 排程器..."
cd /app && node dist/index.js &
BOT_PID=$!

echo "============================================"
echo "  所有服務已啟動"
echo "  Web UI: http://localhost:3003"
echo "  Telegram Bot: 運行中"
echo "============================================"

# 監控進程，任一退出則全部停止
while kill -0 "$WEB_PID" 2>/dev/null && kill -0 "$BOT_PID" 2>/dev/null; do
    sleep 1
done

echo "[警告] 服務退出，正在關閉所有服務..."
kill "$WEB_PID" "$BOT_PID" 2>/dev/null || true
wait "$WEB_PID" 2>/dev/null || true
wait "$BOT_PID" 2>/dev/null || true
exit 1
