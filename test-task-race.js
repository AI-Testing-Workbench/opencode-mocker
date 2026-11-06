#!/usr/bin/env node

/**
 * "停止任务 → 恢复任务"按钮竞态的半自动复现脚本（配合 taskrace 场景）
 *
 * 复现目标（缺陷 2）：
 *   父会话正在等待子会话（task 工具）时被 abort，取消尚未完成（runner 仍在
 *   解绕）就立刻 resume —— 后端 ensureRunning 命中 Running 分支，只 awaitDone
 *   挂到旧 run 上：不启动新 run、不发 busy 事件。resume 快速返回 200，
 *   但 mocker 侧看不到任何新的父会话 LLM 请求 —— 点击被静默吞掉。
 *
 * 前置：
 *   1. node server.js                      （本目录，mock LLM，端口 3100）
 *   2. testagent serve --port 4096         （CLI，provider 指向 mock，见 TASK_RACE_TEST.md）
 *
 * 用法：
 *   node test-task-race.js [--server http://localhost:4096] [--directory /path]
 *                          [--mocker http://localhost:3100] [--hold 60000]
 *                          [--delay 0]      // abort → resume 的间隔 ms（0=撞窗口期；3000=对照组）
 */

const args = process.argv.slice(2);
function flag(name, dflt) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
}

const SERVER = flag("server", "http://localhost:4096");
const MOCK = flag("mocker", "http://localhost:3100");
const DIR = flag("directory", process.cwd());
const HOLD = parseInt(flag("hold", "60000"));
const DELAY = parseInt(flag("delay", "0"));

const q = (path) => `${path}${path.includes("?") ? "&" : "?"}directory=${encodeURIComponent(DIR)}`;

async function api(method, path, body) {
  const res = await fetch(SERVER + q(path), {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function mockerStats() {
  return (await (await fetch(MOCK + "/api/taskrace/stats")).json()).stats;
}

async function statusOf(sid) {
  const { data } = await api("GET", "/session/status");
  return (data && data[sid] && data[sid].type) || "idle";
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return true;
    await sleep(200);
  }
  throw new Error(`超时等待: ${label}`);
}

(async () => {
  console.log(`CLI=${SERVER}  MOCK=${MOCK}  dir=${DIR}  hold=${HOLD}ms  delay=${DELAY}ms\n`);

  // 0. mocker 切到 taskrace
  const cfg = await fetch(MOCK + "/api/scenario", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "taskrace", subHoldMs: HOLD, subChunkMs: 300 }),
  }).then((r) => r.json());
  if (!cfg.ok) throw new Error("mocker 配置失败");

  // 1. 建会话并异步发 prompt（MOCKTASK → mock 返回 task 工具调用）
  const { data: session } = await api("POST", "/session", { title: "taskrace-repro" });
  const sid = session.id;
  console.log(`会话: ${sid}`);
  await api("POST", `/session/${sid}/prompt_async`, {
    parts: [{ type: "text", text: "MOCKTASK 触发子任务" }],
  });

  // 2. 等父 busy、子会话出现并 busy
  await waitFor(() => statusOf(sid).then((t) => t === "busy"), 30000, "父会话 busy");
  let cid;
  await waitFor(async () => {
    const { data } = await api("GET", `/session/${sid}/children`);
    cid = Array.isArray(data) && data[0] && data[0].id;
    return !!cid;
  }, 30000, "子会话出现");
  await waitFor(() => statusOf(cid).then((t) => t === "busy"), 30000, "子会话 busy");
  const before = await mockerStats();
  console.log(`父 busy、子 busy (${cid})；mocker: parentHits=${before.parentHits} childRuns=${before.childRuns}\n`);

  // 3. abort 父会话（不 await 完整解绕）→ 间隔 DELAY → 立即 resume
  const abortP = api("POST", `/session/${sid}/abort`, { reason: "user_abort" });
  await sleep(DELAY);
  const { data: msgs } = await api("GET", `/session/${sid}/message`);
  const lastAssistant = [...(Array.isArray(msgs) ? msgs : msgs.data ?? [])]
    .reverse().find((m) => (m.info ?? m).role === "assistant");
  const messageID = (lastAssistant && (lastAssistant.info ?? lastAssistant).id);
  if (!messageID) throw new Error("找不到 assistant 消息");

  const t0 = Date.now();
  const resume = await api("POST", `/session/${sid}/resume`, { messageID });
  const took = Date.now() - t0;
  const { data: abortData, status: abortStatus } = await abortP;
  console.log(`abort=${abortStatus}  resume=${resume.status} 耗时=${took}ms\n`);

  // 4. 观察 3s：resume 是否真的启动了新一轮
  await sleep(3000);
  const after = await mockerStats();
  const parentStatus = await statusOf(sid);
  const newParentHits = after.parentHits - before.parentHits;

  console.log(`mocker: parentHits +${newParentHits} (events 尾部: ${JSON.stringify(after.events.slice(-3))})`);
  console.log(`父会话状态: ${parentStatus}\n`);

  if (took < 15000 && newParentHits === 0 && parentStatus !== "busy") {
    console.log("❌ 复现成功：resume 被 ensureRunning 的 awaitDone 静默吞掉");
    console.log("   （取消解绕未完成时点击 resume → 不启动新 run、不发 busy；");
    console.log("    扩展侧 cancelRetry 又提前置 idle → 按钮常驻、点击无反应）");
    console.log("   对照组：--delay 3000 重跑，应看到 parentHits +1（正常恢复）");
  } else if (newParentHits > 0 || parentStatus === "busy") {
    console.log("✅ 未复现：resume 正常启动了新一轮（父会话已 busy，子会话将续跑）");
  } else {
    console.log("⚠️ 结果不明确，查看 mocker 控制台与上方 events");
  }
})().catch((e) => { console.error("失败:", e.message); process.exit(1); });
