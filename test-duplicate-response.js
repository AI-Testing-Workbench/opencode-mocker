#!/usr/bin/env node

/**
 * 测试连续 3 次返回相同内容的死循环检测
 * 
 * 测试场景：
 * - 模型连续 3 次返回相同的文本和工具调用
 * - 系统应该检测到并自动停止循环
 * - 验证是否在第 3 步后停止，而不是继续到第 4 步
 */

const http = require('http');

const MOCKER_URL = 'http://localhost:3100';
const API_URL = `${MOCKER_URL}/v1/chat/completions`;

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

// 设置场景
async function setupScenario() {
  log(colors.cyan, '\n📋 设置测试场景...');
  
  const data = JSON.stringify({
    mode: 'duplicate-response',
    loopCount: 1
  });
  
  return new Promise((resolve, reject) => {
    const req = http.request(`${MOCKER_URL}/api/scenario`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          log(colors.green, '✅ 场景设置成功');
          resolve(JSON.parse(body));
        } else {
          reject(new Error(`设置失败: ${res.statusCode} ${body}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// 发送聊天请求
async function sendChatRequest(messages, toolChoice = 'auto') {
  const data = JSON.stringify({
    model: 'mock-model',
    messages: messages,
    stream: false,
    tools: [
      {
        type: 'function',
        function: {
          name: 'bash',
          description: '执行 bash 命令',
          parameters: {
            type: 'object',
            properties: {
              command: { type: 'string', description: '要执行的命令' },
              description: { type: 'string', description: '命令描述' }
            },
            required: ['command']
          }
        }
      }
    ],
    tool_choice: toolChoice
  });
  
  // 调试：检查 JSON 是否有效
  try {
    JSON.parse(data);
  } catch (e) {
    console.error('Invalid JSON:', data);
    throw new Error(`JSON 序列化失败: ${e.message}`);
  }
  
  // 使用 Buffer.byteLength 计算正确的字节长度（支持 UTF-8）
  const contentLength = Buffer.byteLength(data, 'utf8');
  
  return new Promise((resolve, reject) => {
    const url = new URL(API_URL);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': contentLength
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(body));
        } else {
          reject(new Error(`请求失败: ${res.statusCode} ${body}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// 模拟工具执行
function mockToolExecution(toolCall) {
  const args = JSON.parse(toolCall.function.arguments);
  log(colors.blue, `  🔧 执行工具: ${toolCall.function.name}("${args.command}")`);
  return {
    role: 'tool',
    tool_call_id: toolCall.id,
    content: '(no output)' // 模拟空输出
  };
}

// 生成消息指纹
function getMessageFingerprint(message) {
  const text = message.content || '';
  const tools = message.tool_calls 
    ? message.tool_calls.map(tc => `${tc.function.name}:${tc.function.arguments}`).join('|')
    : '';
  return `text:[${text}]||tools:[${tools}]`;
}

// 运行测试
async function runTest() {
  try {
    log(colors.cyan, '\n🚀 开始测试：连续 3 次返回相同内容检测\n');
    
    // 设置场景
    await setupScenario();
    
    // 初始消息
    const messages = [
      { role: 'user', content: '请执行脚本' }
    ];
    
    const fingerprints = [];
    let step = 0;
    let stopped = false;
    
    // 模拟循环（最多 5 次，正常应该在第 3 次后停止）
    for (let i = 0; i < 5; i++) {
      step++;
      log(colors.yellow, `\n--- Step ${step} ---`);
      
      // 清理消息：确保消息格式符合 OpenAI API 标准
      const cleanedMessages = messages.map(msg => {
        const cleaned = { role: msg.role };
        if (msg.content) cleaned.content = msg.content;
        if (msg.tool_calls) cleaned.tool_calls = msg.tool_calls;
        if (msg.tool_call_id) cleaned.tool_call_id = msg.tool_call_id;
        return cleaned;
      });
      
      // 调试：打印消息
      console.log(`\n[DEBUG] Step ${step} - Sending ${cleanedMessages.length} messages`);
      
      const response = await sendChatRequest(cleanedMessages);
      const assistantMessage = response.choices[0].message;
      
      // 生成指纹
      const fingerprint = getMessageFingerprint(assistantMessage);
      fingerprints.push(fingerprint);
      
      log(colors.cyan, `📝 响应: "${assistantMessage.content}"`);
      if (assistantMessage.tool_calls) {
        log(colors.blue, `🔧 工具调用: ${assistantMessage.tool_calls.length} 个`);
      }
      
      // 检查是否有 3 个相同的指纹
      if (fingerprints.length >= 3) {
        const last3 = fingerprints.slice(-3);
        if (last3[0] === last3[1] && last3[1] === last3[2]) {
          log(colors.green, '\n✅ 检测到连续 3 次相同内容！');
          log(colors.green, `   指纹: ${last3[0].substring(0, 80)}...`);
          
          if (step === 3) {
            log(colors.green, '✅ 正确：在第 3 步检测到');
            stopped = true;
            break;
          } else {
            log(colors.red, `❌ 错误：应该在第 3 步检测到，但实际在第 ${step} 步`);
          }
        }
      }
      
      messages.push(assistantMessage);
      
      // 如果有工具调用，执行并添加结果
      if (assistantMessage.tool_calls) {
        for (const toolCall of assistantMessage.tool_calls) {
          const toolResult = mockToolExecution(toolCall);
          messages.push(toolResult);
        }
      } else {
        // 没有工具调用，对话结束
        log(colors.yellow, '⚠️  没有工具调用，对话结束');
        break;
      }
    }
    
    // 验证结果
    log(colors.cyan, '\n📊 测试结果：');
    log(colors.cyan, `   总步数: ${step}`);
    log(colors.cyan, `   指纹数: ${fingerprints.length}`);
    
    if (stopped && step === 3) {
      log(colors.green, '\n✅ 测试通过！');
      log(colors.green, '   系统正确检测到连续 3 次相同内容并停止');
      process.exit(0);
    } else if (step >= 4) {
      log(colors.red, '\n❌ 测试失败！');
      log(colors.red, `   系统未在第 3 步停止，继续执行到第 ${step} 步`);
      log(colors.red, '   死循环检测未生效');
      process.exit(1);
    } else {
      log(colors.yellow, '\n⚠️  测试未完成');
      log(colors.yellow, `   只执行了 ${step} 步，未达到检测条件`);
      process.exit(1);
    }
    
  } catch (error) {
    log(colors.red, '\n❌ 测试出错:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// 主函数
async function main() {
  log(colors.cyan, '╔════════════════════════════════════════════╗');
  log(colors.cyan, '║   连续相同内容死循环检测测试              ║');
  log(colors.cyan, '╚════════════════════════════════════════════╝');
  
  // 检查 mocker 是否运行
  log(colors.cyan, '\n🔍 检查 mocker 服务...');
  try {
    await new Promise((resolve, reject) => {
      http.get(`${MOCKER_URL}/health`, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          reject(new Error(`Health check failed: ${res.statusCode}`));
        }
      }).on('error', reject);
    });
    log(colors.green, '✅ Mocker 服务运行中');
  } catch (error) {
    log(colors.red, '❌ Mocker 服务未运行');
    log(colors.yellow, '   请先启动: node server.js');
    process.exit(1);
  }
  
  await runTest();
}

main();
