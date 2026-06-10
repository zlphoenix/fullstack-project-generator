import { expect, test, describe } from "bun:test";
import { computeMetrics } from "../src/metrics.ts";
import { validateEvent } from "../src/schema.ts";
import { EventStore } from "../src/store.ts";
import type { TelemetryEvent } from "../src/schema.ts";

function ev(partial: Partial<TelemetryEvent>): TelemetryEvent {
  return {
    schema_version: 1,
    event_id: crypto.randomUUID(),
    ts: "2026-05-30T00:00:00Z",
    actor_role: "dev",
    actor_id: "anonymous",
    tool: "claude",
    project_id: "demo",
    milestone: "",
    skill: "",
    phase: "",
    event_type: "skill_start",
    outcome: null,
    attrs: {},
    ...partial,
  };
}

describe("validateEvent", () => {
  test("接收合法事件并补齐缺省", () => {
    const v = validateEvent({ event_type: "story_complete", project_id: "p1" });
    expect(v.ok).toBe(true);
    expect(v.event?.actor_role).toBe("unknown");
    expect(v.event?.tool).toBe("unknown");
    expect(v.event?.event_id).toBeTruthy();
  });
  test("拒绝缺 project_id", () => {
    expect(validateEvent({ event_type: "story_complete" }).ok).toBe(false);
  });
  test("拒绝未知 event_type", () => {
    expect(validateEvent({ event_type: "nope", project_id: "p" }).ok).toBe(false);
  });
  test("非对象输入被拒绝", () => {
    expect(validateEvent("x").ok).toBe(false);
  });
  test("接受工具 hook 事件类型", () => {
    expect(validateEvent({ event_type: "turn_complete", project_id: "p" }).ok).toBe(true);
    expect(validateEvent({ event_type: "session_start", project_id: "p" }).ok).toBe(true);
  });
});

