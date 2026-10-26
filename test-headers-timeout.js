#!/usr/bin/env node

/**
 * headersTimeout 复现脚本
 *
 * 复现的目标错误（VS Code 扩展侧）：
 *   TypeError: fetch failed
 *     cause: HeadersTimeoutError { code: 'UND_ERR_HEADERS_TIMEOUT' }
 *
 * 根因回顾：
 *   /session/:id/resume 是同步阻塞的 —— 它要等整轮 runLoop 结束才返回响应头。
 *   VS Code 扩展跑在 Electron 的 Node 里，fetch 走 undici，默认 headersTimeout = 300s。
 *   于是任何超过 5 分钟的一轮对话，都会让 resume 请求在客户端侧被掐断，
 *   但后端 fiber 仍在继续跑，UI 静默失败。
 *
 * ⚠️ 重要：mocker 挡在 LLM 出站侧，它自己不是 headersTimeout 的发生地。
 *    它通过「把一轮对话拖到超过 300s」间接让 CLI 的 resume 迟迟不返回响应头。
 *    所以本脚本验证的是「mocker 能否稳定把一轮拖够久」，而不是直接复现报错。
 *    真正的报错复现需要 extension + CLI 全链路，见 HEADERS_TIMEOUT_TEST.md。
 *
 * 用法：
 *   1. 启动 mocker：  node server.js
 *   2. 跑本脚本：     node test-headers-timeout.js
 *
 * 可选环境变量：
 *   PORT=3100             mocker 端口
 *   HEADERS_TIMEOUT_MS=3000  线上 undici 的阈值（默认缩到 3s 便于观察）
 *   SLOW_TURN_MS=15000   让 mocker 这一轮持续多久
 */

const http = require('http');

const PORT = parseInt(process.env.PORT || '3100');
const BASE = `http://127.0.0.1:${PORT}`;

