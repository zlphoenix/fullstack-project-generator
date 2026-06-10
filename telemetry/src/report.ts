// 运营报表生成器：从遥测库聚合指标，输出 Markdown / JSON / HTML。
//
// 用法：
//   bun run src/report.ts [--db <path>] [--project <id>] [--since <ISO>] [--format md|json|html] [--out <file>]
//   默认：--db ./data/events.db --format md（输出到 stdout）
import { EventStore } from "./store.ts";
import { computeMetrics, type Metrics } from "./metrics.ts";
import { renderDashboard } from "./dashboard.ts";

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      out[key] = val;
    }
  }
  return out;
}

function pct(n: number | null): string {
  return n === null ? "N/A" : `${(n * 100).toFixed(1)}%`;
}

function table(headers: string[], rows: string[][]): string {
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
  return [head, sep, body].join("\n");
}

function toMarkdown(m: Metrics, scope: string): string {
  const lines: string[] = [];
  lines.push(`# fullstack-project-generator 运营报表`);
  lines.push("");
  lines.push(`> 生成时间：${new Date().toISOString()}　范围：${scope}`);
  lines.push("");
  lines.push(`## 概览`);
  lines.push("");
  lines.push(
    table(
      ["指标", "值"],
      [
        ["事件总数", String(m.total_events)],
        ["项目数", String(m.projects.length)],
        ["完成 Story 数", String(m.story_completed)],
        ["**返工率**", `${pct(m.rework_rate)}（reopen ${m.rework_count} / complete ${m.story_completed}）`],
        ["契约变更次数", String(m.contract_changes)],
        ["AC 通过率", `${pct(m.ac_pass_rate)}（样本 ${m.ac_total}）`],
        [
          "Story 平均交付时长",
          `${m.story_lead_time.avg_hours}h（p50 ${m.story_lead_time.p50_hours}h / p90 ${m.story_lead_time.p90_hours}h，n=${m.story_lead_time.count}）`,
        ],
      ],
    ),
  );
  lines.push("");
  lines.push(`## token 用量与活跃耗时（instrumentation）`);
  lines.push("");
  lines.push(
    table(
      ["指标", "值"],
      [
        ["token 总量", String(m.tokens_total)],
        ["活跃耗时（近似）", `${m.active_hours_total}h`],
        ["会话 / 回合", `${m.sessions} / ${m.turns}`],
      ],
    ),
  );
  lines.push("");
  const tokPhaseRows = Object.entries(m.tokens_by_phase)
    .sort((a, b) => b[1].total_tokens - a[1].total_tokens)
    .map(([k, s]) => [k, String(s.total_tokens), String(s.turns), `${m.active_hours_by_phase[k] ?? 0}h`]);
  lines.push(tokPhaseRows.length ? table(["阶段", "token", "回合", "活跃耗时"], tokPhaseRows) : "_（暂无 usage 数据）_");
  lines.push("");
  const tokTaskRows = Object.entries(m.tokens_by_task)
    .sort((a, b) => b[1].total_tokens - a[1].total_tokens)
    .map(([k, s]) => [k, String(s.total_tokens), String(s.turns)]);
  if (tokTaskRows.length) {
    lines.push(table(["E/S/T", "token", "回合"], tokTaskRows));
    lines.push("");
  }
  lines.push(`## 阶段周期时间`);
  lines.push("");
  const phaseRows = Object.entries(m.phase_cycle_time).map(([phase, s]) => [
    phase,
    String(s.count),
    `${s.avg_hours}h`,
    `${s.p50_hours}h`,
    `${s.p90_hours}h`,
  ]);
  lines.push(phaseRows.length ? table(["阶段", "样本", "平均", "p50", "p90"], phaseRows) : "_（暂无配对的阶段事件）_");
  lines.push("");
  lines.push(`## 按角色分布`);
  lines.push("");
  const roleRows = Object.entries(m.by_actor_role).map(([k, v]) => [k, String(v)]);
  lines.push(roleRows.length ? table(["角色", "事件数"], roleRows) : "_（无）_");
  lines.push("");
  lines.push(`## 按项目分布`);
  lines.push("");
  const projRows = Object.entries(m.by_project).map(([k, v]) => [k, String(v)]);
  lines.push(projRows.length ? table(["项目", "事件数"], projRows) : "_（无）_");
  lines.push("");
  lines.push(`## 按里程碑分布`);
  lines.push("");
  const msRows = Object.entries(m.by_milestone).map(([k, v]) => [k, String(v)]);
  lines.push(msRows.length ? table(["里程碑", "事件数"], msRows) : "_（无）_");
  lines.push("");
  lines.push(`## 解读提示`);
  lines.push("");
  lines.push(`- **返工率**是核心质量信号：DORA 2025 仅 7.3% 团队 < 2%。持续上升说明"提速"可能是假象（生产力悖论）。`);
  lines.push(`- 本报表用于发现瓶颈与验证规范有效性，**不作为个人绩效考核**，避免扭曲行为。`);
  return lines.join("\n");
}

// HTML 输出复用看板渲染（与 server.ts 的 GET /report 同一份）
const toHtml = renderDashboard;

const args = parseArgs(Bun.argv.slice(2));
const dbPath = args.db ?? "./data/events.db";
const format = args.format ?? "md";

const store = new EventStore(dbPath);
const filter: { project_id?: string; since?: string } = {};
if (args.project && args.project !== "true") filter.project_id = args.project;
if (args.since && args.since !== "true") filter.since = args.since;
const metrics = computeMetrics(store.all(filter));
const scope = filter.project_id ? `project=${filter.project_id}` : "全部项目";

let output: string;
if (format === "json") output = JSON.stringify(metrics, null, 2);
else if (format === "html") output = toHtml(metrics, scope);
else output = toMarkdown(metrics, scope);

if (args.out && args.out !== "true") {
  await Bun.write(args.out, output);
  console.log(`报表已写入 ${args.out}`);
} else {
  console.log(output);
}
store.close();
