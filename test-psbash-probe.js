// ps-bash 探针驱动脚本：不需要打开 VS Code，直接模拟 agent 的 bash 工具循环，
// 把探针命令逐条发给真实的 shell 执行，再把输出回灌给 mocker 判定。
//
// 注意：这个脚本本身执行命令用的是本机 shell（process.platform 决定的那个），
// 它验证的是「mocker 的探针协议」是否正确，不验证 ps-bash 本身。
// 真正的 ps-bash 验证要在 VS Code 里选中 psbash 场景 + ps-bash 作为 shell。
//
// 用法：node test-psbash-probe.js [mocker地址，默认http://localhost:3100]
const fetch = require('node-fetch');
const { execSync } = require('child_process');
const probe = require('./scenarios/ps-bash-probe-scenario');

const base = process.argv[2] || 'http://localhost:3100';

async function main() {
  const setRes = await fetch(`${base}/api/scenario`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'psbash' }),
  });
  if (!setRes.ok) throw new Error(`设置场景失败: ${setRes.status} ${await setRes.text()}`);
  console.log(`🎯 已切换 psbash 探针模式，共 ${probe.probes.length} 条命令`);

  // 模拟真实客户端一定携带的工具定义，避免被 summary 守卫误判
  const mockTools = [
    {
      type: 'function',
      function: {
        name: 'bash',
        description: 'Run a shell command',
        parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
      },
    },
  ]
  const stream = false

  const messages = [
    { role: 'system', content: 'mock psbash probe driver' },
    { role: 'user', content: `run psbash probe ${Date.now()}` },
  ];

  let runs = 0;
  let report = null;

  while (true) {
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'mock-model', messages, stream, tools: mockTools }),
    });
    if (!res.ok) throw new Error(`LLM 请求失败: ${res.status} ${await res.text()}`);
    const data = await res.json();
    const choice = data.choices[0];
    const msg = choice.message;
    messages.push(msg);

    if (choice.finish_reason !== 'tool_calls' || !msg.tool_calls?.length) {
      report = msg.content;
      break;
    }

    for (const call of msg.tool_calls) {
      runs++;
      const index = parseInt(String(call.id).replace('call_psbash_', ''), 10);
      const item = probe.probes[index];
      const args = JSON.parse(call.function.arguments || '{}');
      const command = args.command || '';

      let output;
      if (item?.winOnly && process.platform !== 'win32') {
        output = probe.SKIP;
      } else {
        try {
          output = execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        } catch (err) {
          output = `${err.stdout || ''}${err.stderr || ''}` || `exit ${err.status}`;
        }
      }

      messages.push({ role: 'tool', tool_call_id: call.id, content: output });
    }
  }

  console.log(`\n执行了 ${runs} 条命令\n`);
  console.log(report || '（无报告）');

  const failedLine = /psbash 探针完成：(\d+)\/(\d+) 通过/.exec(report || '');
  if (!failedLine) {
    console.error('❌ 报告格式异常');
    process.exit(1);
  }
  if (failedLine[1] !== failedLine[2]) {
    console.error(`❌ 有命令失败：${failedLine[2] - failedLine[1]} 条`);
    process.exit(1);
  }
  console.log('✅ mocker 探针协议自校验通过');
}

main().catch((err) => {
  console.error('测试失败:', err.message);
  process.exit(1);
});
