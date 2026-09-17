#!/usr/bin/env node

/**
 * Abort Scenario Test Script
 * 
 * 测试场景：
 * 1. 启动模拟 LLM 服务器（使用 abort-test-scenario）
 * 2. 发送一个请求，触发长时间运行的工具调用
 * 3. 在工具执行过程中发送 abort 请求
 * 4. 验证服务器是否正确处理 abort
 * 
 * 使用方法：
 * 1. 在一个终端运行：node server.js
 * 2. 在另一个终端运行：node test-abort-scenario.js
 */

const http = require('http');

const SERVER_URL = 'http://localhost:3100';

// 配置服务器使用 abort-test-scenario
async function configureAbortScenario() {
  console.log('📝 Configuring server to use abort-test scenario...\n');
  
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      mode: 'scenario',
      loopCount: 1
    });

    const options = {
      hostname: 'localhost',
      port: 3100,
      path: '/api/scenario',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('✅ Server configured\n');
          resolve();
        } else {
          reject(new Error(`Failed to configure: ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// 发送聊天请求（流式）
function sendChatRequest(messages, signal) {
  console.log('💬 Sending chat request...\n');
  
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: 'mock-model',
      messages: messages,
      stream: true
    });

    const options = {
      hostname: 'localhost',
      port: 3100,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = http.request(options, (res) => {
      console.log(`📡 Response status: ${res.statusCode}\n`);
      
      let buffer = '';
      let chunkCount = 0;
      
      res.on('data', (chunk) => {
        chunkCount++;
        buffer += chunk.toString();
        
        // 解析 SSE 数据
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 保留不完整的行
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              console.log('✅ Stream completed normally\n');
              resolve({ completed: true, chunkCount });
              return;
            }
            
            try {
              const json = JSON.parse(data);
              const delta = json.choices?.[0]?.delta;
              
              if (delta?.role) {
                console.log(`📨 Role: ${delta.role}`);
              }
              
              if (delta?.content) {
                process.stdout.write(delta.content);
              }
              
              if (delta?.tool_calls) {
                const toolCall = delta.tool_calls[0];
                if (toolCall?.function?.name) {
                  console.log(`\n🔧 Tool call: ${toolCall.function.name}`);
                }
                if (toolCall?.function?.arguments) {
                  console.log(`   Args: ${toolCall.function.arguments}`);
                }
              }
              
              const finishReason = json.choices?.[0]?.finish_reason;
              if (finishReason) {
                console.log(`\n✅ Finish reason: ${finishReason}\n`);
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      });

      res.on('end', () => {
        console.log(`\n📊 Received ${chunkCount} chunks\n`);
        resolve({ completed: false, chunkCount });
      });

      res.on('error', (error) => {
        console.error('❌ Response error:', error.message);
        reject(error);
      });
    });

    req.on('error', (error) => {
      console.error('❌ Request error:', error.message);
      reject(error);
    });

    // 如果提供了 signal，监听 abort 事件
    if (signal) {
      signal.addEventListener('abort', () => {
        console.log('\n🛑 Aborting request...\n');
        req.destroy();
        resolve({ aborted: true, chunkCount: 0 });
      });
    }

    req.write(data);
    req.end();
  });
}

// 主测试流程
async function runTest() {
  console.log('🧪 Abort Scenario Test\n');
  console.log('=' .repeat(50) + '\n');
  
  try {
    // 1. 配置服务器
    await configureAbortScenario();
    
    // 2. 发送初始消息
    const messages = [
      {
        role: 'system',
        content: 'You are a helpful assistant using opencode tools.'
      },
      {
        role: 'user',
        content: '请帮我分析项目中的 TODO 注释，找出所有需要优先处理的任务。'
      }
    ];
    
    // 创建 AbortController
    const controller = new AbortController();
    
    // 3. 发送请求
    console.log('🚀 Starting request...\n');
    const requestPromise = sendChatRequest(messages, controller.signal);
    
    // 4. 2秒后触发 abort（模拟用户点击 Cancel 按钮）
    console.log('⏰ Will abort in 2 seconds...\n');
    setTimeout(() => {
      console.log('⚠️  User clicked Cancel button!\n');
      controller.abort();
    }, 2000);
    
    // 5. 等待结果
    const result = await requestPromise;
    
    console.log('=' .repeat(50) + '\n');
    if (result.aborted) {
      console.log('✅ TEST PASSED: Request was aborted successfully');
      console.log('   Expected behavior:');
      console.log('   - Frontend should receive AbortError');
      console.log('   - UI should stop showing working indicator');
      console.log('   - Prompt input should be re-enabled');
    } else if (result.completed) {
      console.log('⚠️  TEST WARNING: Request completed before abort');
      console.log('   This might happen if the server responds too quickly');
    } else {
      console.log('❓ TEST UNCERTAIN: Request ended without [DONE] or abort');
      console.log('   Received chunks:', result.chunkCount);
    }
    
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 检查服务器是否运行
function checkServer() {
  return new Promise((resolve, reject) => {
    const req = http.get(`${SERVER_URL}/health`, (res) => {
      if (res.statusCode === 200) {
        resolve(true);
      } else {
        reject(new Error('Server returned non-200 status'));
      }
    });
    
    req.on('error', () => {
      reject(new Error('Server is not running'));
    });
    
    req.setTimeout(2000, () => {
      req.destroy();
      reject(new Error('Server connection timeout'));
    });
  });
}

// 启动测试
(async () => {
  try {
    console.log('🔍 Checking if server is running...\n');
    await checkServer();
    console.log('✅ Server is running\n');
    await runTest();
  } catch (error) {
    if (error.message.includes('Server is not running')) {
      console.error('❌ Error: Mock server is not running!');
      console.error('   Please start the server first:');
      console.error('   $ node server.js\n');
    } else {
      console.error('❌ Error:', error.message);
    }
    process.exit(1);
  }
})();
