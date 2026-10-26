# headersTimeout 复现与回归指南

复现这个错误：

```
ERR [Extension Host] [TestAgent] Error details: {
  name: 'TypeError', message: 'fetch failed',
  cause: { code: 'UND_ERR_HEADERS_TIMEOUT', message: 'Headers Timeout Error' }
}
TypeError: fetch failed
  at async globalThis.fetch (extensionHostProcess.js)
  at async Z (.../extension.js)              ← client.ts 的 customFetch
  at async G.withRetry (.../extension.js)
  at async JW (.../extension.js)
  at async G.handleContinueTask (.../extension.js)
```

## 一、根因一句话

`/session/:id/resume` 是**同步阻塞**的——它要等整轮 `runLoop` 跑完才返回响应头；而 VS Code 扩展跑在 Electron 的 Node 里，`fetch` 走 undici，**默认 `headersTimeout = 300s`**。于是任何超过 5 分钟的一轮，`resume` 请求都会被前端掐断，但后端 fiber 仍在继续跑。

> 对比：`promptAsync` 用了 `Effect.forkIn(...)` 立刻返回 `NoContent`，所以它永不超时。`resume` 缺的正是这一步。

## 二、mocker 在这里能做什么、不能做什么

必须先说清楚边界，否则会误判：

| | 发生位置 | mocker 能否直接复现 |
| --- | --- | --- |
| `UND_ERR_HEADERS_TIMEOUT` | extension 的 fetch ← CLI 的 HTTP 响应头 | ❌ 不能直接 |
| 一轮耗时被拉长 | CLI 的 LLM 出站 ← mocker 的 SSE | ✅ 能 |

mocker 挡在 **LLM 出站侧**。它不能直接制造 extension 的 headersTimeout，但可以**把一轮对话拖到超过 300s**——这正是触发该错误的充分条件。

### ⚠️ 最容易踩的坑：首轮必须失败

只把一轮拖长是**复现不了的**。原因在 UI 侧：

```ts
// ChatView.tsx:78
const canContinue = () => {
  if (session.status() !== "idle") return false
  const msg = lastAssistantMsg()
  if (msg.error) return true                                    // ← 只有 error 态才显示「继续」
  if (msg.finish && !["tool-calls","unknown"].includes(msg.finish)) return false  // ← 正常完成直接 false
  return true
}
```

也就是说：

- **首轮正常跑完 330s** → `finish=stop` → `canContinue()` 返回 false → **没有「继续」按钮** → 走不到 `resume`
- 而且普通发消息走的是 `promptAsync`，它 `forkIn` 后立刻返回 204，**永远不会超时**

所以复现链条必须是：

```
首轮失败（error 态）→ UI 出现「继续任务」→ 点击 → session.resume（同步阻塞）
                                            → 这一轮被拖长 → 300s 被掐断
```

`slow-turn` 的 `slowFailFirst` 就是干这个的：前 `slowFailTimes` 次请求返回错误码，之后才走慢轮。

> 注意：不能用 `messages` 判断"首轮 vs 继续轮"——`resume` 会重放同一份历史。所以用请求计数器 `slowTurnHits`。

## 三、slow-turn 场景

新增的 `slow-turn` 模式，两种拖长方式：

### stream 风格（默认，最贴近真实长思考）

在**同一个 SSE 流**里持续慢吐字，直到累计达到 `slowTurnMs`。

```
用户消息 → CLI 开始 runLoop → mocker 一直吐字不结束 → runLoop 不结束
        → resume 响应头不返回 → 300s 后被 undici 掐断
```

### tools 风格（模拟慢工具）

反复返回工具调用，每步之间等 `slowStepMs`，靠工具往返把一轮拖长。

```
用户消息 → tool_call#1 → 工具执行 → tool_result → 等 slowStepMs
        → tool_call#2 → ... → 达到 slowSteps 后正常收尾
```

> ⚠️ 注意：`stream` 风格的 SSE **会立刻返回响应头**（首字节 ~2ms），慢的是「整轮何时结束」。这也是为什么问题出在 resume 而非 LLM 调用——LLM 侧有 `bodyTimeout` 兜着，而 resume 侧是 headersTimeout。

