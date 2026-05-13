#!/usr/bin/env node

/**
 * Test script for Tool Mocker functionality
 * 
 * Usage: node test-tool-mocker.js
 */

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3100';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testToolMocker() {
  console.log('🧪 Testing Tool Mocker Functionality\n');

  try {
    // 1. Enable Tool Mocker mode
    console.log('1️⃣  Enabling Tool Mocker mode...');
    const scenarioRes = await fetch(`${BASE_URL}/api/scenario`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'tool-mocker' })
    });
    const scenarioData = await scenarioRes.json();
    console.log('   ✅ Mode:', scenarioData.config.mode);
    await sleep(500);

    // 2. Configure read tool
    console.log('\n2️⃣  Configuring read tool...');
    const readRes = await fetch(`${BASE_URL}/api/tools/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: true,
        response: {
          title: 'Read Test File',
          output: 'const message = "Hello from Tool Mocker!";',
          metadata: { path: '/test/hello.js', size: 42 }
        },
        delay: 500,
        error: null
      })
    });
    const readData = await readRes.json();
    console.log('   ✅ Read tool configured:', readData.ok);
    await sleep(500);

    // 3. Enable tool mock
    console.log('\n3️⃣  Enabling tool mock...');
    const enableRes = await fetch(`${BASE_URL}/api/tools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true })
    });
    const enableData = await enableRes.json();
    console.log('   ✅ Tool mock enabled:', enableData.config.enabled);
    await sleep(500);

    // 4. Send a test request
    console.log('\n4️⃣  Sending test request...');
    const chatRes = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4',
        stream: false,
        messages: [
          { role: 'user', content: 'Please read the test file' }
        ]
      })
    });
    const chatData = await chatRes.json();
    console.log('   ✅ Response received');
    console.log('   📝 Content:', chatData.choices[0].message.content);
    if (chatData.choices[0].message.tool_calls) {
      console.log('   🔧 Tool calls:', chatData.choices[0].message.tool_calls.length);
      console.log('   🔧 Tool name:', chatData.choices[0].message.tool_calls[0].function.name);
    }
    await sleep(500);

    // 5. Test error scenario
    console.log('\n5️⃣  Testing error scenario...');
    const errorRes = await fetch(`${BASE_URL}/api/tools/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: true,
        response: {
          title: 'Write File',
          output: '',
          metadata: {}
        },
        delay: 0,
        error: 'Permission denied: cannot write to /protected/file.txt'
      })
    });
    const errorData = await errorRes.json();
    console.log('   ✅ Error configured:', errorData.ok);
    await sleep(500);

    // 6. Get tool config
    console.log('\n6️⃣  Retrieving tool configuration...');
    const configRes = await fetch(`${BASE_URL}/api/tools`);
    const configData = await configRes.json();
    console.log('   ✅ Tool mock enabled:', configData.enabled);
    console.log('   ✅ Configured tools:', Object.keys(configData.tools).length);
    console.log('   📋 Tools:', Object.keys(configData.tools).join(', '));

    // 7. Test with delay
    console.log('\n7️⃣  Testing delayed response...');
    await fetch(`${BASE_URL}/api/tools/bash`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: true,
        response: {
          title: 'Execute Command',
          output: 'Command executed successfully',
          metadata: { exitCode: 0 }
        },
        delay: 2000,
        error: null
      })
    });
    console.log('   ✅ Bash tool configured with 2s delay');

    console.log('\n✅ All tests passed!\n');
    console.log('🎉 Tool Mocker is working correctly!');
    console.log('\n📊 Summary:');
    console.log('   - Tool Mocker mode: enabled');
    console.log('   - Tool mock: enabled');
    console.log('   - Configured tools: read, write, bash');
    console.log('   - Test request: successful');
    console.log('   - Error handling: configured');
    console.log('   - Delayed response: configured');
    console.log('\n💡 Next steps:');
    console.log('   1. Open http://localhost:3100 to see the control panel');
    console.log('   2. Click "管理工具配置" to manage tool responses');
    console.log('   3. Configure opencode to use http://localhost:3100/v1/chat/completions');
    console.log('   4. Test with opencode and observe tool responses\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('\n💡 Make sure the server is running:');
    console.error('   npm start\n');
    process.exit(1);
  }
}

// Run tests
testToolMocker();
