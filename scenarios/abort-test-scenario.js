/**
 * Abort Test Scenario
 * 
 * 用于测试 session abort 后 UI 是否正确恢复的场景
 * 
 * 测试场景：
 * 1. 用户发送消息
 * 2. AI 开始处理并执行工具调用（模拟长时间运行）
 * 3. 用户点击 abort
 * 4. 验证 UI 是否正确停止并恢复到 idle 状态
 */

// 生成随机工具调用 ID
function generateToolCallId() {
  return 'call_' + Math.random().toString(36).substring(2, 15);
}

/**
 * 根据步骤返回响应
 * @param {number} step - 当前步骤（从 1 开始）
 * @param {Array} messages - 消息历史
 * @returns {Object} 响应对象
 */
function getResponse(step, messages) {
  console.log(`  🎯 Abort Test Scenario - Step ${step}`);

  switch (step) {
    case 1: {
      // 第一步：开始分析，调用 read_file 工具（模拟长时间运行的工具）
      const toolCallId = generateToolCallId();
      return {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: toolCallId,
          type: 'function',
          function: {
            name: 'read_file',
            arguments: JSON.stringify({
              path: '/test/large-file.txt',
              explanation: 'Reading a large file to analyze...'
            })
          }
        }],
        // 添加延迟，让用户有时间点击 abort
        _mockDelay: 5000 // 5秒延迟，模拟慢速操作
      };
    }

    case 2: {
      // 第二步：继续处理（如果用户没有 abort）
      return {
        role: 'assistant',
        content: '我已经读取了文件内容。现在让我分析一下...',
        tool_calls: null
      };
    }

    case 3: {
      // 第三步：调用另一个工具
      const toolCallId = generateToolCallId();
      return {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: toolCallId,
          type: 'function',
          function: {
            name: 'grep_search',
            arguments: JSON.stringify({
              query: 'TODO',
              includePattern: '**/*.ts',
              explanation: 'Searching for TODO comments...'
            })
          }
        }],
        _mockDelay: 3000
      };
    }

    case 4: {
      // 第四步：最终响应
      return {
        role: 'assistant',
        content: '✅ 分析完成！找到了以下内容：\n\n1. 文件内容已读取\n2. 发现了 5 个 TODO 注释\n3. 建议优先处理标记为 URGENT 的任务',
        tool_calls: null
      };
    }

    default:
      return {
        role: 'assistant',
        content: '我已经完成了所有分析工作。还有什么我可以帮助你的吗？',
        tool_calls: null
      };
  }
}

/**
 * 获取工具的模拟结果
 * @param {string} toolName - 工具名称
 * @param {Object} args - 工具参数
 * @returns {string} 工具执行结果
 */
function getToolResult(toolName, args) {
  switch (toolName) {
    case 'read_file':
      return `File content from ${args.path}:\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit.\n\n// TODO: URGENT - Fix memory leak\n// TODO: Add input validation\n// TODO: Improve error handling\n// TODO: Add unit tests\n// TODO: Update documentation`;
    
    case 'grep_search':
      return `Search results for "${args.query}":\n\nfile1.ts:10:// TODO: URGENT - Fix memory leak\nfile2.ts:25:// TODO: Add input validation\nfile3.ts:40:// TODO: Improve error handling\nfile4.ts:55:// TODO: Add unit tests\nfile5.ts:70:// TODO: Update documentation\n\nFound 5 matches`;
    
    default:
      return `Tool ${toolName} executed successfully`;
  }
}

module.exports = {
  name: 'Abort Test Scenario',
  description: 'Tests session abort behavior and UI state recovery',
  getResponse,
  getToolResult,
  
  // 场景配置
  config: {
    supportsStreaming: true,
    defaultDelay: 100, // 默认流式延迟
    chunkSize: 50      // 每个 chunk 的字符数
  }
};