// 把 undici 的 headersTimeout 缩到几秒，等价于线上 300s 的行为
const HEADERS_TIMEOUT_MS = parseInt(process.env.HEADERS_TIMEOUT_MS || '3000');
const SLOW_TURN_MS = parseInt(process.env.SLOW_TURN_MS || '15000');

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode, body: raw });
          }
        });
      },
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function setScenario(cfg) {
  const res = await post('/api/scenario', cfg);
  if (res.status !== 200) throw new Error(`切换场景失败: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.config;
}

/**
 * 用一个自带 headersTimeout 的 fetch 请求慢接口。
 *
 * Node 原生 fetch 无法按请求设置 headersTimeout（只能改全局 dispatcher），
 * 所以这里用 node:http 手动建连，把 headersTimeout 当成「等响应头」的计时器，
 * 行为与 undici 的 HeadersTimeoutError 一致：超过阈值仍未收到响应头 → 中止。
 */
function fetchWithHeadersTimeout(url, body, timeoutMs) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const payload = JSON.stringify(body);
    const urlObj = new URL(url);
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...result, elapsed: Date.now() - startedAt });
    };

    const req = http.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      },
      (res) => {
        // 收到响应头 —— 这就是 undici 里 headersTimeout 的解除条件
        finish({ ok: true, status: res.statusCode });
        res.destroy();
      },
    );

    req.on('error', (err) => finish({ ok: false, error: err.message }));

    const timer = setTimeout(() => {
      // 复刻 undici 的报错形状，便于和线上日志对照
      const err = new Error('fetch failed');
      err.name = 'TypeError';
      err.cause = { code: 'UND_ERR_HEADERS_TIMEOUT', message: 'Headers Timeout Error', name: 'HeadersTimeoutError' };
      req.destroy(err);
      finish({ ok: false, error: err.message, cause: err.cause });
    }, timeoutMs);

    req.write(payload);
    req.end();
  });
}

/**
 * 跑一次流式请求，返回「整轮耗时」与「首字节耗时」。
 *
 * 关键点：SSE 是立刻返回响应头的（首字节很快），慢的是「整轮什么时候结束」。
 * 所以这里必须读到 [DONE] 才能拿到真实的一轮耗时。
 */
function timeStream(body) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const payload = JSON.stringify(body);
    let firstByteAt = null;

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      },
      (res) => {
        res.on('data', () => {
          if (firstByteAt === null) firstByteAt = Date.now();
        });
        res.on('end', () => {
          // ok 表示 HTTP 层成功（2xx）；场景 D 需要区分"服务端返回错误码"和"连接失败"
          const ok = res.statusCode >= 200 && res.statusCode < 300;
          resolve({ ok, status: res.statusCode, total: Date.now() - startedAt, first: firstByteAt ? firstByteAt - startedAt : null });
        });
        res.on('error', () => {
          resolve({ ok: false, status: res.statusCode, total: Date.now() - startedAt, first: firstByteAt ? firstByteAt - startedAt : null });
        });
      },
    );

    req.on('error', () => resolve({ ok: false, total: Date.now() - startedAt, first: null }));
    req.write(payload);
    req.end();
  });
}

/** 非流式请求：响应头会一直等到 body 准备好才发，这里能看到「响应头延迟」。 */
function timeNonStream(body) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const payload = JSON.stringify(body);

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      },
      (res) => {
        const headersAt = Date.now() - startedAt;
        res.resume();
        res.on('end', () => resolve({ ok: true, headers: headersAt, total: Date.now() - startedAt }));
      },
    );

    req.on('error', () => resolve({ ok: false }));
    req.write(payload);
    req.end();
  });
}

const TOLERANCE = 0.15; // 允许 15% 的调度误差

function within(actual, target) {
  return Math.abs(actual - target) <= Math.max(500, target * TOLERANCE);
}

async function main() {
  console.log('════════════════════════════════════════════════════════════');
  console.log(' slow-turn 场景验证（headersTimeout 复现的前置条件）');
  console.log('════════════════════════════════════════════════════════════');
  console.log(` mocker        : ${BASE}`);
  console.log(` 目标单轮耗时  : ${SLOW_TURN_MS}ms`);
  console.log(` undici 阈值   : ${HEADERS_TIMEOUT_MS}ms  （线上默认 300000ms）`);
  console.log('');

  try {
    await new Promise((resolve, reject) => {
      http.get(`${BASE}/health`, (res) => { res.resume(); resolve(); }).on('error', reject);
    });
  } catch {
    console.error(`❌ 连不上 mocker (${BASE})，请先运行: node server.js`);
    process.exit(1);
  }
  console.log('✅ mocker 在线\n');

  const results = [];
  const check = (name, pass, detail) => {
    results.push({ name, pass, detail });
    console.log(` ${pass ? '✅' : '❌'} ${name} — ${detail}`);
  };

  // ── 场景 A：stream 风格能把一轮拖满 ──
  console.log('── 场景 A：stream 风格（单轮流式慢吐字） ──');
  await setScenario({ mode: 'slow-turn', slowStyle: 'stream', slowTurnMs: SLOW_TURN_MS, slowReportEveryMs: Math.max(1000, Math.floor(SLOW_TURN_MS / 2)) });

  const a = await timeStream({ model: 'mock-model', stream: true, messages: [{ role: 'user', content: 'slow turn' }] });
  check(
    'stream 整轮耗时达标',
    a.ok && within(a.total, SLOW_TURN_MS),
    `目标 ${SLOW_TURN_MS}ms，实际 ${a.total}ms`,
  );
  check(
    'stream 首字节很快（证明 SSE 立刻回响应头）',
    a.first !== null && a.first < 1000,
    `首字节 ${a.first}ms —— 所以流式挡不住 headersTimeout，必须靠整轮时长`,
  );

  // ── 场景 B：非流式直接拖响应头 ──
  console.log('\n── 场景 B：非流式（响应头一直等到 body 就绪） ──');
  const nonStreamMs = Math.max(2000, Math.floor(SLOW_TURN_MS / 2));
  await setScenario({ mode: 'slow-turn', slowStyle: 'stream', slowTurnMs: nonStreamMs, slowReportEveryMs: 1000 });

  const b = await timeNonStream({ model: 'mock-model', stream: false, messages: [{ role: 'user', content: 'non stream' }] });
  check(
    '非流式响应头延迟到目标时长',
    b.ok && within(b.headers, nonStreamMs),
    `目标 ${nonStreamMs}ms，响应头 ${b.headers}ms`,
  );

  // ── 场景 C：tools 风格逐步拖长 ──
  console.log('\n── 场景 C：tools 风格（每次工具结果后等 slowStepMs） ──');
  const stepMs = Math.max(1000, Math.floor(SLOW_TURN_MS / 3));
  await setScenario({ mode: 'slow-turn', slowStyle: 'tools', slowSteps: 3, slowStepMs: stepMs, slowTool: 'bash' });

  const c1 = await timeStream({ model: 'mock-model', stream: true, messages: [{ role: 'user', content: 'go' }] });
  check('第 1 步立即返回工具调用', c1.ok && c1.total < 1500, `耗时 ${c1.total}ms`);

  const c2 = await timeStream({
    model: 'mock-model',
    stream: true,
    messages: [
      { role: 'user', content: 'go' },
      { role: 'assistant', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'bash', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'c1', content: 'ok' },
    ],
  });
  check('第 2 步按 slowStepMs 延迟', c2.ok && within(c2.total, stepMs), `目标 ${stepMs}ms，实际 ${c2.total}ms`);

  const c3 = await timeStream({
    model: 'mock-model',
    stream: true,
    messages: [
      { role: 'user', content: 'go' },
      { role: 'assistant', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'bash', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'c1', content: 'ok' },
      { role: 'assistant', tool_calls: [{ id: 'c2', type: 'function', function: { name: 'bash', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'c2', content: 'ok' },
      { role: 'assistant', tool_calls: [{ id: 'c3', type: 'function', function: { name: 'bash', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'c3', content: 'ok' },
    ],
  });
  check('达到 slowSteps 后正常收尾', c3.ok && c3.total < 1500, `耗时 ${c3.total}ms（不再等待）`);

  // ── 场景 D：先失败制造 error 态（复现的真正入口） ──
  //
  // 这一步是之前漏掉的关键：ChatView.canContinue() 要求 assistant 消息带 error
  // 才显示「继续任务」按钮。如果首轮正常完成，用户根本走不到 session.resume，
  // 自然复现不了 headersTimeout。
  console.log('\n── 场景 D：首轮注入失败 → 才能点「继续任务」 ──');
  const dTarget = Math.max(3000, Math.floor(SLOW_TURN_MS / 2));
  await setScenario({
    mode: 'slow-turn',
    slowStyle: 'stream',
    slowTurnMs: dTarget,
    slowFailFirst: true,
    slowFailTimes: 1,
    slowFailAfterMs: 1000,
    slowFailCode: 500,
  });

  const d1 = await timeStream({ model: 'mock-model', stream: true, messages: [{ role: 'user', content: 'fail first' }] });
  check(
    '首轮按配置失败（UI 进入 error 态）',
    !d1.ok,
    `首轮失败，耗时 ${d1.total}ms —— 此时 UI 才会出现「继续任务」按钮`,
  );

  const d2 = await timeStream({ model: 'mock-model', stream: true, messages: [{ role: 'user', content: 'fail first' }] });
  check(
    '第 2 次请求（模拟点继续）走慢轮并正常完成',
    d2.ok && within(d2.total, dTarget),
    `耗时 ${d2.total}ms —— 这一轮才是 resume 会阻塞的时长`,
  );

  // ── 恢复默认 ──
  await setScenario({
    mode: 'scenario',
    slowTurnMs: 330000,
    slowStyle: 'stream',
    slowSteps: 5,
    slowStepMs: 60000,
    slowTool: 'bash',
    slowReportEveryMs: 30000,
  });

  console.log('\n════════════════════════════════════════════════════════════');
  const failed = results.filter((r) => !r.pass).length;
  console.log(` ${results.length - failed}/${results.length} 项通过`);
  console.log('════════════════════════════════════════════════════════════');

  if (failed > 0) {
    console.log('\n未通过项说明：');
    results.filter((r) => !r.pass).forEach((r) => console.log(`  · ${r.name}: ${r.detail}`));
    process.exit(1);
  }

  console.log('\nmocker 已恢复默认 scenario 模式。');
  console.log('');
  console.log('接下来做真实链路复现（这才是真正触发 headersTimeout 的地方）：');
  console.log('  1. TestAgent provider baseURL → http://localhost:3100/v1');
  console.log('  2. 面板切 Slow Turn，slowTurnMs = 330000');
  console.log('  3. 扩展里点「继续任务」→ 约 300s 后 Extension Host 出现');
  console.log('     TypeError: fetch failed / UND_ERR_HEADERS_TIMEOUT');
  console.log('  4. 同时 CLI 日志仍在输出 → 证明后端没挂，只是前端放弃等待');
  console.log('  详细步骤见 HEADERS_TIMEOUT_TEST.md');
}

main().catch((err) => {
  console.error('脚本异常:', err);
  process.exit(1);
});
