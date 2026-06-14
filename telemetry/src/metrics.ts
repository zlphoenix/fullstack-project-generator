// 从事件流派生运营指标。纯函数，便于测试。
import type { PlanNode, PlanSource, PlanSnapshot, TelemetryEvent, ZhStatus } from "./schema.ts";

export interface DurationStat {
  count: number;
  avg_hours: number;
  p50_hours: number;
  p90_hours: number;
}

export interface TokenStat {
  turns: number; // 计入的 turn_complete 数
  total_tokens: number; // sum(usage.turn_total_tokens)
}

export interface Metrics {
  total_events: number;
  by_event_type: Record<string, number>;
  by_actor_role: Record<string, number>;
  by_project: Record<string, number>;
  by_milestone: Record<string, number>;
  by_skill: Record<string, number>; // skill 命中：各 skill 的事件数（含 hook 自动事件）
  projects: string[];
  phase_cycle_time: Record<string, DurationStat>; // key: phase
  story_lead_time: DurationStat;
  rework_rate: number; // story_reopen / story_complete
  rework_count: number;
  story_completed: number;
  contract_changes: number;
  ac_pass_rate: number | null; // verification[kind=ac] ok 比例
  ac_total: number;
  // —— instrumentation 派生（来自 hook 自动事件，模型零参与）——
  sessions: number; // session_start 数
  turns: number; // turn_complete 数
  tokens_by_phase: Record<string, TokenStat>;
  tokens_by_skill: Record<string, TokenStat>;
  tokens_by_task: Record<string, TokenStat>; // key: epic/sprint/task（缺省段为 "-"）
  tokens_total: number;
  active_hours_by_phase: Record<string, number>; // 同 session 相邻 turn 间隔（<30min）归集到后一个 turn 的 phase
  active_hours_total: number;
}

export interface KV {
  k: string;
  tokens: number;
}

export interface NodeStat {
  level: "P" | "E" | "S" | "T";
  id: string;
  name: string;
  status: ZhStatus | "";
  plan: { estimate_tokens: [number, number]; estimate_hours: number | null };
  actual: { tokens: number; active_hours: number; sessions: number; turns: number };
  deviation: { tokens: number | null; hours: number | null };
  source_url: string | null;
  status_drift: { drift: boolean; reason: string };
  gantt: {
    start: string | null;
    end: string | null;
    status4: "未开始" | "执行中" | "已挂起" | "已关闭";
    blocked: boolean;
    critical: boolean;
    deps: string[];
  };
  children: NodeStat[];
}

export interface ProjectStat extends Omit<NodeStat, "level"> {
  level: "P";
  epics: NodeStat[];
}

export interface Stats {
  generated_at: string;
  viewer: { actor_id: string; display_name: string; role_view: string; watched_projects: string[] };
  projects: ProjectStat[];
  dims: { agent: KV[]; skill: KV[]; tool: KV[] };
  developers: { actor_id: string; display_name: string; tokens: number; active_hours: number; tasks_done: number }[];
}

export interface BuildStatsOptions {
  actors?: { resolveName(id: string): string };
  prefs?: { actor_id: string; watched_projects: string[]; role_view: string };
  project?: string;
  viewer?: string;
}

function hoursBetween(a: string, b: string): number {
  return (Date.parse(b) - Date.parse(a)) / 3_600_000;
}

function durationStat(durations: number[]): DurationStat {
  if (durations.length === 0) return { count: 0, avg_hours: 0, p50_hours: 0, p90_hours: 0 };
  const sorted = [...durations].sort((x, y) => x - y);
  const sum = sorted.reduce((s, v) => s + v, 0);
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    count: sorted.length,
    avg_hours: round(sum / sorted.length),
    p50_hours: round(pct(50)),
    p90_hours: round(pct(90)),
  };
}

