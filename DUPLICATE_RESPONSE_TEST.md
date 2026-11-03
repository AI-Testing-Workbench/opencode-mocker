# 连续相同内容死循环检测测试

测试模型连续 3 次返回完全相同内容时的死循环保护机制。

## 测试场景

**问题描述**：
模型在某些情况下可能会陷入死循环，连续多次返回完全相同的内容（文本 + 工具调用），导致：
- 浪费 API 调用
- 用户体验差
- 任务无法完成

**解决方案**：
在主循环中检测连续 3 次 assistant 消息返回相同内容（文本 + 工具调用），自动停止循环。

## 快速测试

```bash
# 确保 mocker 服务运行
node server.js

# 在另一个终端运行测试
./test-duplicate-response.sh
```

## 测试流程

### 1. 场景设置

测试使用 `duplicate-response-scenario.js` 场景，模拟以下行为：

```
Step 1: 
  文本: "正在执行命令..."
  工具: bash("python script.py")
  
Step 2:
  文本: "正在执行命令..."  ← 完全相同
  工具: bash("python script.py")  ← 完全相同
  
Step 3:
  文本: "正在执行命令..."  ← 还是完全相同
  工具: bash("python script.py")  ← 第 3 次，应该触发检测
  
Step 4:
  文本: "命令执行完成"  ← 不应该执行到这里
  工具: null
```

### 2. 内容指纹生成

系统为每个 assistant 消息生成"指纹"，包含：

```typescript
fingerprint = `text:[${textContent}]||tools:[${toolCalls}]`
```

例如：
```
text:[正在执行命令...]||tools:[bash:{"command":"python script.py","description":"执行 Python 脚本"}]
```

### 3. 检测逻辑

```typescript
// 获取最近 3 个 assistant 消息的指纹
const fingerprints = [fingerprint1, fingerprint2, fingerprint3]

// 检查是否完全相同
if (fingerprint1 === fingerprint2 && fingerprint2 === fingerprint3) {
  // 触发保护机制
  添加提示消息
  break 停止循环
}
```

### 4. 预期结果

✅ **成功标准**：
- 在第 3 步检测到重复
- 添加系统提示消息
- 循环停止，不执行第 4 步
- 用户看到友好的提示信息

❌ **失败标准**：
- 执行到第 4 步或更多
- 未添加提示消息
- 循环继续运行

## 测试输出示例

### 成功的测试输出

```
╔════════════════════════════════════════════╗
║   连续相同内容死循环检测测试              ║
╚════════════════════════════════════════════╝

🔍 检查 mocker 服务...
✅ Mocker 服务运行中

🚀 开始测试：连续 3 次返回相同内容检测

📋 设置测试场景...
✅ 场景设置成功

--- Step 1 ---
📝 响应: "正在执行命令..."
🔧 工具调用: 1 个
  🔧 执行工具: bash("python script.py")

--- Step 2 ---
📝 响应: "正在执行命令..."
🔧 工具调用: 1 个
  🔧 执行工具: bash("python script.py")

--- Step 3 ---
📝 响应: "正在执行命令..."
🔧 工具调用: 1 个
  🔧 执行工具: bash("python script.py")

✅ 检测到连续 3 次相同内容！
   指纹: text:[正在执行命令...]||tools:[bash:{"command":"python script.py",...
✅ 正确：在第 3 步检测到

📊 测试结果：
   总步数: 3
   指纹数: 3

✅ 测试通过！
   系统正确检测到连续 3 次相同内容并停止
```

### 失败的测试输出

```
--- Step 4 ---
📝 响应: "命令执行完成"

📊 测试结果：
   总步数: 4
   指纹数: 4

❌ 测试失败！
   系统未在第 3 步停止，继续执行到第 4 步
   死循环检测未生效
```

## 在 VS Code 中手动测试

1. **启动 mocker 服务**：
   ```bash
   cd packages/opencode-mocker
   node server.js
   ```

2. **配置自定义提供商**（在 VS Code 设置中）：
   ```json
   {
     "testagent.providers": {
       "custom": [{
         "id": "mocker",
         "name": "Mock LLM",
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

3. **通过 Web UI 设置场景**：
   - 访问 http://localhost:3100
   - 选择场景：`duplicate-response`
   - 点击 "Apply"

4. **开始会话**：
   - 在 VS Code 中选择 "Mock LLM" 提供商
   - 发送任意消息开始会话
   - 观察是否在第 3 轮后自动停止

5. **验证提示信息**：
   - 会话中应该出现系统提示：
     ```
     检测到模型连续 3 次返回完全相同的内容，为防止死循环已自动停止。
     建议：
     1) 检查任务是否可行或需要更多信息
     2) 尝试不同的解决思路
     3) 调整提示或参数
     ```

## 代码位置

### 检测逻辑

**文件**：`packages/testagent-core/packages/opencode/src/session/prompt.ts`

**位置**：主循环开始处（step >= 3 时）

**关键代码**：
```typescript
// 生成消息内容指纹
const getMessageFingerprint = (msg: MessageV2.WithParts): string => {
  const textParts = msg.parts
    .filter((p): p is MessageV2.TextPart => p.type === "text")
    .map((p) => p.text.trim())
    .join("\n")
  
  const toolParts = msg.parts
    .filter((p): p is MessageV2.ToolPart => p.type === "tool")
    .map((p) => `${p.tool}:${JSON.stringify(p.state.input)}`)
    .join("|")
  
  return `text:[${textParts}]||tools:[${toolParts}]`
}

// 比较最近 3 个指纹
if (fingerprint1 === fingerprint2 && fingerprint2 === fingerprint3) {
  // 停止循环
  break
}
```

### Mock 场景

**文件**：`packages/opencode-mocker/scenarios/duplicate-response-scenario.js`

## 常见问题

### Q: 为什么要检测完整内容而不仅仅是工具？

**A**: 更准确！如果只检测工具：
```
Step 1: text="尝试方法A" + tool: bash("ls")
Step 2: text="方法A失败，尝试方法B" + tool: bash("ls")
Step 3: text="再试一次" + tool: bash("ls")
```
工具相同但文本不同，说明模型在思考尝试不同方法，不应该停止。

只有当文本和工具都完全相同时，才是真正的死循环：
```
Step 1: text="正在执行..." + tool: bash("ls")
Step 2: text="正在执行..." + tool: bash("ls")
Step 3: text="正在执行..." + tool: bash("ls")  ← 这才应该停止
```

### Q: 为什么是 3 次而不是 2 次？

**A**: 平衡准确性和用户体验：
- **2 次**：可能误判（模型有时需要重试）
- **3 次**：足够确定是死循环
- **4 次+**：已经浪费太多 API 调用

### Q: 这个检测会影响正常的重试吗？

**A**: 不会。只有当**连续 3 次完全相同**（文本 + 工具调用）时才触发。正常重试通常：
- 文本会有变化（"再试一次"、"换个方法"等）
- 或者工具参数会调整
- 或者会尝试不同的工具

## 相关测试

- **单次请求内重复工具**：`processor.ts` 中的 doom_loop 检测
- **工具参数验证失败**：`invalid` 工具检测（已有）
- **连续错误重试**：YOLO 模式的错误自动续跑（已有）

## 贡献

发现问题或有改进建议？欢迎提交 Issue 或 PR！
