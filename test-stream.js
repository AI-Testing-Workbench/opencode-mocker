// 测试流式响应
const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3100,
  path: '/v1/chat/completions',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
};

async function testStream() {
  console.log('🚀 测试流式响应\n');
  console.log('='.repeat(80));

  const requestData = JSON.stringify({
    model: 'gpt-4',
    stream: true,
    messages: [
      { role: 'user', content: '帮我创建一个网页应用' }
    ]
  });

  const req = http.request(options, (res) => {
    console.log(`\n状态码: ${res.statusCode}`);
    console.log(`Content-Type: ${res.headers['content-type']}\n`);
    console.log('接收到的数据块：\n');

    let chunkCount = 0;

    res.on('data', (chunk) => {
      chunkCount++;
      const data = chunk.toString();
      console.log(`[Chunk ${chunkCount}]`);
      
      // 解析 SSE 数据
      const lines = data.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.substring(6);
          if (jsonStr === '[DONE]') {
            console.log('  ✓ [DONE]');
          } else {
            try {
              const parsed = JSON.parse(jsonStr);
              const delta = parsed.choices[0]?.delta;
              
              if (delta.reasoning) {
                console.log(`  💭 Reasoning: ${delta.reasoning.substring(0, 60)}...`);
              }
              if (delta.content) {
                console.log(`  📝 Content: ${delta.content}`);
              }
              if (delta.tool_calls) {
                console.log(`  🔧 Tool calls: ${delta.tool_calls.length} tool(s)`);
                delta.tool_calls.forEach((tool, i) => {
                  console.log(`     ${i + 1}. ${tool.function.name}`);
                });
              }
              if (parsed.choices[0]?.finish_reason) {
                console.log(`  ✓ Finish: ${parsed.choices[0].finish_reason}`);
              }
            } catch (e) {
              console.log(`  ⚠️  Parse error: ${e.message}`);
            }
          }
        }
      }
      console.log();
    });

    res.on('end', () => {
      console.log('='.repeat(80));
      console.log(`\n✅ 流式响应完成！共接收 ${chunkCount} 个数据块\n`);
    });
  });

  req.on('error', (error) => {
    console.error('❌ 请求失败:', error.message);
  });

  req.write(requestData);
  req.end();
}

async function testStreamWithContinue() {
  console.log('\n\n🚀 测试第二轮（包含工具调用）\n');
  console.log('='.repeat(80));

  const requestData = JSON.stringify({
    model: 'gpt-4',
    stream: true,
    messages: [
      { role: 'user', content: '帮我创建一个网页应用' },
      { role: 'assistant', content: '好的...' },
      { role: 'user', content: '继续' }
    ]
  });

  const req = http.request(options, (res) => {
    console.log(`\n状态码: ${res.statusCode}`);
    console.log(`Content-Type: ${res.headers['content-type']}\n`);
    console.log('接收到的数据块：\n');

    let chunkCount = 0;

    res.on('data', (chunk) => {
      chunkCount++;
      const data = chunk.toString();
      console.log(`[Chunk ${chunkCount}]`);
      
      const lines = data.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.substring(6);
          if (jsonStr === '[DONE]') {
            console.log('  ✓ [DONE]');
          } else {
            try {
              const parsed = JSON.parse(jsonStr);
              const delta = parsed.choices[0]?.delta;
              
              if (delta.reasoning) {
                console.log(`  💭 Reasoning: ${delta.reasoning.substring(0, 60)}...`);
              }
              if (delta.content) {
                console.log(`  📝 Content: ${delta.content}`);
              }
              if (delta.tool_calls) {
                console.log(`  🔧 Tool calls: ${delta.tool_calls.length} tool(s)`);
                delta.tool_calls.forEach((tool, i) => {
                  console.log(`     ${i + 1}. ${tool.function.name}`);
                });
              }
              if (parsed.choices[0]?.finish_reason) {
                console.log(`  ✓ Finish: ${parsed.choices[0].finish_reason}`);
              }
            } catch (e) {
              console.log(`  ⚠️  Parse error: ${e.message}`);
            }
          }
        }
      }
      console.log();
    });

    res.on('end', () => {
      console.log('='.repeat(80));
      console.log(`\n✅ 流式响应完成！共接收 ${chunkCount} 个数据块\n`);
    });
  });

  req.on('error', (error) => {
    console.error('❌ 请求失败:', error.message);
  });

  req.write(requestData);
  req.end();
}

// 运行测试
testStream();
setTimeout(() => {
  testStreamWithContinue();
}, 2000);
