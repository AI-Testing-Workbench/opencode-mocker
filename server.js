const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// ── 场景状态（内存） ──
let scenarioConfig = {
  mode: 'scenario', // 'scenario' | 'echo' | 'fixed' | 'delay' | 'bigdata' | 'error' | 'longrun' | 'reset' | 'hang' | 'stream-error' | 'tool-hang' | 'tool-mocker'
  fixedReply: 'This is a mock response.',
  delayMs: 2000,
  sizeMB: 1,
  statusCode: 500,
  message: 'Internal Server Error',
  longrunHours: 1,
  longrunIntervalMs: 5000,
  // 网络异常场景参数
  resetAfterBytes: 1024, // reset 场景：发送多少字节后断开
  hangAfterChunks: 3,    // hang 场景：发送多少个 chunk 后挂起
  streamErrorAfterMs: 500, // stream-error 场景：多少毫秒后抛出错误
  toolHangPartial: 0.5,  // tool-hang 场景：工具参数发送比例（0-1）
  // 场景循环参数
  loopCount: 10,          // scenario 场景：循环次数
};

// ── 会话循环跟踪（内存） ──
const sessionLoops = new Map(); // sessionId -> { current: number, total: number, currentStep: number }

// ── 工具 Mock 配置（内存） ──
let toolMockConfig = {
  enabled: false,
  tools: {
    // 文件操作工具
    read: {
      enabled: true,
      arguments: {
        path: '/test/file.txt'
      },
      response: {
        title: 'Read File',
        output: 'File content here...',
        metadata: { path: '/test/file.txt' }
      },
      delay: 0,
      error: null
    },
    write: {
      enabled: true,
      arguments: {
        path: '/test/file.txt',
        content: 'Hello, World!'
      },
      response: {
        title: 'Write File',
        output: 'File written successfully',
        metadata: { path: '/test/file.txt', bytes: 100 }
      },
      delay: 0,
      error: null
    },
    edit: {
      enabled: true,
      arguments: {
        path: '/test/file.txt',
        oldStr: 'old text',
        newStr: 'new text'
      },
      response: {
        title: 'Edit File',
        output: 'File edited successfully',
        metadata: { path: '/test/file.txt', changes: 1 }
      },
      delay: 0,
      error: null
    },
    
    // 搜索工具
    glob: {
      enabled: true,
      arguments: {
        pattern: '**/*.ts'
      },
      response: {
        title: 'Find Files',
        output: 'src/index.ts\nsrc/utils.ts\ntest/test.ts',
        metadata: { pattern: '**/*.ts', count: 3 }
      },
      delay: 0,
      error: null
    },
    grep: {
      enabled: true,
      arguments: {
        pattern: 'TODO',
        path: '/test'
      },
      response: {
        title: 'Search Files',
        output: 'file.txt:10:// TODO: implement feature\nfile.txt:25:// TODO: fix bug',
        metadata: { matches: 2 }
      },
      delay: 0,
      error: null
    },
    
    // 命令执行
    bash: {
      enabled: true,
      arguments: {
        command: 'npm install',
        description: 'Install dependencies'
      },
      response: {
        title: 'Execute Command',
        output: 'Command executed successfully\nOutput line 1\nOutput line 2',
        metadata: { exitCode: 0 }
      },
      delay: 0,
      error: null
    },
    
    // Web 工具
    webfetch: {
      enabled: true,
      arguments: {
        url: 'https://example.com',
        mode: 'truncated'
      },
      response: {
        title: 'Fetch URL',
        output: '<html>Page content</html>',
        metadata: { url: 'https://example.com', status: 200 }
      },
      delay: 0,
      error: null
    },
    
    // 任务管理
    task: {
      enabled: true,
      arguments: {
        action: 'create',
        title: 'New Task',
        description: 'Task description'
      },
      response: {
        title: 'Task Created',
        output: 'Task created successfully\nID: task-123',
        metadata: { taskId: 'task-123', action: 'create' }
      },
      delay: 0,
      error: null
    },
    todowrite: {
      enabled: true,
      arguments: {
        path: '/test/TODO.md',
        content: '- [ ] Task 1\n- [ ] Task 2'
      },
      response: {
        title: 'Write TODO',
        output: 'TODO file written successfully',
        metadata: { path: '/test/TODO.md', items: 2 }
      },
      delay: 0,
      error: null
    },
    
    // 交互工具
    question: {
      enabled: true,
      arguments: {
        question: 'Do you want to proceed?',
        options: ['Yes', 'No']
      },
      response: {
        title: 'User Response',
        output: 'User selected: Yes',
        metadata: { question: 'Do you want to proceed?', answer: 'Yes' }
      },
      delay: 0,
      error: null
    },
    
    // 其他工具
    skill: {
      enabled: true,
      arguments: {
        name: 'test-skill',
        action: 'execute'
      },
      response: {
        title: 'Skill Executed',
        output: 'Skill executed successfully',
        metadata: { skill: 'test-skill', result: 'success' }
      },
      delay: 0,
      error: null
    },
    sandbox: {
      enabled: true,
      arguments: {
        code: 'console.log("Hello")',
        language: 'javascript'
      },
      response: {
        title: 'Sandbox Execution',
        output: 'Hello\n',
        metadata: { language: 'javascript', exitCode: 0 }
      },
      delay: 0,
      error: null
    }
  }
};

