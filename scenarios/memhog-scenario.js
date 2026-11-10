const { randomBytes, createHash, randomUUID } = require('node:crypto');
const { setTimeout: pause } = require('node:timers/promises');

const sessions = new Map();
const ranges = {
  memhogTurns: [1, 1000, true],
  memhogMB: [0.01, 32, false],
  memhogChunkKB: [1, 256, true],
  memhogDelayMs: [0, 1000, true],
};

function configure(body) {
  const settings = {};
  for (const [key, range] of Object.entries(ranges)) {
    if (body[key] === undefined) continue;
    const value = Number(body[key]);
    if (!Number.isFinite(value) || value < range[0] || value > range[1] || (range[2] && !Number.isInteger(value))) {
      return { error: `${key} 必须在 ${range[0]} 到 ${range[1]} 之间${range[2] ? '且为整数' : ''}` };
    }
    settings[key] = value;
  }
  return settings;
}

async function handle(req, res, cfg) {
  const messages = req.body.messages || [];
  const first = messages.find(msg => msg.role === 'user');
  const key = req.get('x-opencode-session') || req.get('x-session-affinity') ||
    createHash('sha256').update(JSON.stringify(first || {})).digest('hex');
  // 工具结果携带轮次，重试同一请求不会额外推进；压缩后使用会话计数继续。
  const rounds = messages.filter(msg => msg.role === 'tool')
    .map(msg => Number(/^call_memhog_(\d+)_/.exec(msg.tool_call_id || '')?.[1]) || 0);
  const previous = rounds.reduce((max, round) => Math.max(max, round), 0);
  const round = (previous || sessions.get(key) || 0) + 1;
  const finished = round > cfg.memhogTurns;
  const bytes = finished ? 0 : Math.round(cfg.memhogMB * 1024 * 1024);
  const chunk = cfg.memhogChunkKB * 1024;
  const header = finished ? `内存压测输出完成，共 ${cfg.memhogTurns} 轮。请检查 webview 的实际堆内存和崩溃记录。` :
    `memhog round ${round}/${cfg.memhogTurns}\n`;
  const call = finished ? undefined : {
    id: `call_memhog_${round}_${randomUUID()}`,
    type: 'function',
    function: {
      name: 'bash',
      arguments: JSON.stringify({ command: `echo "memhog ${round}/${cfg.memhogTurns}"`, description: `内存压测第 ${round} 轮` }),
    },
  };
  const id = `chatcmpl-${randomUUID()}`;
  const model = req.body.model || 'mock-model';
  const created = Math.floor(Date.now() / 1000);
  const reason = finished ? 'stop' : 'tool_calls';
  const controller = new AbortController();
  const close = () => controller.abort();
  res.once('close', close);
  const usage = { prompt_tokens: 100, completion_tokens: Math.ceil((bytes || Buffer.byteLength(header)) / 4) };
  usage.total_tokens = usage.prompt_tokens + usage.completion_tokens;
  // 每个分片独立生成，流式路径不在模拟服务器内构造整条大消息。
  function* chunks() {
    yield header;
    for (let position = 0; position < bytes - header.length; position += chunk) {
      const size = Math.min(chunk, bytes - header.length - position);
      yield randomBytes(Math.ceil(size / 2)).toString('hex').replace(/(.{128})/g, '$1\n').slice(0, size);
    }
  }
  async function write(value) {
    if (controller.signal.aborted) return false;
    if (res.write(value)) return true;
    return new Promise(resolve => {
      const drain = () => { cleanup(); resolve(true); };
      const abort = () => { cleanup(); resolve(false); };
      const cleanup = () => {
        res.off('drain', drain);
        controller.signal.removeEventListener('abort', abort);
      };
      res.once('drain', drain);
      controller.signal.addEventListener('abort', abort, { once: true });
    });
  }
  const frame = (delta, finish = null, extra = {}) => `data: ${JSON.stringify({
    id, object: 'chat.completion.chunk', created, model,
    choices: [{ index: 0, delta, finish_reason: finish }], ...extra,
  })}\n\n`;
  try {
    if (!req.body.stream) {
      res.json({ id, object: 'chat.completion', created, model,
        choices: [{ index: 0, message: { role: 'assistant', content: [...chunks()].join(''), ...(call ? { tool_calls: [call] } : {}) }, finish_reason: reason }], usage });
    } else {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      if (!await write(frame({ role: 'assistant' }))) return;
      for (const content of chunks()) {
        if (!await write(frame({ content }))) return;
        if (cfg.memhogDelayMs) await pause(cfg.memhogDelayMs, undefined, { signal: controller.signal });
      }
      if (call && !await write(frame({ tool_calls: [{ index: 0, ...call }] }))) return;
      if (!await write(frame({}, reason, { usage }))) return;
      if (!await write('data: [DONE]\n\n')) return;
      res.end();
    }
    sessions.delete(key);
    sessions.set(key, Math.min(round, cfg.memhogTurns));
    if (sessions.size > 128) sessions.delete(sessions.keys().next().value);
  } catch (err) {
    if (err.name !== 'AbortError') {
      process.stderr.write(`memhog 响应失败：${err.message}\n`);
      res.destroy(err);
    }
  } finally {
    res.off('close', close);
  }
}

module.exports = { configure, handle, reset: () => sessions.clear() };
