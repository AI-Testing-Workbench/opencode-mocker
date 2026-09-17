# Abort 行为测试指南

本文档说明如何使用 opencode-mocker 测试 session abort 后 UI 的状态恢复。

## 问题背景

当用户在 TestAgent/Kilo 中点击 Cancel/Abort 按钮时，可能会出现以下问题：

1. **UI 卡住**：WorkingIndicator 继续显示并计时
2. **输入框禁用**：PromptInput 保持禁用状态，无法发送新消息
3. **状态不一致**：前端认为 session 仍在 busy 状态

## 测试场景

`abort-test-scenario.js` 模拟了一个真实的使用场景：

1. 用户发送消息："请帮我分析项目中的 TODO 注释"
2. AI 开始处理，调用 `read_file` 工具（模拟 5 秒的慢速操作）
3. 用户在工具执行过程中点击 Cancel 按钮
4. 系统应该：
   - 中断当前请求
   - 将 session 状态设为 `idle`
   - 停止 WorkingIndicator
   - 重新启用 PromptInput

## 使用方法

### 方法 1：使用测试脚本（自动化）

1. **启动模拟服务器**：
   ```bash
   cd packages/opencode-mocker
   node server.js
   ```

2. **运行测试脚本**（在另一个终端）：
   ```bash
   node test-abort-scenario.js
   ```

   测试脚本会：
   - 配置服务器使用 abort-test 场景
   - 发送聊天请求
   - 2秒后自动触发 abort
   - 验证 abort 是否成功

### 方法 2：手动测试（真实 UI）

1. **启动模拟服务器**：
   ```bash
   cd packages/opencode-mocker
   node server.js
   ```

2. **配置 TestAgent 连接到 mocker**：
   
   在 TestAgent 的 settings 中，添加自定义提供商：
   ```json
   {
     "providers": {
       "custom": [{
         "id": "abort-test",
         "name": "Abort Test Mock",
         "apiBase": "http://localhost:3100/v1",
         "apiKey": "mock-key",
         "models": [{
           "id": "mock-model",
           "name": "Mock Model"
         }]
       }]
     }
   }
   ```

3. **在 TestAgent 中测试**：
   
   a. 选择 "Abort Test Mock" 提供商和 "Mock Model"
   
   b. 发送包含 "abort" 关键词的 system message（会自动使用 abort-test 场景）：
      ```
      You are testing abort behavior using opencode tools
      ```
   
   c. 发送用户消息：
      ```
      请帮我分析项目中的 TODO 注释
      ```
   
   d. 等待 AI 开始调用工具（会显示 "Tool call: read_file"）
   
   e. 在工具执行期间（5秒内）点击 **Cancel** 按钮
   
   f. 观察：
      - ✅ WorkingIndicator 是否停止
      - ✅ 计时器是否停止
      - ✅ PromptInput 是否重新启用
      - ✅ 是否没有显示错误消息

## 场景配置

### abort-test-scenario.js

这个场景包含 4 个步骤：

1. **Step 1**：调用 `read_file` 工具（5秒延迟）
2. **Step 2**：返回分析文本
3. **Step 3**：调用 `grep_search` 工具（3秒延迟）
4. **Step 4**：返回最终结果

每个工具调用都有延迟，给用户足够时间点击 abort。

### 自定义场景

你可以修改 `abort-test-scenario.js` 来测试不同的情况：

```javascript
// 修改工具延迟时间
_mockDelay: 10000  // 10秒延迟

// 添加更多工具调用
tool_calls: [{
  id: generateToolCallId(),
  type: 'function',
  function: {
    name: 'bash',  // 测试命令执行的 abort
    arguments: JSON.stringify({
      command: 'npm install',
      description: 'Installing dependencies...'
    })
  }
}]
```

## 预期行为

### 成功的 Abort

当 abort 成功时，你应该看到：

1. **后端日志**（server.js）：
   ```
   🛑 Client aborted request
   ```

2. **前端日志**（浏览器 DevTools）：
   ```
   触发了abort  掉后端接口
   [TestAgent] Manually set session status to idle after abort: ses_xxx
   [TestAgent] Reconciled session status: ses_xxx busy → idle
   ```

3. **UI 状态**：
   - WorkingIndicator 消失
   - PromptInput 可用
   - 没有错误消息

### 失败的 Abort（修复前）

如果修复不正确，你可能会看到：

1. **UI 卡住**：
   - WorkingIndicator 继续显示
   - 计时器继续增加
   - PromptInput 保持禁用

2. **错误日志**：
   ```
   ERROR service=session.processor error=Aborted
   INFO service=bus type=session.error publishing
   ```

3. **前端收到 session.error 而不是 session.status:idle**

## 验证修复

运行测试后，检查以下内容确认修复有效：

### ✅ 检查清单

- [ ] abort 后前端立即停止显示 WorkingIndicator
- [ ] 前端日志显示 "Reconciled session status: ... → idle"
- [ ] PromptInput 重新启用，可以发送新消息
- [ ] 没有显示 "AbortError" 或错误通知
- [ ] `sessionStatusMap` 中该 session 的状态为 `idle`
- [ ] 可以立即发送新的消息，系统正常响应

## 相关文件

- `scenarios/abort-test-scenario.js` - Abort 测试场景
- `test-abort-scenario.js` - 自动化测试脚本
- `server.js` - 模拟 LLM 服务器
- `packages/kilo-vscode/src/KiloProvider.ts` - 前端 abort 处理
- `packages/kilo-vscode/webview-ui/src/context/session.tsx` - Session 状态管理

## 常见问题

### Q: 测试脚本报错 "Server is not running"

A: 确保先启动 `node server.js`

### Q: TestAgent 没有使用 abort-test 场景

A: 确保在 system message 中包含 "abort" 关键词，或者修改 `server.js` 的 `getScenarioModule` 函数

### Q: Abort 太快，来不及点击 Cancel 按钮

A: 修改 `abort-test-scenario.js` 中的 `_mockDelay` 值，增加延迟时间

### Q: 想测试多个连续的 abort

A: 修改场景的 `loopCount` 配置，或者在每个 step 中都添加延迟

## 调试技巧

1. **查看完整请求日志**：
   ```bash
   tail -f logs/all_requests.jsonl | jq .
   ```

2. **查看浏览器 Network 面板**：
   - 确认请求是否被正确 abort
   - 查看 SSE 流是否正确关闭

3. **查看 React DevTools**：
   - 检查 `SessionContext` 的状态
   - 确认 `statusMap[sessionID]` 的值

4. **添加更多日志**：
   ```javascript
   // 在 KiloProvider.ts 的 handleAbort 中
   console.log('[DEBUG] Before abort:', this.sessionStatusMap.get(targetSessionID));
   await abortSession(...);
   console.log('[DEBUG] After abort:', this.sessionStatusMap.get(targetSessionID));
   ```