describe("computeMetrics", () => {
  test("返工率 = reopen / complete", () => {
    const events = [
      ev({ event_type: "story_complete", attrs: { story: "US-1" } }),
      ev({ event_type: "story_complete", attrs: { story: "US-2" } }),
      ev({ event_type: "story_reopen", attrs: { story: "US-1" } }),
    ];
    const m = computeMetrics(events);
    expect(m.story_completed).toBe(2);
    expect(m.rework_count).toBe(1);
    expect(m.rework_rate).toBe(0.5);
  });

  test("阶段周期时间按 phase 配对", () => {
    const events = [
      ev({ event_type: "phase_enter", phase: "architecture", ts: "2026-05-30T00:00:00Z" }),
      ev({ event_type: "phase_complete", phase: "architecture", ts: "2026-05-30T02:00:00Z" }),
    ];
    const m = computeMetrics(events);
    expect(m.phase_cycle_time.architecture.count).toBe(1);
    expect(m.phase_cycle_time.architecture.avg_hours).toBe(2);
  });

  test("Story 交付时长 start→complete", () => {
    const events = [
      ev({ event_type: "story_start", attrs: { story: "US-9" }, ts: "2026-05-30T00:00:00Z" }),
      ev({ event_type: "story_complete", attrs: { story: "US-9" }, ts: "2026-05-30T03:00:00Z" }),
    ];
    const m = computeMetrics(events);
    expect(m.story_lead_time.count).toBe(1);
    expect(m.story_lead_time.avg_hours).toBe(3);
  });

  test("AC 通过率仅统计 kind=ac", () => {
    const events = [
      ev({ event_type: "verification", outcome: "ok", attrs: { kind: "ac" } }),
      ev({ event_type: "verification", outcome: "fail", attrs: { kind: "ac" } }),
      ev({ event_type: "verification", outcome: "ok", attrs: { kind: "compile" } }),
    ];
    const m = computeMetrics(events);
    expect(m.ac_total).toBe(2);
    expect(m.ac_pass_rate).toBe(0.5);
  });

  test("空输入安全", () => {
    const m = computeMetrics([]);
    expect(m.total_events).toBe(0);
    expect(m.rework_rate).toBe(0);
    expect(m.ac_pass_rate).toBeNull();
  });

  test("按里程碑分布", () => {
    const events = [
      ev({ event_type: "skill_start", milestone: "M1" }),
      ev({ event_type: "skill_start", milestone: "M1" }),
      ev({ event_type: "skill_start", milestone: "M2" }),
      ev({ event_type: "skill_start", milestone: "" }),
    ];
    const m = computeMetrics(events);
    expect(m.by_milestone["M1"]).toBe(2);
    expect(m.by_milestone["M2"]).toBe(1);
    expect(m.by_milestone["(none)"]).toBe(1);
  });
  test("token 用量按 phase/skill/task 聚合（取 turn_total_tokens 增量）", () => {
    const usage = (turn: number, total: number) => ({
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: total, turn_total_tokens: turn },
    });
    const events = [
      ev({
        event_type: "turn_complete", phase: "sprint_develop", skill: "sprint-develop",
        attrs: { ...usage(400, 400), epic: "E001", sprint: "S001", task: "T001", session_id: "s1" },
        ts: "2026-06-10T00:00:00Z",
      }),
      ev({
        event_type: "turn_complete", phase: "sprint_develop", skill: "sprint-develop",
        attrs: { ...usage(600, 1000), epic: "E001", sprint: "S001", task: "T001", session_id: "s1" },
        ts: "2026-06-10T00:10:00Z",
      }),
      ev({
        event_type: "turn_complete", phase: "qa", skill: "project-qa",
        attrs: { ...usage(300, 300), session_id: "s2" },
        ts: "2026-06-10T01:00:00Z",
      }),
      // 无 usage 的 turn 不计 token，但计入回合数
      ev({ event_type: "turn_complete", phase: "qa", attrs: { session_id: "s2" }, ts: "2026-06-10T01:05:00Z" }),
    ];
    const m = computeMetrics(events);
    expect(m.turns).toBe(4);
    expect(m.tokens_total).toBe(1300);
    expect(m.tokens_by_phase["sprint_develop"].total_tokens).toBe(1000);
    expect(m.tokens_by_phase["sprint_develop"].turns).toBe(2);
    expect(m.tokens_by_skill["project-qa"].total_tokens).toBe(300);
    expect(m.tokens_by_task["E001/S001/T001"].total_tokens).toBe(1000);
    expect(m.tokens_by_task["E001/S001/T001"].turns).toBe(2);
  });

  test("活跃耗时：同 session 相邻 turn 间隔，超 30 分钟剔除", () => {
    const t = (phase: string, sid: string, ts: string) =>
      ev({ event_type: "turn_complete", phase, attrs: { session_id: sid }, ts });
    const events = [
      ev({ event_type: "session_start", attrs: { session_id: "s1" }, ts: "2026-06-10T00:00:00Z" }),
      t("sprint_develop", "s1", "2026-06-10T00:06:00Z"), // 6min（从 session_start 起算）
      t("sprint_develop", "s1", "2026-06-10T00:18:00Z"), // 12min
      t("sprint_develop", "s1", "2026-06-10T02:00:00Z"), // 间隔 >30min → 剔除
      t("qa", "s1", "2026-06-10T02:30:00Z"), // 30min → 计入 qa
    ];
    const m = computeMetrics(events);
    expect(m.sessions).toBe(1);
    expect(m.active_hours_by_phase["sprint_develop"]).toBe(0.3); // 0.1 + 0.2
    expect(m.active_hours_by_phase["qa"]).toBe(0.5);
    expect(m.active_hours_total).toBe(0.8);
  });

  test("skill 命中分布", () => {
    const events = [
      ev({ event_type: "skill_start", skill: "sprint-develop" }),
      ev({ event_type: "turn_complete", skill: "sprint-develop" }),
      ev({ event_type: "skill_start", skill: "project-qa" }),
    ];
    const m = computeMetrics(events);
    expect(m.by_skill["sprint-develop"]).toBe(2);
    expect(m.by_skill["project-qa"]).toBe(1);
  });
});

describe("EventStore", () => {
  test("插入幂等 + 查询过滤", () => {
    const store = new EventStore(":memory:");
    const e = ev({ event_id: "fixed-1", event_type: "story_complete", project_id: "p1" });
    expect(store.insert(e)).toBe(true);
    expect(store.insert(e)).toBe(false); // 幂等：重复 event_id 忽略
    store.insert(ev({ event_type: "skill_start", project_id: "p2" }));
    expect(store.count()).toBe(2);
    expect(store.all({ project_id: "p1" }).length).toBe(1);
    store.close();
  });
});
