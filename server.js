const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

// 根据请求自动选择场景
function getScenarioModule(messages) {
  // 检查是否是 OpenCode（通过 system 消息判断）
  if (messages && messages.length > 0) {
    const systemMsg = messages.find(m => m.role === 'system');
    if (systemMsg && systemMsg.content && systemMsg.content.includes('opencode')) {
      console.log('  📱 Detected OpenCode client');
      return require('./scenarios/opencode-scenario');
    }
  }
  
  console.log('  🔧 Using generic scenario');
  return require('./scenarios/web-project-scenario');
}

const app = express();
const PORT = process.env.PORT || 3100;

app.use(cors());
app.use(bodyParser.json());

// 创建日志目录
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// 记录请求到文件
function logRequest(endpoint, requestBody) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = path.join(logsDir, `request_${timestamp}.json`);
  
  const logData = {
    timestamp: new Date().toISOString(),
    endpoint: endpoint,
    request: requestBody
  };
  
  fs.writeFileSync(filename, JSON.stringify(logData, null, 2));
  console.log(`📝 Request logged to: ${filename}`);
  
  // 同时追加到汇总文件
  const summaryFile = path.join(logsDir, 'all_requests.jsonl');
  fs.appendFileSync(summaryFile, JSON.stringify(logData) + '\n');
}

// 会话管理：基于消息历史长度来确定步骤
function getStepFromMessages(messages) {
  // OpenCode 的对话流程：
  // 1. user: "帮我创建..."
  // 2. assistant: "我会帮你..." (步骤1)
  // 3. user: "继续"
  // 4. assistant: tool_calls (步骤2)
  // 5. tool: 执行结果
  // 6. assistant: 确认 (步骤2的后续)
  // 7. user: "继续"
  // 8. assistant: tool_calls (步骤3)
  
  // 检查最后一条消息
  const lastMsg = messages[messages.length - 1];
  
  // 如果最后一条是 tool 消息，说明工具刚执行完，需要确认
  if (lastMsg && lastMsg.role === 'tool') {
    // 返回一个特殊标记，表示需要确认而不是新步骤
    return 'confirm';
  }
  
  // 否则，计算用户消息数量
  let userCount = 0;
  for (const msg of messages) {
    if (msg.role === 'user') {
      userCount++;
    }
  }
  
  return userCount;
}

function getSessionId(messages) {
  // 使用第一条用户消息作为会话标识
  if (messages && messages.length > 0) {
    for (const msg of messages) {
      if (msg.role === 'user') {
        const content = msg.content || '';
        return content.substring(0, 50);
      }
    }
  }
  return 'default';
}

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Mock LLM Server is running' });
});

// 查看所有请求日志
app.get('/logs', (req, res) => {
  const summaryFile = path.join(logsDir, 'all_requests.jsonl');
  
  if (!fs.existsSync(summaryFile)) {
    return res.json({ message: 'No logs yet', logs: [] });
  }
  
  const content = fs.readFileSync(summaryFile, 'utf-8');
  const logs = content.trim().split('\n').map(line => JSON.parse(line));
  
  res.json({
    total: logs.length,
    logs: logs
  });
});

// 查看最新的请求
app.get('/logs/latest', (req, res) => {
  const files = fs.readdirSync(logsDir)
    .filter(f => f.startsWith('request_'))
    .sort()
    .reverse();
  
  if (files.length === 0) {
    return res.json({ message: 'No logs yet' });
  }
  
  const latestFile = path.join(logsDir, files[0]);
  const content = JSON.parse(fs.readFileSync(latestFile, 'utf-8'));
  
  res.json(content);
});

// 清空日志
app.post('/logs/clear', (req, res) => {
  const files = fs.readdirSync(logsDir);
  files.forEach(file => {
    fs.unlinkSync(path.join(logsDir, file));
  });
  
  console.log('🗑️  All logs cleared');
  res.json({ message: 'All logs cleared' });
});

