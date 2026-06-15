#!/bin/bash
# ==============================================
# 启动自动化 Chrome（独立 profile，不影响你日常用的 Chrome）
# 用法: bash launch-chrome.sh
# ==============================================
set -e

AUTO_PROFILE="$HOME/.horoscope-chrome"

echo "🔮 命理运势 — 自动化 Chrome 启动器"
echo ""

# 1. 检查 CDP 是否已在运行
if curl -sf http://127.0.0.1:9222/json/version > /dev/null 2>&1; then
    echo "✅ 自动化 Chrome 已就绪 (端口 9222)"
    echo ""
    echo "   当前标签页:"
    curl -s http://127.0.0.1:9222/json | python3 -c "
import json, sys
pages = json.load(sys.stdin)
for p in pages:
    if p.get('type') == 'page':
        print(f'   📑 {p.get(\"title\",\"?\")[:60]}')
" 2>/dev/null || true
    exit 0
fi

# 2. 创建 profile（如果不存在）
if [ ! -d "$AUTO_PROFILE" ]; then
    mkdir -p "$AUTO_PROFILE"
    echo "📁 已创建自动化 Chrome profile: $AUTO_PROFILE"
fi

# 3. 启动自动化 Chrome
echo "🚀 正在启动自动化 Chrome..."
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 \
  --user-data-dir="$AUTO_PROFILE" \
  --no-first-run \
  --no-default-browser-check \
  &>/dev/null &

# 4. 等待 CDP 就绪
for i in $(seq 1 15); do
    sleep 1
    if curl -sf http://127.0.0.1:9222/json/version > /dev/null 2>&1; then
        echo "✅ 自动化 Chrome 已就绪！"
        echo ""
        
        # 检查 X 登录状态
        echo "🔍 正在检查 X 登录状态..."
        # Open a tab to X home to check
        curl -s "http://127.0.0.1:9222/json/new?url=https://x.com/home" > /dev/null 2>&1
        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "📌 下一步:"
        echo "   1. 在弹出的 Chrome 窗口中登录 x.com"
        echo "   2. 然后在 Web UI (http://localhost:3456) 点击「发布」"
        echo ""
        echo "⚠️  不要关闭这个 Chrome 窗口"
        echo "   它和你日常用的 Chrome 互不影响"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        
        exit 0
    fi
done

echo "❌ 启动超时"
exit 1
