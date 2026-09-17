# YOLO 错误中断测试指南(mocker 版)

针对 v2 加固的三层错误处理:**传输层重试 → emitted 闸门 → YOLO 有界自动续跑**。
把 opencode/testagent 的 provider baseURL 指向 `http://localhost:3100/v1`(OpenAI 兼容,
必须走 **stream** 请求),然后用 `flaky` 场景控制"前 N 次失败、之后恢复"。

## 启动

```bash
node server.js            # 或 Web 面板 http://localhost:3100
```

配置场景(两种任选):

```bash
# API
curl -X POST localhost:3100/api/scenario -H 'Content-Type: application/json' \
  -d '{"mode":"flaky","failKind":"mid","failTimes":1,"midWords":3}'

# 计数重置(不切模式)
curl -X POST localhost:3100/api/flaky/reset
```

> 每次 `POST /api/scenario`(mode=flaky)会自动把请求计数归零,从干净状态开始。

## failKind 与 YOLO 三层行为的对应关系

| failKind | 服务端行为 | 命中客户端哪一层 | YOLO 开启时预期 |
| --- | --- | --- | --- |
| `http` | 直接返回错误码(`statusCode`,默认 500) | **重试层**(5xx 可重试,每轮最多 5 次,2s→30s 退避) | failTimes ≤5:重试层透明恢复,**UI 只短暂显示"重试中"状态**;failTimes ≥6:重试耗尽 → **错误续跑层**(见下) |
| `mid`,`midWords>0` | 流出 N 个 content chunk 后 destroy 连接(`TypeError: terminated`) | **emitted 闸门**拦截重试(本轮已有输出,重放会重复吐字)→ 错误直接落轮末 | **错误续跑层**:等待 2s/4s/8s 后注入 `[SYSTEM]...automatically resumed` 合成消息重发整轮(新 assistant 消息,不会重复旧半截文本) |
| `mid`,`midWords=0` | 首字节前 destroy(纯瞬断) | 重试层(terminated 标记 isRetryable) | 与 http 类似:透明重试,通常无感 | 
| `empty` | 正常 finish=stop 但零 content | completion guard(**空轮信号**) | 注入 CONTINUE 提醒续跑(无退避 sleep);恢复轮正常收尾 |
| `truncate` | 半截文本 + `finish_reason:"length"` | completion guard(**截断信号**) | 同上,CONTINUE 续跑 |

**错误续跑层的边界**:连续错误(每轮重试耗尽后算一次)最多 **3 次**,期间任何一轮取得进展即清零;
打满 3 次后 run 以错误终止(status idle/error,Session.Event.Error 推给 UI)。

## 推荐测试矩阵(每条先 `POST /api/flaky/reset` 或重设 scenario 归零计数)

1. **透明恢复(对照组,不开 YOLO)**:`http + failTimes=2` → 内层重试即恢复,会话应无任何错误可见。
2. **半截不重放(闸门核心用例)**:`mid + midWords=3 + failTimes=1`,开启 YOLO → 断流后**不应**看到重复的"部分输出1..."重放;应看到:旧消息带错误结束 →(约 2s)→ 合成的续跑提醒(模型气泡里可见 `[SYSTEM]...automatically resumed`)→ 新回复「【mock 已恢复】」。
3. **续跑上限熔断**:`mid + failTimes=8` → 观察续跑注入 3 次后停止,会话以错误状态收尾(对照:不开 YOLO 时第一次错误就直接停)。
4. **abort 不复活**:测试中途手动停止 → 不应出现任何自动续跑。
5. **guard 信号**:`empty + failTimes=1` 与 `truncate + failTimes=1` → 分别触发 CONTINUE 续跑。
6. **存量挂起唤醒**(v2 另一项):场景切 `scenario` 正常跑 → 触发一个权限询问不回复(webview 待审批卡片)→ **此时**点 YOLO 开关 → 卡片应立刻以"once 批准"消失,任务继续。
7. **(回归)非 YOLO 错误路径**:`mid + failTimes=1`,YOLO **关闭** → 应当直接以错误终止(不应自动续跑)。

## 观察点

- **mocker 控制台**:`🎲 Flaky mode [mid] request #N: ❌/✅`——数 LLM 请求次数可区分"重试层消耗"与"续跑层消耗"(续跑每轮额外 +1 个请求)。
- **CLI 日志**(log 文件,`permission`/`processor`/`session.prompt` service):
  - `yolo error auto-resume:注入提醒退避续跑 {resume, error:"APIError"}` = 续跑层触发
  - `失败重试,次数:N` = 重试层在工作
  - `yolo completion guard 触发 {reason:"length"|"empty"|"asking"}` = guard 扩展生效
- **UI**:续跑提醒与 guard 注入均为 synthetic 用户消息,聊天流中以特殊气泡呈现;错误气泡上带 statusCode/`Connection reset by server`。

## 已知注意点

- `flaky` 的 mid/empty/truncate 只对流式请求生效(opencode 客户端恒为流式,无影响);非流式探测请求会直接拿恢复响应,但**仍计数**——建议测试矩阵里失败计数留 1 的余量。
- `/api/scenario` GET 与 flaky 响应文本里的「第 N 次请求」可辅助核对计数。
- midWords>0 的断流错误在 fromError 里映射为 `APIError "Connection reset by server"`,在 RESUMABLE 名单内;若未来新增错误类型,先核对 `session/prompt.ts` 的 `RESUMABLE`。
