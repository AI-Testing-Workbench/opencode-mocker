# taskrace：「停止任务 → 恢复任务」按钮竞态复现指南

复现目标 bug：父会话调用 `task` 子任务后点击停止，再点「恢复任务」——
子会话恢复了，但父会话 webview 仍显示「恢复任务」按钮，且再点击无任何反应。

## Bug 机制（摘要）

1. **提前置 idle**：点停止时扩展的 `cancelRetry`（KiloProvider.ts）无条件向 webview
   推送 `sessionStatus: idle`，但此刻后端父会话 runner 还在取消解绕中（要等级联取消
   所有子会话 fiber），按钮提前出现。
2. **resume 被吞**：在取消窗口期点击「恢复任务」→ 后端 `ensureRunning` 命中
   `Running` 分支，只 `awaitDone` 挂到旧 run 上（runner.ts），**不启动新 run、
   不发 busy 事件** → 按钮常驻、点击看似无反应。
3. 子会话 fiber 挂在 instance scope 独立运行，父会话 run 结束/失败后子会话仍可
   继续跑 → 出现「子会话 busy + 父会话 idle + 按钮常驻」的稳态。

## 前置条件

1. 启动 mock LLM（本目录）：

   ```bash
   node server.js   # http://localhost:3100
   ```

2. 配置一个指向 mocker 的自定义 provider（与 ABORT_TEST.md 相同方式）：

   ```json
   { "id": "mock", "apiBase": "http://localhost:3100/v1", "apiKey": "mock-key",
     "models": [{ "id": "mock-model", "name": "Mock Model" }] }
   ```

3. 启动 CLI 并加载含本次修复的扩展（`bun run extension` 或安装 VSIX）。

## 场景切换

```bash
curl -X POST localhost:3100/api/scenario -H 'Content-Type: application/json' \
  -d '{"mode":"taskrace","subHoldMs":120000,"subChunkMs":300}'
```

参数：

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `subHoldMs` | 120000 | 子会话慢流总时长（保证来得及点停止），最小 5000 |
| `subChunkMs` | 300 | 子会话流式分片间隔 |
| `resumeEcho` | true | 恢复时父会话回显 `task_id`，复用同一子会话（复现「子任务恢复了」） |
| `parentFailAfterResume` | false | 恢复后让父会话 LLM 请求返回 500，复现「按钮常驻 + 点击看似无反应」稳态 |

状态机：父会话第 1 次请求 → 返回 `task` 工具调用（prompt 含 `MOCKSUBTASK` 标记）；
子会话请求（末条 user 消息含 `MOCKSUBTASK`）→ 慢流 `subHoldMs`；
父会话第 2 次请求：若子任务结果为空/`cancelled` → 回显 `task_id` 再派 task（恢复）；
否则返回收尾文本。观测端点：`GET /api/taskrace/stats`。

## 手动 UI 复现步骤

1. 在扩展里新建会话（选 mock provider / Mock Model），发送：`MOCKTASK 触发子任务`
2. 等父会话出现子任务卡片、子会话开始慢流输出（约 2 分钟窗口）。
3. 点父会话的 **停止**。
4. **立刻**点「恢复任务」→ 观察：
   - 修复前：按钮可能常驻（取消窗口期的点击被吞），或恢复后按钮状态与后端不一致；
   - 修复后：停止瞬间按钮不再提前出现（按后端真实状态同步），点击恢复后按钮
     立即消失、子会话续跑，整轮结束后按钮才再次出现。
5. 变体（复现常驻稳态）：`{"mode":"taskrace","parentFailAfterResume":true}` →
   恢复后父会话每轮 LLM 都 500 失败 → 按钮常驻；修复后每次点击仍会触发
   乐观 busy + 事后对账，状态不再卡死。

## 半自动复现（脚本）

```bash
node test-task-race.js --server http://localhost:4096 --directory /path/to/work \
                       --hold 60000 --delay 0     # 撞取消窗口
node test-task-race.js ... --delay 3000           # 对照组：应正常恢复
```

脚本流程：建会话 → `prompt_async` MOCKTASK → 等父子会话 busy → abort →
立即 resume → 依据「resume 耗时 / mocker parentHits 增量 / 父会话状态」判定
resume 是否被 `awaitDone` 吞掉。

## 修复验证点（扩展侧改动）

- `cancelRetry` 不再盲发 idle，改为 `reconcileSessionStatus` 按后端真实状态同步。
- `handleContinueTask` 请求前乐观置 busy，`finally` 对账兜底。
- `withRetry` 推送 retry/idle 时同步 `sessionStatusMap`；controller 删除校验归属。
