// 度量看板 HTML 渲染（纯函数、零依赖）。
// server.ts 的 GET /report 使用 Stats 单页；report.ts 的旧 Metrics HTML 仍走兼容包装。
import type { KV, Metrics, NodeStat, ProjectStat, Stats, TokenStat } from "./metrics.ts";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function pct(n: number | null): string {
  return n === null ? "N/A" : `${(n * 100).toFixed(1)}%`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n <= -1_000_000) return `-${(Math.abs(n) / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  if (n <= -1_000) return `-${(Math.abs(n) / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtHours(n: number | null): string {
  return n === null ? "—" : `${n.toFixed(1)}h`;
}

function table(headers: string[], rows: string[][], empty = "（暂无数据）"): string {
  if (rows.length === 0) return `<p class="empty">${empty}</p>`;
  const head = headers.map((h) => `<th>${esc(h)}</th>`).join("");
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("\n");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function tokenRows(map: Record<string, TokenStat>): string[][] {
  return Object.entries(map)
    .sort((a, b) => b[1].total_tokens - a[1].total_tokens)
    .map(([k, s]) => [esc(k), fmtTokens(s.total_tokens), String(s.turns)]);
}

function dimRows(items: KV[]): string[][] {
  return items.map((item) => [esc(item.k), fmtTokens(item.tokens)]);
}

function flattenProject(project: ProjectStat): NodeStat[] {
  const out: NodeStat[] = [];
  const walk = (node: NodeStat) => {
    out.push(node);
    for (const child of node.children) walk(child);
  };
  for (const epic of project.epics) walk(epic);
  return out;
}

function flattenStats(stats: Stats): NodeStat[] {
  return stats.projects.flatMap((project) => [project as NodeStat, ...flattenProject(project)]);
}

function driftBadge(node: NodeStat | ProjectStat): string {
  if (!node.status_drift.drift) return "";
  return ` <span class="drift" title="${esc(node.status_drift.reason)}">⚠ 状态疑似过期</span>`;
}

function sourceLink(url: string | null): string {
  return url ? `<a href="${esc(url)}">原文↗</a>` : "—";
}

function indent(level: NodeStat["level"]): string {
  return { P: "", E: "", S: "&nbsp;&nbsp;", T: "&nbsp;&nbsp;&nbsp;&nbsp;" }[level];
}

function nodeRows(stats: Stats): string[][] {
  const rows: string[][] = [];
  for (const project of stats.projects) {
    rows.push([
      `<b>${esc(project.id)}</b>`,
      esc(project.name),
      `${esc(project.status || "—")}${driftBadge(project)}`,
      "—",
      `${fmtTokens(project.actual.tokens)} / ${fmtHours(project.actual.active_hours)}`,
      "—",
      sourceLink(project.source_url),
    ]);
    for (const node of flattenProject(project)) {
      rows.push([
        `${indent(node.level)}${esc(node.id)}`,
        esc(node.name),
        `${esc(node.status || "—")}${driftBadge(node)}`,
        `${fmtTokens(Math.round((node.plan.estimate_tokens[0] + node.plan.estimate_tokens[1]) / 2))} / ${fmtHours(node.plan.estimate_hours)}`,
        `${fmtTokens(node.actual.tokens)} / ${fmtHours(node.actual.active_hours)}`,
        `${node.deviation.tokens === null ? "—" : fmtTokens(node.deviation.tokens)} / ${fmtHours(node.deviation.hours)}`,
        sourceLink(node.source_url),
      ]);
    }
  }
  return rows;
}

function ganttBars(stats: Stats): string {
  const nodes = flattenStats(stats).filter((node) => node.gantt.start || node.gantt.end);
  if (nodes.length === 0) return `<p class="empty">未排期；未声明依赖时隐藏关键路径行。</p>`;
  const critical = nodes.some((node) => node.gantt.critical);
  const bars = nodes
    .map((node, index) => {
      const width = Math.max(8, Math.min(100, 18 + node.actual.turns * 12));
      const left = (index % 4) * 8;
      const cls = `bar s-${node.gantt.status4}${node.gantt.blocked ? " blocked" : ""}${node.gantt.critical ? " critical" : ""}`;
      return `<div class="gantt-row"><span>${esc(node.id)}</span><i class="${cls}" style="margin-left:${left}%;width:${width}%" title="${esc(node.name)}"></i></div>`;
    })
    .join("");
  const criticalLine = critical ? `<div class="critical-line">关键路径</div>` : `<div class="empty">未声明依赖</div>`;
  return `${criticalLine}${bars}`;
}

function kpis(stats: Stats): string {
  const all = flattenStats(stats);
  const tokens = stats.projects.reduce((sum, project) => sum + project.actual.tokens, 0);
  const active = stats.projects.reduce((sum, project) => sum + project.actual.active_hours, 0);
  const drift = all.filter((node) => node.status_drift.drift).length;
  const watched = stats.viewer.watched_projects.length;
  return `<div class="kpis">
<span class="kpi"><b>${fmtTokens(tokens)}</b><span>token 总量</span></span>
<span class="kpi"><b>${fmtHours(active)}</b><span>活跃耗时</span></span>
<span class="kpi"><b>${stats.projects.length}</b><span>项目</span></span>
<span class="kpi"><b>${stats.developers.length}</b><span>开发者</span></span>
<span class="kpi"><b>${drift}</b><span>状态漂移</span></span>
<span class="kpi"><b>${watched}</b><span>关注项目</span></span>
</div>`;
}

export function renderStatsDashboard(stats: Stats): string {
  const actor = esc(stats.viewer.actor_id);
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FPG 统计看板</title>
<style>
:root{color-scheme:light;--line:#d8dee8;--muted:#5f6978;--bg:#f7f9fc;--ink:#172033;--blue:#2f6fed;--green:#21875b;--yellow:#b7791f;--red:#c73535}
*{box-sizing:border-box}body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;color:var(--ink);background:#fff;font-size:14px;line-height:1.45}header{padding:20px 24px;border-bottom:1px solid var(--line);background:var(--bg)}main{padding:18px 24px;max-width:1320px;margin:0 auto}h1{font-size:22px;margin:0 0 8px}h2{font-size:17px;margin:28px 0 10px}.toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.toolbar label{font-size:13px;color:var(--muted)}input,select,button{height:32px;border:1px solid var(--line);border-radius:6px;background:#fff;padding:0 10px}.kpis{display:grid;grid-template-columns:repeat(6,minmax(120px,1fr));gap:10px;margin:16px 0}.kpi{border:1px solid var(--line);border-radius:8px;padding:10px 12px;background:#fff}.kpi b{display:block;font-size:20px}.kpi span{color:var(--muted);font-size:12px}.grid{display:grid;grid-template-columns:1.2fr .8fr;gap:16px}.panel{border:1px solid var(--line);border-radius:8px;padding:14px;background:#fff;min-width:0}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border-bottom:1px solid var(--line);padding:8px;text-align:left;vertical-align:top}th{background:var(--bg);font-weight:600}.empty{color:var(--muted);margin:8px 0}.drift{display:inline-block;border:1px solid #f0b429;background:#fff8e1;color:#7a5200;border-radius:999px;padding:1px 7px;font-size:12px;white-space:nowrap}.dims{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.gantt-controls{display:flex;gap:6px;margin-bottom:10px}.gantt-row{display:grid;grid-template-columns:74px 1fr;align-items:center;min-height:28px;border-bottom:1px solid #eef1f5}.gantt-row span{font-size:12px;color:var(--muted)}.bar{display:block;height:16px;border-radius:4px}.s-未开始{background:#d7dde7;border:1px dashed #8d98a8}.s-执行中{background:var(--blue)}.s-已挂起{background:repeating-linear-gradient(45deg,#f6d365,#f6d365 5px,#f2b84b 5px,#f2b84b 10px)}.s-已关闭{background:var(--green)}.blocked{box-shadow:inset -8px 0 0 var(--red)}.critical{outline:2px solid #111}.critical-line{font-size:12px;color:#111;margin:4px 0 8px}.legend{display:flex;flex-wrap:wrap;gap:10px;color:var(--muted);font-size:12px;margin-top:10px}.legend i{display:inline-block;width:18px;height:10px;border-radius:3px;margin-right:4px}.dev-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}.dev{border:1px solid var(--line);border-radius:8px;padding:10px}.dev b{display:block}.dev span{color:var(--muted);font-size:12px}@media(max-width:900px){.grid,.dims{grid-template-columns:1fr}.kpis{grid-template-columns:repeat(2,1fr)}main,header{padding-left:14px;padding-right:14px}}
</style></head><body>
<header><h1>FPG 统计看板</h1><div class="toolbar">
<label>查看者 <input id="actor" value="${actor}" aria-label="actor"></label>
<label>视角 <select id="role-view"><option>boss</option><option>dev</option><option>product</option><option>qa</option></select></label>
<button id="save-prefs">保存关注</button><small>生成时间 ${esc(stats.generated_at)} · ${esc(stats.viewer.display_name)}</small>
</div></header>
<main>
<section id="overview">${kpis(stats)}</section>
<section class="grid"><div class="panel" id="gantt"><h2>并行甘特</h2><div class="gantt-controls"><button data-scale="hour">时</button><button data-scale="day">天</button><button data-scale="week">周</button></div><div id="gantt-bars">${ganttBars(stats)}</div><div class="legend"><span><i class="s-未开始"></i>未开始</span><span><i class="s-执行中"></i>执行中</span><span><i class="s-已挂起"></i>已挂起</span><span><i class="s-已关闭"></i>已关闭</span><span>关键路径</span></div></div>
<div class="panel"><h2>三维度</h2><div class="dims"><div id="dim-agent"><h3>Agent</h3>${table(["k", "token"], dimRows(stats.dims.agent))}</div><div id="dim-skill"><h3>Skill</h3>${table(["k", "token"], dimRows(stats.dims.skill))}</div><div id="dim-tool"><h3>Tool</h3>${table(["k", "token"], dimRows(stats.dims.tool))}</div></div></div></section>
<section class="panel" id="v-drill"><h2>下钻</h2>${table(["ID", "名称", "状态", "计划", "实际", "偏差", "来源"], nodeRows(stats))}</section>
<section class="panel" id="developers"><h2>开发者维度</h2><div class="dev-list">${stats.developers.map((dev) => `<div class="dev"><b>${esc(dev.display_name)}</b><span>${esc(dev.actor_id)} · ${fmtTokens(dev.tokens)} · ${fmtHours(dev.active_hours)} · ${dev.tasks_done} tasks</span></div>`).join("") || `<p class="empty">暂无开发者数据</p>`}</div></section>
</main>
<script>
const stats = ${JSON.stringify(stats)};
document.getElementById('role-view').value = stats.viewer.role_view;
document.querySelectorAll('[data-scale]').forEach((btn) => btn.addEventListener('click', () => document.getElementById('gantt').dataset.scale = btn.dataset.scale));
document.getElementById('save-prefs').addEventListener('click', async () => {
  const actor = document.getElementById('actor').value || stats.viewer.actor_id;
  const role_view = document.getElementById('role-view').value;
  await fetch('/api/prefs?actor=' + encodeURIComponent(actor), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ watched_projects: stats.viewer.watched_projects, role_view }) });
});
</script>
</body></html>`;
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
