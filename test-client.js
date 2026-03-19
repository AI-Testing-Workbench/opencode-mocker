// 测试客户端 - 模拟 opencode 的多轮交互
const fetch = require('node-fetch');

const API_URL = 'http://localhost:3100/v1/messages';

// 模拟对话历史
let messages = [];

async function sendMessage(userMessage) {
  messages.push({
    role: 'user',
    content: userMessage
  });

  console.log(`\n>>> 用户: ${userMessage}`);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 4096,
        messages: messages
      })
    });

    const data = await response.json();
    const assistantMessage = data.content[0].text;

    messages.push({
      role: 'assistant',
      content: assistantMessage
    });

    console.log(`<<< 助手: ${assistantMessage}\n`);
    console.log('---'.repeat(30));

    return assistantMessage;
  } catch (error) {
    console.error('请求失败:', error.message);
    return null;
  }
}

async function runTest() {
  console.log('🚀 开始测试多轮交互...\n');
  console.log('='.repeat(90));

  // 第一轮：初始请求
  await sendMessage('帮我创建一个网页应用');
  await sleep(1000);

  // 后续轮次：持续回复"继续"
  for (let i = 2; i <= 17; i++) {
    console.log(`\n📍 第 ${i} 轮交互`);
    await sendMessage('继续');
    await sleep(1000);
  }

  console.log('\n✅ 测试完成！共进行了 17 轮交互');
  console.log(`📊 总消息数: ${messages.length}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 运行测试
runTest().catch(console.error);
