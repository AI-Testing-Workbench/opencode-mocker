#!/usr/bin/env node

/**
 * 测试 invalid 工具 + length/stop finish_reason 场景
 * 
 * 这个脚本用于测试 AI SDK 的 experimental_repairToolCall 行为：
 * 当工具参数验证失败时，工具名会被改为 "invalid"，状态为 "completed"
 * 如果 finish_reason 是 "length" 或 "stop"，应该停止循环而不是无限重试
 */

const BASE_URL = 'http://localhost:3100';

async function testInvalidToolScenario() {
  console.log('🧪 Testing Invalid Tool Scenario\n');
  console.log('=' .repeat(60));
  
  // 步骤 1: 设置为 invalid-tool 模式
  console.log('\n📝 Step 1: Setting mode to invalid-tool...');
  const setModeRes = await fetch(`${BASE_URL}/api/scenario`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'invalid-tool' })
  });
  const modeResult = await setModeRes.json();
  console.log('✅ Mode set:', modeResult.config.mode);
  
  // 步骤 2: 发送第一个请求（触发 invalid + length）
  console.log('\n📝 Step 2: Sending first request (should trigger invalid tool with length finish_reason)...');
  const firstReq = {
    model: 'gpt-4',
    messages: [
      {
        role: 'system',
        content: '你是一个有帮助的助手'
      },
      {
        role: 'user',
        content: '请测试工具参数验证失败的场景'
      }
    ],
    stream: true
  };
  
  console.log('Sending to /v1/chat/completions...');
  const firstRes = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(firstReq)
  });
  
  console.log('\n📨 First Response (streaming):');
  const reader = firstRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let step2Data = null;
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (line.startsWith('data: ') && line !== 'data: [DONE]') {
        const data = JSON.parse(line.slice(6));
        
        // 打印内容
        if (data.choices?.[0]?.delta?.content) {
          process.stdout.write(data.choices[0].delta.content);
        }
        
        // 打印工具调用
        if (data.choices?.[0]?.delta?.tool_calls) {
          const toolCall = data.choices[0].delta.tool_calls[0];
          if (toolCall?.function?.name) {
            console.log(`\n\n🔧 Tool Call: ${toolCall.function.name}`);
            console.log(`   ID: ${toolCall.id}`);
          }
          if (toolCall?.function?.arguments) {
            console.log(`   Arguments: ${toolCall.function.arguments}`);
          }
        }
        
        // 检查 finish_reason
        if (data.choices?.[0]?.finish_reason) {
          console.log(`\n\n⏹️  Finish Reason: ${data.choices[0].finish_reason}`);
          step2Data = data;
        }
      }
    }
  }
  
  // 验证第一步结果
  console.log('\n\n' + '='.repeat(60));
  console.log('✅ Step 2 Complete');
  if (step2Data) {
    console.log(`   Finish Reason: ${step2Data.choices[0].finish_reason}`);
    console.log(`   Expected: "length"`);
    console.log(`   Match: ${step2Data.choices[0].finish_reason === 'length' ? '✅' : '❌'}`);
  }
  
  // 步骤 3: 发送工具结果（模拟客户端处理 invalid 工具）
  console.log('\n📝 Step 3: Sending tool result (simulating client handling invalid tool)...');
  const secondReq = {
    model: 'gpt-4',
    messages: [
      ...firstReq.messages,
      {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'call_invalid_length_test',
          type: 'function',
          function: {
            name: 'invalid',
            arguments: JSON.stringify({
              path: 12345,
              content: null,
              invalidField: "some value"
            })
          }
        }]
      },
      {
        role: 'tool',
        tool_call_id: 'call_invalid_length_test',
        content: JSON.stringify({
          error: 'Tool parameter validation failed',
          details: 'path should be string, got number'
        })
      }
    ],
    stream: true
  };
  
  console.log('Sending follow-up request...');
  const secondRes = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(secondReq)
  });
  
  console.log('\n📨 Second Response (should trigger invalid + stop):');
  const reader2 = secondRes.body.getReader();
  let buffer2 = '';
  let step3Data = null;
  
  while (true) {
    const { done, value } = await reader2.read();
    if (done) break;
    
    buffer2 += decoder.decode(value, { stream: true });
    const lines = buffer2.split('\n');
    buffer2 = lines.pop() || '';
    
    for (const line of lines) {
      if (line.startsWith('data: ') && line !== 'data: [DONE]') {
        const data = JSON.parse(line.slice(6));
        
        if (data.choices?.[0]?.delta?.content) {
          process.stdout.write(data.choices[0].delta.content);
        }
        
        if (data.choices?.[0]?.delta?.tool_calls) {
          const toolCall = data.choices[0].delta.tool_calls[0];
          if (toolCall?.function?.name) {
            console.log(`\n\n🔧 Tool Call: ${toolCall.function.name}`);
            console.log(`   ID: ${toolCall.id}`);
          }
          if (toolCall?.function?.arguments) {
            console.log(`   Arguments: ${toolCall.function.arguments}`);
          }
        }
        
        if (data.choices?.[0]?.finish_reason) {
          console.log(`\n\n⏹️  Finish Reason: ${data.choices[0].finish_reason}`);
          step3Data = data;
        }
      }
    }
  }
  
  // 验证第三步结果
  console.log('\n\n' + '='.repeat(60));
  console.log('✅ Step 3 Complete');
  if (step3Data) {
    console.log(`   Finish Reason: ${step3Data.choices[0].finish_reason}`);
    console.log(`   Expected: "stop"`);
    console.log(`   Match: ${step3Data.choices[0].finish_reason === 'stop' ? '✅' : '❌'}`);
  }
  
  // 总结
  console.log('\n' + '='.repeat(60));
  console.log('🎯 Test Summary:');
  console.log('   1. First request returned invalid tool with "length" finish_reason');
  console.log('   2. Second request returned invalid tool with "stop" finish_reason');
  console.log('   3. Both should trigger the loop-breaking logic in processor.ts');
  console.log('\n✅ Test completed! Check processor.ts logs for:');
  console.log('   - "存在 invalid 工具且 finish_reason 为 length/stop，停止循环"');
  console.log('   - Error message: "模型侧输出异常【length】" or "模型侧输出异常【stop】"');
  console.log('\n' + '='.repeat(60));
}

// 运行测试
testInvalidToolScenario().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
