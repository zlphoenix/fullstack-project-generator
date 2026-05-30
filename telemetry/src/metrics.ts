// 从事件流派生运营指标。纯函数，便于测试。
import type { TelemetryEvent } from "./schema.ts";

export interface DurationStat {
  count: number;
  avg_hours: number;
  p50_hours: number;
  p90_hours: number;
}

export interface Metrics {
  total_events: number;
  by_event_type: Record<string, number>;
  by_actor_role: Record<string, number>;
  by_project: Record<string, number>;
  by_milestone: Record<string, number>;
  projects: string[];
  phase_cycle_time: Record<string, DurationStat>; // key: phase
  story_lead_time: DurationStat;
  rework_rate: number; // story_reopen / story_complete
  rework_count: number;
  story_completed: number;
  contract_changes: number;
  ac_pass_rate: number | null; // verification[kind=ac] ok 比例
  ac_total: number;
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

export function computeMetrics(events: TelemetryEvent[]): Metrics {
  const byType: Record<string, number> = {};
  const byRole: Record<string, number> = {};
  const byProject: Record<string, number> = {};
  const byMilestone: Record<string, number> = {};

  let reworkCount = 0;
  let storyCompleted = 0;
  let contractChanges = 0;
  let acTotal = 0;
  let acOk = 0;

  for (const e of events) {
    inc(byType, e.event_type);
    inc(byRole, e.actor_role);
    inc(byProject, e.project_id);
    inc(byMilestone, e.milestone || "(none)");
    if (e.event_type === "story_reopen") reworkCount++;
    if (e.event_type === "story_complete") storyCompleted++;
    if (e.event_type === "contract_change") contractChanges++;
    if (e.event_type === "verification" && e.attrs?.kind === "ac") {
      acTotal++;
      if (e.outcome === "ok") acOk++;
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

  return {
    total_events: events.length,
    by_event_type: byType,
    by_actor_role: byRole,
    by_project: byProject,
    by_milestone: byMilestone,
    projects: Object.keys(byProject).sort(),
    phase_cycle_time: phaseCycle,
    story_lead_time: durationStat(allStoryDurations),
    rework_rate: storyCompleted > 0 ? Math.round((reworkCount / storyCompleted) * 1000) / 1000 : 0,
    rework_count: reworkCount,
    story_completed: storyCompleted,
    contract_changes: contractChanges,
    ac_pass_rate: acTotal > 0 ? Math.round((acOk / acTotal) * 1000) / 1000 : null,
    ac_total: acTotal,
  };
}