function inc(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

/** 将 enter/complete 类事件按 (project, key) 配对，计算时长（小时）。 */
function pairDurations(
  events: TelemetryEvent[],
  startType: string,
  endType: string,
  keyOf: (e: TelemetryEvent) => string,
): Record<string, number[]> {
  const open = new Map<string, string>(); // pairKey -> start ts
  const out: Record<string, number[]> = {};
  for (const e of events) {
    const groupKey = keyOf(e);
    const pairKey = `${e.project_id}::${groupKey}`;
    if (e.event_type === startType) {
      open.set(pairKey, e.ts);
    } else if (e.event_type === endType) {
      const start = open.get(pairKey);
      if (start) {
        (out[groupKey] ??= []).push(hoursBetween(start, e.ts));
        open.delete(pairKey);
      }
    }
  }
  return out;
}

/** turn_complete.attrs.usage 的回合增量 token；无 usage 或非法时返回 null。 */
function turnTokens(e: TelemetryEvent): number | null {
  const usage = e.attrs?.usage as Record<string, unknown> | undefined;
  if (!usage || typeof usage !== "object") return null;
  const v = usage.turn_total_tokens ?? usage.total_tokens;
  return typeof v === "number" && v >= 0 ? v : null;
}

function addTokens(map: Record<string, TokenStat>, key: string, tokens: number) {
  const s = (map[key] ??= { turns: 0, total_tokens: 0 });
  s.turns++;
  s.total_tokens += tokens;
}

function addNumber(map: Record<string, number>, key: string, value: number) {
  map[key] = (map[key] ?? 0) + value;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function taskKey(epic: unknown, sprint: unknown, task: unknown): string {
  return `${epic ?? "-"}/${sprint ?? "-"}/${task ?? "-"}`;
}

const IDLE_GAP_HOURS = 0.5; // 同 session 相邻 turn 间隔超过 30 分钟视为空闲，不计入活跃耗时

export function computeMetrics(events: TelemetryEvent[]): Metrics {
  const byType: Record<string, number> = {};
  const byRole: Record<string, number> = {};
  const byProject: Record<string, number> = {};
  const byMilestone: Record<string, number> = {};
  const bySkill: Record<string, number> = {};

  let reworkCount = 0;
  let storyCompleted = 0;
  let contractChanges = 0;
  let acTotal = 0;
  let acOk = 0;
  let sessions = 0;
  let turns = 0;
  let tokensTotal = 0;
  const tokensByPhase: Record<string, TokenStat> = {};
  const tokensBySkill: Record<string, TokenStat> = {};
  const tokensByTask: Record<string, TokenStat> = {};
  const activeByPhase: Record<string, number> = {};
  let activeTotal = 0;
  const lastTurnTs = new Map<string, string>(); // session_id -> 上一个 turn 的 ts

  for (const e of events) {
    inc(byType, e.event_type);
    inc(byRole, e.actor_role);
    inc(byProject, e.project_id);
    inc(byMilestone, e.milestone || "(none)");
    inc(bySkill, e.skill || "(none)");
    if (e.event_type === "story_reopen") reworkCount++;
    if (e.event_type === "story_complete") storyCompleted++;
    if (e.event_type === "contract_change") contractChanges++;
    if (e.event_type === "verification" && e.attrs?.kind === "ac") {
      acTotal++;
      if (e.outcome === "ok") acOk++;
    }
    if (e.event_type === "session_start") {
      sessions++;
      const sid = String(e.attrs?.session_id ?? "");
      if (sid) lastTurnTs.set(sid, e.ts); // 首个 turn 的耗时从会话开始算
    }
    if (e.event_type === "turn_complete") {
      turns++;
      // token 用量（instrumentation）
      const tokens = turnTokens(e);
      if (tokens !== null) {
        tokensTotal += tokens;
        addTokens(tokensByPhase, e.phase || "(none)", tokens);
        addTokens(tokensBySkill, e.skill || "(none)", tokens);
      }
      // E/S/T 归因：只要带 epic/sprint/task 标记就计入（按回合），token 缺失记 0。
      // 与 token 解耦——让暂无 usage 的工具（如当前 Claude Code）会话也能看到归因。
      const a = e.attrs ?? {};
      if (a.epic || a.sprint || a.task) {
        addTokens(tokensByTask, `${a.epic ?? "-"}/${a.sprint ?? "-"}/${a.task ?? "-"}`, tokens ?? 0);
      }
      // 活跃耗时近似：同 session 相邻 turn 间隔，归集到后一个 turn 的 phase
      const sid = String(e.attrs?.session_id ?? "");
      if (sid) {
        const prev = lastTurnTs.get(sid);
        if (prev) {
          const h = hoursBetween(prev, e.ts);
          if (h > 0 && h <= IDLE_GAP_HOURS) {
            activeByPhase[e.phase || "(none)"] = (activeByPhase[e.phase || "(none)"] ?? 0) + h;
            activeTotal += h;
          }
        }
        lastTurnTs.set(sid, e.ts);
      }
    }
  }

  // 阶段周期时间：phase_enter → phase_complete，按 phase 分组
  const phaseDurations = pairDurations(events, "phase_enter", "phase_complete", (e) => e.phase || "unknown");
  const phaseCycle: Record<string, DurationStat> = {};
  for (const [phase, ds] of Object.entries(phaseDurations)) phaseCycle[phase] = durationStat(ds);

  // Story 交付时长：story_start → story_complete，按 story 配对
  const storyDurations = pairDurations(events, "story_start", "story_complete", (e) =>
    String(e.attrs?.story ?? e.event_id),
  );
  const allStoryDurations = Object.values(storyDurations).flat();

  const round2 = (n: number) => Math.round(n * 100) / 100;
  for (const k of Object.keys(activeByPhase)) activeByPhase[k] = round2(activeByPhase[k]);

  return {
    total_events: events.length,
    by_event_type: byType,
    by_actor_role: byRole,
    by_project: byProject,
    by_milestone: byMilestone,
    by_skill: bySkill,
    projects: Object.keys(byProject).sort(),
    phase_cycle_time: phaseCycle,
    story_lead_time: durationStat(allStoryDurations),
    rework_rate: storyCompleted > 0 ? Math.round((reworkCount / storyCompleted) * 1000) / 1000 : 0,
    rework_count: reworkCount,
    story_completed: storyCompleted,
    contract_changes: contractChanges,
    ac_pass_rate: acTotal > 0 ? Math.round((acOk / acTotal) * 1000) / 1000 : null,
    ac_total: acTotal,
    sessions,
    turns,
    tokens_by_phase: tokensByPhase,
    tokens_by_skill: tokensBySkill,
    tokens_by_task: tokensByTask,
    tokens_total: tokensTotal,
    active_hours_by_phase: activeByPhase,
    active_hours_total: round2(activeTotal),
  };
}

export function githubSlug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\s-]/gu, "")
    .replace(/\s+/g, "-");
}

