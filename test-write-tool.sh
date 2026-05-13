#!/bin/bash

# 测试 Write 工具的完整流程

BASE_URL="http://localhost:3100"

echo "🔧 设置 tool-mocker 模式..."
curl -X POST "$BASE_URL/api/scenario" \
  -H "Content-Type: application/json" \
  -d '{"mode":"tool-mocker"}' \
  -s | jq .

echo ""
echo "🔧 启用 write 工具..."
curl -X POST "$BASE_URL/api/tools" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "tools": {
      "write": {
        "enabled": true,
        "arguments": {
          "filePath": "/test/hello.txt",
          "content": "Hello, World!"
        },
        "response": {
          "title": "Write File",
          "output": "File written successfully to /test/hello.txt",
          "metadata": {
            "path": "/test/hello.txt",
            "bytes": 13
          }
        },
        "delay": 0,
        "error": null
      }
    }
  }' \
  -s | jq .

echo ""
echo "📤 第一次请求：发送用户消息..."
RESPONSE1=$(curl -X POST "$BASE_URL/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mock-model",
    "messages": [
      {
        "role": "user",
        "content": "write hello world to a file"
      }
    ],
    "stream": false
  }' \
  -s)

echo "$RESPONSE1" | jq .

# 提取 tool_call_id
TOOL_CALL_ID=$(echo "$RESPONSE1" | jq -r '.choices[0].message.tool_calls[0].id')
TOOL_NAME=$(echo "$RESPONSE1" | jq -r '.choices[0].message.tool_calls[0].function.name')
TOOL_ARGS=$(echo "$RESPONSE1" | jq -r '.choices[0].message.tool_calls[0].function.arguments')

echo ""
echo "✅ 收到工具调用："
echo "  - Tool Call ID: $TOOL_CALL_ID"
echo "  - Tool Name: $TOOL_NAME"
echo "  - Arguments: $TOOL_ARGS"

echo ""
echo "📤 第二次请求：发送工具执行结果..."
curl -X POST "$BASE_URL/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d "{
    \"model\": \"mock-model\",
    \"messages\": [
      {
        \"role\": \"user\",
        \"content\": \"write hello world to a file\"
      },
      {
        \"role\": \"assistant\",
        \"content\": null,
        \"tool_calls\": [
          {
            \"id\": \"$TOOL_CALL_ID\",
            \"type\": \"function\",
            \"function\": {
              \"name\": \"$TOOL_NAME\",
              \"arguments\": $TOOL_ARGS
            }
          }
        ]
      },
      {
        \"role\": \"tool\",
        \"tool_call_id\": \"$TOOL_CALL_ID\",
        \"content\": \"{\\\"success\\\":true,\\\"path\\\":\\\"/test/hello.txt\\\",\\\"bytes\\\":13}\"
      }
    ],
    \"stream\": false
  }" \
  -s | jq .

echo ""
echo "✅ 测试完成！"
