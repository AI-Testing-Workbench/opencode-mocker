# Mock LLM Server - 大模型挡板服务

用于测试 opencode 在 Windows 下的稳定性，模拟大模型 API 并引导完成前后端项目搭建。

## 功能特性

- 🎭 模拟 Claude 和 OpenAI API 格式
- 📝 预设场景：通过多轮交互引导创建待办事项 Web 应用
- 🔄 支持多轮对话，每次只返回一小步操作
- 💭 支持思考过程（reasoning）输出
- 🔧 支持工具调用（tool_calls）模拟
- 🌊 支持流式响应（Server-Sent Events）
- 📊 会话管理和请求计数
- 🌐 CORS 支持
- ⏱️ 适合长时间稳定性测试（17+ 轮交互）
- 🔌 **网络异常场景**：模拟连接重置、流挂起、传输错误等（新增）

## 快速开始

### 1. 安装依赖

\`\`\`bash
npm install
\`\`\`

### 2. 启动服务

\`\`\`bash
npm start
\`\`\`

服务将运行在 `http://localhost:3100`

### 3. 配置 opencode

将 opencode 的 API 端点配置为：

- Claude 格式：`http://localhost:3100/v1/messages`
- OpenAI 格式：`http://localhost:3100/v1/chat/completions`

参考配置示例（见 `opencode-config-example.json`）：
\`\`\`json
{
  "apiEndpoint": "http://localhost:3100/v1/messages",
  "model": "claude-3-sonnet-20240229",
  "apiKey": "mock-api-key-not-required",
  "maxTokens": 4096
}
\`\`\`

### 4. 测试服务（可选）

运行测试客户端模拟完整的17轮交互：
\`\`\`bash
npm test
\`\`\`

测试 OpenAI 格式（包含思考和工具调用）：
\`\`\`bash
npm run test:openai
\`\`\`

测试流式响应：
\`\`\`bash
npm run test:stream
\`\`\`

## API 端点

### POST /v1/messages
模拟 Claude API 格式

请求示例：
\`\`\`json
{
  "model": "claude-3-sonnet-20240229",
  "max_tokens": 1024,
  "messages": [
    {
      "role": "user",
      "content": "帮我创建一个网页应用"
    }
  ]
}
\`\`\`

### POST /v1/chat/completions
模拟 OpenAI API 格式（支持思考和工具调用）

请求示例（非流式）：
\`\`\`json
{
  "model": "gpt-4",
  "stream": false,
  "messages": [
    {
      "role": "user",
      "content": "帮我创建一个网页应用"
    }
  ]
}
\`\`\`

请求示例（流式）：
\`\`\`json
{
  "model": "gpt-4",
  "stream": true,
  "messages": [
    {
      "role": "user",
      "content": "帮我创建一个网页应用"
    }
  ]
}
\`\`\`

流式响应示例（Server-Sent Events）：
\`\`\`
data: {"id":"chatcmpl_xxx","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"reasoning":"思考过程..."},"finish_reason":null}]}

data: {"id":"chatcmpl_xxx","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"响应内容"},"finish_reason":null}]}

data: {"id":"chatcmpl_xxx","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"tool_calls":[...]},"finish_reason":null}]}

data: {"id":"chatcmpl_xxx","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}

data: [DONE]
\`\`\`

响应示例（包含思考和工具调用）：
\`\`\`json
{
  "id": "chatcmpl_xxx",
  "object": "chat.completion",
  "model": "gpt-4",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "创建后端配置文件。",
        "reasoning": "目录结构已创建完成。现在需要创建后端的 package.json 文件...",
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
  ]
}
\`\`\`

### GET /health
健康检查

### POST /reset
重置会话计数器

请求体：
\`\`\`json
{
  "sessionId": "可选，指定会话ID"
}
\`\`\`

### GET /sessions
查看所有会话状态

## 预设场景

当前实现了一个完整的待办事项应用场景，通过 17+ 轮交互完成：

1. 项目规划和结构说明（需用户回复"继续"）
2. 创建后端目录结构 - 🔧 工具调用：create_directory
3. 创建 backend/package.json - 🔧 工具调用：write_file
4. 创建 backend/server.js - 🔧 工具调用：write_file
5. 创建 backend/routes/todos.js - 🔧 工具调用：write_file
6. 创建前端目录结构 - 🔧 工具调用：create_directory
7. 创建 frontend/index.html - 🔧 工具调用：write_file
8. 创建 frontend/style.css - 🔧 工具调用：write_file
9. 创建 frontend/app.js - 🔧 工具调用：write_file
10. 创建 README.md - 🔧 工具调用：write_file
11. 验证后端文件 - 🔧 工具调用：list_directory
12. 验证前端文件 - 🔧 工具调用：list_directory
13. 测试后端服务指导
14. 测试前端页面指导
15. 功能测试指导
16. 优化建议
17. 项目总结

每一步都包含：
- 💭 思考过程（reasoning）：解释当前步骤的目的和逻辑
- 🔧 工具调用（tool_calls）：模拟实际的文件操作
- 📝 响应内容（content）：给用户的提示信息

每一步都需要用户确认后才继续，适合测试长时间运行的稳定性。

## 自定义场景

编辑 `scenarios/web-project-scenario.js` 文件来自定义场景：

\`\`\`javascript
const scenarios = [
  "第一步的响应内容",
  "第二步的响应内容",
  // ...
];

const codeResponses = {
  2: "具体的代码内容",
  // ...
};
\`\`\`

## 测试建议

1. 启动挡板服务
2. 配置 opencode 连接到本地服务
3. 在 opencode 中输入："帮我创建一个网页应用"
4. 每次收到响应后，回复"继续"进行下一步
5. 观察 opencode 是否能够：
   - 正确解析响应
   - 创建文件和目录
   - 写入代码内容
   - 在多轮交互中保持稳定
   - 完成整个项目搭建流程（17+ 轮）

## 会话管理

- 每个对话会话自动分配独立的计数器
- 支持多个并发会话测试
- 可通过 `/sessions` 端点查看所有会话状态
- 可通过 `/reset` 端点重置特定会话或所有会话

## 日志输出

服务会在控制台输出：
- 会话 ID（前20个字符）
- 每个请求的序号
- 用户消息内容（前100个字符）
- 当前响应的场景步骤

## 环境变量

- `PORT`: 服务端口（默认 3100）

## 场景模式

服务支持多种测试场景，可通过 Web 控制面板（`http://localhost:3100`）或 API 切换：