// ── 工具调用 ID 到工具名称的映射（内存） ──
const toolCallIdToName = new Map();

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

function getStepFromMessages(messages, sessionId) {
  const lastMsg = messages[messages.length - 1];
  
  // 如果会话有循环状态，使用状态中的步骤
  if (sessionLoops.has(sessionId)) {
    const loopState = sessionLoops.get(sessionId);
    
    // 如果最后一条是用户消息，重置到步骤1
    if (lastMsg && lastMsg.role === 'user') {
      loopState.currentStep = 1;
      return 1;
    }
    
    // 如果最后一条是工具结果
    if (lastMsg && lastMsg.role === 'tool') {
      // 检查是否是自动循环触发工具
      if (lastMsg.tool_call_id && lastMsg.tool_call_id.startsWith('call_auto_loop_')) {
        console.log('  🔄 Detected auto-loop trigger, resetting to step 1');
        loopState.currentStep = 1;
        return 1;
      }
      
      // 否则步骤+1
      loopState.currentStep++;
      return loopState.currentStep;
    }
    
    // 其他情况返回当前步骤
    return loopState.currentStep;
  }
  
  // 没有循环状态时，使用原来的逻辑
  // 如果最后一条是用户消息，说明是新一轮的开始，返回步骤1
  if (lastMsg && lastMsg.role === 'user') {
    return 1;
  }
  
  // 如果最后一条是工具结果，计算从最后一个用户消息之后的工具调用数量
  if (lastMsg && lastMsg.role === 'tool') {
    // 找到最后一个用户消息的索引
    let lastUserIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserIndex = i;
        break;
      }
    }
    
    // 统计从最后一个用户消息之后的工具调用数量
    let toolCallCount = 0;
    for (let i = lastUserIndex + 1; i < messages.length; i++) {
      if (messages[i].role === 'assistant' && messages[i].tool_calls && messages[i].tool_calls.length > 0) {
        toolCallCount++;
      }
    }
    
    // 返回下一步：已执行的工具调用数 + 1
    return toolCallCount + 1;
  }
  
  // 默认返回步骤1
  return 1;
}

