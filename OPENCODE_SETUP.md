# OpenCode 配置指南

## 问题诊断

如果你看到服务器日志显示相同的请求重复多次，这是正常的！这意味着：

1. ✅ OpenCode 正在正确发送请求
2. ✅ 服务器正在正确响应
3. ⚠️ OpenCode 可能没有正确处理响应

## 当前服务配置

- 服务地址：`http://localhost:3100`
- 端点：`/v1/chat/completions` (OpenAI 格式)
- 步骤计数：基于消息历史中的用户消息数量

## OpenCode 配置步骤

### 1. 基本配置

在 OpenCode 中配置以下参数：

```json
{
  "apiEndpoint": "http://localhost:3100/v1/chat/completions",
  "model": "gpt-4",
  "apiKey": "sk-mock-key-not-required",
  "temperature": 0.7,
  "maxTokens": 4096,
  "stream": true
}
```

**重要**：如果 OpenCode 没有响应，尝试设置 `"stream": true` 启用流式响应。

### 2. 响应格式

服务返回标准的 OpenAI Chat Completion 格式：

```json
{
  "id": "chatcmpl_xxx",
  "object": "chat.completion",
  "model": "gpt-4",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "响应内容",
      "reasoning": "思考过程（可选）",
      "tool_calls": [...]  // 工具调用（可选）
    },
    "finish_reason": "stop" 或 "tool_calls"
  }],
  "usage": {
    "prompt_tokens": 100,
    "completion_tokens": 200,
    "total_tokens": 300
  }
}
```

### 3. 工具调用格式

当响应包含工具调用时：

```json
{
  "message": {
    "role": "assistant",
    "content": "创建后端配置文件。",
    "reasoning": "目录结构已创建完成。现在需要创建...",
    "tool_calls": [
      {
        "id": "call_write_package_json",
        "type": "function",
        "function": {
          "name": "write_file",
          "arguments": "{\"path\":\"backend/package.json\",\"content\":\"...\"}"
        }
      }
    ]
  },
  "finish_reason": "tool_calls"
}
```

### 4. 支持的工具

- `create_directory`: 创建目录
  - 参数：`{"path": "目录路径"}`

- `write_file`: 写入文件
  - 参数：`{"path": "文件路径", "content": "文件内容"}`

- `list_directory`: 列出目录
  - 参数：`{"path": "目录路径"}`

## 测试步骤

### 手动测试

```bash
# 第一轮
curl -X POST http://localhost:3100/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {"role": "user", "content": "帮我创建一个网页应用"}
    ]
  }'

# 第二轮（包含工具调用）
curl -X POST http://localhost:3100/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {"role": "user", "content": "帮我创建一个网页应用"},
      {"role": "assistant", "content": "好的..."},
      {"role": "user", "content": "继续"}
    ]
  }'
```

### 自动化测试

```bash
# 运行完整测试（5轮交互）
npm run test:openai
```

## 故障排查

### 问题：OpenCode 一直重复发送相同请求

**原因**：OpenCode 可能没有正确处理响应或工具调用

**解决方案**：
1. 检查 OpenCode 是否支持 `reasoning` 字段
2. 检查 OpenCode 是否正确解析 `tool_calls`
3. 查看 OpenCode 的错误日志

### 问题：OpenCode 一直重复发送相同请求

**原因**：OpenCode 可能期望流式响应

**解决方案**：
1. 在配置中添加 `"stream": true`
2. 确认 OpenCode 支持 Server-Sent Events (SSE)
3. 查看 OpenCode 的网络日志，确认响应格式

### 问题：OpenCode 没有执行工具调用

**可能原因**：
1. OpenCode 不识别工具名称
2. 工具参数格式不正确
3. OpenCode 需要预先注册工具

**解决方案**：
1. 检查 OpenCode 的工具配置
2. 确认 OpenCode 支持的工具名称和参数格式
3. 可能需要修改 `scenarios/web-project-scenario.js` 中的工具定义

### 问题：步骤计数不正确

**当前机制**：步骤 = 消息历史中的用户消息数量

**示例**：
- 1条用户消息 → 步骤 1
- 2条用户消息 → 步骤 2
- 3条用户消息 → 步骤 3

**注意**：系统消息不计入步骤数

## 调试技巧

### 1. 查看服务器日志

服务器会输出详细的请求信息：
- 会话ID
- 当前步骤
- 用户消息
- 消息总数
- 响应大小

### 2. 检查响应内容

```bash
# 查看完整响应
curl -X POST http://localhost:3100/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '...' | python3 -m json.tool
```

### 3. 监控网络请求

在 OpenCode 中启用网络日志，查看：
- 请求是否成功发送
- 响应状态码
- 响应内容是否完整

## 自定义场景

如需修改场景，编辑 `scenarios/web-project-scenario.js`：

```javascript
// 修改步骤内容
const scenarios = [
  "第一步的描述...",
  "第二步的描述...",
  // ...
];

// 修改工具调用
const stepActions = {
  2: {
    reasoning: "思考过程",
    action: "给用户的提示",
    toolCalls: [
      {
        id: "call_id",
        type: "function",
        function: {
          name: "工具名称",
          arguments: JSON.stringify({参数})
        }
      }
    ]
  }
};
```

## 联系支持

如果问题持续存在，请提供：
1. OpenCode 版本
2. 服务器日志
3. OpenCode 错误日志
4. 网络请求/响应详情