// 模拟Claude API格式
app.post('/v1/messages', (req, res) => {
  const { messages, model, max_tokens } = req.body;
  
  // 记录请求
  logRequest('/v1/messages', req.body);
  
  // 根据请求选择场景
  const scenarios = getScenarioModule(messages);
  
  const sessionId = getSessionId(messages);
  const step = getStepFromMessages(messages);
  
  const userMessage = messages[messages.length - 1]?.content || '';
  
  console.log(`\n[Session: ${sessionId.substring(0, 20)}...] [Step ${step}]`);
  console.log('User message:', userMessage.substring(0, 100));
  console.log('Total messages:', messages.length, '(User messages:', step + ')');
  
  // 获取当前场景的响应
  const response = scenarios.getResponse(step, messages);
  
  console.log(`Responding with step ${step}`);
  
  // 返回Claude API格式的响应
  res.json({
    id: `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: response
      }
    ],
    model: model || 'claude-3-sonnet-20240229',
    stop_reason: 'end_turn',
    usage: {
      input_tokens: 100,
      output_tokens: 200
    }
  });
});

// 模拟OpenAI API格式（支持思考和工具调用）
app.post('/v1/chat/completions', (req, res) => {
  const { messages, model, stream } = req.body;
  
  // 记录请求
  logRequest('/v1/chat/completions', req.body);
  
  // 根据请求选择场景
  const scenarios = getScenarioModule(messages);
  
  const sessionId = getSessionId(messages);
  const step = getStepFromMessages(messages);
  
  const userMessage = messages[messages.length - 1]?.content || '';
  
  console.log(`\n[Session: ${sessionId.substring(0, 20)}...] [Step ${step}]`);
  console.log('User message:', userMessage.substring(0, 100));
  console.log('Total messages:', messages.length, '(User messages:', step === 'confirm' ? 'confirming tool execution' : step + ')');
  console.log('Stream mode:', stream ? 'YES' : 'NO');
  
  // 如果是确认工具执行，返回简单确认
  if (step === 'confirm') {
    console.log('Tool execution completed, sending confirmation');
    
    const confirmContent = "完成";
    
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      const streamId = `chatcmpl_${Date.now()}`;
      const created = Math.floor(Date.now() / 1000);
      
      res.write(`data: ${JSON.stringify({
        id: streamId,
        object: 'chat.completion.chunk',
        created: created,
        model: model || 'gpt-4',
        choices: [{
          index: 0,
          delta: { role: 'assistant' },
          finish_reason: null
        }]
      })}\n\n`);
      
      res.write(`data: ${JSON.stringify({
        id: streamId,
        object: 'chat.completion.chunk',
        created: created,
        model: model || 'gpt-4',
        choices: [{
          index: 0,
          delta: { content: confirmContent },
          finish_reason: null
        }]
      })}\n\n`);
      
      res.write(`data: ${JSON.stringify({
        id: streamId,
        object: 'chat.completion.chunk',
        created: created,
        model: model || 'gpt-4',
        choices: [{
          index: 0,
          delta: {},
          finish_reason: 'stop'
        }]
      })}\n\n`);
      
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    } else {
      res.json({
        id: `chatcmpl_${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model || 'gpt-4',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: confirmContent
          },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15
        }
      });
      return;
    }
  }
  
  const { content, reasoning, toolCalls } = scenarios.getResponseWithTools(step, messages);
  
  console.log(`Responding with step ${step}`);
  if (reasoning) {
    console.log(`  Reasoning: ${reasoning.substring(0, 80)}...`);
  }
  if (toolCalls && toolCalls.length > 0) {
    console.log(`  Tool calls: ${toolCalls.length} tool(s)`);
  }
  
  // 如果请求流式响应
  if (stream) {
    console.log('Using streaming response...\n');
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    const streamId = `chatcmpl_${Date.now()}`;
    const created = Math.floor(Date.now() / 1000);
    
    // 1. 发送 role（第一个 chunk）
    const roleChunk = {
      id: streamId,
      object: 'chat.completion.chunk',
      created: created,
      model: model || 'gpt-4',
      choices: [{
        index: 0,
        delta: {
          role: 'assistant'
        },
        finish_reason: null
      }]
    };
    res.write(`data: ${JSON.stringify(roleChunk)}\n\n`);
    
    // 2. 发送思考过程（如果有）
    if (reasoning) {
      const reasoningChunk = {
        id: streamId,
        object: 'chat.completion.chunk',
        created: created,
        model: model || 'gpt-4',
        choices: [{
          index: 0,
          delta: {
            reasoning: reasoning
          },
          finish_reason: null
        }]
      };
      res.write(`data: ${JSON.stringify(reasoningChunk)}\n\n`);
    }
    
    // 3. 发送内容
    if (content) {
      const contentChunk = {
        id: streamId,
        object: 'chat.completion.chunk',
        created: created,
        model: model || 'gpt-4',
        choices: [{
          index: 0,
          delta: {
            content: content
          },
          finish_reason: null
        }]
      };
      res.write(`data: ${JSON.stringify(contentChunk)}\n\n`);
    }
    
    // 4. 发送工具调用（如果有）- 逐个发送
    if (toolCalls && toolCalls.length > 0) {
      toolCalls.forEach((tool, idx) => {
        const toolCallChunk = {
          id: streamId,
          object: 'chat.completion.chunk',
          created: created,
          model: model || 'gpt-4',
          choices: [{
            index: 0,
            delta: {
              tool_calls: [{
                index: idx,
                id: tool.id,
                type: tool.type,
                function: tool.function
              }]
            },
            finish_reason: null
          }]
        };
        res.write(`data: ${JSON.stringify(toolCallChunk)}\n\n`);
      });
    }
    
    // 5. 发送结束标记
    const finishChunk = {
      id: streamId,
      object: 'chat.completion.chunk',
      created: created,
      model: model || 'gpt-4',
      choices: [{
        index: 0,
        delta: {},
        finish_reason: toolCalls && toolCalls.length > 0 ? 'tool_calls' : 'stop'
      }]
    };
    res.write(`data: ${JSON.stringify(finishChunk)}\n\n`);
    
    // 6. 发送 [DONE]
    res.write('data: [DONE]\n\n');
    res.end();
    
    return;
  }
  
  // 非流式响应（原有逻辑）
  const responseMessage = {
    role: 'assistant',
    content: content
  };
  
  if (reasoning) {
    responseMessage.reasoning = reasoning;
  }
  
  if (toolCalls && toolCalls.length > 0) {
    responseMessage.tool_calls = toolCalls;
  }
  
  const response = {
    id: `chatcmpl_${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: model || 'gpt-4',
    choices: [
      {
        index: 0,
        message: responseMessage,
        finish_reason: toolCalls && toolCalls.length > 0 ? 'tool_calls' : 'stop'
      }
    ],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 200,
      total_tokens: 300
    }
  };
  
  console.log('Response size:', JSON.stringify(response).length, 'bytes');
  console.log('Sending response...\n');
  
  res.json(response);
});

// 重置计数器端点（已废弃，保留用于兼容）
app.post('/reset', (req, res) => {
  console.log('\n[INFO] Reset endpoint called (no longer needed with message-based counting)');
  res.json({ message: 'Using message-based step counting' });
});

// 查看会话状态（已废弃，保留用于兼容）
app.get('/sessions', (req, res) => {
  res.json({
    message: 'Using message-based step counting',
    info: 'Step is determined by counting user messages in the conversation history'
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Mock LLM Server running on http://localhost:${PORT}`);
  console.log(`📝 Health check: http://localhost:${PORT}/health`);
  console.log(`📋 View logs: http://localhost:${PORT}/logs`);
  console.log(`📄 Latest log: http://localhost:${PORT}/logs/latest`);
  console.log(`🗑️  Clear logs: POST http://localhost:${PORT}/logs/clear`);
  console.log(`\nSupported endpoints:`);
  console.log(`  - POST /v1/messages (Claude format)`);
  console.log(`  - POST /v1/chat/completions (OpenAI format)`);
  console.log(`\n💡 Step counting: Based on user message count in conversation history`);
  console.log(`📁 Logs directory: ${logsDir}`);
  console.log(`\nReady to guide opencode through web project creation!\n`);
});