function getSessionId(messages) {
  if (messages && messages.length > 0) {
    for (const msg of messages) {
      if (msg.role === 'user') {
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || '');
        return content.substring(0, 50);
      }
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

function logRequest(endpoint, requestBody, responseBody = null) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = path.join(logsDir, `request_${timestamp}.json`);
  const logData = {
    timestamp: new Date().toISOString(),
    endpoint,
    scenario: scenarioConfig.mode,
    request: requestBody,
    response: responseBody,
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
          longrunHours, longrunIntervalMs, resetAfterBytes, hangAfterChunks,
          streamErrorAfterMs, toolHangPartial, loopCount } = req.body;
  const validModes = ['scenario', 'echo', 'fixed', 'delay', 'bigdata', 'error', 'longrun',
                      'reset', 'hang', 'stream-error', 'tool-hang', 'tool-mocker'];
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
  if (resetAfterBytes   !== undefined) scenarioConfig.resetAfterBytes   = Math.min(10240, Math.max(100, parseInt(resetAfterBytes)));
  if (hangAfterChunks   !== undefined) scenarioConfig.hangAfterChunks   = Math.min(20, Math.max(1, parseInt(hangAfterChunks)));
  if (streamErrorAfterMs !== undefined) scenarioConfig.streamErrorAfterMs = Math.min(10000, Math.max(100, parseInt(streamErrorAfterMs)));
  if (toolHangPartial   !== undefined) scenarioConfig.toolHangPartial   = Math.min(1, Math.max(0, parseFloat(toolHangPartial)));
  if (loopCount         !== undefined) scenarioConfig.loopCount         = Math.min(100, Math.max(1, parseInt(loopCount)));
  console.log(`\n🎭 Scenario changed: ${JSON.stringify(scenarioConfig)}`);
  res.json({ ok: true, config: scenarioConfig });
});

// ── 场景拦截中间件 ──
async function scenarioMiddleware(req, res, next) {
  const { mode, fixedReply, delayMs, sizeMB, statusCode, message,
          longrunHours, longrunIntervalMs } = scenarioConfig;
  const isStream = !!req.body?.stream;
  const model = req.body?.model || 'mock-model';

  // scenario 和 tool-mocker 模式：放行，走多轮对话逻辑
  if (mode === 'scenario' || mode === 'tool-mocker') return next();

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

  // ── reset：连接重置（模拟 TypeError: terminated） ──
  if (mode === 'reset') {
    const { resetAfterBytes } = scenarioConfig;
    console.log(`  🔌 Reset mode: will disconnect after ${resetAfterBytes} bytes`);
    
    const id = `chatcmpl-${uuidv4()}`;
    const created = Math.floor(Date.now() / 1000);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 发送角色
    res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] })}\n\n`);
    
    // 发送部分内容
    let bytesSent = 0;
    const content = 'This is a partial response that will be interrupted by connection reset. ';
    const words = content.split(' ');
    
    for (const word of words) {
      const chunk = `data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { content: word + ' ' }, finish_reason: null }] })}\n\n`;
      bytesSent += Buffer.byteLength(chunk, 'utf8');
      res.write(chunk);
      
      if (bytesSent >= resetAfterBytes) {
        console.log(`  ❌ Destroying connection after ${bytesSent} bytes`);
        await sleep(50); // 让客户端接收到部分数据
        res.destroy(new Error('connection reset'));
        return;
      }
      await sleep(20);
    }
    
    // 如果没有达到阈值，正常结束
    res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  // ── hang：流挂起（不发送 [DONE]） ──
  if (mode === 'hang') {
    const { hangAfterChunks } = scenarioConfig;
    console.log(`  ⏸️  Hang mode: will hang after ${hangAfterChunks} chunks`);
    
    const id = `chatcmpl-${uuidv4()}`;
    const created = Math.floor(Date.now() / 1000);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 发送角色
    res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] })}\n\n`);
    
    // 发送指定数量的 chunks
    for (let i = 0; i < hangAfterChunks; i++) {
      res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { content: `Chunk ${i + 1}... ` }, finish_reason: null }] })}\n\n`);
      await sleep(50);
    }
    
    console.log(`  ⏳ Connection hanging (no [DONE] marker will be sent)`);
    // 不发送 [DONE]，也不关闭连接
    // 连接会一直保持打开状态，直到客户端超时
    return;
  }

  // ── stream-error：流传输错误 ──
  if (mode === 'stream-error') {
    const { streamErrorAfterMs } = scenarioConfig;
    console.log(`  💥 Stream error mode: will error after ${streamErrorAfterMs}ms`);
    
    const id = `chatcmpl-${uuidv4()}`;
    const created = Math.floor(Date.now() / 1000);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 发送角色
    res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] })}\n\n`);
    
    // 发送部分内容
    res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { content: 'Partial response before error...' }, finish_reason: null }] })}\n\n`);
    
    // 等待指定时间后抛出错误
    await sleep(streamErrorAfterMs);
    console.log(`  ❌ Destroying stream with error`);
    res.destroy(new Error('Stream transmission failed'));
    return;
  }

  // ── tool-hang：工具调用挂起 ──
  if (mode === 'tool-hang') {
    const { toolHangPartial } = scenarioConfig;
    console.log(`  🔧 Tool hang mode: will send ${toolHangPartial * 100}% of tool arguments`);
    
    const id = `chatcmpl-${uuidv4()}`;
    const created = Math.floor(Date.now() / 1000);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 发送角色
    res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] })}\n\n`);
    
    // 发送工具调用开始
    const toolCallId = 'call_' + uuidv4().substring(0, 8);
    res.write(`data: ${JSON.stringify({ 
      id, object: 'chat.completion.chunk', created, model, 
      choices: [{ 
        index: 0, 
        delta: { 
          tool_calls: [{ 
            index: 0, 
            id: toolCallId, 
            type: 'function', 
            function: { name: 'read_file', arguments: '' } 
          }] 
        }, 
        finish_reason: null 
      }] 
    })}\n\n`);
    
    // 发送部分参数
    const fullArgs = JSON.stringify({ path: '/test/file.txt', encoding: 'utf-8' });
    const partialLength = Math.floor(fullArgs.length * toolHangPartial);
    const partialArgs = fullArgs.substring(0, partialLength);
    
    res.write(`data: ${JSON.stringify({ 
      id, object: 'chat.completion.chunk', created, model, 
      choices: [{ 
        index: 0, 
        delta: { 
          tool_calls: [{ 
            index: 0, 
            function: { arguments: partialArgs } 
          }] 
        }, 
        finish_reason: null 
      }] 
    })}\n\n`);
    
    await sleep(100);
    console.log(`  ⏳ Tool call hanging (incomplete arguments: "${partialArgs}")`);
    // 不发送完整参数，也不发送 [DONE]
    return;
  }

  return res.status(400).json({ error: `Unknown mode: ${mode}` });
}

