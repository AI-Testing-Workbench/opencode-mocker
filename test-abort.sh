#!/bin/bash

# Abort Test Quick Start Script
# 快速启动 abort 测试

echo "🧪 TestAgent Abort 测试"
echo "================================"
echo ""

# 检查 server 是否已运行
if curl -s http://localhost:3100/health > /dev/null 2>&1; then
  echo "✅ Mock 服务器已运行"
  echo ""
else
  echo "❌ Mock 服务器未运行"
  echo ""
  echo "请先在另一个终端启动服务器："
  echo "  $ cd packages/opencode-mocker"
  echo "  $ node server.js"
  echo ""
  exit 1
fi

# 运行测试
echo "🚀 开始测试..."
echo ""

node test-abort-scenario.js

echo ""
echo "================================"
echo "测试完成！"
echo ""
echo "💡 提示："
echo "  - 如果测试通过，UI 应该正确处理 abort"
echo "  - 如果测试失败，检查 KiloProvider.ts 和 session.tsx"
echo "  - 查看完整测试说明：cat ABORT_TEST.md"
echo ""
