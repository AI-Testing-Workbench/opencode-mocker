const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// ── 场景状态（内存） ──
let scenarioConfig = {
  mode: 'scenario', // 'scenario' | 'echo' | 'fixed' | 'delay' | 'bigdata' | 'error' | 'longrun'
  fixedReply: 'This is a mock response.',
  delayMs: 2000,
  sizeMB: 1,
  statusCode: 500,
  message: 'Internal Server Error',
  longrunHours: 1,
  longrunIntervalMs: 5000,
};

// ── 工具函数 ──

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildMessage(content, model) {
  return {
    id: `chatcmpl-${uuidv4()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: model || 'mock-model',
    choices: [{
      index: 0,
      message: { role: 'assistant', content },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  };
}

async function sendStream(res, content, model) {
  const id = `chatcmpl-${uuidv4()}`;
  const created = Math.floor(Date.now() / 1000);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // opening role chunk
  res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: model || 'mock-model', choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }] })}\n\n`);

  // content in word-sized chunks
  const words = content.split(' ');
  for (let i = 0; i < words.length; i++) {
    const piece = (i === 0 ? '' : ' ') + words[i];
    res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: model || 'mock-model', choices: [{ index: 0, delta: { content: piece }, finish_reason: null }] })}\n\n`);
    await new Promise(r => setTimeout(r, 20));
  }

  // finish
  res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: model || 'mock-model', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
}

function generateBigContent(targetBytes) {
  const sentence = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris. ';
  let result = '';
  while (Buffer.byteLength(result, 'utf8') < targetBytes) result += sentence;
  return result.slice(0, targetBytes);
}

const RANDOM_SENTENCES = [
  'Analyzing the provided context and gathering relevant information.',
  'Cross-referencing multiple data sources to ensure accuracy.',
  'Evaluating potential approaches before proceeding.',
  'Identified a key pattern in the input data.',
  'Considering edge cases that may affect the outcome.',
  'Reviewing previous steps to maintain consistency.',
  'Structuring the response for clarity and completeness.',
  'Validating assumptions against known constraints.',
  'Exploring alternative solutions to find the optimal path.',
  'Synthesizing information from various components.',
  'Checking for potential conflicts in the current approach.',
  'Refining the analysis based on new observations.',
  'Breaking down the problem into smaller, manageable parts.',
  'Verifying that all requirements have been addressed.',
  'Preparing a comprehensive summary of findings.',
  'Iterating over the solution to improve quality.',
  'Detected an interesting edge case worth noting.',
  'Aligning the output with the expected format.',
  'Running internal consistency checks on the result.',
  'Almost there — finalizing the remaining details.',
];
function randomSentence() {
  return RANDOM_SENTENCES[Math.floor(Math.random() * RANDOM_SENTENCES.length)];
}

// ── 多轮对话场景模块选择 ──
function getScenarioModule(messages) {
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

function getStepFromMessages(messages) {
  const lastMsg = messages[messages.length - 1];
  if (lastMsg && lastMsg.role === 'tool') return 'confirm';
  let userCount = 0;
  for (const msg of messages) {
    if (msg.role === 'user') userCount++;
  }
  return userCount;
}

function getSessionId(messages) {
  if (messages && messages.length > 0) {
    for (const msg of messages) {
      if (msg.role === 'user') return (msg.content || '').substring(0, 50);
    }
  }
  return 'default';
}

// ── Express 应用 ──
const app = express();
const PORT = process.env.PORT || 3100;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// 日志目录
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);

function logRequest(endpoint, requestBody) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = path.join(logsDir, `request_${timestamp}.json`);
  const logData = {
    timestamp: new Date().toISOString(),
    endpoint,
    scenario: scenarioConfig.mode,
    request: requestBody,
  };
  fs.writeFileSync(filename, JSON.stringify(logData, null, 2));
  console.log(`📝 Request logged to: ${filename}`);
  const summaryFile = path.join(logsDir, 'all_requests.jsonl');
  fs.appendFileSync(summaryFile, JSON.stringify(logData) + '\n');
}

// ── 健康检查 ──
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', message: 'Mock LLM Server is running' });
});

// ── 场景管理 API ──
app.get('/api/scenario', (_req, res) => res.json(scenarioConfig));

app.post('/api/scenario', (req, res) => {
  const { mode, fixedReply, delayMs, sizeMB, statusCode, message,
          longrunHours, longrunIntervalMs } = req.body;
  const validModes = ['scenario', 'echo', 'fixed', 'delay', 'bigdata', 'error', 'longrun'];
  if (!validModes.includes(mode)) {
    return res.status(400).json({ error: 'Invalid mode' });
  }
  scenarioConfig.mode = mode;
  if (fixedReply        !== undefined) scenarioConfig.fixedReply        = String(fixedReply);
  if (delayMs           !== undefined) scenarioConfig.delayMs           = Math.min(60000, Math.max(0, parseInt(delayMs)));
  if (sizeMB            !== undefined) scenarioConfig.sizeMB            = Math.min(5, Math.max(0.1, parseFloat(sizeMB)));
  if (statusCode        !== undefined) scenarioConfig.statusCode        = parseInt(statusCode);
  if (message           !== undefined) scenarioConfig.message           = String(message);
  if (longrunHours      !== undefined) scenarioConfig.longrunHours      = Math.min(24, Math.max(0.1, parseFloat(longrunHours)));
  if (longrunIntervalMs !== undefined) scenarioConfig.longrunIntervalMs = Math.min(30000, Math.max(500, parseInt(longrunIntervalMs)));
  console.log(`\n🎭 Scenario changed: ${JSON.stringify(scenarioConfig)}`);
  res.json({ ok: true, config: scenarioConfig });
});

// ── 场景拦截中间件 ──
async function scenarioMiddleware(req, res, next) {
  const { mode, fixedReply, delayMs, sizeMB, statusCode, message,
          longrunHours, longrunIntervalMs } = scenarioConfig;
  const isStream = !!req.body?.stream;
  const model = req.body?.model || 'mock-model';

  // scenario 模式：放行，走多轮对话逻辑
  if (mode === 'scenario') return next();

  // 其余模式在此直接响应
  logRequest(req.path, req.body);

  // ── error ──
  if (mode === 'error') {
    console.log(`  ❌ Error mode: ${statusCode} ${message}`);
    return res.status(statusCode).json({
      error: { message, type: 'mock_error', code: statusCode }
    });
  }

  // ── longrun：持续 streaming，直到超时 ──
  if (mode === 'longrun') {
    const durationMs = longrunHours * 60 * 60 * 1000;
    const id = `chatcmpl-${uuidv4()}`;
    const startTime = Date.now();
    console.log(`  ♾️  Long run mode: ${longrunHours}h, interval ${longrunIntervalMs}ms`);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model, choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }] })}\n\n`);

    const timer = setInterval(() => {
      if (res.writableEnded) { clearInterval(timer); return; }
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, Math.floor((durationMs - elapsed) / 1000));
      const content = `${randomSentence()} *(${remaining}s remaining)*\n\n`;
      res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model, choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\n`);
      if (elapsed >= durationMs) {
        clearInterval(timer);
        res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
    }, longrunIntervalMs);

    req.on('close', () => clearInterval(timer));
    return;
  }

  // ── bigdata ──
  if (mode === 'bigdata') {
    const targetBytes = Math.round(sizeMB * 1024 * 1024);
    const bigContent = generateBigContent(targetBytes);
    console.log(`  📦 Big data mode: sending ${sizeMB}MB`);

    if (isStream) {
      const id = `chatcmpl-${uuidv4()}`;
      const created = Math.floor(Date.now() / 1000);
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }] })}\n\n`);
      const chunkSize = 64 * 1024;
      let offset = 0;
      while (offset < bigContent.length) {
        const slice = bigContent.slice(offset, offset + chunkSize);
        res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { content: slice }, finish_reason: null }] })}\n\n`);
        offset += chunkSize;
        await new Promise(r => setImmediate(r));
      }
      res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }
    return res.json(buildMessage(bigContent, model));
  }

  // ── delay ──
  if (mode === 'delay') {
    console.log(`  ⏱️  Delay mode: waiting ${delayMs}ms`);
    await sleep(delayMs);
    console.log(`  ⏱️  Delay done`);
    const content = fixedReply;
    if (isStream) return sendStream(res, content, model);
    return res.json(buildMessage(content, model));
  }

  // ── echo ──
  if (mode === 'echo') {
    const msgs = req.body?.messages || [];
    const last = msgs[msgs.length - 1];
    const lastContent = typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content || '');
    const content = `[ECHO] ${lastContent}`;
    console.log(`  🔁 Echo mode`);
    if (isStream) return sendStream(res, content, model);
    return res.json(buildMessage(content, model));
  }

  // ── fixed ──
  if (mode === 'fixed') {
    console.log(`  📌 Fixed mode`);
    if (isStream) return sendStream(res, fixedReply, model);
    return res.json(buildMessage(fixedReply, model));
  }

  return res.status(400).json({ error: `Unknown mode: ${mode}` });
}

// ── 日志端点 ──
app.get('/logs', (_req, res) => {
  const summaryFile = path.join(logsDir, 'all_requests.jsonl');
  if (!fs.existsSync(summaryFile)) return res.json({ message: 'No logs yet', logs: [] });
  const content = fs.readFileSync(summaryFile, 'utf-8');
  const logs = content.trim().split('\n').map(line => JSON.parse(line));
  res.json({ total: logs.length, logs });
});

app.get('/logs/latest', (_req, res) => {
  const files = fs.readdirSync(logsDir).filter(f => f.startsWith('request_')).sort().reverse();
  if (files.length === 0) return res.json({ message: 'No logs yet' });
  res.json(JSON.parse(fs.readFileSync(path.join(logsDir, files[0]), 'utf-8')));
});

app.post('/logs/clear', (_req, res) => {
  fs.readdirSync(logsDir).forEach(file => fs.unlinkSync(path.join(logsDir, file)));
  console.log('🗑️  All logs cleared');
  res.json({ message: 'All logs cleared' });
});

// ── Claude API 格式 ──
app.post('/v1/messages', scenarioMiddleware, (req, res) => {
  const { messages, model } = req.body;
  logRequest('/v1/messages', req.body);
  const scenarios = getScenarioModule(messages);
  const sessionId = getSessionId(messages);
  const step = getStepFromMessages(messages);
  const userMessage = messages[messages.length - 1]?.content || '';
  console.log(`\n[Session: ${sessionId.substring(0, 20)}...] [Step ${step}]`);
  console.log('User message:', userMessage.substring(0, 100));
  const response = scenarios.getResponse(step, messages);
  res.json({
    id: `msg_${uuidv4()}`,
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: response }],
    model: model || 'claude-3-sonnet-20240229',
    stop_reason: 'end_turn',
    usage: { input_tokens: 100, output_tokens: 200 },
  });
});

// ── OpenAI API 格式 ──
app.post('/v1/chat/completions', scenarioMiddleware, (req, res) => {
  const { messages, model, stream } = req.body;
  logRequest('/v1/chat/completions', req.body);
  const scenarios = getScenarioModule(messages);
  const sessionId = getSessionId(messages);
  const step = getStepFromMessages(messages);
  const userMessage = messages[messages.length - 1]?.content || '';
  console.log(`\n[Session: ${sessionId.substring(0, 20)}...] [Step ${step}]`);
  console.log('User message:', userMessage.substring(0, 100));
  console.log('Stream mode:', stream ? 'YES' : 'NO');

  // tool 执行完毕后的确认
  if (step === 'confirm') {
    const confirmContent = '完成';
    if (stream) return sendStream(res, confirmContent, model);
    return res.json(buildMessage(confirmContent, model));
  }

  const { content, reasoning, toolCalls } = scenarios.getResponseWithTools(step, messages);
  console.log(`Responding with step ${step}`);
  if (reasoning) console.log(`  Reasoning: ${reasoning.substring(0, 80)}...`);
  if (toolCalls?.length) console.log(`  Tool calls: ${toolCalls.length} tool(s)`);

  if (stream) {
    const id = `chatcmpl-${uuidv4()}`;
    const created = Math.floor(Date.now() / 1000);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: model || 'mock-model', choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] })}\n\n`);
    if (reasoning) res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: model || 'mock-model', choices: [{ index: 0, delta: { reasoning }, finish_reason: null }] })}\n\n`);
    if (content)   res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: model || 'mock-model', choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\n`);
    if (toolCalls?.length) {
      toolCalls.forEach((tool, idx) => {
        res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: model || 'mock-model', choices: [{ index: 0, delta: { tool_calls: [{ index: idx, id: tool.id, type: tool.type, function: tool.function }] }, finish_reason: null }] })}\n\n`);
      });
    }
    res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: model || 'mock-model', choices: [{ index: 0, delta: {}, finish_reason: toolCalls?.length ? 'tool_calls' : 'stop' }] })}\n\n`);
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  const responseMessage = { role: 'assistant', content };
  if (reasoning) responseMessage.reasoning = reasoning;
  if (toolCalls?.length) responseMessage.tool_calls = toolCalls;

  res.json({
    id: `chatcmpl-${uuidv4()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: model || 'mock-model',
    choices: [{ index: 0, message: responseMessage, finish_reason: toolCalls?.length ? 'tool_calls' : 'stop' }],
    usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
  });
});

// ── 兼容旧端点 ──
app.post('/reset', (_req, res) => res.json({ message: 'Using message-based step counting' }));
app.get('/sessions', (_req, res) => res.json({ message: 'Using message-based step counting' }));

app.listen(PORT, () => {
  console.log(`\n🚀 Mock LLM Server running on http://localhost:${PORT}`);
  console.log(`🎛️  Control Panel:  http://localhost:${PORT}/`);
  console.log(`📝 Health check:   http://localhost:${PORT}/health`);
  console.log(`📋 View logs:      http://localhost:${PORT}/logs`);
  console.log(`\nSupported endpoints:`);
  console.log(`  - POST /v1/messages          (Claude format)`);
  console.log(`  - POST /v1/chat/completions  (OpenAI format)`);
  console.log(`  - GET  /api/scenario         (get current scenario)`);
  console.log(`  - POST /api/scenario         (set scenario)`);
  console.log(`\n📁 Logs directory: ${logsDir}\n`);
});
