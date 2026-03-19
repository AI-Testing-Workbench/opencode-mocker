// 测试 OpenAI 格式的响应（包含思考和工具调用）
const https = require('http');

const API_URL = 'http://localhost:3100/v1/chat/completions';

let messages = [];

async function sendMessage(userMessage) {
  messages.push({
    role: 'user',
    content: userMessage
  });

  console.log(`\n${'='.repeat(80)}`);
  console.log(`>>> 用户: ${userMessage}`);
  console.log('='.repeat(80));

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: messages
      })
    });

    const data = await response.json();
    const assistantMessage = data.choices[0].message;

    // 显示响应内容
    console.log(`\n<<< 助手: ${assistantMessage.content}`);
    
    // 显示思考过程（如果有）
    if (assistantMessage.reasoning) {
      console.log(`\n💭 思考过程:`);
      console.log(`   ${assistantMessage.reasoning}`);
    }
    
    // 显示工具调用（如果有）
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      console.log(`\n🔧 工具调用 (${assistantMessage.tool_calls.length} 个):`);
      assistantMessage.tool_calls.forEach((tool, index) => {
        console.log(`   ${index + 1}. ${tool.function.name}`);
        const args = JSON.parse(tool.function.arguments);
        console.log(`      参数: ${JSON.stringify(args, null, 2).split('\n').join('\n      ')}`);
      });
    }
    
    // 显示完成原因
    console.log(`\n✓ 完成原因: ${data.choices[0].finish_reason}`);

    messages.push(assistantMessage);

    return assistantMessage;
  } catch (error) {
    console.error('❌ 请求失败:', error.message);
    return null;
  }
}

async function runTest() {
  console.log('\n🚀 开始测试 OpenAI 格式的多轮交互（包含思考和工具调用）\n');

  // 第一轮：初始请求
  await sendMessage('帮我创建一个网页应用');
  await sleep(500);

  // 第二轮：创建目录（应该有工具调用）
  await sendMessage('继续');
  await sleep(500);

  // 第三轮：创建 package.json（应该有工具调用）
  await sendMessage('继续');
  await sleep(500);

  // 第四轮：创建 server.js（应该有工具调用）
  await sendMessage('继续');
  await sleep(500);

  // 第五轮：创建 routes/todos.js（应该有工具调用）
  await sendMessage('继续');
  await sleep(500);

  console.log('\n' + '='.repeat(80));
  console.log('✅ 测试完成！已进行 5 轮交互');
  console.log(`📊 总消息数: ${messages.length}`);
  console.log(`\n💡 提示: 继续回复"继续"可以完成剩余的 ${17 - 5} 个步骤`);
  console.log('='.repeat(80) + '\n');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 运行测试
runTest().catch(console.error);
