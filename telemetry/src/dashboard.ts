// 度量看板 HTML 渲染（纯函数、零依赖）。
// 由 server.ts（GET /report）与 report.ts（--format html）共用。
// 数据全部来自 instrumentation（hook 自动事件），不含模型自报数字。
import type { Metrics, TokenStat } from "./metrics.ts";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function pct(n: number | null): string {
  return n === null ? "N/A" : `${(n * 100).toFixed(1)}%`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function table(headers: string[], rows: string[][], empty = "（暂无数据）"): string {
  if (rows.length === 0) return `<p class="empty">${empty}</p>`;
  const head = headers.map((h) => `<th>${esc(h)}</th>`).join("");
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("\n");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/** TokenStat map → 按 token 降序的表格行 */
function tokenRows(map: Record<string, TokenStat>): string[][] {
  return Object.entries(map)
    .sort((a, b) => b[1].total_tokens - a[1].total_tokens)
    .map(([k, s]) => [esc(k), fmtTokens(s.total_tokens), String(s.turns)]);
}

export function renderDashboard(m: Metrics, scope: string): string {
  const phaseCycleRows = Object.entries(m.phase_cycle_time).map(([phase, s]) => [
    esc(phase),
    String(s.count),
    `${s.avg_hours}h`,
    `${s.p50_hours}h`,
    `${s.p90_hours}h`,
  ]);
  const activeRows = Object.entries(m.active_hours_by_phase)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => [esc(k), `${v}h`]);
  const skillRows = Object.entries(m.by_skill)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => [esc(k), String(v)]);

  return `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FPG 度量看板</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;max-width:960px;margin:2rem auto;padding:0 1rem;color:#222}
h1{font-size:1.4rem}h2{font-size:1.1rem;margin-top:1.6rem;border-bottom:1px solid #eee;padding-bottom:.3rem}
table{border-collapse:collapse;width:100%;margin:.5rem 0;font-size:.9rem}
th,td{border:1px solid #ddd;padding:.35rem .6rem;text-align:left}th{background:#f5f5f5}
.kpis{display:flex;flex-wrap:wrap;gap:.6rem;margin:.8rem 0}
.kpi{padding:.6rem 1rem;background:#f0f4ff;border-radius:8px;min-width:7.5rem}
.kpi b{font-size:1.25rem;display:block}.kpi span{font-size:.8rem;color:#555}
small,.empty{color:#666}.cols{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
@media(max-width:720px){.cols{grid-template-columns:1fr}}
</style></head><body>
<h1>FPG 度量看板</h1>
<p><small>生成时间 ${new Date().toISOString()}　范围 ${esc(scope)}　数据来源：工具 hook 自动采集（instrumentation）</small></p>

<div class="kpis">
<span class="kpi"><b>${fmtTokens(m.tokens_total)}</b><span>token 总量</span></span>
<span class="kpi"><b>${m.active_hours_total}h</b><span>活跃耗时（近似）</span></span>
<span class="kpi"><b>${m.sessions}</b><span>会话数</span></span>
<span class="kpi"><b>${m.turns}</b><span>回合数</span></span>
<span class="kpi"><b>${m.story_completed}</b><span>完成 Story</span></span>
<span class="kpi"><b>${pct(m.rework_rate)}</b><span>返工率</span></span>
<span class="kpi"><b>${pct(m.ac_pass_rate)}</b><span>AC 通过率</span></span>
</div>

<h2>各环节 token 用量</h2>
<div class="cols">
<div><h3>按阶段</h3>${table(["阶段", "token", "回合"], tokenRows(m.tokens_by_phase))}</div>
<div><h3>按 Skill</h3>${table(["skill", "token", "回合"], tokenRows(m.tokens_by_skill))}</div>
</div>

<h2>按 Epic/Sprint/Task 归因</h2>
${table(["E/S/T", "token", "回合"], tokenRows(m.tokens_by_task), "（暂无归因数据——确认 Skill 已写 .fpg/current-task 标记）")}

<h2>各环节耗时</h2>
<div class="cols">
<div><h3>活跃耗时（按阶段，近似）</h3>${table(["阶段", "活跃小时"], activeRows)}</div>
<div><h3>阶段周期时间（enter→complete）</h3>${table(["阶段", "样本", "平均", "p50", "p90"], phaseCycleRows)}</div>
</div>

<h2>Skill 命中</h2>
${table(["skill / 工具", "事件数"], skillRows)}

<p><small>活跃耗时为同一会话相邻回合间隔之和（&gt;30 分钟视为空闲剔除）。度量用于发现瓶颈与验证规范有效性，不作个人考核。</small></p>
</body></html>`;
}
