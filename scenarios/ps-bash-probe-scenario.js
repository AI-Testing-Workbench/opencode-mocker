// psbash 探针场景：逐条下发 POSIX 命令，由 agent 的 bash 工具实际执行，
// 再把结果回灌给 mocker 做判定。用于回归 "ps-bash 是否能把 bash 语义正确
// 转译到 PowerShell"。每条命令都是无副作用的（创建文件都放在 .psbash-probe/ 下，
// 最后一条统一清理）。

// 已知的失败特征：命中即判定为 "shell 层报错"，而不是命令本身的业务失败。
const FAIL_PATTERNS = [
  // Windows PowerShell 把 curl 解析成 Invoke-WebRequest
  'Invoke-WebRequest',
  'Invoke-RestMethod',
  // 参数绑定失败（-H / -d / -k / -h 被 PowerShell 当成自己的参数）
  'ParameterBindingException',
  'CannotConvertArgument',
  'A parameter cannot be found that matches parameter name',
  '无法绑定参数',
  '找不到与参数名称',
  // cmd.exe / 找不到可执行文件
  'is not recognized as an internal or external command',
  '不是内部或外部命令',
  'CommandNotFoundException',
  // ps-bash 自身的 .NET host 故障
  'System.Management.Automation.RemoteException',
  'hostfxr',
  'coreclr',
  'Unable to load DLL',
  'ps-bash-host',
  // bash 命令被当成 PowerShell 语法而解析失败
  '表达式或语句中包含意外的标记',
  'Unexpected token',
  'Missing closing',
];

const probes = [
  // ── 0. 环境准备 ──
  { id: 'setup', group: '准备', cmd: 'mkdir -p .psbash-probe && echo ready' },

  // ── 1. 基础 / 别名 ──
  { id: 'pwd', group: '基础', cmd: 'pwd' },
  { id: 'ls_long', group: '基础', cmd: 'ls -la' },
  { id: 'ls_pipe', group: '基础', cmd: 'ls -la | head -5' },
  { id: 'wc_l', group: '基础', cmd: 'echo "hello" | wc -l' },
  { id: 'echo_e', group: '基础', cmd: 'echo -e "a\\nb\\nc"' },

  // ── 2. sort / uniq 参数 ──
  { id: 'sort_n', group: 'sort', cmd: 'printf "10\\n2\\n1\\n" | sort -n' },
  { id: 'sort_k5h', group: 'sort', cmd: 'echo -e "1 2 3 4 100\\n1 2 3 4 5\\n1 2 3 4 2K\\n1 2 3 4 1M" | sort -k5 -h' },
  { id: 'sort_uniq', group: 'sort', cmd: 'echo -e "a\\na\\nb\\nb\\nb" | sort | uniq -c | sort -rn' },

  // ── 3. 引号 / JSON（本次回归的核心）──
  { id: 'single_quote', group: '引号', cmd: `echo '{"typ_id":"CFC_ACC_ADJ","env":"ST"}'` },
  {
    id: 'node_argv_single',
    group: '引号',
    cmd: `node -e "console.log(JSON.stringify(process.argv.slice(1)))" -- -d '{"a":1,"b":"x"}'`,
  },
  {
    id: 'node_argv_double',
    group: '引号',
    cmd: `node -e "console.log(process.argv[1])" -- "{\\"k\\":\\"v\\"}"`,
  },
  {
    id: 'node_env_json',
    group: '引号',
    cmd: `BODY='{"k":"v"}' node -e "console.log(process.env.BODY)"`,
  },
  { id: 'curl_version', group: '引号', cmd: 'curl.exe --version | head -2', winOnly: true },

  // ── 4. 变量 / 命令替换 ──
  { id: 'var_assign', group: '变量', cmd: 'X=1; echo $X' },
  { id: 'var_braces', group: '变量', cmd: 'echo "${HOME}"' },
  { id: 'cmd_subst', group: '变量', cmd: 'echo "$(echo nested)"' },
  { id: 'for_loop', group: '变量', cmd: 'for i in 1 2 3; do echo "n=$i"; done' },
  { id: 'test_cond', group: '变量', cmd: 'if [ -f package.json ]; then echo yes; else echo no; fi' },

  // ── 5. 管道 / 重定向 ──
  { id: 'redirect_out', group: '管道', cmd: 'echo hi > .psbash-probe/a.txt && cat .psbash-probe/a.txt' },
  { id: 'redirect_append', group: '管道', cmd: 'echo more >> .psbash-probe/a.txt && wc -l < .psbash-probe/a.txt' },
  { id: 'stderr_merge', group: '管道', cmd: 'echo err >&2 2>&1; echo out' },
  { id: 'and_chain', group: '管道', cmd: 'true && echo ok || echo bad' },
  { id: 'exit_status', group: '管道', cmd: 'false; echo "exit=$?"' },
  { id: 'pipe_head', group: '管道', cmd: 'ls | grep -v node_modules | head -3' },

  // ── 6. 查找 / 文本处理 ──
  { id: 'find_name', group: '文本', cmd: 'find . -maxdepth 1 -name "package.json" -print' },
  { id: 'grep_name', group: '文本', cmd: `grep -n '"name"' package.json | head -2` },
  { id: 'cut_field', group: '文本', cmd: `echo "a,b,c" | cut -d, -f2` },
  { id: 'tr_split', group: '文本', cmd: `echo "hello world" | tr ' ' '\\n'` },
  { id: 'tail_lines', group: '文本', cmd: `printf "l1\\nl2\\nl3\\n" | tail -2` },
  { id: 'sed_replace', group: '文本', cmd: `echo "abc" | sed 's/b/B/'` },
  { id: 'awk_field', group: '文本', cmd: `echo "a b c" | awk '{print $2}'` },
  { id: 'xargs_echo', group: '文本', cmd: 'echo "1 2 3" | xargs -n1 echo item' },
  { id: 'path_split', group: '文本', cmd: `echo $PATH | tr ':' '\\n' | head -3` },

  // ── 7. heredoc ──
  {
    id: 'heredoc',
    group: 'heredoc',
    cmd: `cat <<'EOF' > .psbash-probe/h.txt\nhello heredoc\nEOF\ncat .psbash-probe/h.txt`,
  },

  // ── 8. 中文 / Windows 路径相关 ──
  { id: 'cn_text', group: '中文', cmd: 'echo "中文测试 UTF8" > .psbash-probe/cn.txt && cat .psbash-probe/cn.txt' },
  { id: 'which_python', group: '中文', cmd: 'which python || command -v python || echo no-python' },
  { id: 'cmd_echo', group: '中文', cmd: 'cmd //c echo from-cmd', winOnly: true },

  // ── 9. 清理 ──
  { id: 'cleanup', group: '清理', cmd: 'rm -rf .psbash-probe && echo cleaned' },
];

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : part?.text || ''))
      .join('\n');
  }
  return '';
}