// ── 工具 Mock 管理 API ──
app.get('/api/tools', (_req, res) => res.json(toolMockConfig));

app.post('/api/tools', (req, res) => {
  const { enabled, tools } = req.body;
  if (enabled !== undefined) toolMockConfig.enabled = !!enabled;
  if (tools) {
    Object.keys(tools).forEach(toolName => {
      if (!toolMockConfig.tools[toolName]) {
        toolMockConfig.tools[toolName] = {
          enabled: true,
          response: { title: toolName, output: '', metadata: {} },
          delay: 0,
          error: null
        };
      }
      Object.assign(toolMockConfig.tools[toolName], tools[toolName]);
    });
  }
  console.log(`\n🔧 Tool mock config updated`);
  res.json({ ok: true, config: toolMockConfig });
});

app.post('/api/tools/:toolName', (req, res) => {
  const { toolName } = req.params;
  const { enabled, response, delay, error } = req.body;
  
  if (!toolMockConfig.tools[toolName]) {
    toolMockConfig.tools[toolName] = {
      enabled: true,
      response: { title: toolName, output: '', metadata: {} },
      delay: 0,
      error: null
    };
  }
  
  if (enabled !== undefined) toolMockConfig.tools[toolName].enabled = !!enabled;
  if (response) toolMockConfig.tools[toolName].response = response;
  if (delay !== undefined) toolMockConfig.tools[toolName].delay = Math.max(0, parseInt(delay));
  if (error !== undefined) toolMockConfig.tools[toolName].error = error;
  
  console.log(`\n🔧 Tool mock updated: ${toolName}`);
  res.json({ ok: true, tool: toolMockConfig.tools[toolName] });
});