export function buildSourceUrl(source: PlanSource): string | null {
  if (source.repo_url) {
    return `${source.repo_url}/blob/${source.commit}/${source.path}#${githubSlug(source.heading)}`;
  }
  if (source.abs_path) return `vscode://file/${source.abs_path}:${source.line}`;
  return null;
}

function mid(tokens: [number, number]): number {
  return Math.round((tokens[0] + tokens[1]) / 2);
}

export function criticalPath(nodes: { id: string; deps?: string[]; gantt?: { deps: string[] }; plan: { estimate_tokens: [number, number] } }[]): Set<string> {
  const depsOf = (node: { deps?: string[]; gantt?: { deps: string[] } }) => node.deps ?? node.gantt?.deps ?? [];
  if (!nodes.some((node) => depsOf(node).length > 0)) return new Set();
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const node of nodes) indegree.set(node.id, 0);
  for (const node of nodes) {
    for (const dep of depsOf(node)) {
      if (!byId.has(dep)) continue;
      (children.get(dep) ?? children.set(dep, []).get(dep)!).push(node.id);
      indegree.set(node.id, (indegree.get(node.id) ?? 0) + 1);
    }
  }
  const queue = nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0).map((node) => node.id);
  const score = new Map<string, number>();
  const prev = new Map<string, string | null>();
  for (const id of queue) {
    const node = byId.get(id)!;
    score.set(id, mid(node.plan.estimate_tokens) || 1);
    prev.set(id, null);
  }
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    for (const child of children.get(id) ?? []) {
      const childNode = byId.get(child)!;
      const candidate = (score.get(id) ?? 0) + (mid(childNode.plan.estimate_tokens) || 1);
      if (candidate > (score.get(child) ?? -Infinity)) {
        score.set(child, candidate);
        prev.set(child, id);
      }
      indegree.set(child, (indegree.get(child) ?? 0) - 1);
      if (indegree.get(child) === 0) queue.push(child);
    }
  }
  let best = "";
  let bestScore = -Infinity;
  for (const [id, value] of score.entries()) {
    if (value > bestScore) {
      best = id;
      bestScore = value;
    }
  }
  const path = new Set<string>();
  for (let id: string | null | undefined = best; id; id = prev.get(id)) path.add(id);
  return new Set([...path].reverse());
}

