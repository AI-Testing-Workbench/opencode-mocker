# Mock LLM Server - 项目总结

## 已完成的功能

### ✅ 核心功能
- [x] 模拟 OpenAI Chat Completion API
- [x] 模拟 Claude Messages API
- [x] 支持多轮对话
- [x] 基于消息历史的步骤计数
- [x] 思考过程（reasoning）输出
- [x] 工具调用（tool_calls）模拟

### ✅ 预设场景
- [x] 17步完整的待办事项应用创建流程
- [x] 包含前后端代码生成
- [x] 每步都有详细的思考过程
- [x] 模拟真实的文件操作工具调用

### ✅ 测试工具
- [x] 健康检查端点
- [x] 自动化测试脚本（Claude 格式）
- [x] 自动化测试脚本（OpenAI 格式）
- [x] 详细的日志输出

## 技术架构

### 服务端口
- 默认：3100
- 可通过环境变量 `PORT` 修改

### API 端点

1. **POST /v1/chat/completions** (OpenAI 格式)
   - 支持 reasoning 字段
   - 支持 tool_calls 字段
   - finish_reason: "stop" 或 "tool_calls"

2. **POST /v1/messages** (Claude 格式)
   - 标准 Claude API 响应格式
   - 纯文本响应，无工具调用

3. **GET /health**
   - 健康检查

### 步骤计数机制

**当前实现**：基于消息历史
```javascript
步骤数 = 消息历史中的用户消息数量
```

**优点**：
- 无需维护会话状态
- 支持无状态部署
- 自动处理重试和重连
- 不受系统消息影响

**示例**：
```
消息历史：[user, assistant, user] → 步骤 2
消息历史：[system, user, assistant, user, assistant, user] → 步骤 3
```

## 预设场景详情

### 步骤 1：项目规划
- 类型：纯文本
- 内容：介绍项目结构
- 无工具调用

### 步骤 2-10：代码生成
- 类型：工具调用
- 工具：create_directory, write_file
- 包含：reasoning + tool_calls

### 步骤 11-12：验证
- 类型：工具调用
- 工具：list_directory
- 包含：reasoning + tool_calls

### 步骤 13-17：指导和总结
- 类型：纯文本
- 内容：测试指导、优化建议、总结

## 工具定义

### create_directory
创建目录
```json
{
  "name": "create_directory",
  "arguments": {
    "path": "目录路径"
  }
}
```

### write_file
写入文件
```json
{
  "name": "write_file",
  "arguments": {
    "path": "文件路径",
    "content": "文件内容"
  }
}
```

### list_directory
列出目录内容
```json
{
  "name": "list_directory",
  "arguments": {
    "path": "目录路径"
  }
}
```

## 使用场景

### 1. OpenCode 稳定性测试
- 长时间运行测试（17+ 轮交互）
- 工具调用处理测试
- 思考过程解析测试
- 多轮对话状态管理测试

### 2. API 兼容性测试
- OpenAI API 格式兼容性
- Claude API 格式兼容性
- 自定义字段支持（reasoning）

### 3. 开发调试
- 无需真实 API Key
- 可预测的响应
- 快速迭代测试

## 配置文件

### package.json
```json
{
  "scripts": {
    "start": "node server.js",
    "test": "node test-client.js",
    "test:openai": "node test-openai-format.js"
  }
}
```

### 环境变量
```bash
PORT=3100  # 服务端口
```

## 日志格式

```
[Session: 帮我创建一个网页应用...] [Step 2]
User message: 继续
Total messages: 3 (User messages: 2)
  Current step: 2, Total scenarios: 17
Responding with step 2
  Reasoning: 用户同意开始项目创建...
  Tool calls: 2 tool(s)
Response size: 620 bytes
Sending response...
```

## 文件结构

```
opencode-mocker/
├── server.js                      # 主服务器
├── package.json                   # 依赖配置
├── scenarios/
│   └── web-project-scenario.js   # 场景定义
├── test-client.js                 # Claude 格式测试
├── test-openai-format.js          # OpenAI 格式测试
├── opencode-config-example.json   # 配置示例
├── README.md                      # 主文档
├── OPENCODE_SETUP.md             # OpenCode 配置指南
└── SUMMARY.md                     # 本文件
```

## 已知问题和解决方案

### 问题 1：OpenCode 重复发送请求
**现象**：服务器日志显示相同请求重复多次
**原因**：OpenCode 可能没有正确处理响应
**状态**：已优化步骤计数机制，基于消息历史而非会话计数

### 问题 2：工具调用未执行
**现象**：OpenCode 收到 tool_calls 但未执行
**原因**：可能需要在 OpenCode 中注册工具
**建议**：查看 OPENCODE_SETUP.md 中的工具配置说明

## 下一步优化建议

### 1. 增强功能
- [ ] 支持流式响应（SSE）
- [ ] 添加更多预设场景
- [ ] 支持自定义工具定义
- [ ] 添加工具执行结果模拟

### 2. 测试增强
- [ ] 添加单元测试
- [ ] 添加集成测试
- [ ] 性能测试
- [ ] 并发测试

### 3. 文档完善
- [ ] API 文档（OpenAPI/Swagger）
- [ ] 场景开发指南
- [ ] 视频教程

### 4. 部署优化
- [ ] Docker 支持
- [ ] 配置文件支持
- [ ] 日志级别控制
- [ ] 监控和指标

## 快速开始

```bash
# 安装依赖
npm install

# 启动服务
npm start

# 测试（另一个终端）
npm run test:openai

# 配置 OpenCode
# 参考 OPENCODE_SETUP.md
```

## 联系和支持

- 主文档：README.md
- 配置指南：OPENCODE_SETUP.md
- 场景定义：scenarios/web-project-scenario.js