## 四、参数

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `slowTurnMs` | `330000` | 本轮目标耗时（ms），默认刚好越过 300s 阈值 |
| `slowStyle` | `stream` | `stream` = 长轮流式；`tools` = 反复调工具 |
| `slowSteps` | `5` | tools 风格：本轮发起几次工具调用 |
| `slowStepMs` | `60000` | tools 风格：每次工具调用前等多久 |
| `slowTool` | `bash` | tools 风格：用哪个工具名 |
| `slowReportEveryMs` | `30000` | 服务端心跳日志间隔，用于和前端断开时刻对齐 |
| **`slowFailFirst`** | `false` | **必开**：前 N 次注入失败，制造 error 态 |
| `slowFailTimes` | `1` | 前几次失败 |
| `slowFailAfterMs` | `3000` | 失败前等待多久（让 UI 先显示忙碌） |
| `slowFailCode` | `500` | 返回的错误码 |

## 五、快速验证 mocker 本身

```bash
cd packages/opencode-mocker
node server.js                 # 终端 A

node test-headers-timeout.js   # 终端 B
```

预期 8 项全过，验证四件事：

1. `stream` 风格能把一轮拖满 `slowTurnMs`，且首字节极快
2. 非流式请求的**响应头**确实被拖到目标时长（模拟 resume 的阻塞行为）
3. `tools` 风格按 `slowStepMs` 逐步延迟，达到步数后正常收尾
4. **首轮能按配置失败，第 2 次请求才走慢轮**（复现入口）

调试时可缩短时长：

```bash
PORT=3100 SLOW_TURN_MS=6000 node test-headers-timeout.js
```

## 六、真实链路复现步骤

### 1. 启动 mocker

```bash
cd packages/opencode-mocker
node server.js
```

面板 http://localhost:3100 → 场景选 **Slow Turn 🐢** → 设置：

| 项 | 值 |
| --- | --- |
| `slowTurnMs` | `330000` |
| `slowFailFirst` | **开启** ⭐ |
| `slowFailTimes` | `1` |
| `slowFailAfterMs` | `3000` |

→ 应用。

或用 API：

```bash
curl -X POST localhost:3100/api/scenario \
  -H 'Content-Type: application/json' \
  -d '{"mode":"slow-turn","slowStyle":"stream","slowTurnMs":330000,"slowFailFirst":true,"slowFailTimes":1,"slowFailAfterMs":3000}'
```

### 2. 配置 TestAgent provider

指向 mocker：

```json
{
  "providers": {
    "custom": [{
      "id": "mocker",
      "name": "Mock LLM",
      "apiBase": "http://localhost:3100/v1",
      "apiKey": "mock-key",
      "models": [{ "id": "mock-model", "name": "Mock Model" }]
    }]
  }
}
```

### 3. 触发

1. 扩展里选 mocker 模型
2. 发一条消息 → 约 3s 后**这一轮报错**（这是故意的）
3. 此时底部出现 **「继续任务」** 按钮 / 错误气泡上有重试图标
4. 点它 —— 这一步才会走 `session.resume`

### 4. 观察

**约 300s 后**，Extension Host 输出面板出现：

```
[TestAgent] 🔄 handleContinueTask called: {...}
[TestAgent] ❌ Failed to resume task: TypeError: fetch failed
[TestAgent] Error details: { cause: { code: 'UND_ERR_HEADERS_TIMEOUT' } }
```

**同时**——这是关键判据——mocker 控制台仍在每 30s 打心跳：

```
🐢 slow-turn 已持续 300s / 330s ⚠️ 已越过 undici headersTimeout(300s)
🐢 slow-turn 已持续 330s / 330s ⚠️ 已越过 undici headersTimeout(300s)
```

后端没挂，只是前端放弃等待。

### 5. 确认「重复点击会叠加」

