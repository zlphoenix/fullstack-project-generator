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
] as const;
export const OUTCOMES = ["ok", "fail", "skip"] as const;

export type ActorRole = (typeof ACTOR_ROLES)[number];
export type Tool = (typeof TOOLS)[number];
export type EventType = (typeof EVENT_TYPES)[number];
export type Outcome = (typeof OUTCOMES)[number];

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
    attrs:
      typeof r.attrs === "object" && r.attrs !== null
        ? (r.attrs as Record<string, unknown>)
        : {},
  };
  return { ok: true, errors: [], event };
}
