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
  return items.map((item) => [esc(item.k === "无" ? "未调用 MCP" : item.k), fmtTokens(item.tokens)]);
}

function epicLabel(item: { id: string; name: string }): string {
  return item.name ? `${item.id} ${item.name}` : item.id;
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

type GanttItem = {
  projectId: string;
  id: string;
  name: string;
  start: number | null;
  end: number | null;
  status4: NodeStat["gantt"]["status4"];
  blocked: boolean;
  critical: boolean;
};

function driftBadge(node: NodeStat | ProjectStat): string {
  if (!node.status_drift.drift) return "";
  return ` <span class="drift" title="${esc(node.status_drift.reason)}">⚠ 状态疑似过期</span>`;
}

function sourceLink(url: string | null): string {
  return url ? `<a href="${esc(url)}">原文↗</a>` : "—";
}

function isCompleteNode(node: NodeStat): boolean {
  return node.gantt.status4 === "已关闭" || node.status === "已完成" || node.status === "已验证";
}

function drillKey(projectId: string, path: string[]): string {
  return [projectId, ...path].join("/");
}

function treeCell(node: NodeStat, key: string, hasChildren: boolean): string {
  const toggle = hasChildren
    ? `<button class="tree-toggle" type="button" aria-label="展开 ${esc(node.id)}" data-tree-toggle="${esc(key)}">▸</button>`
    : `<span class="tree-spacer"></span>`;
  return `<span class="tree-id">${toggle}<span>${esc(node.id)}</span></span>`;
}

function drillTable(stats: Stats): string {
  const rows: string[] = [];
  for (const project of stats.projects) {
    const projectKey = drillKey(project.id, ["P"]);
    rows.push(`<tr data-project="${esc(project.id)}" data-tree-row="1" data-node-key="${esc(projectKey)}" data-node-id="${esc(project.id)}" data-level="P" data-expanded="true"><td><b>${esc(project.id)}</b></td><td>${esc(project.name)}</td><td>${esc(project.status || "—")}${driftBadge(project)}</td><td>—</td><td>${fmtTokens(project.actual.tokens)} / ${fmtHours(project.actual.active_hours)}</td><td>—</td><td>${sourceLink(project.source_url)}</td></tr>`);
    const walk = (node: NodeStat, parentKey: string, path: string[]) => {
      const key = drillKey(project.id, path);
      const complete = isCompleteNode(node);
      const hidden = node.level !== "E" || complete ? " hidden" : "";
      const expanded = "false";
      rows.push(`<tr data-project="${esc(project.id)}" data-tree-row="1" data-node-key="${esc(key)}" data-node-id="${esc(node.id)}" data-parent-key="${esc(parentKey)}" data-level="${esc(node.level)}" data-complete="${complete ? "true" : "false"}" data-expanded="${expanded}"${hidden}><td>${treeCell(node, key, node.children.length > 0)}</td><td>${esc(node.name)}</td><td>${esc(node.status || "—")}${driftBadge(node)}</td><td>${fmtTokens(Math.round((node.plan.estimate_tokens[0] + node.plan.estimate_tokens[1]) / 2))} / ${fmtHours(node.plan.estimate_hours)}</td><td>${fmtTokens(node.actual.tokens)} / ${fmtHours(node.actual.active_hours)}</td><td>${node.deviation.tokens === null ? "—" : fmtTokens(node.deviation.tokens)} / ${fmtHours(node.deviation.hours)}</td><td>${sourceLink(node.source_url)}</td></tr>`);
      node.children.forEach((child, index) => walk(child, key, [...path, child.level, child.id, String(index)]));
    };
    project.epics.forEach((epic, index) => walk(epic, projectKey, [epic.level, epic.id, String(index)]));
  }
  const headers = ["ID", "名称", "状态", "计划", "实际", "偏差", "来源"].map((h) => `<th>${esc(h)}</th>`).join("");
  return rows.length === 0 ? `<p class="empty">（暂无数据）</p>` : `<div class="tree-toolbar"><label><input type="checkbox" id="show-completed">显示已完成</label></div><table class="treelist"><thead><tr>${headers}</tr></thead><tbody>${rows.join("\n")}</tbody></table>`;
}

function collectGanttItems(stats: Stats, watched: Set<string>): GanttItem[] {
  const items: GanttItem[] = [];
  for (const project of stats.projects) {
    if (watched.size > 0 && !watched.has(project.id)) continue;
    for (const epic of project.epics.filter((item) => /^E\d+/.test(item.id))) {
      items.push({
        projectId: project.id,
        id: epic.id,
        name: epic.name,
        start: toTime(epic.gantt.start),
        end: toTime(epic.gantt.end),
        status4: epic.gantt.status4,
        blocked: epic.gantt.blocked,
        critical: epic.gantt.critical || flattenProject({ ...project, epics: [epic], children: [epic] }).some((node) => node.gantt.critical),
      });
    }
  }
  return items;
}

function toTime(value: string | null): number | null {
  if (!value) return null;
  const n = Date.parse(value);
  return Number.isFinite(n) ? n : null;
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfWeek(ms: number): number {
  const d = new Date(startOfDay(ms));
  d.setDate(d.getDate() - d.getDay());
  return d.getTime();
}

function scaleWindow(items: GanttItem[], scale: "hour" | "day" | "week"): { start: number; end: number } {
  const dated = items.filter((item) => item.start !== null || item.end !== null);
  if (dated.length === 0) {
    const now = Date.now();
    return { start: now, end: now + 48 * 3_600_000 };
  }
  const min = Math.min(...dated.map((item) => item.start ?? item.end!));
  const max = Math.max(...dated.map((item) => item.end ?? item.start!));
  if (scale === "hour") return { start: min - 3_600_000, end: min + 48 * 3_600_000 };
  if (scale === "day") {
    const start = startOfDay(min);
    return { start, end: Math.max(start + 7 * 86_400_000, startOfDay(max) + 86_400_000) };
  }
  const start = startOfWeek(min);
  return { start, end: Math.max(start + 4 * 7 * 86_400_000, startOfWeek(max) + 7 * 86_400_000) };
}

function ticks(start: number, end: number, scale: "hour" | "day" | "week"): string {
  const span = end - start || 1;
  const labels: string[] = [];
  for (let i = 0; i <= 4; i++) {
    const ms = start + (span * i) / 4;
    const d = new Date(ms);
    const label = scale === "hour"
      ? `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:00`
      : scale === "day"
        ? `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
        : `${d.getFullYear()}W${String(Math.ceil((((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86_400_000) + 1) / 7)).padStart(2, "0")}`;
    labels.push(`<span style="left:${i * 25}%">${label}</span>`);
  }
  return `<div class="gantt-axis">${labels.join("")}</div>`;
}

function barPosition(item: GanttItem, start: number, end: number): { left: number; width: number } | null {
  if (item.start === null && item.end === null) return null;
  const itemStart = item.start ?? item.end!;
  const itemEnd = item.end ?? item.start!;
  const span = end - start || 1;
  const clippedStart = Math.max(start, itemStart);
  const clippedEnd = Math.min(end, Math.max(itemEnd, itemStart + 3_600_000));
  const left = Math.max(0, Math.min(100, ((clippedStart - start) / span) * 100));
  const width = Math.max(1.5, Math.min(100 - left, ((clippedEnd - clippedStart) / span) * 100));
  return { left: Math.round(left * 100) / 100, width: Math.round(width * 100) / 100 };
}

function assignLanes(items: GanttItem[]): GanttItem[][] {
  const dated = items.filter((item) => item.start !== null || item.end !== null)
    .sort((a, b) => (a.start ?? a.end!)- (b.start ?? b.end!) || a.id.localeCompare(b.id));
  const lanes: GanttItem[][] = [];
  const laneEnds: number[] = [];
  for (const item of dated) {
    const s = item.start ?? item.end!;
    const e = item.end ?? item.start ?? s;
    let lane = laneEnds.findIndex((end) => end <= s);
    if (lane === -1) {
      lane = lanes.length;
      lanes.push([]);
      laneEnds.push(-Infinity);
    }
    lanes[lane].push(item);
    laneEnds[lane] = Math.max(laneEnds[lane], e);
  }
  return lanes;
}

function ganttBars(stats: Stats, scale: "hour" | "day" | "week" = "day"): string {
  const watched = new Set(stats.viewer.watched_projects.length ? stats.viewer.watched_projects : stats.projects.map((project) => project.id));
  const items = collectGanttItems(stats, watched);
  const critical = flattenStats(stats).some((node) => node.gantt.critical);
  const { start, end } = scaleWindow(items, scale);
  const groups = new Map<string, GanttItem[]>();
  for (const item of items) (groups.get(item.projectId) ?? groups.set(item.projectId, []).get(item.projectId)!).push(item);
  const body = [...groups.entries()].map(([projectId, group]) => {
    const lanes = assignLanes(group);
    const laneHtml = lanes.map((lane, index) => {
      const bars = lane.map((item) => {
        const pos = barPosition(item, start, end);
        if (!pos) return "";
        const cls = `bar s-${item.status4}${item.blocked ? " blocked" : ""}${item.critical ? " critical" : ""}`;
        return `<i class="${cls}" data-id="${esc(item.id)}" data-left="${pos.left}" data-width="${pos.width}" style="left:${pos.left}%;width:${pos.width}%" title="${esc(item.name)}">${esc(item.id)}</i>`;
      }).join("");
      const label = lane.map((item) => esc(epicLabel(item))).join(" / ");
      return `<div class="gantt-lane"><span title="${label}">${label}</span><div class="lane-track">${bars}</div></div>`;
    }).join("");
    const unplanned = group.filter((item) => item.start === null && item.end === null).map((item) => `<span class="unplanned">${esc(item.id)} 未排期</span>`).join("");
    return `<section class="gantt-project" data-project="${esc(projectId)}"><h3>${esc(projectId)}</h3>${laneHtml || `<p class="empty">未排期</p>`}${unplanned}</section>`;
  }).join("");
  const criticalLine = critical ? `<div class="critical-line">关键路径</div>` : `<div class="empty">未声明依赖</div>`;
  return `${ticks(start, end, scale)}${criticalLine}${body || `<p class="empty">未排期；未声明依赖时隐藏关键路径行。</p>`}`;
}

function watchPanel(stats: Stats): string {
  const watched = new Set(stats.viewer.watched_projects);
  return `<div class="watch-panel" id="watch-panel"><b>关注项目</b>${stats.projects.map((project) => {
    const checked = watched.size === 0 || watched.has(project.id) ? " checked" : "";
    return `<label><input type="checkbox" name="watched-project" value="${esc(project.id)}"${checked}>${esc(project.id)}</label>`;
  }).join("")}</div>`;
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
*{box-sizing:border-box}body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;color:var(--ink);background:#fff;font-size:14px;line-height:1.45}header{padding:20px 24px;border-bottom:1px solid var(--line);background:var(--bg)}main{padding:18px 24px;max-width:1320px;margin:0 auto}h1{font-size:22px;margin:0 0 8px}h2{font-size:17px;margin:28px 0 10px}.toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.toolbar label{font-size:13px;color:var(--muted)}input,select,button{height:32px;border:1px solid var(--line);border-radius:6px;background:#fff;padding:0 10px}.kpis{display:grid;grid-template-columns:repeat(6,minmax(120px,1fr));gap:10px;margin:16px 0}.kpi{border:1px solid var(--line);border-radius:8px;padding:10px 12px;background:#fff}.kpi b{display:block;font-size:20px}.kpi span{color:var(--muted);font-size:12px}.grid{display:grid;grid-template-columns:1.2fr .8fr;gap:16px}.panel{border:1px solid var(--line);border-radius:8px;padding:14px;background:#fff;min-width:0}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border-bottom:1px solid var(--line);padding:8px;text-align:left;vertical-align:top}th{background:var(--bg);font-weight:600}.empty{color:var(--muted);margin:8px 0}.drift{display:inline-block;border:1px solid #f0b429;background:#fff8e1;color:#7a5200;border-radius:999px;padding:1px 7px;font-size:12px;white-space:nowrap}.dims{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.watch-panel,.tree-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:10px 0}.watch-panel label,.tree-toolbar label{display:inline-flex;align-items:center;gap:4px;color:var(--muted)}.watch-panel input,.tree-toolbar input{height:auto}.treelist .tree-id{display:inline-flex;align-items:center;gap:4px}.treelist tr[data-level="S"] .tree-id{padding-left:18px}.treelist tr[data-level="T"] .tree-id{padding-left:36px}.tree-toggle,.tree-spacer{width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;flex:0 0 20px}.tree-toggle{border:0;background:transparent;padding:0;color:var(--muted);cursor:pointer;font-size:13px}.tree-toggle:hover{color:var(--ink);background:#eef1f5}.gantt-controls{display:flex;gap:6px;margin-bottom:10px}.gantt-axis{position:relative;height:24px;border-bottom:1px solid var(--line);margin:2px 0 8px}.gantt-axis span{position:absolute;transform:translateX(-50%);font-size:11px;color:var(--muted);white-space:nowrap}.gantt-project{margin:10px 0}.gantt-project h3{font-size:13px;margin:6px 0;color:var(--muted)}.gantt-lane{display:grid;grid-template-columns:minmax(180px,24%) 1fr;align-items:center;min-height:30px;border-bottom:1px solid #eef1f5}.gantt-lane span{font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:8px}.lane-track{position:relative;height:24px;background:linear-gradient(90deg,#eef1f5 1px,transparent 1px);background-size:25% 100%}.bar{position:absolute;top:4px;display:block;height:16px;border-radius:4px;padding:0 4px;overflow:hidden;white-space:nowrap;font-size:10px;color:#fff;line-height:16px}.s-未开始{background:#d7dde7;border:1px dashed #8d98a8;color:#3d4652}.s-执行中{background:var(--blue)}.s-已挂起{background:repeating-linear-gradient(45deg,#f6d365,#f6d365 5px,#f2b84b 5px,#f2b84b 10px);color:#4b3410}.s-已关闭{background:var(--green)}.blocked{box-shadow:inset -8px 0 0 var(--red)}.critical{outline:2px solid #111}.critical-line{font-size:12px;color:#111;margin:4px 0 8px}.legend{display:flex;flex-wrap:wrap;gap:10px;color:var(--muted);font-size:12px;margin-top:10px}.legend i{display:inline-block;width:18px;height:10px;border-radius:3px;margin-right:4px}.unplanned{display:inline-block;margin:6px 6px 0 0;border:1px dashed var(--line);border-radius:999px;padding:2px 8px;color:var(--muted);font-size:12px}.dev-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}.dev{border:1px solid var(--line);border-radius:8px;padding:10px}.dev b{display:block}.dev span{color:var(--muted);font-size:12px}@media(max-width:900px){.grid,.dims{grid-template-columns:1fr}.kpis{grid-template-columns:repeat(2,1fr)}main,header{padding-left:14px;padding-right:14px}}
</style></head><body>
<header><h1>FPG 统计看板</h1><div class="toolbar">
<label>查看者 <input id="actor" value="${actor}" aria-label="actor"></label>
<label>视角 <select id="role-view"><option>boss</option><option>dev</option><option>product</option><option>qa</option></select></label>
<button id="save-prefs">保存关注</button><small>生成时间 ${esc(stats.generated_at)} · ${esc(stats.viewer.display_name)}</small>
</div></header>
<main>
<section id="overview">${kpis(stats)}${watchPanel(stats)}</section>
<section class="grid"><div class="panel" id="gantt" data-scale="day"><h2>并行甘特</h2><div class="gantt-controls"><button data-scale="hour">时</button><button data-scale="day">天</button><button data-scale="week">周</button></div><div id="gantt-bars">${ganttBars(stats)}</div><div class="legend"><span><i class="s-未开始"></i>未开始</span><span><i class="s-执行中"></i>执行中</span><span><i class="s-已挂起"></i>已挂起</span><span><i class="s-已关闭"></i>已关闭</span><span>关键路径</span></div></div>
<div class="panel"><h2>三维度</h2><div class="dims"><div id="dim-agent"><h3>Agent</h3>${table(["k", "token"], dimRows(stats.dims.agent))}</div><div id="dim-skill"><h3>Skill</h3>${table(["k", "token"], dimRows(stats.dims.skill))}</div><div id="dim-tool"><h3>Tool</h3>${table(["k", "token"], dimRows(stats.dims.tool))}</div></div></div></section>
<section class="panel" id="v-drill"><h2>迭代进展明细</h2>${drillTable(stats)}</section>
<section class="panel" id="developers"><h2>开发者维度</h2><div class="dev-list">${stats.developers.map((dev) => `<div class="dev"><b>${esc(dev.display_name)}</b><span>${esc(dev.actor_id)} · ${fmtTokens(dev.tokens)} · ${fmtHours(dev.active_hours)} · ${dev.tasks_done} tasks</span></div>`).join("") || `<p class="empty">暂无开发者数据</p>`}</div></section>
</main>
<script>
const stats = ${JSON.stringify(stats)};
document.getElementById('role-view').value = stats.viewer.role_view;
const toTime = (value) => value ? Date.parse(value) : null;
const flattenProject = (project) => {
  const out = [];
  const walk = (node) => { out.push(node); (node.children || []).forEach(walk); };
  (project.epics || []).forEach(walk);
  return out;
};
const flattenStats = () => stats.projects.flatMap((project) => [{ ...project, projectId: project.id }, ...flattenProject(project).map((node) => ({ ...node, projectId: project.id }))]);
const watchedProjects = () => Array.from(document.querySelectorAll('input[name="watched-project"]:checked')).map((item) => item.value);
const visibleProjects = () => new Set(watchedProjects().length ? watchedProjects() : stats.projects.map((project) => project.id));
const collectGanttItems = () => {
  const watched = visibleProjects();
  return stats.projects.flatMap((project) => watched.has(project.id) ? project.epics.filter((epic) => /^E\\d+/.test(epic.id)).map((epic) => ({
    projectId: project.id, id: epic.id, name: epic.name,
    start: toTime(epic.gantt.start), end: toTime(epic.gantt.end),
    status4: epic.gantt.status4, blocked: epic.gantt.blocked,
    critical: epic.gantt.critical || flattenProject({ ...project, epics: [epic] }).some((node) => node.gantt.critical),
  })) : []);
};
const epicLabel = (item) => item.name ? item.id + ' ' + item.name : item.id;
const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0,0,0,0); return d.getTime(); };
const startOfWeek = (ms) => { const d = new Date(startOfDay(ms)); d.setDate(d.getDate() - d.getDay()); return d.getTime(); };
const scaleWindow = (items, scale) => {
  const dated = items.filter((item) => item.start !== null || item.end !== null);
  if (!dated.length) { const now = Date.now(); return { start: now, end: now + 48 * 3600000 }; }
  const min = Math.min(...dated.map((item) => item.start ?? item.end));
  const max = Math.max(...dated.map((item) => item.end ?? item.start));
  if (scale === 'hour') return { start: min - 3600000, end: min + 48 * 3600000 };
  if (scale === 'day') { const start = startOfDay(min); return { start, end: Math.max(start + 7 * 86400000, startOfDay(max) + 86400000) }; }
  const start = startOfWeek(min); return { start, end: Math.max(start + 4 * 7 * 86400000, startOfWeek(max) + 7 * 86400000) };
};
const ticks = (start, end, scale) => {
  const span = end - start || 1;
  return '<div class="gantt-axis">' + [0,1,2,3,4].map((i) => {
    const d = new Date(start + span * i / 4);
    const label = scale === 'hour' ? String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') + ' ' + String(d.getHours()).padStart(2,'0') + ':00'
      : scale === 'day' ? String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0')
      : d.getFullYear() + 'W' + String(Math.ceil(((((d.getTime() - new Date(d.getFullYear(),0,1).getTime()) / 86400000) + 1) / 7))).padStart(2,'0');
    return '<span style="left:' + (i * 25) + '%">' + label + '</span>';
  }).join('') + '</div>';
};
const barPosition = (item, start, end) => {
  if (item.start === null && item.end === null) return null;
  const itemStart = item.start ?? item.end;
  const itemEnd = item.end ?? item.start;
  const span = end - start || 1;
  const clippedStart = Math.max(start, itemStart);
  const clippedEnd = Math.min(end, Math.max(itemEnd, itemStart + 3600000));
  const left = Math.max(0, Math.min(100, ((clippedStart - start) / span) * 100));
  const width = Math.max(1.5, Math.min(100 - left, ((clippedEnd - clippedStart) / span) * 100));
  return { left: Math.round(left * 100) / 100, width: Math.round(width * 100) / 100 };
};
const assignLanes = (items) => {
  const dated = items.filter((item) => item.start !== null || item.end !== null).sort((a,b) => (a.start ?? a.end) - (b.start ?? b.end) || a.id.localeCompare(b.id));
  const lanes = [], laneEnds = [];
  dated.forEach((item) => {
    const s = item.start ?? item.end, e = item.end ?? item.start ?? s;
    let lane = laneEnds.findIndex((end) => end <= s);
    if (lane === -1) { lane = lanes.length; lanes.push([]); laneEnds.push(-Infinity); }
    lanes[lane].push(item); laneEnds[lane] = Math.max(laneEnds[lane], e);
  });
  return lanes;
};
const renderGantt = (scale = document.getElementById('gantt').dataset.scale || 'day') => {
  const items = collectGanttItems();
  const allNodes = flattenStats();
  const hasCritical = allNodes.some((node) => node.gantt.critical);
  const window = scaleWindow(items, scale);
  const grouped = new Map();
  items.forEach((item) => grouped.set(item.projectId, [...(grouped.get(item.projectId) || []), item]));
  let html = ticks(window.start, window.end, scale) + (hasCritical ? '<div class="critical-line">关键路径</div>' : '<div class="empty">未声明依赖</div>');
  grouped.forEach((group, projectId) => {
    const lanes = assignLanes(group);
    html += '<section class="gantt-project" data-project="' + projectId + '"><h3>' + projectId + '</h3>';
    html += lanes.map((lane) => {
      const label = lane.map(epicLabel).join(' / ');
      return '<div class="gantt-lane"><span title="' + label.replaceAll('"', '&quot;') + '">' + label + '</span><div class="lane-track">' + lane.map((item) => {
      const pos = barPosition(item, window.start, window.end);
      if (!pos) return '';
      const cls = 'bar s-' + item.status4 + (item.blocked ? ' blocked' : '') + (item.critical ? ' critical' : '');
      return '<i class="' + cls + '" data-id="' + item.id + '" data-left="' + pos.left + '" data-width="' + pos.width + '" style="left:' + pos.left + '%;width:' + pos.width + '%" title="' + item.name.replaceAll('"', '&quot;') + '">' + item.id + '</i>';
    }).join('') + '</div></div>';
    }).join('') || '<p class="empty">未排期</p>';
    html += group.filter((item) => item.start === null && item.end === null).map((item) => '<span class="unplanned">' + item.id + ' 未排期</span>').join('');
    html += '</section>';
  });
  document.getElementById('gantt').dataset.scale = scale;
  document.getElementById('gantt-bars').innerHTML = html || '<p class="empty">未排期</p>';
};
const childRowsOf = (key) => Array.from(document.querySelectorAll('[data-parent-key="' + CSS.escape(key) + '"]'));
const isNumberedEpic = (row) => row.dataset.level !== 'E' || /^E\\d+$/.test(row.dataset.nodeId || '');
const applyDrillTree = () => {
  const watched = visibleProjects();
  const showCompleted = document.getElementById('show-completed')?.checked || false;
  const rows = Array.from(document.querySelectorAll('[data-tree-row]'));
  rows.forEach((row) => {
    const projectVisible = watched.size === 0 || watched.has(row.dataset.project);
    let visible = projectVisible;
    if (visible && row.dataset.level !== 'P') {
      const completeAllowed = showCompleted || row.dataset.complete !== 'true';
      const parent = rows.find((item) => item.dataset.nodeKey === row.dataset.parentKey);
      visible = completeAllowed && isNumberedEpic(row) && !!parent && !parent.hidden && parent.dataset.expanded === 'true';
    }
    row.hidden = !visible;
    const toggle = row.querySelector('[data-tree-toggle]');
    if (toggle) {
      const expanded = row.dataset.expanded === 'true';
      toggle.textContent = expanded ? '▾' : '▸';
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.setAttribute('aria-label', (expanded ? '折叠 ' : '展开 ') + (row.dataset.nodeId || ''));
    }
  });
};
const applyWatchFilter = () => {
  const watched = visibleProjects();
  document.querySelectorAll('[data-project]:not([data-tree-row])').forEach((el) => { el.hidden = watched.size > 0 && !watched.has(el.dataset.project); });
  applyDrillTree();
  renderGantt();
};
document.querySelectorAll('[data-tree-toggle]').forEach((button) => button.addEventListener('click', () => {
  const row = button.closest('[data-tree-row]');
  if (!row) return;
  row.dataset.expanded = row.dataset.expanded === 'true' ? 'false' : 'true';
  if (row.dataset.expanded === 'false') {
    const collapse = (parentKey) => childRowsOf(parentKey).forEach((child) => {
      child.dataset.expanded = 'false';
      collapse(child.dataset.nodeKey);
    });
    collapse(row.dataset.nodeKey);
  }
  applyDrillTree();
}));
document.getElementById('show-completed')?.addEventListener('change', applyDrillTree);
document.querySelectorAll('[data-scale]').forEach((btn) => btn.addEventListener('click', () => renderGantt(btn.dataset.scale)));
document.querySelectorAll('input[name="watched-project"]').forEach((box) => box.addEventListener('change', applyWatchFilter));
applyWatchFilter();
document.getElementById('save-prefs').addEventListener('click', async () => {
  const actor = document.getElementById('actor').value || stats.viewer.actor_id;
  const role_view = document.getElementById('role-view').value;
  await fetch('/api/prefs?actor=' + encodeURIComponent(actor), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ watched_projects: watchedProjects(), role_view }) });
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
