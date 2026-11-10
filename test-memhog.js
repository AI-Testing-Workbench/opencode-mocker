// 协议自测不会打开 webview 或制造 OOM；只验证大文本、流式分片和自驱动轮次。
// 用法：npm run test:memhog -- [轮数，默认3] [每轮MiB，默认0.125] [服务地址]
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Script } = require('node:vm');

const turns = Number(process.argv[2] || 3);
const size = Number(process.argv[3] || 0.125);
const base = process.argv[4] || 'http://localhost:3100';
const tools = [{ type: 'function', function: { name: 'bash', parameters: { type: 'object', properties: {} } } }];

async function request(path, body, headers = {}, signal) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal,
  });
  assert.equal(res.status, 200, `${path} 请求失败：${res.status} ${res.ok ? '' : await res.text()}`);
  return res;
}

async function main() {
  const previous = await (await fetch(`${base}/api/scenario`)).json();
  try {
    await request('/api/scenario', { mode: 'memhog', memhogTurns: turns, memhogMB: size, memhogChunkKB: 16, memhogDelayMs: 0 });
    const invalid = await fetch(`${base}/api/scenario`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'memhog', memhogMB: 'invalid' }),
    });
    assert.equal(invalid.status, 400, '无效配置应被拒绝');
    assert.equal((await (await fetch(`${base}/api/scenario`)).json()).memhogMB, size);
    const html = await (await fetch(base)).text();
    new Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
    assert.ok(html.includes('id="cfg-memhog"'), '控制面板缺少内存压测配置');

    for (const stream of [true, false]) {
      const headers = { 'x-opencode-session': randomUUID() };
      const messages = [{ role: 'user', content: `内存压测 ${randomUUID()}` }];
      for (let round = 1; round <= turns + 1; round++) {
        const res = await request('/v1/chat/completions', { model: 'mock-model', messages, tools, stream }, headers);
        const data = await res.text();
        const frames = stream ? data.split('\n\n').filter(line => line.startsWith('data: {')).map(line => JSON.parse(line.slice(6))) : [];
        const message = stream ? {
          role: 'assistant',
          content: frames.map(frame => frame.choices[0].delta.content || '').join(''),
          tool_calls: frames.flatMap(frame => frame.choices[0].delta.tool_calls || []).map(({ index, ...call }) => call),
        } : JSON.parse(data).choices[0].message;
        const reason = stream ? frames.at(-1).choices[0].finish_reason : JSON.parse(data).choices[0].finish_reason;
        if (stream) assert.ok(data.endsWith('data: [DONE]\n\n'), '流式结束标记缺失');
        if (round > turns) {
          assert.equal(reason, 'stop');
          assert.match(message.content, /内存压测输出完成/);
          break;
        }
        assert.equal(reason, 'tool_calls');
        assert.equal(Buffer.byteLength(message.content), Math.round(size * 1024 * 1024));
        assert.match(message.content, new RegExp(`^memhog round ${round}/${turns}\\n`));
        const call = message.tool_calls[0];
        assert.equal(call.function.name, 'bash');
        assert.equal(JSON.parse(call.function.arguments).command, `echo "memhog ${round}/${turns}"`);
        if (stream) assert.ok(frames.filter(frame => frame.choices[0].delta.content).length > 1, '大文本应分片发送');
        messages.push(message, { role: 'tool', tool_call_id: call.id, content: '工具执行完成' });
      }
      process.stdout.write(`${stream ? '流式' : '非流式'}验证通过：${turns} 轮，每轮 ${size} MiB\n`);
    }

    const headers = { 'x-session-affinity': randomUUID() };
    const messages = [{ role: 'user', content: '会话隔离和压缩验证' }];
    const first = await (await request('/v1/chat/completions', { messages, tools }, headers)).json();
    assert.match(first.choices[0].message.content, /^memhog round 1\//);
    const isolated = await (await request('/v1/chat/completions', { messages, tools }, { 'x-session-affinity': randomUUID() })).json();
    assert.match(isolated.choices[0].message.content, /^memhog round 1\//);
    const history = [...messages, first.choices[0].message, {
      role: 'tool', tool_call_id: first.choices[0].message.tool_calls[0].id, content: '工具执行完成',
    }];
    for (const attempt of [1, 2]) {
      const retry = await (await request('/v1/chat/completions', { messages: history, tools }, headers)).json();
      assert.match(retry.choices[0].message.content, /^(memhog round 2\/|内存压测输出完成)/, `第 ${attempt} 次重试不应跳过轮次`);
    }
    await request('/api/scenario', { mode: 'memhog' });
    await request('/v1/chat/completions', { messages, tools }, headers);
    const compacted = [{ role: 'user', content: '压缩后新的提示内容' }];
    const second = await (await request('/v1/chat/completions', { messages: compacted, tools }, headers)).json();
    assert.match(second.choices[0].message.content, new RegExp(`^(memhog round 2/|内存压测输出完成)`));
    const summary = await (await request('/v1/chat/completions', {
      messages: [{ role: 'assistant', content: '历史内容' }, { role: 'user', content: 'summarize the conversation' }], tools: [],
    }, headers)).json();
    assert.equal(summary.choices[0].finish_reason, 'stop');
    assert.ok(!summary.choices[0].message.tool_calls, '压缩请求不得调用工具');

    await request('/api/scenario', { mode: 'memhog', memhogDelayMs: 1000 });
    const controller = new AbortController();
    const running = await request('/v1/chat/completions', { messages, tools, stream: true }, {}, controller.signal);
    await running.body.getReader().read();
    controller.abort();
    assert.equal((await fetch(`${base}/health`)).status, 200, '取消流后服务仍应可用');
    const logs = await (await fetch(`${base}/logs/latest`)).json();
    assert.ok(JSON.stringify(logs).length < 4096, '压测日志不应保存完整大文本');
    process.stdout.write('配置校验、控制面板语法、会话隔离、请求重试、压缩续跑、取消和日志摘要验证通过。此结果不代表 webview 已复现 OOM。\n');
  } finally {
    await request('/api/scenario', previous);
  }
}

main().catch(err => {
  process.stderr.write(`内存压测自测失败：${err.message}\n`);
  process.exitCode = 1;
});
