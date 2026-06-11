// 从事件流派生运营指标。纯函数，便于测试。
import type { TelemetryEvent } from "./schema.ts";

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
