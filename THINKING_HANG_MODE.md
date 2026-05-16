# Thinking-Hang 模式说明

## 概述

`thinking-hang` 是一个新的测试场景模式，用于模拟 AI 模型发送思考内容（reasoning）后挂起不响应的情况。

## 行为

1. **发送 role**: 返回 `role: assistant`
2. **发送 reasoning**: 返回思考内容（可自定义）
3. **挂起**: 不发送 `content` 和 `[DONE]` 标记
4. **保持连接**: 连接保持打开状态，直到客户端超时

## 使用场景

适合测试以下情况：
- 客户端处理思考内容后的超时行为
- 流式响应中断的错误恢复
- 长时间等待的超时处理
- 思考内容显示后的用户体验

## 配置方法

### 方法 1: 通过 Web 界面

1. 访问 `http://localhost:3000`
2. 在"场景选择"下拉菜单中选择 "Thinking Hang — 思考后挂起 🧠"
3. 在配置面板中输入自定义的思考内容（可选）
4. 点击"应用"按钮

### 方法 2: 通过 API

```bash
curl -X POST http://localhost:3000/api/scenario \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "thinking-hang",
    "fixedReply": "我正在思考这个问题...\n\n分析需求中..."
  }'
```

### 方法 3: 使用测试脚本

```bash
node test-thinking-hang.js
```

## 响应格式

```
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1234567890,"model":"mock-model","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}

data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1234567890,"model":"mock-model","choices":[{"index":0,"delta":{"reasoning":"让我思考一下这个问题...\n\n首先，我需要分析用户的需求。\n然后，我会制定一个详细的计划。\n最后，我会逐步执行这个计划。\n\n现在开始执行..."},"finish_reason":null}]}

# 之后不再发送任何数据，连接保持打开
```

## 默认思考内容

如果不指定 `fixedReply`，将使用以下默认内容：

```
让我思考一下这个问题...

首先，我需要分析用户的需求。
然后，我会制定一个详细的计划。
最后，我会逐步执行这个计划。

现在开始执行...
```

## 与其他挂起模式的区别

| 模式 | 发送内容 | 用途 |
|------|---------|------|
| `hang` | role + 部分 content chunks | 测试普通内容流挂起 |
| `tool-hang` | role + 部分工具调用参数 | 测试工具调用挂起 |
| `thinking-hang` | role + 完整 reasoning | 测试思考内容后挂起 |

## 注意事项

- 连接会一直保持打开，直到客户端超时或主动断开
- 不会发送 `[DONE]` 标记
- 不会发送任何 `content` 字段
- 适合测试客户端的超时处理和错误恢复机制
