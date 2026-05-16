#!/usr/bin/env node

/**
 * 测试 thinking-hang 模式
 * 
 * 这个模式会：
 * 1. 发送 role: assistant
 * 2. 发送 reasoning（思考内容）
 * 3. 然后挂起，不发送 content 和 [DONE]
 * 
 * 用法：
 *   node test-thinking-hang.js
 */

const BASE_URL = 'http://localhost:3000';

async function setMode(mode, options = {}) {
  const res = await fetch(`${BASE_URL}/api/scenario`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, ...options })
  });
  const data = await res.json();
  console.log('✅ Mode set:', data);
}

async function testThinkingHang(customThinking) {
  console.log('\n🧠 Testing thinking-hang mode...\n');
  
  // 设置模式
  const options = customThinking ? { fixedReply: customThinking } : {};
  await setMode('thinking-hang', options);
  
  // 发送请求
  const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [{ role: 'user', content: '请帮我创建一个待办事项应用' }],
      stream: true
    })
  });

  console.log('📡 Streaming response:\n');
  
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let chunkCount = 0;
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        console.log('\n✅ Stream completed (done=true)');
        break;
      }
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (!line.trim() || line.trim() === 'data: [DONE]') continue;
        if (!line.startsWith('data: ')) continue;
        
        try {
          const data = JSON.parse(line.slice(6));
          const delta = data.choices?.[0]?.delta;
          
          if (delta?.role) {
            console.log(`[Chunk ${++chunkCount}] Role: ${delta.role}`);
          }
          if (delta?.reasoning) {
            console.log(`[Chunk ${++chunkCount}] Reasoning:\n${delta.reasoning}\n`);
          }
          if (delta?.content) {
            console.log(`[Chunk ${++chunkCount}] Content: ${delta.content}`);
          }
          
          const finishReason = data.choices?.[0]?.finish_reason;
          if (finishReason) {
            console.log(`[Chunk ${++chunkCount}] Finish reason: ${finishReason}`);
          }
        } catch (e) {
          console.error('Parse error:', e.message);
        }
      }
    }
  } catch (err) {
    console.log(`\n⚠️  Stream error: ${err.message}`);
    console.log('   (This is expected - the connection hangs without sending [DONE])');
  }
  
  console.log(`\n📊 Total chunks received: ${chunkCount}`);
}

// 运行测试
(async () => {
  try {
    // 测试1：使用默认思考内容
    await testThinkingHang();
    
    // 等待一下
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 测试2：使用自定义思考内容
    console.log('\n' + '='.repeat(60));
    await testThinkingHang('我正在分析你的需求...\n这需要仔细考虑架构设计。\n让我制定一个详细的实现计划。');
    
  } catch (err) {
    console.error('❌ Test failed:', err);
  }
})();