function status4(status: ZhStatus | ""): "未开始" | "执行中" | "已挂起" | "已关闭" {
  if (status === "已完成") return "已关闭";
  if (status === "搁置") return "已挂起";
  if (status === "未开始" || status === "") return "未开始";
  return "执行中";
}

type DriftInput = {
  status: ZhStatus | "";
  actual: { turns: number };
  children: DriftInput[];
};

function descendants(node: DriftInput): DriftInput[] {
  return node.children.flatMap((child) => [child, ...descendants(child)]);
}

export function computeStatusDrift(node: DriftInput): { drift: boolean; reason: string } {
  const all = [node, ...descendants(node)];
  if (all.some((item) => item.actual.turns > 0) && (node.status === "未开始" || node.status === "")) {
    return { drift: true, reason: "有实测活动但状态仍未开始" };
  }
  if (node.children.length > 0 && node.children.every((child) => child.status === "已完成") && node.status !== "已完成") {
    return { drift: true, reason: "子项均已完成但本级未收口" };
  }
  if (
    (node.status === "已完成" || node.status === "已验证") &&
    descendants(node).some((child) => !["已完成", "已验证", "搁置"].includes(child.status))
  ) {
    return { drift: true, reason: "本级已收口但有子项未完成" };
  }
  return { drift: false, reason: "" };
}

interface ActualBucket {
  tokens: number;
  active_hours: number;
  sessions: Set<string>;
  turns: number;
  start: string | null;
  end: string | null;
}

interface BuiltNode {
  projectId: string;
  planNode: PlanNode | null;
  key: string;
  children: BuiltNode[];
  stat: NodeStat;
  bucket: ActualBucket;
}

function emptyActual(): ActualBucket {
  return { tokens: 0, active_hours: 0, sessions: new Set(), turns: 0, start: null, end: null };
}

function addActual(target: ActualBucket, source: ActualBucket) {
  target.tokens += source.tokens;
  target.active_hours += source.active_hours;
  target.turns += source.turns;
  for (const session of source.sessions) target.sessions.add(session);
  if (source.start && (!target.start || source.start < target.start)) target.start = source.start;
  if (source.end && (!target.end || source.end > target.end)) target.end = source.end;
}

function aggregateChildren(direct: ActualBucket, children: BuiltNode[]): ActualBucket {
  const aggregate = emptyActual();
  addActual(aggregate, direct);
  for (const child of children) addActual(aggregate, child.bucket);
  return aggregate;
}

function actualOut(bucket: ActualBucket): NodeStat["actual"] {
  return {
    tokens: bucket.tokens,
    active_hours: round2(bucket.active_hours),
    sessions: bucket.sessions.size,
    turns: bucket.turns,
  };
}

