# 快速参考

## 启动服务

```bash
npm install
npm start
```

服务地址：`http://localhost:3100`

## OpenCode 配置

```json
{
  "apiEndpoint": "http://localhost:3100/v1/chat/completions",
  "model": "gpt-4",
  "apiKey": "sk-mock-not-required"
}
```

## 测试命令

```bash
# 健康检查
curl http://localhost:3100/health

# 测试第一轮
curl -X POST http://localhost:3100/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4","messages":[{"role":"user","content":"帮我创建一个网页应用"}]}'

# 运行自动化测试
npm run test:openai
```

## 响应格式

### 纯文本响应（步骤 1, 13-17）
```json
{
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "响应内容"
    },
    "finish_reason": "stop"
  }]
}
```

### 工具调用响应（步骤 2-12）
```json
{
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "简短说明",
      "reasoning": "详细思考过程",
      "tool_calls": [{
        "id": "call_xxx",
        "type": "function",
        "function": {
          "name": "工具名",
          "arguments": "{\"参数\":\"值\"}"
        }
      }]
    },
    "finish_reason": "tool_calls"
  }]
}
```

## 支持的工具

| 工具名 | 参数 | 说明 |
|--------|------|------|
| `create_directory` | `{"path": "路径"}` | 创建目录 |
| `write_file` | `{"path": "路径", "content": "内容"}` | 写入文件 |
| `list_directory` | `{"path": "路径"}` | 列出目录 |

## 17步场景流程

1. 项目规划 📋
2. 创建后端目录 📁
3. 创建 package.json 📦
4. 创建 server.js 🖥️
5. 创建 routes/todos.js 🛣️
6. 创建前端目录 📁
7. 创建 index.html 📄
8. 创建 style.css 🎨
9. 创建 app.js ⚡
10. 创建 README.md 📖
11. 验证后端文件 ✅
12. 验证前端文件 ✅
13. 测试后端指导 🧪
14. 测试前端指导 🧪
15. 功能测试指导 🧪
16. 优化建议 💡
17. 项目总结 🎉

## 步骤计数规则

```
步骤 = 消息历史中的用户消息数量
```

示例：
- `[user]` → 步骤 1
- `[user, assistant, user]` → 步骤 2
- `[system, user, assistant, user]` → 步骤 2（系统消息不计数）

## 常见问题

### Q: OpenCode 一直重复请求？
A: 正常现象，表示在发送请求。检查 OpenCode 是否正确处理响应。

### Q: 如何查看详细日志？
A: 查看运行 `npm start` 的终端输出。

### Q: 如何修改场景？
A: 编辑 `scenarios/web-project-scenario.js`

### Q: 如何更改端口？
A: `PORT=3200 npm start`

## 文档索引

- 📘 **README.md** - 完整文档
- 🔧 **OPENCODE_SETUP.md** - OpenCode 配置详解
- 📊 **SUMMARY.md** - 项目总结
- ⚡ **QUICK_REFERENCE.md** - 本文件

## 一键测试

```bash
# 启动服务（终端1）
npm start

# 运行测试（终端2）
npm run test:openai
```

预期输出：5轮交互，包含思考过程和工具调用。