断开后再点一次「继续任务」，mocker 会收到**新的**一轮请求；前端再等 5 分钟再失败。这就是线上用户感受到的「点了没反应、反复失败」。

## 七、回归验证（修复后应观察到）

修复目标是让 `resume` 变成异步（仿 `promptAsync` 的 `forkIn`）。修复后：

| 检查项 | 修复前 | 修复后 |
| --- | --- | --- |
| 点「继续任务」后 HTTP 响应 | 300s 后失败 | **立即**返回（<1s） |
| Extension Host 报错 | `UND_ERR_HEADERS_TIMEOUT` | 无 |
| 会话是否继续跑 | 是（但 UI 认为失败） | 是，且 UI 正确跟随 |
| 重复点击 | 叠加多个等待 | 命中 `Running` 分支，幂等 |
| 失败时 UI 反馈 | 静默（只 console.error） | 应有 `sendMessageFailed` 或 `sessionStatus: idle` |

验证命令：

```bash
# 修复后应秒回，而不是等 330s
time curl -X POST localhost:3000/session/<sid>/resume \
  -H 'Content-Type: application/json' \
  -d '{"messageID":"<mid>"}'
```

## 八、相关代码位置

| 环节 | 位置 |
| --- | --- |
| 前端 catch（无 UI 反馈） | `packages/kilo-vscode/src/KiloProvider.ts:4259` |
| `withRetry`（异常不走重试分支） | `packages/kilo-vscode/src/KiloProvider.ts:3876` |
| SDK customFetch（`timeout:false` 是 Bun 专有） | `packages/sdk/js/src/client.ts:41` |
| resume 端点（同步阻塞） | `packages/testagent-core/packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts:432` |
| resume 实现（等整轮） | `packages/testagent-core/packages/opencode/src/session/prompt.ts:1997` |
| `awaitDone`（Deferred 等 runLoop） | `packages/testagent-core/packages/opencode/src/effect/runner.ts:122` |
| 正确写法参考（forkIn） | `packages/testagent-core/packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts:401` |

## 九、已知注意点

- **只有超过 5 分钟的一轮才会触发**。短任务一切正常，所以表现为「偶发」。
- **首轮必须失败**，否则走不到 `resume`（见第二节）。这是第一次尝试最容易失败的原因。
- **非流式请求也会拖响应头**，但 opencode 客户端恒为流式，正常路径走不到。
- `slowTurnMs` 上限 900000（15 分钟），避免误设成几小时把服务端连接占满。
- 切走 slow-turn 场景后，已在跑的那一轮**不会被中断**，会自然跑完。
- 若只想快速看 UI 表现而不想等 5 分钟，可临时把扩展侧的 headersTimeout 调小（需改 dispatcher），或直接用 `test-headers-timeout.js` 观察 mocker 行为。

## 十、没复现时的排查清单

如果点了「继续任务」却一切正常，按顺序检查：

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 底部显示「新建任务」而不是「继续」 | 这一轮**正常完成**了（`finish=stop`） | 开 `slowFailFirst`，让首轮失败 |
| 点了「继续」但几秒就成功 | 首轮失败次数用完了，第 2 次走的是**慢轮的正常完成**；但你点的时候可能还没到 300s | 把 `slowTurnMs` 设成 ≥ 330000 |
| 完全没有报错，任务正常跑完 330s | 你走的是**普通发消息**（`promptAsync`，立刻返回 204） | 必须走 `resume`，即先制造 error 态再点继续 |
| 报错但不是 `UND_ERR_HEADERS_TIMEOUT` | 可能是 provider 侧的 `bodyTimeout` 或 `chunkTimeout` | 检查 CLI 日志的 service 名，区分是 provider 还是 extension |
| 300s 后没报错 | 扩展侧 undici 的 headersTimeout 被改过 | 确认 `packages/sdk/js/src/client.ts` 的 fetch 配置 |

**判断是否真的走了 resume**：Extension Host 输出面板里应有

```
[TestAgent] 🔄 handleContinueTask called: {...}
```

没有这一行 = 根本没走 resume，问题不在 headersTimeout。