### 基础场景

1. **scenario** - 多轮对话场景（默认）
   - 模拟完整的项目搭建流程
   - 17+ 轮交互，包含工具调用和思考过程

2. **echo** - 回显模式
   - 返回用户输入的内容
   - 适合测试基本连接

3. **fixed** - 固定回复
   - 返回预设的固定内容
   - 可自定义回复文本

4. **delay** - 延迟响应
   - 在指定延迟后返回响应
   - 可配置延迟时间（0-60000ms）

5. **bigdata** - 大数据响应
   - 返回大量数据（0.1-5MB）
   - 测试大数据处理能力

6. **error** - 错误响应
   - 返回 HTTP 错误状态码
   - 可配置状态码和错误信息

7. **longrun** - 持续运行
   - 持续发送流式数据（最长24小时）
   - 适合长时间稳定性测试

### 网络异常场景 🆕

这些场景用于模拟各种网络异常情况，帮助测试错误处理和恢复机制：

#### 1. **reset** - 连接重置 ⭐ 推荐

**模拟错误**：`TypeError: terminated at Fetch.onAborted`

**行为**：
- 发送部分 SSE 数据
- 在达到指定字节数后立即销毁连接
- 客户端会收到连接重置错误

**配置参数**：
- `resetAfterBytes`: 发送多少字节后断开（100-10240，默认 1024）

**使用场景**：
- 测试网络中断处理
- 验证连接重置恢复机制
- 复现 `TypeError: terminated` 错误

