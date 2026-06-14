import { expect, test, describe } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSourceUrl,
  buildStats,
  computeMetrics,
  computeStatusDrift,
  criticalPath,
  githubSlug,
} from "../src/metrics.ts";
import { createTelemetryHandler } from "../src/server.ts";
import { validateEvent } from "../src/schema.ts";
import { EventStore } from "../src/store.ts";
import type { TelemetryEvent } from "../src/schema.ts";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const TELEMETRY_DIR = dirname(TEST_DIR);
const REPO_DIR = dirname(TELEMETRY_DIR);

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

  test("接受合法 plan_sync 并补齐 node 缺省字段", () => {
    const v = validateEvent({
      schema_version: 2,
      event_type: "plan_sync",
      project_id: "p",
      attrs: {
        plan: {
          root: "E002",
          generated_at: "2026-06-14T00:00:00.000Z",
          nodes: [{ level: "T", id: "T001", parent: "S001", name: "schema store" }],
        },
      },
    });

    expect(v.ok).toBe(true);
    const plan = v.event?.attrs.plan as { nodes: Record<string, unknown>[] };
    expect(v.event?.schema_version).toBe(2);
    expect(plan.nodes[0].deps).toEqual([]);
    expect(plan.nodes[0].estimate_tokens).toEqual([0, 0]);
    expect(plan.nodes[0].estimate_hours).toBeNull();
    expect(plan.nodes[0].status).toBe("未开始");
    expect(plan.nodes[0].category).toBe("");
    expect(plan.nodes[0].source).toEqual({
      repo_url: "",
      commit: "",
      path: "",
      heading: "",
      line: 0,
      abs_path: "",
    });
  });

  test("拒绝缺 root 或 nodes 的 plan_sync", () => {
    expect(
      validateEvent({ event_type: "plan_sync", project_id: "p", attrs: { plan: { nodes: [] } } }).ok,
    ).toBe(false);
    expect(
      validateEvent({ event_type: "plan_sync", project_id: "p", attrs: { plan: { root: "E002" } } }).ok,
    ).toBe(false);
  });

  test("plan_sync 丢弃坏 node 并保留好 node", () => {
    const v = validateEvent({
      event_type: "plan_sync",
      project_id: "p",
      attrs: {
        plan: {
          root: "E002",
          generated_at: "2026-06-14T00:00:00.000Z",
          nodes: [
            { level: "T" },
            { id: "T000" },
            { level: "T", id: "T001", parent: "S001", deps: "T000" },
          ],
        },
      },
    });

    expect(v.ok).toBe(true);
    const plan = v.event?.attrs.plan as { nodes: Record<string, unknown>[] };
    expect(plan.nodes.map((node) => node.id)).toEqual(["T001"]);
    expect(plan.nodes[0].deps).toEqual([]);
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

  test("E/S/T 归因与 token 解耦：无 usage 的归因回合仍计入（turns 增、token 记 0）", () => {
    const events = [
      // 有标记、无 usage（如当前 Claude Code 会话）
      ev({ event_type: "turn_complete", attrs: { epic: "E007", sprint: "S001", task: "T001", session_id: "c1" } }),
      ev({ event_type: "turn_complete", attrs: { epic: "E007", sprint: "S001", task: "T001", session_id: "c1" } }),
    ];
    const m = computeMetrics(events);
    expect(m.tokens_by_task["E007/S001/T001"].turns).toBe(2);
    expect(m.tokens_by_task["E007/S001/T001"].total_tokens).toBe(0);
    expect(m.tokens_total).toBe(0);
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

describe("stats helpers", () => {
  test("githubSlug 保留 CJK，删除括号标点并压空格为连字符", () => {
    expect(githubSlug("Hello World")).toBe("hello-world");
    expect(githubSlug("E002 统计细化（需求实现过程精细化度量）")).toBe(
      "e002-统计细化需求实现过程精细化度量",
    );
    expect(githubSlug("  多   空格 / 标点!  ")).toBe("多-空格-标点");
  });

  test("buildSourceUrl 支持 repo permalink、vscode 兜底与 null", () => {
    expect(
      buildSourceUrl({
        repo_url: "https://github.com/acme/repo",
        commit: "abc123",
        path: "docs/plan.md",
        heading: "E002 统计细化（需求实现过程精细化度量）",
        line: 9,
        abs_path: "/repo/docs/plan.md",
      }),
    ).toBe("https://github.com/acme/repo/blob/abc123/docs/plan.md#e002-统计细化需求实现过程精细化度量");
    expect(
      buildSourceUrl({ repo_url: "", commit: "", path: "", heading: "", line: 12, abs_path: "/tmp/plan.md" }),
    ).toBe("vscode://file//tmp/plan.md:12");
    expect(buildSourceUrl({ repo_url: "", commit: "", path: "", heading: "", line: 0, abs_path: "" })).toBeNull();
  });

  test("criticalPath 线性链、分叉取高权重、无边返空", () => {
    const linear = criticalPath([
      { id: "T001", deps: [], plan: { estimate_tokens: [100, 100] } },
      { id: "T002", deps: ["T001"], plan: { estimate_tokens: [100, 100] } },
      { id: "T003", deps: ["T002"], plan: { estimate_tokens: [100, 100] } },
    ]);
    expect([...linear]).toEqual(["T001", "T002", "T003"]);

    const fork = criticalPath([
      { id: "T001", deps: [], plan: { estimate_tokens: [100, 100] } },
      { id: "T002", deps: ["T001"], plan: { estimate_tokens: [300, 300] } },
      { id: "T003", deps: ["T001"], plan: { estimate_tokens: [100, 100] } },
    ]);
    expect([...fork]).toEqual(["T001", "T002"]);
    expect([...criticalPath([{ id: "T001", deps: [], plan: { estimate_tokens: [0, 0] } }])]).toEqual([]);
  });

  test("computeStatusDrift 覆盖 R1/R2/R3 和无漂移", () => {
    expect(
      computeStatusDrift({ status: "未开始", actual: { turns: 1 }, children: [] }),
    ).toEqual({ drift: true, reason: "有实测活动但状态仍未开始" });
    expect(
      computeStatusDrift({
        status: "执行中",
        actual: { turns: 0 },
        children: [
          { status: "已完成", actual: { turns: 0 }, children: [] },
          { status: "已完成", actual: { turns: 0 }, children: [] },
        ],
      }),
    ).toEqual({ drift: true, reason: "子项均已完成但本级未收口" });
    expect(
      computeStatusDrift({
        status: "已完成",
        actual: { turns: 0 },
        children: [{ status: "执行中", actual: { turns: 0 }, children: [] }],
      }),
    ).toEqual({ drift: true, reason: "本级已收口但有子项未完成" });
    expect(
      computeStatusDrift({ status: "执行中", actual: { turns: 1 }, children: [] }),
    ).toEqual({ drift: false, reason: "" });
  });
});

describe("buildStats", () => {
  test("输出 /stats 契约：树、偏差、dims、开发者、甘特、漂移与无计划降级", () => {
    const plan = {
      root: "E001",
      generated_at: "2026-06-14T00:00:00.000Z",
      nodes: [
        {
          level: "E",
          id: "E001",
          parent: null,
          name: "Epic One",
          category: "Must Deliver",
          status: "执行中",
          deps: [],
          estimate_tokens: [1000, 3000],
          estimate_hours: null,
          source: { repo_url: "https://github.com/acme/repo", commit: "abc", path: "epic.md", heading: "Epic One", line: 1, abs_path: "" },
          planned_start: null,
          planned_end: null,
        },
        {
          level: "S",
          id: "S001",
          parent: "E001",
          name: "Sprint One",
          category: "Must Deliver",
          status: "未开始",
          deps: [],
          estimate_tokens: [1000, 3000],
          estimate_hours: 1,
          source: { repo_url: "", commit: "", path: "", heading: "", line: 8, abs_path: "/tmp/sprint.md" },
          planned_start: "2026-06-10",
          planned_end: "2026-06-11",
        },
        {
          level: "T",
          id: "T001",
          parent: "S001",
          name: "Task One",
          category: "Must Deliver",
          status: "未开始",
          deps: [],
          estimate_tokens: [1000, 3000],
          estimate_hours: 0.5,
          source: { repo_url: "", commit: "", path: "", heading: "", line: 9, abs_path: "/tmp/task.md" },
          planned_start: null,
          planned_end: null,
        },
        {
          level: "T",
          id: "T002",
          parent: "S001",
          name: "Task Two",
          category: "Must Verify",
          status: "已完成",
          deps: ["T001"],
          estimate_tokens: [0, 0],
          estimate_hours: null,
          source: { repo_url: "", commit: "", path: "", heading: "", line: 0, abs_path: "" },
          planned_start: null,
          planned_end: null,
        },
      ],
    };
    const events = [
      ev({
        schema_version: 2,
        event_id: "plan-buildstats",
        event_type: "plan_sync",
        project_id: "p1",
        ts: "2026-06-14T00:00:00.000Z",
        attrs: { plan },
      }),
      ev({ event_type: "session_start", project_id: "p1", actor_id: "dev-a", ts: "2026-06-14T01:00:00.000Z", attrs: { session_id: "s1" } }),
      ev({
        event_type: "turn_complete",
        project_id: "p1",
        actor_id: "dev-a",
        tool: "codex",
        skill: "superpowers:tdd",
        ts: "2026-06-14T01:10:00.000Z",
        attrs: {
          session_id: "s1",
          epic: "E001",
          sprint: "S001",
          task: "T001",
          usage: { turn_total_tokens: 2500 },
          mcp_tools: ["shell"],
        },
      }),
      ev({
        event_type: "turn_complete",
        project_id: "p1",
        actor_id: "dev-a",
        tool: "codex",
        skill: "",
        ts: "2026-06-14T01:20:00.000Z",
        attrs: {
          session_id: "s1",
          epic: "E009",
          sprint: "S001",
          task: "T001",
          usage: { turn_total_tokens: 100 },
        },
      }),
    ];

    const stats = buildStats(events, {
      actors: { resolveName: (id: string) => (id === "dev-a" ? "Dev A" : id) },
      prefs: { actor_id: "dev-a", watched_projects: ["p1"], role_view: "dev" },
      viewer: "dev-a",
    });

    expect(stats.viewer).toEqual({ actor_id: "dev-a", display_name: "Dev A", role_view: "dev", watched_projects: ["p1"] });
    expect(stats.dims.agent.find((kv) => kv.k === "codex")?.tokens).toBe(2600);
    expect(stats.dims.skill.find((kv) => kv.k === "superpowers:tdd")?.tokens).toBe(2500);
    expect(stats.dims.tool.find((kv) => kv.k === "shell")?.tokens).toBe(2500);
    expect(stats.dims.tool.find((kv) => kv.k === "无")?.tokens).toBe(100);
    expect(stats.developers).toEqual([{ actor_id: "dev-a", display_name: "Dev A", tokens: 2600, active_hours: 0.33, tasks_done: 2 }]);

    const p1 = stats.projects.find((project) => project.id === "p1");
    expect(p1?.level).toBe("P");
    const epic = p1?.epics[0];
    const sprint = epic?.children[0];
    const task = sprint?.children.find((node) => node.id === "T001");
    const zeroEstimate = sprint?.children.find((node) => node.id === "T002");
    expect(task?.actual).toEqual({ tokens: 2500, active_hours: 0.17, sessions: 1, turns: 1 });
    expect(task?.deviation).toEqual({ tokens: 500, hours: -0.3 });
    expect(task?.status_drift).toEqual({ drift: true, reason: "有实测活动但状态仍未开始" });
    expect(task?.source_url).toBe("vscode://file//tmp/task.md:9");
    expect(zeroEstimate?.deviation.tokens).toBeNull();
    expect(sprint?.gantt).toMatchObject({ start: "2026-06-10", end: "2026-06-11", status4: "未开始", critical: false });
    expect(zeroEstimate?.gantt.critical).toBe(true);

    const unplannedEpic = p1?.epics.find((node) => node.id === "E009");
    expect(unplannedEpic?.status).toBe("");
    expect(unplannedEpic?.plan).toEqual({ estimate_tokens: [0, 0], estimate_hours: null });
    expect(unplannedEpic?.actual.tokens).toBe(100);
    expect(unplannedEpic?.deviation).toEqual({ tokens: null, hours: null });
    expect(unplannedEpic?.source_url).toBeNull();
  });

  test("父级 sessions 使用真实 session 去重，同一 session 多任务不重复计数", () => {
    const plan = {
      root: "E010",
      generated_at: "2026-06-14T00:00:00.000Z",
      nodes: [
        node("E", "E010", null, "Epic", "执行中", []),
        node("S", "S001", "E010", "Sprint", "执行中", []),
        node("T", "T001", "S001", "Task 1", "执行中", []),
        node("T", "T002", "S001", "Task 2", "执行中", []),
      ],
    };
    const stats = buildStats([
      ev({ schema_version: 2, event_type: "plan_sync", project_id: "p10", attrs: { plan } }),
      ev({ event_type: "session_start", project_id: "p10", ts: "2026-06-14T01:00:00.000Z", attrs: { session_id: "same" } }),
      ev({ event_type: "turn_complete", project_id: "p10", ts: "2026-06-14T01:05:00.000Z", attrs: { session_id: "same", epic: "E010", sprint: "S001", task: "T001", usage: { turn_total_tokens: 10 } } }),
      ev({ event_type: "turn_complete", project_id: "p10", ts: "2026-06-14T01:10:00.000Z", attrs: { session_id: "same", epic: "E010", sprint: "S001", task: "T002", usage: { turn_total_tokens: 20 } } }),
    ]);

    const sprint = stats.projects[0].epics[0].children[0];
    expect(sprint.actual.sessions).toBe(1);
    expect(stats.projects[0].epics[0].actual.sessions).toBe(1);
    expect(stats.projects[0].actual.sessions).toBe(1);
  });

  test("计划已有 Epic 时追加未知 sprint/task 归因，不丢 actual", () => {
    const plan = {
      root: "E020",
      generated_at: "2026-06-14T00:00:00.000Z",
      nodes: [node("E", "E020", null, "Epic", "执行中", [])],
    };
    const stats = buildStats([
      ev({ schema_version: 2, event_type: "plan_sync", project_id: "p20", attrs: { plan } }),
      ev({ event_type: "turn_complete", project_id: "p20", attrs: { session_id: "u1", epic: "E020", sprint: "S999", task: "T999", usage: { turn_total_tokens: 321 } } }),
    ]);

    const epic = stats.projects[0].epics[0];
    const sprint = epic.children.find((item) => item.id === "S999");
    expect(sprint?.children[0].id).toBe("T999");
    expect(sprint?.children[0].actual.tokens).toBe(321);
    expect(epic.actual.tokens).toBe(321);
  });
});

function node(level: "E" | "S" | "T", id: string, parent: string | null, name: string, status: string, deps: string[]) {
  return {
    level,
    id,
    parent,
    name,
    category: "Must Deliver",
    status,
    deps,
    estimate_tokens: [0, 0],
    estimate_hours: null,
    source: { repo_url: "", commit: "", path: "", heading: "", line: 0, abs_path: "" },
    planned_start: null,
    planned_end: null,
  };
}

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

  test("latestPlanSnapshots 对同 project/root 取最新", () => {
    const store = new EventStore(":memory:");
    const older = ev({
      schema_version: 2,
      event_id: "plan-old",
      event_type: "plan_sync",
      project_id: "p1",
      ts: "2026-06-14T00:00:00.000Z",
      attrs: {
        plan: {
          root: "E002",
          generated_at: "2026-06-14T00:00:00.000Z",
          nodes: [{ level: "T", id: "T001", parent: "S001", name: "old" }],
        },
      },
    });
    const newer = ev({
      schema_version: 2,
      event_id: "plan-new",
      event_type: "plan_sync",
      project_id: "p1",
      ts: "2026-06-14T01:00:00.000Z",
      attrs: {
        plan: {
          root: "E002",
          generated_at: "2026-06-14T01:00:00.000Z",
          nodes: [{ level: "T", id: "T001", parent: "S001", name: "new" }],
        },
      },
    });
    const otherProject = ev({
      schema_version: 2,
      event_id: "plan-other",
      event_type: "plan_sync",
      project_id: "p2",
      ts: "2026-06-14T02:00:00.000Z",
      attrs: { plan: { root: "E002", generated_at: "2026-06-14T02:00:00.000Z", nodes: [] } },
    });

    store.insert(older);
    store.insert(newer);
    store.insert(otherProject);

    const all = store.latestPlanSnapshots();
    expect(all.length).toBe(2);
    expect(all.find((plan) => plan.root === "E002" && plan.nodes.length > 0)?.nodes[0].name).toBe("new");
    const p1 = store.latestPlanSnapshots("p1");
    expect(p1.length).toBe(1);
    expect(p1[0].nodes[0].name).toBe("new");
    store.close();
  });

  test("actors 空表迁移回填 Allen，改名不改 events.actor_id，无行回退字面 id", () => {
    const store = new EventStore(":memory:");
    store.insert(ev({ actor_id: "allen-id", event_id: "actor-event-1" }));

    expect(store.listActors()).toEqual([
      { actor_id: "allen-id", display_name: "Allen", role: "dev" },
    ]);
    expect(store.resolveName("allen-id")).toBe("Allen");

    const renamed = store.upsertActor({ actor_id: "allen-id", display_name: "Allen Zhang", role: "dev" });
    expect(renamed.display_name).toBe("Allen Zhang");
    expect(store.resolveName("allen-id")).toBe("Allen Zhang");
    expect(store.all()[0].actor_id).toBe("allen-id");
    expect(store.resolveName("missing-id")).toBe("missing-id");
    store.close();
  });

  test("user_prefs 支持 upsert 往返并在无行时派生默认", () => {
    const store = new EventStore(":memory:");
    store.insert(ev({ actor_id: "pm-1", actor_role: "pm", project_id: "p1", event_id: "pref-1" }));
    store.insert(ev({ actor_id: "pm-1", actor_role: "pm", project_id: "p2", event_id: "pref-2" }));
    store.upsertActor({ actor_id: "pm-1", display_name: "Pat", role: "pm" });

    expect(store.getPrefs("pm-1")).toEqual({
      actor_id: "pm-1",
      watched_projects: ["p1", "p2"],
      role_view: "boss",
    });

    store.upsertPrefs("pm-1", { watched_projects: ["p2"], role_view: "qa" });
    expect(store.getPrefs("pm-1")).toEqual({
      actor_id: "pm-1",
      watched_projects: ["p2"],
      role_view: "qa",
    });
    store.close();
  });
});

describe("plan-sync.sh", () => {
  test("--dry-run 对 fixture 输出符合 PlanSnapshot 契约", async () => {
    const epicDir = join(TELEMETRY_DIR, "test/fixtures/E999-sample");
    const proc = Bun.spawn({
      cmd: ["bash", join(TELEMETRY_DIR, "plan-sync.sh"), "--epic-dir", epicDir, "--project", "fixture", "--dry-run"],
      cwd: REPO_DIR,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const snapshot = JSON.parse(stdout) as { root: string; nodes: Record<string, unknown>[] };
    expect(snapshot.root).toBe("E999");
    expect(snapshot.nodes.length).toBe(6);

    const epic = snapshot.nodes.find((node) => node.level === "E");
    expect(epic?.id).toBe("E999");
    expect(epic?.parent).toBeNull();
    expect(epic?.estimate_tokens).toEqual([10000, 20000]);

    const s1 = snapshot.nodes.find((node) => node.id === "S001" && node.level === "S");
    expect(s1?.parent).toBe("E999");
    expect(s1?.status).toBe("执行中");
    expect(s1?.estimate_tokens).toEqual([2000, 4000]);
    expect(s1?.estimate_hours).toBe(3);
    expect(s1?.source).toMatchObject({
      path: "telemetry/test/fixtures/E999-sample/sprints/S001-build/plan.md",
      heading: "S001 Build Core",
      line: 1,
    });

    const s2 = snapshot.nodes.find((node) => node.id === "S002" && node.level === "S");
    expect(s2?.deps).toEqual(["S001"]);
    expect(s2?.estimate_tokens).toEqual([500, 1000]);
    expect(s2?.estimate_hours).toBe(1.5);

    const t2 = snapshot.nodes.find((node) => node.id === "T002" && node.parent === "S001");
    expect(t2?.deps).toEqual(["T001"]);
    expect(t2?.estimate_tokens).toEqual([1000, 2000]);
    expect(t2?.source).toMatchObject({
      path: "telemetry/test/fixtures/E999-sample/sprints/S001-build/plan.md",
      heading: "Task 清单与指标",
    });

    const smoke = snapshot.nodes.find((node) => node.id === "T001" && node.parent === "S002");
    expect(smoke?.status).toBe("未开始");
    expect(smoke?.estimate_tokens).toEqual([2000, 2000]);
    expect(smoke?.estimate_hours).toBeNull();
  });
});

describe("server actors API", () => {
  test("GET/PUT /api/actors 往返，空 display_name 返回 400，事件 actor_id 不变", async () => {
    const store = new EventStore(":memory:");
    store.insert(ev({ actor_id: "dev-1", event_id: "server-actor-1" }));
    const fetch = createTelemetryHandler(store, "");

    const before = await fetch(new Request("http://local/api/actors"));
    expect(before.status).toBe(200);
    expect(await before.json()).toEqual([{ actor_id: "dev-1", display_name: "Allen", role: "dev" }]);

    const renamed = await fetch(
      new Request("http://local/api/actors/dev-1", {
        method: "PUT",
        body: JSON.stringify({ display_name: "Dev One", role: "qa" }),
      }),
    );
    expect(renamed.status).toBe(200);
    expect(await renamed.json()).toEqual({ actor_id: "dev-1", display_name: "Dev One", role: "qa" });
    expect(store.all()[0].actor_id).toBe("dev-1");

    const bad = await fetch(
      new Request("http://local/api/actors/dev-1", {
        method: "PUT",
        body: JSON.stringify({ display_name: "" }),
      }),
    );
    expect(bad.status).toBe(400);
    store.close();
  });

  test("PUT /api/actors 使用 Bearer 鉴权", async () => {
    const store = new EventStore(":memory:");
    const fetch = createTelemetryHandler(store, "secret");

    const denied = await fetch(
      new Request("http://local/api/actors/dev-2", {
        method: "PUT",
        body: JSON.stringify({ display_name: "Denied" }),
      }),
    );
    expect(denied.status).toBe(401);

    const ok = await fetch(
      new Request("http://local/api/actors/dev-2", {
        method: "PUT",
        headers: { Authorization: "Bearer secret" },
        body: JSON.stringify({ display_name: "Allowed" }),
      }),
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ actor_id: "dev-2", display_name: "Allowed", role: "dev" });
    store.close();
  });
});

describe("server stats API", () => {
  test("GET /stats 返回 buildStats 契约形状并带 viewer", async () => {
    const store = new EventStore(":memory:");
    store.insert(ev({ actor_id: "viewer-1", project_id: "p-route", event_id: "stats-route-1" }));
    store.upsertActor({ actor_id: "viewer-1", display_name: "Viewer One", role: "dev" });
    const fetch = createTelemetryHandler(store, "");

    const res = await fetch(new Request("http://local/stats?project=p-route&actor=viewer-1"));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.viewer).toEqual({
      actor_id: "viewer-1",
      display_name: "Viewer One",
      role_view: "dev",
      watched_projects: ["p-route"],
    });
    expect(body).toHaveProperty("projects");
    expect(body).toHaveProperty("dims");
    expect(body).toHaveProperty("developers");
    expect(body).not.toHaveProperty("total_events");
    store.close();
  });
});
