// 长轮次（longturns）模式自校验脚本：模拟 agent 的工具回灌循环，
// 验证 mocker 是否精确跑满 N 轮后收尾，用于在打开 webview 前先确认 mocker 行为正确。
//
// 用法：node test-longturns.js [轮数，默认50] [mocker地址，默认http://localhost:3100]
const fetch = require('node-fetch');

async function main() {
  const turns = parseInt(process.argv[2] || '50');
  const base = process.argv[3] || 'http://localhost:3100';

  const setRes = await fetch(`${base}/api/scenario`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'longturns', turns, turnDelayMs: 0 }),
  });
  if (!setRes.ok) throw new Error(`设置场景失败: ${setRes.status}`);
  console.log(`🎯 已切换 longturns 模式，目标 ${turns} 轮`);

  const messages = [
    { role: 'system', content: 'mock longturns driver' },
    { role: 'user', content: `longturns 压测自驱动 ${Date.now()}` },
  ];

  let toolTurns = 0;
  let requests = 0;

  while (true) {
    requests++;
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'mock-model', messages, stream: false }),
    });
    if (!res.ok) throw new Error(`LLM 请求失败: ${res.status} ${await res.text()}`);
    const data = await res.json();
    const choice = data.choices[0];
    const msg = choice.message;
    messages.push(msg);

    if (choice.finish_reason === 'tool_calls' && msg.tool_calls?.length) {
      toolTurns++;
      for (const tc of msg.tool_calls) {
        messages.push({ role: 'tool', tool_call_id: tc.id, content: `mock tool output ${toolTurns}` });
      }
      if (toolTurns % 10 === 0) console.log(`  ... 已完成 ${toolTurns}/${turns} 轮`);
      continue;
    }
    console.log(`🏁 收尾消息: ${String(msg.content).slice(0, 80)}`);
    break;
  }

  console.log(`\n结果: 工具轮=${toolTurns}  LLM请求=${requests}  历史消息=${messages.length} 条`);
  if (toolTurns !== turns) {
    console.error(`❌ 轮数不符：期望 ${turns}，实际 ${toolTurns}`);
    process.exit(1);
  }
  console.log(`✅ longturns ${turns} 轮验证通过`);
}

main().catch(err => {
  console.error('测试失败:', err.message);
  process.exit(1);
});
