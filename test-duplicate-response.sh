#!/bin/bash

# 测试连续 3 次返回相同内容的死循环检测

set -e

echo "╔════════════════════════════════════════════╗"
echo "║   连续相同内容死循环检测 - 快速测试       ║"
echo "╚════════════════════════════════════════════╝"
echo ""

# 检查 mocker 是否运行
if ! curl -s http://localhost:3100/health > /dev/null 2>&1; then
    echo "❌ Mocker 服务未运行"
    echo "   请在另一个终端运行: node server.js"
    exit 1
fi

echo "✅ Mocker 服务运行中"
echo ""

# 运行测试
node test-duplicate-response.js

echo ""
echo "测试完成！"
