# OpenCode Mocker

Mock LLM Server for OpenCode/TestAgent Testing

一个灵活的模拟服务器，用于测试 LLM 集成的各种场景，包括正常操作、错误、延迟和网络问题。

## 快速开始

```bash
# 启动服务器
node server.js

# 在另一个终端运行测试
node test-client.js
```

服务器将在 http://localhost:3100 启动。

## 测试场景

### 🛑 Abort 测试（新增！）

测试 session abort 后 UI 状态恢复：

```bash
# 方法 1：自动化测试
./test-abort.sh

# 方法 2：手动测试脚本
node test-abort-scenario.js
```

查看详细说明：[ABORT_TEST.md](./ABORT_TEST.md)

### 🎭 其他测试场景

- **scenario**: 多轮对话场景（支持工具调用）
- **echo**: 回显用户输入
- **fixed**: 返回固定响应
- **delay**: 延迟响应
- **bigdata**: 大数据传输
- **error**: HTTP 错误
- **longrun**: 长时间运行
- **reset**: 连接重置
- **hang**: 流挂起
- **stream-error**: 流传输错误
- **tool-hang**: 工具调用挂起
- **thinking-hang**: 思考内容后挂起
- **flaky**: 前 N 次调用失败后自动恢复 🎲（YOLO 错误中断自动化测试专用，含 mid/http/empty/truncate 四形态）

查看 YOLO 错误中断测试指南：[YOLO_ERROR_TEST.md](./YOLO_ERROR_TEST.md)

## 场景配置

### 通过 Web UI

访问 http://localhost:3100 打开配置面板。

### 通过 API

```bash
# 切换到 abort 测试场景
curl -X POST http://localhost:3100/api/scenario \
  -H "Content-Type: application/json" \
  -d '{"mode":"scenario","loopCount":1}'

# 切换到错误场景
curl -X POST http://localhost:3100/api/scenario \
  -H "Content-Type: application/json" \
  -d '{"mode":"error","statusCode":500,"message":"Internal Server Error"}'
```

## 工具 Mock

配置工具调用的模拟响应：

```bash
# 启用工具 mock 模式
curl -X POST http://localhost:3100/api/tools \
  -H "Content-Type: application/json" \
  -d '{"enabled":true}'

# 配置特定工具的响应
curl -X POST http://localhost:3100/api/tools/read_file \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "response": {
      "title": "Read File",
      "output": "Custom file content",
      "metadata": {"path": "/custom/path.txt"}
    },
    "delay": 1000,
    "error": null
  }'
```

## 日志

所有请求都会记录到 `logs/` 目录：

```bash
# 查看所有请求
cat logs/all_requests.jsonl | jq .

# 实时查看请求
tail -f logs/all_requests.jsonl | jq .
```

## 场景文件

自定义场景保存在 `scenarios/` 目录：

- `opencode-scenario.js` - OpenCode 客户端场景
- `web-project-scenario.js` - Web 项目场景
- `abort-test-scenario.js` - Abort 测试场景（新增）

## 文件结构

```
opencode-mocker/
├── server.js                    # 主服务器
├── scenarios/                   # 场景定义
│   ├── opencode-scenario.js
│   ├── web-project-scenario.js
│   └── abort-test-scenario.js   # 新增
├── test-abort-scenario.js       # Abort 测试脚本（新增）
├── test-abort.sh                # 快速测试脚本（新增）
├── ABORT_TEST.md                # Abort 测试文档（新增）
├── test-client.js               # 通用测试客户端
├── test-stream.js               # 流式测试
├── test-tool-mocker.js          # 工具 mock 测试
├── logs/                        # 请求日志
└── public/                      # Web UI
```

## API 端点

### LLM API

- `POST /v1/chat/completions` - 聊天补全（兼容 OpenAI API）

### 管理 API

- `GET /health` - 健康检查
- `GET /api/scenario` - 获取当前场景配置
- `POST /api/scenario` - 更新场景配置
- `GET /api/tools` - 获取工具 mock 配置
- `POST /api/tools` - 更新工具 mock 配置
- `POST /api/tools/:toolName` - 更新单个工具配置
- `POST /api/tools/reset` - 重置工具配置

## 环境变量

```bash
PORT=3100  # 服务器端口（默认 3100）
```

## 使用示例

### 在 TestAgent 中使用

配置自定义提供商：

```json
{
  "providers": {
    "custom": [{
      "id": "mocker",
      "name": "Mock LLM",
      "apiBase": "http://localhost:3100/v1",
      "apiKey": "mock-key",
      "models": [{
        "id": "mock-model",
        "name": "Mock Model"
      }]
    }]
  }
}
```

### 作为测试依赖

```javascript
const fetch = require('node-fetch');

async function testLLM() {
  const response = await fetch('http://localhost:3100/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'mock-model',
      messages: [
        { role: 'user', content: 'Hello!' }
      ],
      stream: false
    })
  });
  
  const data = await response.json();
  console.log(data.choices[0].message.content);
}
```

## 贡献

欢迎提交 Issue 和 Pull Request！

## License

MIT
