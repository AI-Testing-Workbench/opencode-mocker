// 连续 3 次返回相同内容场景：测试死循环检测
// 场景：模型连续 3 次返回完全相同的文本和工具调用，触发死循环保护

const scenarios = [
  // Step 1-3: 连续 3 次完全相同的响应（应该触发检测）
  `正在执行命令...`,
  `正在执行命令...`,
  `正在执行命令...`,
  
  // Step 4: 如果未被拦截，返回不同内容
  `命令执行完成`,
];

// 工具调用配置：前 3 次完全相同
const stepActions = {
  1: {
    reasoning: "尝试执行命令",
    action: "正在执行命令...",
    toolCalls: [
      {
        id: "call_bash_1",
        type: "function",
        function: {
          name: "bash",
          arguments: JSON.stringify({
            command: "python script.py",
            description: "执行 Python 脚本"
          })
        }
      }
    ]
  },
  
  2: {
    reasoning: "尝试执行命令", // 完全相同
    action: "正在执行命令...",
    toolCalls: [
      {
        id: "call_bash_2",
        type: "function",
        function: {
          name: "bash",
          arguments: JSON.stringify({
            command: "python script.py", // 相同的工具和参数
            description: "执行 Python 脚本"
          })
        }
      }
    ]
  },
  
  3: {
    reasoning: "尝试执行命令", // 还是完全相同
    action: "正在执行命令...",
    toolCalls: [
      {
        id: "call_bash_3",
        type: "function",
        function: {
          name: "bash",
          arguments: JSON.stringify({
            command: "python script.py", // 第 3 次相同，应该触发检测
            description: "执行 Python 脚本"
          })
        }
      }
    ]
  },
  
  4: {
    reasoning: "命令完成",
    action: "命令执行完成",
    toolCalls: null // 如果执行到这里，说明检测失败
  }
};

// 获取响应（支持思考和工具调用）
function getResponseWithTools(step, messages) {
  console.log(`  [DuplicateResponse] Step: ${step}, Total scenarios: ${scenarios.length}`);
  
  if (stepActions[step]) {
    const stepData = stepActions[step];
    return {
      content: stepData.action,
      reasoning: stepData.reasoning || null,
      toolCalls: stepData.toolCalls || null
    };
  }
  
  const scenarioIndex = Math.min(step - 1, scenarios.length - 1);
  return {
    content: scenarios[scenarioIndex],
    reasoning: null,
    toolCalls: null
  };
}

function getResponse(step, messages) {
  const result = getResponseWithTools(step, messages);
  return result.content;
}

module.exports = {
  getResponse,
  getResponseWithTools,
  scenarios,
  stepActions,
  metadata: {
    name: "Duplicate Response Test",
    description: "测试连续 3 次返回相同内容的死循环检测",
    expectedBehavior: "在第 3 次返回后应该被检测到并停止循环",
    shouldReachStep: 3, // 应该在第 3 步被拦截
    shouldNotReachStep: 4 // 不应该执行到第 4 步
  }
};
