// Aggregates compat results (JSONL from tests/compat.test.ts) into a coverage report grouped by root cause.
// usage: node scripts/compat-report.mjs <results.jsonl...> [--out report.md]
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outPath = outIdx >= 0 ? args.splice(outIdx, 2)[1] : null;
const results = args.flatMap((f) =>
  readFileSync(f, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l)),
);

const EX_RE = /^(?:Exception in thread "[^"]*" |[^:]+: )?([\w$]+(?:\.[\w$]+)+(?:Exception|Error))(?::\s*(.*))?$/;

function exceptions(r) {
  const out = [];
  for (const line of [...r.uncaught, ...r.errors]) {
    const m = EX_RE.exec(line.trim());
    if (m) out.push({ type: m[1], msg: m[2] ?? '' });
  }
  return out;
}

function causeOf(r) {
  if (r.status === 'load-error') return `jar 无法解析: ${r.errors[0] ?? ''}`;
  if (r.status === 'vm-error') {
    const fatal = r.errors.find((e) => e.startsWith('[VM fatal]')) ?? '';
    return `虚拟机错误: ${fatal.replace('[VM fatal] ', '').replace(/ \[at .*$/, '').replace(/\d+/g, 'N')}`;
  }
  const exs = exceptions(r);
  const missing = exs.find((e) => e.type === 'java.lang.NoClassDefFoundError');
  if (missing) return `缺少类: ${missing.msg}`;
  const link = exs.find((e) => e.type === 'java.lang.UnsatisfiedLinkError');
  if (link) return `未实现 native: ${link.msg}`;
  const nsm = exs.find((e) => /NoSuch(Method|Field)Error|AbstractMethodError/.test(e.type));
  if (nsm) return `缺少成员 (${nsm.type.split('.').pop()}): ${nsm.msg}`;
  if (r.status === 'uncaught' || exs.length) {
    const e = exs[0];
    if (e) return `异常: ${e.type}${e.msg ? `: ${e.msg.replace(/\d+/g, 'N').slice(0, 80)}` : ''}`;
    return `异常: ${r.uncaught[0] ?? '?'}`;
  }
  if (r.status === 'exited') return '游戏自行退出';
  return r.status === 'slow' ? '出帧过慢（无报错）' : '无画面（无报错）';
}

const statusCounts = {};
for (const r of results) statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;

const causes = new Map();
for (const r of results) {
  if (r.status === 'ok') continue;
  const c = causeOf(r);
  if (!causes.has(c)) causes.set(c, []);
  causes.get(c).push(r);
}
const sortedCauses = [...causes].sort((a, b) => b[1].length - a[1].length);

// missing classes across all games (including those that still render): what to implement next
const missingAll = new Map();
const nativeAll = new Map();
for (const r of results) {
  const seen = new Set();
  for (const e of exceptions(r)) {
    const map = e.type === 'java.lang.NoClassDefFoundError' ? missingAll : e.type === 'java.lang.UnsatisfiedLinkError' ? nativeAll : null;
    if (!map || seen.has(e.msg)) continue;
    seen.add(e.msg);
    map.set(e.msg, (map.get(e.msg) ?? 0) + 1);
  }
}

const total = results.length;
const pct = (n) => `${((n / total) * 100).toFixed(1)}%`;
const lines = [];
lines.push(`# 兼容性报告（${total} 个 jar）`, '');
lines.push('| 状态 | 数量 | 占比 |', '|---|---|---|');
for (const [s, n] of Object.entries(statusCounts).sort((a, b) => b[1] - a[1])) lines.push(`| ${s} | ${n} | ${pct(n)} |`);
lines.push('', '## 失败原因（按影响游戏数排序）', '', '| 原因 | 游戏数 | 示例 |', '|---|---|---|');
for (const [c, rs] of sortedCauses) lines.push(`| ${c.replace(/\|/g, '/')} | ${rs.length} | ${rs.slice(0, 3).map((r) => r.jar).join('、')} |`);
lines.push('', '## 缺少的类（所有游戏中出现次数）', '', '| 类 | 游戏数 |', '|---|---|');
for (const [c, n] of [...missingAll].sort((a, b) => b[1] - a[1])) lines.push(`| ${c} | ${n} |`);
if (nativeAll.size) {
  lines.push('', '## 未实现的 native 方法', '', '| 方法 | 游戏数 |', '|---|---|');
  for (const [c, n] of [...nativeAll].sort((a, b) => b[1] - a[1])) lines.push(`| ${c} | ${n} |`);
}
lines.push('', '## 失败明细', '', '| jar | 状态 | 帧数 | 原因 |', '|---|---|---|---|');
for (const r of results.filter((r) => r.status !== 'ok').sort((a, b) => a.jar.localeCompare(b.jar))) {
  lines.push(`| ${r.jar} | ${r.status} | ${r.frames} | ${causeOf(r).replace(/\|/g, '/')} |`);
}
const report = lines.join('\n') + '\n';
if (outPath) writeFileSync(outPath, report);

// compact console summary
console.log(`total ${total}`, statusCounts);
console.log('\ntop causes:');
for (const [c, rs] of sortedCauses.slice(0, 45)) console.log(`${String(rs.length).padStart(4)}  ${c.slice(0, 140)}`);
console.log(`\nmissing classes (${missingAll.size}):`);
console.log([...missingAll].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([c, n]) => `${n} ${c}`).join('\n'));
if (nativeAll.size) console.log(`\nmissing natives:\n${[...nativeAll].map(([c, n]) => `${n} ${c}`).join('\n')}`);
