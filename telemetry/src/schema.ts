// 遥测事件类型与校验。详见 ../schema.md

export const ACTOR_ROLES = ["dev", "product", "qa", "ops", "pm", "unknown"] as const;
export const TOOLS = ["claude", "codex", "unknown"] as const;
export const EVENT_TYPES = [
  "skill_start",
  "skill_complete",
  "phase_enter",
  "phase_complete",
  "story_start",
  "story_complete",
  "story_reopen",
  "contract_change",
  "verification",
  // 工具侧 hook 自动发出的事件（不依赖模型自觉）：
  "session_start", // 会话开始（Claude SessionStart hook）
  "turn_complete", // 一个 agent 回合结束（Codex notify / Claude Stop hook）
  "plan_sync",
] as const;
export const OUTCOMES = ["ok", "fail", "skip"] as const;

export type ActorRole = (typeof ACTOR_ROLES)[number];
export type Tool = (typeof TOOLS)[number];
export type EventType = (typeof EVENT_TYPES)[number];
export type Outcome = (typeof OUTCOMES)[number];

export type ZhStatus = "未开始" | "执行中" | "阻塞" | "已实现" | "已验证" | "已完成" | "搁置";
export type PlanCategory = "Must Deliver" | "Must Verify" | "Supporting" | "Backlog" | "";

export interface PlanSource {
  repo_url: string;
  commit: string;
  path: string;
  heading: string;
  line: number;
  abs_path: string;
}

export interface PlanNode {
  level: "E" | "S" | "T";
  id: string;
  parent: string | null;
  name: string;
  category: PlanCategory;
  status: ZhStatus;
  deps: string[];
  estimate_tokens: [number, number];
  estimate_hours: number | null;
  source: PlanSource;
  planned_start: string | null;
  planned_end: string | null;
}

export interface PlanSnapshot {
  root: string;
  generated_at: string;
  nodes: PlanNode[];
}

export interface TelemetryEvent {
  schema_version: number;
  event_id: string;
  ts: string; // ISO8601 UTC
  actor_role: ActorRole;
  actor_id: string;
  tool: Tool;
  project_id: string;
  milestone: string;
  skill: string;
  phase: string;
  event_type: EventType;
  outcome: Outcome | null;
  attrs: Record<string, unknown>;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  event?: TelemetryEvent;
}

const ZH_STATUSES: ZhStatus[] = ["未开始", "执行中", "阻塞", "已实现", "已验证", "已完成", "搁置"];
const PLAN_CATEGORIES: PlanCategory[] = ["Must Deliver", "Must Verify", "Supporting", "Backlog", ""];

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeSource(value: unknown): PlanSource {
  const source = asRecord(value) ?? {};
  return {
    repo_url: asString(source.repo_url),
    commit: asString(source.commit),
    path: asString(source.path),
    heading: asString(source.heading),
    line: typeof source.line === "number" && Number.isFinite(source.line) ? source.line : 0,
    abs_path: asString(source.abs_path),
  };
}

function normalizePlanNode(value: unknown): PlanNode | null {
  const node = asRecord(value);
  if (!node) return null;
  const level = node.level;
  const id = asString(node.id).trim();
  if ((level !== "E" && level !== "S" && level !== "T") || !id) return null;

  const tokens = Array.isArray(node.estimate_tokens) ? node.estimate_tokens : [];
  const lo = typeof tokens[0] === "number" && Number.isFinite(tokens[0]) ? tokens[0] : 0;
  const hi = typeof tokens[1] === "number" && Number.isFinite(tokens[1]) ? tokens[1] : 0;
  const category = PLAN_CATEGORIES.includes(node.category as PlanCategory)
    ? (node.category as PlanCategory)
    : "";
  const status = ZH_STATUSES.includes(node.status as ZhStatus) ? (node.status as ZhStatus) : "未开始";
  const deps = Array.isArray(node.deps) ? node.deps.filter((dep) => typeof dep === "string") : [];

  return {
    level,
    id,
    parent: typeof node.parent === "string" ? node.parent : null,
    name: asString(node.name),
    category,
    status,
    deps,
    estimate_tokens: [lo, hi],
    estimate_hours:
      typeof node.estimate_hours === "number" && Number.isFinite(node.estimate_hours)
        ? node.estimate_hours
        : null,
    source: normalizeSource(node.source),
    planned_start: typeof node.planned_start === "string" ? node.planned_start : null,
    planned_end: typeof node.planned_end === "string" ? node.planned_end : null,
  };
}

function normalizePlanSyncAttrs(attrs: Record<string, unknown>, errors: string[]): Record<string, unknown> | null {
  const plan = asRecord(attrs.plan);
  if (!plan) {
    errors.push("plan_sync.attrs.plan 必须是对象");
    return null;
  }
  const root = asString(plan.root).trim();
  if (!root) errors.push("plan_sync.attrs.plan.root 不能为空");
  if (!Array.isArray(plan.nodes)) errors.push("plan_sync.attrs.plan.nodes 必须是数组");
  if (errors.length > 0) return null;

  return {
    ...attrs,
    plan: {
      root,
      generated_at: asString(plan.generated_at, new Date().toISOString()),
      nodes: (plan.nodes as unknown[]).map(normalizePlanNode).filter((node): node is PlanNode => node !== null),
    } satisfies PlanSnapshot,
  };
}

/**
 * 宽松校验：补齐缺省值、拒绝明显非法的事件。
 * 设计为"尽量接收"——遥测不应因个别字段缺失而丢弃整条流程数据。
 */
export function validateEvent(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, errors: ["event 必须是 JSON 对象"] };
  }
  const r = raw as Record<string, unknown>;

  const event_type = String(r.event_type ?? "");
  if (!EVENT_TYPES.includes(event_type as EventType)) {
    errors.push(`未知 event_type: "${event_type}"`);
  }
  const project_id = String(r.project_id ?? "").trim();
  if (!project_id) errors.push("project_id 不能为空");

  const rawAttrs =
    typeof r.attrs === "object" && r.attrs !== null ? (r.attrs as Record<string, unknown>) : {};
  const attrs =
    event_type === "plan_sync" ? normalizePlanSyncAttrs(rawAttrs, errors) : rawAttrs;

  if (errors.length > 0) return { ok: false, errors };

  const actor_role = ACTOR_ROLES.includes(r.actor_role as ActorRole)
    ? (r.actor_role as ActorRole)
    : "unknown";
  const tool = TOOLS.includes(r.tool as Tool) ? (r.tool as Tool) : "unknown";
  const outcome = OUTCOMES.includes(r.outcome as Outcome) ? (r.outcome as Outcome) : null;

  const ts =
    typeof r.ts === "string" && !Number.isNaN(Date.parse(r.ts))
      ? new Date(r.ts).toISOString()
      : new Date().toISOString();

  const event: TelemetryEvent = {
    schema_version: typeof r.schema_version === "number" ? r.schema_version : 1,
    event_id: String(r.event_id ?? crypto.randomUUID()),
    ts,
    actor_role,
    actor_id: String(r.actor_id ?? "anonymous"),
    tool,
    project_id,
    milestone: String(r.milestone ?? ""),
    skill: String(r.skill ?? ""),
    phase: String(r.phase ?? ""),
    event_type: event_type as EventType,
    outcome,
    attrs: attrs ?? {},
  };
  return { ok: true, errors: [], event };
}