// 重置工具配置为默认值
app.post('/api/tools/reset', (req, res) => {
  console.log(`\n🔄 Resetting tool config to defaults...`);
  
  toolMockConfig = {
    enabled: false,
    tools: {
      // 文件操作工具
      read: {
        enabled: true,
        arguments: { path: '/test/file.txt' },
        response: {
          title: 'Read File',
          output: 'File content here...',
          metadata: { path: '/test/file.txt' }
        },
        delay: 0,
        error: null
      },
      write: {
        enabled: true,
        arguments: { path: '/test/file.txt', content: 'Hello, World!' },
        response: {
          title: 'Write File',
          output: 'File written successfully',
          metadata: { path: '/test/file.txt', bytes: 100 }
        },
        delay: 0,
        error: null
      },
      edit: {
        enabled: true,
        arguments: { path: '/test/file.txt', oldStr: 'old text', newStr: 'new text' },
        response: {
          title: 'Edit File',
          output: 'File edited successfully',
          metadata: { path: '/test/file.txt', changes: 1 }
        },
        delay: 0,
        error: null
      },
      
      // 搜索工具
      glob: {
        enabled: true,
        arguments: { pattern: '**/*.ts' },
        response: {
          title: 'Find Files',
          output: 'src/index.ts\nsrc/utils.ts\ntest/test.ts',
          metadata: { pattern: '**/*.ts', count: 3 }
        },
        delay: 0,
        error: null
      },
      grep: {
        enabled: true,
        arguments: { pattern: 'TODO', path: '/test' },
        response: {
          title: 'Search Files',
          output: 'file.txt:10:// TODO: implement feature\nfile.txt:25:// TODO: fix bug',
          metadata: { matches: 2 }
        },
        delay: 0,
        error: null
      },
      
      // 命令执行
      bash: {
        enabled: true,
        arguments: { command: 'npm install', description: 'Install dependencies' },
        response: {
          title: 'Execute Command',
          output: 'Command executed successfully\nOutput line 1\nOutput line 2',
          metadata: { exitCode: 0 }
        },
        delay: 0,
        error: null
      },
      
      // Web 工具
      webfetch: {
        enabled: true,
        arguments: { url: 'https://example.com', mode: 'truncated' },
        response: {
          title: 'Fetch URL',
          output: '<html>Page content</html>',
          metadata: { url: 'https://example.com', status: 200 }
        },
        delay: 0,
        error: null
      },
      
      // 任务管理
      task: {
        enabled: true,
        arguments: { action: 'create', title: 'New Task', description: 'Task description' },
        response: {
          title: 'Task Created',
          output: 'Task created successfully\nID: task-123',
          metadata: { taskId: 'task-123', action: 'create' }
        },
        delay: 0,
        error: null
      },
      todowrite: {
        enabled: true,
        arguments: { path: '/test/TODO.md', content: '- [ ] Task 1\n- [ ] Task 2' },
        response: {
          title: 'Write TODO',
          output: 'TODO file written successfully',
          metadata: { path: '/test/TODO.md', items: 2 }
        },
        delay: 0,
        error: null
      },
      
      // 交互工具
      question: {
        enabled: true,
        arguments: { question: 'Do you want to proceed?', options: ['Yes', 'No'] },
        response: {
          title: 'User Response',
          output: 'User selected: Yes',
          metadata: { question: 'Do you want to proceed?', answer: 'Yes' }
        },
        delay: 0,
        error: null
      },
      
      // 其他工具
      skill: {
        enabled: true,
        arguments: { name: 'test-skill', action: 'execute' },
        response: {
          title: 'Skill Executed',
          output: 'Skill executed successfully',
          metadata: { skill: 'test-skill', result: 'success' }
        },
        delay: 0,
        error: null
      },
      sandbox: {
        enabled: true,
        arguments: { code: 'console.log("Hello")', language: 'javascript' },
        response: {
          title: 'Sandbox Execution',
          output: 'Hello\n',
          metadata: { language: 'javascript', exitCode: 0 }
        },
        delay: 0,
        error: null
      }
    }
  };
  
  console.log(`✅ Tool config reset complete. ${Object.keys(toolMockConfig.tools).length} tools loaded.`);
  res.json({ ok: true, message: 'Tool config reset to defaults', config: toolMockConfig });
});

