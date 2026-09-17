#!/usr/bin/env node

/**
 * 简化版 invalid-tool 测试 - 模拟持续会话
 * 
 * 使用方法：
 * 1. curl -X POST http://localhost:3100/api/scenario -H "Content-Type: application/json" -d '{"mode":"invalid-tool"}'
 * 2. node test-invalid-simple.js
 */

const BASE_URL = 'http://localhost:3100';

// 使用固定的用户消息来确保 sessionId 一致
const SESSION_USER_MSG = '测试invalid工具场景';

async function test() {
  console.log('🧪 Simple Invalid Tool Test (Same Session)\n');
  
  // 第一次请求 - 应返回普通文本
  console.log('📝 Request 1: First user message...');
  const res1 = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [{ role: 'user', content: SESSION_USER_MSG }],
      stream: false
    })
  });
  const data1 = await res1.json();
  console.log(`✅ Response 1: ${data1.choices[0].message.content}`);
  console.log(`   Finish reason: ${data1.choices[0].finish_reason}\n`);
  
  await new Promise(r => setTimeout(r, 500));
  
  // 第二次请求 - 应返回 invalid 工具 + length
  console.log('📝 Request 2: Second user message (same session)...');
  const res2 = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [{ role: 'user', content: SESSION_USER_MSG }],
      stream: false
    })
  });
  const data2 = await res2.json();
  const msg2 = data2.choices[0].message;
  console.log(`✅ Response 2: ${msg2.content || '(no content)'}`);
  if (msg2.tool_calls) {
    console.log(`   Tool calls: ${msg2.tool_calls.length}`);
    msg2.tool_calls.forEach(tc => {
      console.log(`   - ${tc.function.name}: ${tc.function.arguments.substring(0, 50)}...`);
    });
  }
  console.log(`   Finish reason: ${data2.choices[0].finish_reason}\n`);
  
  await new Promise(r => setTimeout(r, 500));
  
  // 第三次请求 - 应返回 invalid 工具 + stop
  console.log('📝 Request 3: Third user message (same session)...');
  const res3 = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [{ role: 'user', content: SESSION_USER_MSG }],
      stream: false
    })
  });
  const data3 = await res3.json();
  const msg3 = data3.choices[0].message;
  console.log(`✅ Response 3: ${msg3.content || '(no content)'}`);
  if (msg3.tool_calls) {
    console.log(`   Tool calls: ${msg3.tool_calls.length}`);
    msg3.tool_calls.forEach(tc => {
      console.log(`   - ${tc.function.name}: ${tc.function.arguments.substring(0, 50)}...`);
    });
  }
  console.log(`   Finish reason: ${data3.choices[0].finish_reason}\n`);
  
  console.log('=' .repeat(60));
  console.log('🎯 Done! Each request auto-advances to the next step.');
  console.log('   - Request 1: Normal text response');
  console.log('   - Request 2: invalid tool + length finish_reason');
  console.log('   - Request 3: invalid tool + stop finish_reason');
  console.log('\n💡 Note: All requests use the same session ID (first 50 chars of user message)');
}

test().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