function deviation(actual: NodeStat["actual"], plan: NodeStat["plan"]): NodeStat["deviation"] {
  const m = mid(plan.estimate_tokens);
  return {
    tokens: m > 0 ? actual.tokens - m : null,
    hours: plan.estimate_hours !== null ? round1(actual.active_hours - plan.estimate_hours) : null,
  };
}

function kvList(map: Record<string, number>): KV[] {
  return Object.entries(map)
    .map(([k, tokens]) => ({ k, tokens }))
    .sort((a, b) => b.tokens - a.tokens || a.k.localeCompare(b.k));
}

function planFromEvent(event: TelemetryEvent): PlanSnapshot | null {
  const plan = (event.attrs as { plan?: PlanSnapshot }).plan;
  return plan?.root ? plan : null;
}

export function buildStats(events: TelemetryEvent[], options: BuildStatsOptions = {}): Stats {
  const filtered = options.project ? events.filter((event) => event.project_id === options.project) : events;
  const resolveName = options.actors?.resolveName ?? ((id: string) => id);
  const viewerId = options.viewer ?? options.prefs?.actor_id ?? "anonymous";
  const prefs = options.prefs ?? {
    actor_id: viewerId,
    watched_projects: [...new Set(filtered.filter((event) => event.actor_id === viewerId).map((event) => event.project_id))].sort(),
    role_view: "dev",
  };

  const latestPlans = new Map<string, { project_id: string; plan: PlanSnapshot; ts: string }>();
  for (const event of filtered) {
    if (event.event_type !== "plan_sync") continue;
    const plan = planFromEvent(event);
    if (!plan) continue;
    const key = `${event.project_id}\u0000${plan.root}`;
    const old = latestPlans.get(key);
    if (!old || Date.parse(event.ts) >= Date.parse(old.ts)) latestPlans.set(key, { project_id: event.project_id, plan, ts: event.ts });
  }

  const actualByProjectTask = new Map<string, ActualBucket>();
  const projectIds = new Set(filtered.map((event) => event.project_id));
  const dims = { agent: {} as Record<string, number>, skill: {} as Record<string, number>, tool: {} as Record<string, number> };
  const developerBuckets = new Map<string, { tokens: number; active: number; tasks: Set<string> }>();
  const lastTs = new Map<string, string>();

  for (const event of filtered) {
    if (event.event_type === "session_start") {
      const sid = String(event.attrs?.session_id ?? "");
      if (sid) lastTs.set(sid, event.ts);
      continue;
    }
    if (event.event_type !== "turn_complete") continue;
    const tokens = turnTokens(event) ?? 0;
    addNumber(dims.agent, event.tool || "unknown", tokens);
    addNumber(dims.skill, event.skill || "(none)", tokens);
    const tools = Array.isArray(event.attrs?.mcp_tools) ? event.attrs.mcp_tools.filter((tool) => typeof tool === "string") : [];
    if (tools.length === 0) addNumber(dims.tool, "无", tokens);
    for (const tool of tools) addNumber(dims.tool, tool, tokens);

    const sid = String(event.attrs?.session_id ?? "");
    const key = taskKey(event.attrs?.epic, event.attrs?.sprint, event.attrs?.task);
    let active = 0;
    if (sid) {
      const prev = lastTs.get(sid);
      if (prev) {
        const h = hoursBetween(prev, event.ts);
        if (h > 0 && h <= IDLE_GAP_HOURS) active = h;
      }
      lastTs.set(sid, event.ts);
    }
    const bucketKey = `${event.project_id}\u0000${key}`;
    const bucket = actualByProjectTask.get(bucketKey) ?? emptyActual();
    bucket.tokens += tokens;
    bucket.active_hours += active;
    bucket.turns += 1;
    if (sid) bucket.sessions.add(sid);
    if (!bucket.start || event.ts < bucket.start) bucket.start = event.ts;
    if (!bucket.end || event.ts > bucket.end) bucket.end = event.ts;
    actualByProjectTask.set(bucketKey, bucket);

    const dev = developerBuckets.get(event.actor_id) ?? { tokens: 0, active: 0, tasks: new Set<string>() };
    dev.tokens += tokens;
    dev.active += active;
    dev.tasks.add(`${event.project_id}/${key}`);
    developerBuckets.set(event.actor_id, dev);
  }

  const actualFor = (project: string, key: string) => actualByProjectTask.get(`${project}\u0000${key}`) ?? emptyActual();
  const projects = new Map<string, { stat: ProjectStat; epics: BuiltNode[] }>();

  function makeNode(
    projectId: string,
    planNode: PlanNode | null,
    level: "E" | "S" | "T",
    id: string,
    children: BuiltNode[],
    key: string,
  ): BuiltNode {
    const direct = actualFor(projectId, key);
    const aggregate = aggregateChildren(direct, children);
    const plan = {
      estimate_tokens: planNode?.estimate_tokens ?? ([0, 0] as [number, number]),
      estimate_hours: planNode?.estimate_hours ?? null,
    };
    const actual = actualOut(aggregate);
    const status = planNode?.status ?? "";
    const start = planNode?.planned_start ?? aggregate.start;
    const end = planNode?.planned_end ?? aggregate.end;
    const node: NodeStat = {
      level,
      id,
      name: planNode?.name ?? id,
      status,
      plan,
      actual,
      deviation: deviation(actual, plan),
      source_url: planNode ? buildSourceUrl(planNode.source) : null,
      status_drift: { drift: false, reason: "" },
      gantt: { start, end, status4: status4(status), blocked: status === "阻塞", critical: false, deps: planNode?.deps ?? [] },
      children: children.map((child) => child.stat),
    };
    node.status_drift = computeStatusDrift(node);
    return { projectId, planNode, key, children, stat: node, bucket: aggregate };
  }

  function refreshNode(node: BuiltNode): void {
    for (const child of node.children) refreshNode(child);
    const aggregate = aggregateChildren(actualFor(node.projectId, node.key), node.children);
    const actual = actualOut(aggregate);
    const start = node.planNode?.planned_start ?? aggregate.start;
    const end = node.planNode?.planned_end ?? aggregate.end;
    node.bucket = aggregate;
    node.stat.children = node.children.map((child) => child.stat);
    node.stat.actual = actual;
    node.stat.deviation = deviation(actual, node.stat.plan);
    node.stat.gantt.start = start;
    node.stat.gantt.end = end;
    node.stat.status_drift = computeStatusDrift(node.stat);
  }

  for (const { project_id, plan } of latestPlans.values()) {
    const byParent = new Map<string, PlanNode[]>();
    for (const node of plan.nodes) {
      const parent = node.parent ?? "";
      (byParent.get(parent) ?? byParent.set(parent, []).get(parent)!).push(node);
    }
    const eNodes = plan.nodes.filter((node) => node.level === "E");
    const epics = eNodes.map((ePlan) => {
      const sprintNodes = (byParent.get(ePlan.id) ?? []).filter((node) => node.level === "S");
      const sStats = sprintNodes.map((sPlan) => {
        const taskStats = (byParent.get(sPlan.id) ?? [])
          .filter((node) => node.level === "T")
          .map((tPlan) => makeNode(project_id, tPlan, "T", tPlan.id, [], `${sPlan.parent}/${sPlan.id}/${tPlan.id}`));
        const critical = criticalPath(taskStats.map((task) => task.stat));
        for (const task of taskStats) task.stat.gantt.critical = critical.has(task.stat.id);
        return makeNode(project_id, sPlan, "S", sPlan.id, taskStats, `${sPlan.parent}/${sPlan.id}/-`);
      });
      const critical = criticalPath(sStats.map((sprint) => sprint.stat));
      for (const sprint of sStats) sprint.stat.gantt.critical = critical.has(sprint.stat.id);
      return makeNode(project_id, ePlan, "E", ePlan.id, sStats, `${ePlan.id}/-/-`);
    });
    const project = projects.get(project_id) ?? builtProjectNode(project_id);
    project.epics.push(...epics);
    project.stat.epics = project.epics.map((epic) => epic.stat);
    project.stat.children = project.stat.epics;
    projects.set(project_id, project);
  }

  for (const [compound, bucket] of actualByProjectTask.entries()) {
    const [projectId, key] = compound.split("\u0000");
    const [epicId, sprintId, taskId] = key.split("/");
    const project = projects.get(projectId) ?? builtProjectNode(projectId);
    let epic = project.epics.find((item) => item.stat.id === epicId);
    if (!epic) {
      const task = makeNode(projectId, null, "T", taskId, [], `${epicId}/${sprintId}/${taskId}`);
      const sprint = makeNode(projectId, null, "S", sprintId, [task], `${epicId}/${sprintId}/-`);
      epic = makeNode(projectId, null, "E", epicId, [sprint], `${epicId}/-/-`);
      project.epics.push(epic);
      projects.set(projectId, project);
    } else if (sprintId !== "-") {
      let sprint = epic.children.find((item) => item.stat.id === sprintId);
      if (!sprint) {
        const children = taskId !== "-" ? [makeNode(projectId, null, "T", taskId, [], `${epicId}/${sprintId}/${taskId}`)] : [];
        sprint = makeNode(projectId, null, "S", sprintId, children, `${epicId}/${sprintId}/-`);
        epic.children.push(sprint);
      } else if (taskId !== "-" && !sprint.children.some((item) => item.stat.id === taskId)) {
        sprint.children.push(makeNode(projectId, null, "T", taskId, [], `${epicId}/${sprintId}/${taskId}`));
      }
    }
    project.stat.epics = project.epics.map((item) => item.stat);
    project.stat.children = project.stat.epics;
    projects.set(projectId, project);
  }

  for (const projectId of projectIds) {
    const project = projects.get(projectId) ?? builtProjectNode(projectId);
    for (const epic of project.epics) refreshNode(epic);
    const aggregate = aggregateChildren(emptyActual(), project.epics);
    project.stat.epics = project.epics.map((epic) => epic.stat);
    project.stat.children = project.stat.epics;
    project.stat.actual = actualOut(aggregate);
    project.stat.deviation = deviation(project.stat.actual, project.stat.plan);
    project.stat.gantt.start = aggregate.start;
    project.stat.gantt.end = aggregate.end;
    project.stat.status_drift = computeStatusDrift(project.stat);
    projects.set(projectId, project);
  }

  return {
    generated_at: new Date().toISOString(),
    viewer: {
      actor_id: viewerId,
      display_name: resolveName(viewerId),
      role_view: prefs.role_view,
      watched_projects: prefs.watched_projects,
    },
    projects: [...projects.values()].map((project) => project.stat).sort((a, b) => a.id.localeCompare(b.id)),
    dims: { agent: kvList(dims.agent), skill: kvList(dims.skill), tool: kvList(dims.tool) },
    developers: [...developerBuckets.entries()]
      .map(([actor_id, bucket]) => ({
        actor_id,
        display_name: resolveName(actor_id),
        tokens: bucket.tokens,
        active_hours: round2(bucket.active),
        tasks_done: bucket.tasks.size,
      }))
      .sort((a, b) => b.tokens - a.tokens || a.actor_id.localeCompare(b.actor_id)),
  };
}

function builtProjectNode(id: string): { stat: ProjectStat; epics: BuiltNode[] } {
  return { stat: projectNode(id), epics: [] };
}

function projectNode(id: string): ProjectStat {
  return {
    level: "P",
    id,
    name: id,
    status: "",
    plan: { estimate_tokens: [0, 0], estimate_hours: null },
    actual: { tokens: 0, active_hours: 0, sessions: 0, turns: 0 },
    deviation: { tokens: null, hours: null },
    source_url: null,
    status_drift: { drift: false, reason: "" },
    gantt: { start: null, end: null, status4: "未开始", blocked: false, critical: false, deps: [] },
    children: [],
    epics: [],
  };
}