const SKIP = '[skipped: windows-only probe]'

function judge(output) {
  const text = textOf(output);
  if (text.includes(SKIP)) return { ok: true, reason: null, skipped: true }
  if (!text.trim()) return { ok: false, reason: 'empty output' };
  for (const pattern of FAIL_PATTERNS) {
    if (text.includes(pattern)) return { ok: false, reason: pattern };
  }
  return { ok: true, reason: null };
}

function toolCall(probe, index) {
  return {
    id: `call_psbash_${index}`,
    type: 'function',
    function: {
      name: 'bash',
      arguments: JSON.stringify({
        command: probe.cmd,
        description: `[${probe.group}] ${probe.id}`,
        timeout: 60000,
      }),
    },
  };
}

function summary(results) {
  const total = results.length
  const skipped = results.filter((item) => item.skipped).length
  const failed = results.filter((item) => !item.ok && !item.skipped)
  const groups = new Map()
  for (const item of results) {
    const stat = groups.get(item.group) || { total: 0, failed: 0 }
    if (item.skipped) continue
    stat.total++
    if (!item.ok) stat.failed++
    groups.set(item.group, stat)
  }

  const table = [...groups.entries()]
    .map(([group, stat]) => `${stat.failed === 0 ? '✅' : '❌'} ${group}: ${stat.total - stat.failed}/${stat.total}`)
    .join('\n')

  const detail = failed
    .map((item) => `- [${item.group}] ${item.id}\n  cmd: ${item.cmd.replace(/\n/g, ' ⏎ ')}\n  hit: ${item.reason}`)
    .join('\n')

  const run = total - skipped
  return [
    `psbash 探针完成：${run - failed.length}/${run} 通过${skipped ? `（跳过 ${skipped} 条 windows-only）` : ''}`,
    '',
    table,
    '',
    failed.length ? `失败明细:\n${detail}` : '全部命令均通过 ps-bash 转译。',
  ].join('\n')
}

module.exports = {
  probes,
  judge,
  toolCall,
  summary,
  FAIL_PATTERNS,
  SKIP,
  textOf,
}