app.delete('/api/tools/:toolName', (req, res) => {
  const { toolName } = req.params;
  delete toolMockConfig.tools[toolName];
  console.log(`\n🗑️  Tool mock deleted: ${toolName}`);
  res.json({ ok: true });
});

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
app.post('/v1/messages', scenarioMiddleware, async (req, res) => {
  const { messages, model } = req.body;
  logRequest('/v1/messages', req.body);
  const scenarios = getScenarioModule(messages);
  const sessionId = getSessionId(messages);
  const step = getStepFromMessages(messages, sessionId);
  const lastMessage = messages[messages.length - 1];
  const userMessage = typeof lastMessage?.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage?.content || '');
  console.log(`\n[Session: ${sessionId.substring(0, 20)}...] [Step ${step}]`);
  console.log('User message:', userMessage.substring(0, 100));
  const response = scenarios.getResponse(step, messages);
  
  // 添加500ms延时
  await sleep(500);
  
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
app.post('/v1/chat/completions', scenarioMiddleware, async (req, res) => {
  const { messages, model, stream } = req.body;
  
  // Tool Mocker 模式：模拟 LLM 返回工具调用
  if (scenarioConfig.mode === 'tool-mocker' && toolMockConfig.enabled) {
    const lastMsg = messages[messages.length - 1];
    
    // 检测是否是工具执行结果的消息（role: tool）
    if (lastMsg?.role === 'tool') {
      const toolCallId = lastMsg.tool_call_id;
      const toolName = toolCallIdToName.get(toolCallId);
      console.log(`\n🔧 Tool Mocker: received tool result for call_id=${toolCallId}, tool=${toolName}`);
      
      // 检查是否有该工具的配置
      const toolCfg = toolName ? toolMockConfig.tools[toolName] : null;
      if (!toolCfg) {
        console.log(`  ⚠️  No config found for tool: ${toolName || 'unknown'}, using default response`);
        const content = `Received result from ${toolName || 'unknown tool'}.`;
        const response = buildMessage(content, model);
        logRequest('/v1/chat/completions', req.body, { 
          mockerMode: 'tool-mocker',
          toolCallId,
          toolName: toolName || null,
          toolConfig: null,
          response 
        });
        if (stream) return sendStream(res, content, model);
        return res.json(response);
      }
      
      // 应用延迟
      if (toolCfg.delay > 0) {
        console.log(`  ⏱️  Applying delay: ${toolCfg.delay}ms`);
        await sleep(toolCfg.delay);
      }
      
      // 如果配置了错误，返回错误响应
      if (toolCfg.error) {
        console.log(`  ❌ Returning error: ${toolCfg.error}`);
        const content = `Error: ${toolCfg.error}`;
        const response = buildMessage(content, model);
        logRequest('/v1/chat/completions', req.body, {
          mockerMode: 'tool-mocker',
          toolName,
          toolConfig: { enabled: toolCfg.enabled, delay: toolCfg.delay, error: toolCfg.error },
          response
        });
        if (stream) return sendStream(res, content, model);
        return res.json(response);
      }
      
      // 返回配置的响应
      console.log(`  ✅ Returning mocked response for ${toolName}`);
      const content = `${toolCfg.response.title}\n\n${toolCfg.response.output}`;
      const response = buildMessage(content, model);
      logRequest('/v1/chat/completions', req.body, {
        mockerMode: 'tool-mocker',
        toolName,
        toolConfig: {
          enabled: toolCfg.enabled,
          delay: toolCfg.delay,
          response: toolCfg.response
        },
        response
      });
      if (stream) return sendStream(res, content, model);
      return res.json(response);
    }
    
    // 对于用户消息，返回工具调用
    if (lastMsg?.role === 'user') {
      const userContent = typeof lastMsg.content === 'string' ? lastMsg.content : JSON.stringify(lastMsg.content);
      console.log(`\n🔧 Tool Mocker mode: user message received`);
      console.log(`User message: ${userContent.substring(0, 100)}`);
      
      // 查找启用的工具
      const enabledTools = Object.entries(toolMockConfig.tools)
        .filter(([_, cfg]) => cfg.enabled)
        .map(([name, _]) => name);
      
      if (enabledTools.length === 0) {
        console.log(`  ⚠️  No tools enabled`);
        const content = 'No tools are enabled in the mocker configuration.';
        const response = buildMessage(content, model);
        logRequest('/v1/chat/completions', req.body, {
          mockerMode: 'tool-mocker',
          messageType: 'user',
          enabledTools: [],
          response
        });
        if (stream) return sendStream(res, content, model);
        return res.json(response);
      }
      
      // 智能选择工具：根据用户消息内容匹配工具
      let selectedTool = null;
      const lowerContent = userContent.toLowerCase();
      
      // 工具关键词映射（仅包含 opencode 实际支持的工具）
      const toolKeywords = {
        read: ['读', 'read', '查看', 'view', '显示', 'show', '文件内容', 'file content'],
        write: ['写', 'write', '创建', 'create', '保存', 'save', '新建', 'new file'],
        edit: ['编辑', 'edit', '修改', 'modify', '更改', 'change', '替换', 'replace'],
        bash: ['执行', 'execute', '运行', 'run', '命令', 'command', 'shell', 'bash'],
        glob: ['查找文件', 'find files', 'glob', '匹配文件', 'match files', '文件模式', 'file pattern'],
        grep: ['搜索', 'search', '查找', 'find', 'grep', '匹配', 'match', '搜索内容', 'search content'],
        webfetch: ['获取', 'fetch', '下载', 'download', 'url', '网页', 'webpage', '抓取', 'scrape'],
        task: ['任务', 'task', '待办', 'todo', '创建任务', 'create task'],
        todowrite: ['写入待办', 'write todo', 'todo文件', 'todo file'],
        question: ['询问', 'ask', '问题', 'question', '确认', 'confirm', '选择', 'choose'],
        skill: ['技能', 'skill', '执行技能', 'execute skill'],
        sandbox: ['沙箱', 'sandbox', '执行代码', 'execute code', '运行代码', 'run code']
      };
      
      // 匹配工具
      for (const toolName of enabledTools) {
        const keywords = toolKeywords[toolName] || [];
        if (keywords.some(kw => lowerContent.includes(kw))) {
          selectedTool = toolName;
          break;
        }
      }
      
      // 如果没有匹配到，使用第一个启用的工具
      if (!selectedTool) {
        selectedTool = enabledTools[0];
        console.log(`  ℹ️  No keyword match, using first enabled tool: ${selectedTool}`);
      } else {
        console.log(`  ✓ Matched tool by keyword: ${selectedTool}`);
      }
      
      const toolCfg = toolMockConfig.tools[selectedTool];
      
      // 使用配置的参数，如果没有配置则使用默认值
      let toolArgs = toolCfg.arguments || { mock: true, timestamp: Date.now() };
      
      console.log(`  🔧 Using configured arguments for ${selectedTool}`);
      
      // 构造工具调用
      const toolCallId = 'call_' + uuidv4().substring(0, 8);
      
      // 存储 tool_call_id 到工具名称的映射
      toolCallIdToName.set(toolCallId, selectedTool);
      
      const toolCall = {
        id: toolCallId,
        type: 'function',
        function: {
          name: selectedTool,
          arguments: JSON.stringify(toolArgs)
        }
      };
      
      console.log(`  🔧 Returning tool call: ${selectedTool}`);
      console.log(`  📝 Arguments: ${JSON.stringify(toolArgs)}`);
      
      if (stream) {
        const id = `chatcmpl-${uuidv4()}`;
        const created = Math.floor(Date.now() / 1000);
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // 1. 发送角色
        res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }] })}\n\n`);
        
        // 2. 发送工具调用（包含 name）
        res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: toolCall.id, type: toolCall.type, function: { name: toolCall.function.name, arguments: '' } }] }, finish_reason: null }] })}\n\n`);
        
        // 3. 发送工具参数（可以分块发送）
        res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: toolCall.function.arguments } }] }, finish_reason: null }] })}\n\n`);
        
        // 4. 发送结束标记
        res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] })}\n\n`);
        res.write('data: [DONE]\n\n');
        
        logRequest('/v1/chat/completions', req.body, {
          mockerMode: 'tool-mocker',
          messageType: 'user',
          selectedTool,
          toolCall,
          stream: true
        });
        
        return res.end();
      }

      const responseMessage = {
        role: 'assistant',
        content: null,  // 当有 tool_calls 时，content 应该是 null
        tool_calls: [toolCall]
      };

      const response = {
        id: `chatcmpl-${uuidv4()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model || 'mock-model',
        choices: [{ index: 0, message: responseMessage, finish_reason: 'tool_calls' }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      };
      
      logRequest('/v1/chat/completions', req.body, {
        mockerMode: 'tool-mocker',
        messageType: 'user',
        selectedTool,
        toolCall,
        response
      });

      return res.json(response);
    }
  }
  
  // 原有的 scenario 逻辑
  logRequest('/v1/chat/completions', req.body);
  const scenarios = getScenarioModule(messages);
  const sessionId = getSessionId(messages);
  const step = getStepFromMessages(messages, sessionId);
  const lastMessage = messages[messages.length - 1];
  const userMessage = typeof lastMessage?.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage?.content || '');
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

  // 检查是否需要自动循环（步骤13是完成总结，此时所有工具已执行完毕）
  let shouldAutoLoop = false;
  if (scenarioConfig.mode === 'scenario' && step === 13 && !toolCalls?.length) {
    // 步骤13是完成总结（无工具调用），检查循环状态
    if (!sessionLoops.has(sessionId)) {
      sessionLoops.set(sessionId, { current: 1, total: scenarioConfig.loopCount, currentStep: 13 });
    }
    const loopState = sessionLoops.get(sessionId);
    console.log(`  🔄 Loop state: ${loopState.current}/${loopState.total}`);
    
    if (loopState.current < loopState.total) {
      shouldAutoLoop = true;
      loopState.current++;
      console.log(`  ✅ Will auto-trigger next loop (${loopState.current}/${loopState.total})`);
    } else {
      console.log(`  🏁 All loops completed, stopping`);
      sessionLoops.delete(sessionId);
    }
  }
  
  // 如果是第一次执行（步骤1且是用户消息后），初始化循环状态
  if (scenarioConfig.mode === 'scenario' && step === 1 && lastMessage?.role === 'user' && scenarioConfig.loopCount > 1) {
    if (!sessionLoops.has(sessionId)) {
      sessionLoops.set(sessionId, { current: 1, total: scenarioConfig.loopCount, currentStep: 1 });
      console.log(`  🔄 Initialized loop state: 1/${scenarioConfig.loopCount}`);
    }
  }

  // 添加500ms延时
  await sleep(500);

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
    
    // 如果需要自动循环，添加一个特殊的工具调用来触发下一轮
    if (shouldAutoLoop) {
      const loopToolCall = {
        id: 'call_auto_loop_' + Date.now(),
        type: 'function',
        function: {
          name: 'bash',
          arguments: JSON.stringify({
            command: 'echo "Starting next loop..."',
            description: '触发下一轮循环'
          })
        }
      };
      const toolIndex = (toolCalls?.length || 0);
      res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: model || 'mock-model', choices: [{ index: 0, delta: { tool_calls: [{ index: toolIndex, id: loopToolCall.id, type: loopToolCall.type, function: loopToolCall.function }] }, finish_reason: null }] })}\n\n`);
    }
    
    res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: model || 'mock-model', choices: [{ index: 0, delta: {}, finish_reason: (toolCalls?.length || shouldAutoLoop) ? 'tool_calls' : 'stop' }] })}\n\n`);
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  const responseMessage = { role: 'assistant', content };
  if (reasoning) responseMessage.reasoning = reasoning;
  
  // 构建工具调用数组
  const allToolCalls = toolCalls ? [...toolCalls] : [];
  
  // 如果需要自动循环，添加触发工具调用
  if (shouldAutoLoop) {
    allToolCalls.push({
      id: 'call_auto_loop_' + Date.now(),
      type: 'function',
      function: {
        name: 'bash',
        arguments: JSON.stringify({
          command: 'echo "Starting next loop..."',
          description: '触发下一轮循环'
        })
      }
    });
  }
  
  if (allToolCalls.length) responseMessage.tool_calls = allToolCalls;

  res.json({
    id: `chatcmpl-${uuidv4()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: model || 'mock-model',
    choices: [{ index: 0, message: responseMessage, finish_reason: allToolCalls.length ? 'tool_calls' : 'stop' }],
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
