// 异常场景：测试 invalid 工具 + length/stop finish_reason
// 
// 这是一个多轮对话场景，每次用户发送消息时自动推进到下一步
// 用于测试 processor.ts 对 invalid 工具 + length/stop 的处理逻辑

// 会话步骤跟踪（基于会话 ID）
const sessionSteps = new Map(); // sessionId -> currentStep

const scenarios = [
  // Step 1: 初始响应
  `我会帮你测试工具参数验证失败的场景。`,

  // Step 2: 触发 invalid 工具调用（length finish_reason）
  `尝试调用工具，但参数验证会失败`,

  // Step 3: 触发 invalid 工具调用（stop finish_reason）
  `尝试另一个工具调用`,
];

// 场景：模拟 AI SDK 的 experimental_repairToolCall 行为
// 当工具参数验证失败时，AI SDK 会将工具名称改为 "invalid"，状态设为 "completed"
const stepActions = {
  // Step 2: 模拟 invalid 工具 + length finish_reason
  2: {
    reasoning: "测试参数验证失败且达到 token 限制的情况",
    action: "尝试调用工具，但参数验证会失败，并且达到了 token 限制。这是一个很长的响应，用于触发 length finish_reason...",
    toolCalls: [
      {
        id: "call_invalid_length_test",
        type: "function",
        function: {
          name: "invalid",  // AI SDK 将失败的工具调用改名为 "invalid"
          arguments: JSON.stringify({
            tool: "write",
            error: "Invalid input for tool write: JSON parsing failed: Text: {\"filePath\": \"D:\\\\skill大赛\\\\i_skill的数据\\\\自百灵金命分析系列\\\\testcases_without_data_plus.yaml\". Error message: Expected ',' or '}' after property value in JSON at position 84 (line 1 column 85)"
          })
        }
      }
    ],
    finishReason: "length",  // 关键：finish_reason 是 "length"
    // 模拟 AI SDK 的行为：工具状态是 "completed"（不是 "error"）
    // 因为 AI SDK 成功返回了错误信息给模型
    toolStatus: "completed"
  },
  
  // Step 3: 模拟 invalid 工具 + stop finish_reason
  3: {
    reasoning: "测试参数验证失败且正常停止的情况",
    action: "尝试调用另一个工具，参数验证也会失败",
    toolCalls: [
      {
        id: "call_invalid_stop_test",
        type: "function",
        function: {
          name: "invalid",  // AI SDK 将失败的工具调用改名为 "invalid"
          arguments: JSON.stringify({
            tool: "read_file",
            error: "Invalid input for tool read_file: JSON parsing failed: Expected string for 'path' property, got object"
          })
        }
      }
    ],
    finishReason: "stop",  // 关键：finish_reason 是 "stop"
    toolStatus: "completed"
  },
  
  // Step 4: 正常的finish_reason工具调用（用于对比）
  4: {
    reasoning: "正常的工具调用应该会成功",
    action: "创建一个测试文件",
    toolCalls: [
      {
        id: "call_normal_write",
        type: "function",
        function: {
          name: "invalid",
          arguments: JSON.stringify({
            tool: "write",
            error: "Invalid input for tool write: JSON parsing failed: Text: {\"filePath\": \"D:\\\\skill大赛\\\\i_skill的数据\\\\自百灵金命分析系列\\\\testcases_without_data_plus.yaml\". Error message: Expected ',' or '}' after property value in JSON at position 84 (line 1 column 85)"
          })
        }
      }
    ],
    finishReason: "tool-calls"  // 正常情况：finish_reason 是 "tool-calls"
  }
};

// 获取会话当前步骤（每次调用时自动推进）
function getSessionStep(sessionId) {
  if (!sessionSteps.has(sessionId)) {
    sessionSteps.set(sessionId, 1);
  }
  const current = sessionSteps.get(sessionId);
  console.log(`  [Invalid Tool Scenario] Session: ${sessionId.substring(0, 20)}..., Current step: ${current}`);
  return current;
}

// 推进到下一步
function advanceStep(sessionId) {
  const current = sessionSteps.get(sessionId) || 1;
  const next = current + 1;
  sessionSteps.set(sessionId, next);
  console.log(`  [Invalid Tool Scenario] Session: ${sessionId.substring(0, 20)}..., Advanced to step: ${next}`);
  return next;
}

// 重置会话步骤
function resetSession(sessionId) {
  if (sessionId) {
    sessionSteps.delete(sessionId);
    console.log(`  [Invalid Tool Scenario] Session: ${sessionId.substring(0, 20)}... reset`);
  } else {
    // 重置所有会话
    sessionSteps.clear();
    console.log(`  [Invalid Tool Scenario] All sessions reset`);
  }
}

// 获取响应（支持思考和工具调用）
function getResponseWithTools(step, messages, sessionId) {
  // 如果提供了 sessionId，使用会话步骤跟踪
  let actualStep = step;
  if (sessionId) {
    actualStep = getSessionStep(sessionId);
  }
  
  console.log(`  [Invalid Tool Scenario] Responding with step: ${actualStep}, Total scenarios: ${scenarios.length}`);
  
  if (stepActions[actualStep]) {
    const stepData = stepActions[actualStep];
    
    // 响应后推进到下一步（如果有 sessionId）
    if (sessionId) {
      advanceStep(sessionId);
    }
    
    return {
      content: stepData.action,
      reasoning: stepData.reasoning || null,
      toolCalls: stepData.toolCalls || null,
      finishReason: stepData.finishReason || "stop",
      toolStatus: stepData.toolStatus || "completed"
    };
  }
  
  const scenarioIndex = Math.min(actualStep - 1, scenarios.length - 1);
  
  // 响应后推进到下一步（如果有 sessionId）
  if (sessionId) {
    advanceStep(sessionId);
  }
  
  return {
    content: scenarios[scenarioIndex],
    reasoning: null,
    toolCalls: null,
    finishReason: "stop"
  };
}

function getResponse(step, messages, sessionId) {
  const result = getResponseWithTools(step, messages, sessionId);
  return result.content;
}

module.exports = {
  getResponse,
  getResponseWithTools,
  resetSession,
  scenarios,
  stepActions
};