**示例**：
\`\`\`bash
curl -X POST http://localhost:3100/api/scenario \
  -H "Content-Type: application/json" \
  -d '{"mode":"reset","resetAfterBytes":1024}'
\`\`\`

#### 2. **hang** - 流挂起

**模拟错误**：超时 / `AbortError`

**行为**：
- 发送指定数量的数据块
- 不发送 `[DONE]` 标记
- 连接保持打开状态
- 客户端会等待直到超时

**配置参数**：
- `hangAfterChunks`: 发送多少个 chunk 后挂起（1-20，默认 3）

**使用场景**：
- 测试超时处理逻辑
- 验证 AbortController 机制
- 测试长时间等待的行为

**示例**：
\`\`\`bash
curl -X POST http://localhost:3100/api/scenario \
  -H "Content-Type: application/json" \
  -d '{"mode":"hang","hangAfterChunks":3}'
\`\`\`

#### 3. **stream-error** - 流传输错误

**模拟错误**：流读取错误

**行为**：
- 响应头成功返回（200 OK）
- 发送部分数据
- 在指定时间后销毁流
- 读取响应体时失败

**配置参数**：
- `streamErrorAfterMs`: 多少毫秒后抛出错误（100-10000，默认 500）

**使用场景**：
- 测试流读取错误处理
- 验证部分数据接收后的恢复
- 测试流中断的边界情况

**示例**：
\`\`\`bash
curl -X POST http://localhost:3100/api/scenario \
  -H "Content-Type: application/json" \
  -d '{"mode":"stream-error","streamErrorAfterMs":500}'
\`\`\`

#### 4. **tool-hang** - 工具调用挂起

**模拟错误**：工具执行错误

**行为**：
- 发送工具调用开始
- 发送部分工具参数（可配置比例）
- 连接挂起，参数不完整
- 不发送 `[DONE]` 标记

**配置参数**：
- `toolHangPartial`: 工具参数发送比例（0-1，默认 0.5 = 50%）

**使用场景**：
- 测试工具调用的错误恢复
- 验证不完整参数的处理
- 测试工具执行超时

**示例**：
\`\`\`bash
curl -X POST http://localhost:3100/api/scenario \
  -H "Content-Type: application/json" \
  -d '{"mode":"tool-hang","toolHangPartial":0.5}'
\`\`\`

### 场景切换 API

**获取当前场景**：
\`\`\`bash
curl http://localhost:3100/api/scenario
\`\`\`

**切换场景**：
\`\`\`bash
curl -X POST http://localhost:3100/api/scenario \
  -H "Content-Type: application/json" \
  -d '{"mode":"reset","resetAfterBytes":1024}'
\`\`\`

**响应示例**：
\`\`\`json
{
  "ok": true,
  "config": {
    "mode": "reset",
    "resetAfterBytes": 1024,
    ...
  }
}
\`\`\`

## 环境变量

- `PORT`: 服务端口（默认 3100）

## 故障排查

### 问题：opencode 没有收到响应

**症状**：服务器日志显示重复的请求，如：
```
[Session: <Role>You are "Sisy...] [Request 64]
[Session: <Role>You are "Sisy...] [Request 65]
[Session: <Role>You are "Sisy...] [Request 66]
```

**原因**：这实际上表示 opencode 正在发送请求，但可能没有正确处理响应。

**解决方案**：

1. **检查步骤计数机制**：
   - 当前版本使用基于消息历史的步骤计数
   - 步骤 = 消息历史中的用户消息数量
   - 不再依赖会话计数器

2. **验证响应格式**：
   ```bash
   curl -X POST http://localhost:3100/v1/chat/completions \
     -H "Content-Type: application/json" \
     -d '{"model":"gpt-4","messages":[{"role":"user","content":"测试"}]}' \
     | python3 -m json.tool
   ```

3. **检查 opencode 配置**：
   - 确认支持 `reasoning` 字段
   - 确认支持 `tool_calls` 字段
   - 查看 opencode 错误日志

4. **查看详细配置指南**：
   ```bash
   cat OPENCODE_SETUP.md
   ```

### 问题：端口被占用

如果 3100 端口被占用，可以：
1. 修改 `server.js` 中的 `PORT` 变量
2. 或使用环境变量：`PORT=3200 npm start`

## 许可证

MIT
