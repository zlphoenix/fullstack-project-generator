# E002 技术设计 — 统计细化数据模型与看板（实现契约）

> 配套 [plan.md](plan.md)。**本文是给开发者（含 Codex）的权威实现契约，要求无歧义。** 决策依据 [ADR-019](../../../00-决策记录.md)。
> 目录规则见 [telemetry/AGENTS.md](../../../../telemetry/AGENTS.md)：仅 TS(Bun)+shell、零外部依赖、`emit.sh`/`plan-sync.sh` 永不阻断宿主、改完跑 `cd telemetry && bun test`。
> 凡本文写了类型/DDL/算法/默认值/边界的地方，**照写**；需要偏离时先回来改本文并在 PR 说明。

## 0. 名词与现有代码锚点

| 物 | 现状文件 | 改动 |
|---|---|---|
| 事件类型/校验 | `telemetry/src/schema.ts` | 加 `plan_sync`；`plan_sync` 专用校验 |
| 存储 | `telemetry/src/store.ts` | 加 `actors`、`user_prefs` 表与读写方法；`plan_sync` 仍进 `events` |
| 指标聚合 | `telemetry/src/metrics.ts` | 加 `buildStats()`（树 + 维度 + 甘特 + 关键路径），保留旧 `computeMetrics` |
| 收集器路由 | `telemetry/src/server.ts` | 加 `/stats`(改)、`/api/actors`、`/api/prefs`；`/report` 用新看板 |
| 看板 HTML | `telemetry/src/dashboard.ts` | 重写为原生单页 SPA-less（消费 `/stats`） |
| 埋点客户端 | `telemetry/emit.sh` | 透传 `--event-type plan_sync`（已支持 `--attrs`，预计无需改） |
| 计划同步客户端 | 新增 `telemetry/plan-sync.sh` | 解析 plan.md → 快照 JSON → emit |
| 安装 | `scripts/install.sh` | 安装时询问显示名（默认 Allen），best-effort 注册 actor |

## 1. 数据来源二分（核心）

| 侧 | 来源 | 内容 | 写哪 |
|---|---|---|---|
| 实测 instrumentation | hook → `turn_complete`（`telemetry/hooks/*`，已存在） | token、活跃耗时、session/turn 数、E/S/T 归因 | `events` 表（已有）|
| 计划 plan | `plan-sync.sh` 解析 `plan.md` → `plan_sync` 事件 | E/S/T 编号/描述/分类/前置/中文状态/估算/源链接 | `events` 表（新事件类型）|

`/stats` 在读时把两侧 join。**实际值绝不写回 plan.md**（plan-lint 已禁 `实际Token/主动耗时/等待耗时` 列）。

## 2. `plan_sync` 事件（schema_version 升至 2）

### 2.1 类型（加进 `schema.ts`）

```ts
// EVENT_TYPES 追加 "plan_sync"
export const EVENT_TYPES = [ /* …现有… */, "plan_sync" ] as const;

export type ZhStatus = "未开始"|"执行中"|"阻塞"|"已实现"|"已验证"|"已完成"|"搁置";
export type PlanCategory = "Must Deliver"|"Must Verify"|"Supporting"|"Backlog"|"";

export interface PlanSource {
  repo_url: string;   // 规范化后的 https 仓库地址；无则 ""
  commit: string;     // git HEAD sha；无则 ""
  path: string;       // 相对仓库根，如 docs/iteration/epics/E002-metrics-refinement/plan.md
  heading: string;    // 该节点对应标题的【原始文本】（不做 slug）；T 行无标题时取所属清单标题
  line: number;       // 1-based 行号（标题行或清单数据行），本地兜底定位
  abs_path: string;   // 客户端本机绝对路径，供 vscode://file 兜底；可为 ""
}
export interface PlanNode {
  level: "E"|"S"|"T";
  id: string;                 // 短编号：E002 / S001 / T001（在父内唯一）
  parent: string|null;        // 直接父短编号：S001.parent="E002"，E002.parent=null
  name: string;
  category: PlanCategory;
  status: ZhStatus;
  deps: string[];             // 同级前置短编号，如 ["S001"]；无则 []
  estimate_tokens: [number, number];  // [lo,hi]；未知 [0,0]
  estimate_hours: number|null;         // 可选；plan.md 有「估计工时」列才有值，否则 null
  source: PlanSource;
  planned_start: string|null;  // ISO 日期；plan.md 无日期列时 null
  planned_end: string|null;
}
export interface PlanSnapshot { root: string; generated_at: string; nodes: PlanNode[]; }
```

### 2.2 校验（`validateEvent`）

`event_type==="plan_sync"` 时：
- 必须 `attrs.plan` 是对象，`attrs.plan.root` 非空字符串，`attrs.plan.nodes` 是数组——否则 `ok:false`。
- **宽松**：逐个 node 丢弃 `level/id` 缺失的，其余字段缺省补齐（`deps:[]`、`estimate_tokens:[0,0]`、`status:"未开始"`、`category:""`、`estimate_hours:null`、`source` 各字段 `""`/`0`）。保留通过的 node。
- 其它事件类型校验不变。`schema_version` 缺省仍补 1；`plan_sync` 客户端发 2。

### 2.3 存储与覆盖语义

- `plan_sync` 与所有事件一样 **append-only 进 `events`**，不建专表。
- 「最新计划」在 **读时** 计算：对每个 `(project_id, attrs.plan.root)`，取 `ts` 最大的那条 `plan_sync` 为当前快照，旧的忽略。这天然实现「计划变更同步＝重发覆盖」。
- `store.ts` 加方法 `latestPlanSnapshots(project_id?): PlanSnapshot[]`（按上面规则去重；返回每个 root 的最新）。

## 3. `plan-sync.sh`（纯 shell 客户端，零 bun 依赖）

用法：
```
plan-sync.sh --epic-dir <epics/E###-*> --project <id> [--endpoint URL] [--dry-run]
```
行为（**永不阻断宿主，始终 exit 0**；`--dry-run` 时把快照 JSON 打到 stdout 不上报）：

1. `root` = epic 目录名的 `E###` 前缀。
2. 遍历：
   - **E 节点** = `<epic-dir>/plan.md`：`level=E,id=root,parent=null`。从该文件首个 H1（`# E002 …`）取 `name`/`heading`/`line`；`category`/`status`/`estimate_tokens` 从「Sprint 清单与指标」表里**不**取（E 自身的估算从「终止契约」的 `Token 预算上限` 行解析，状态默认「执行中」可被顶层 `docs/iteration/plan.md` 行覆盖——简化：E 节点 status 固定从顶层 plan 的 Epic 行取，取不到则「执行中」）。
   - **S 节点** = `<epic-dir>/plan.md` 的「Sprint 清单与指标」表每行：`level=S,parent=root`，列映射见 §3.1；`source` 指向 epic plan.md 该行 `line`、`heading`=「Sprint 清单与指标」。若存在 `sprints/S###-*/plan.md`，`source` 改指该文件 H1。
   - **T 节点** = 每个 `sprints/S###-*/plan.md` 的下级清单表每行：`level=T,parent=S###`，`source` 指该 sprint plan.md 行。
3. `source` 公共字段：
   - `repo_url` = `git -C <dir> remote get-url origin` 规范化：去尾 `.git`；`git@host:org/repo`→`https://host/org/repo`；失败→`""`。
   - `commit` = `git -C <dir> rev-parse HEAD`（失败 `""`）。
   - `path` = `git -C <dir> ls-files --full-name -- <file>`（失败用相对路径）。
   - `abs_path` = 文件绝对路径。
4. 组装 `PlanSnapshot` JSON，`--dry-run` 则打印；否则 `emit.sh --event-type plan_sync --project <id> --attrs '<json>'`。

### 3.1 列解析规则（对治理标准表头）

下级清单表头形如 `| ID | 名称 | 分类 | 前置 | 可并行 | 状态 | 估计Token | 证据 |`（列可缺，按表头名定位，找不到则给默认）：
- `ID`→`id`（trim）。`名称`→`name`。`分类`→`category`（不在枚举则 `""`）。`状态`→`status`（不在 7 中文枚举：英文别名映射，仍不中则 `未开始`）。
- `前置`→`deps`：按 `,，/、 ` 分割，提取 `E\d+|S\d+|T\d+`，`—`/空→`[]`。
- `估计Token`→`estimate_tokens`：正则 `([0-9]+)\s*[kK]?\s*[-–~]\s*([0-9]+)\s*[kK]?` 取两数，含 `k` 则 ×1000；单值→`[v,v]`；无→`[0,0]`。
- `估计工时`（可选列）→`estimate_hours`：取首个数字（小时），无列→`null`。
- `line` = 该数据行行号。

> Mermaid 边（`A --> B` 表示 A 是 B 的前置）也解析，与「前置」列**求并集**写入 B 的 `deps`。解析失败不致命。

## 4. 身份模型（id/name 分离）

`store.ts` 新表（`migrate()` 内 `CREATE TABLE IF NOT EXISTS`，不动 `events`）：
```sql
CREATE TABLE IF NOT EXISTS actors (
  actor_id    TEXT PRIMARY KEY,   -- 不可变；事件里存的就是它
  display_name TEXT NOT NULL,     -- 可改；改名只改这里
  role        TEXT NOT NULL DEFAULT 'dev',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
```
- **解析**：展示期 `LEFT JOIN actors`。`resolveName(actor_id)` = actors 行 `display_name`，无行→回退**字面 `actor_id`**（不是 Allen）。
- **历史迁移**：`migrate()` 末尾，若 `actors` 为空，对 `SELECT DISTINCT actor_id FROM events` 每个插入一行 `display_name='Allen', role='dev'`（实现「历史数据都挂 Allen」）。只跑一次（空表判定）。
- **改名不影响历史**：`events.actor_id` 永不被改；改名只 `UPDATE actors`。测试覆盖。
- API：
  - `GET /api/actors` → `[{actor_id, display_name, role}]`
  - `PUT /api/actors/:id` body `{display_name?, role?}` → upsert，返回该行。`display_name` 空串拒 400。
- `store` 方法：`listActors()`、`upsertActor({actor_id,display_name,role})`、`resolveName(id)`。

## 5. 偏好/关注模型

```sql
CREATE TABLE IF NOT EXISTS user_prefs (
  actor_id        TEXT PRIMARY KEY,
  watched_projects TEXT NOT NULL DEFAULT '[]',  -- JSON 数组
  role_view       TEXT NOT NULL DEFAULT 'dev',  -- boss|dev|product|qa
  updated_at      TEXT NOT NULL
);
```
- API：`GET /api/prefs?actor=<id>`、`PUT /api/prefs?actor=<id>` body `{watched_projects?, role_view?}`（upsert）。
- 默认（无行时 `GET` 返回的派生默认，不落库）：`watched_projects` = 该 actor 有事件关联的全部 `project_id`；`role_view` = `actors.role` 映射（`pm/ops→boss`，其余原样，未知→`dev`）。
- `store` 方法：`getPrefs(id)`、`upsertPrefs(id, patch)`。

## 6. `GET /stats` 契约（看板唯一数据源）

请求：`GET /stats?project=<可选>&actor=<查看者id, 可选>`。返回（TS 形状，**字段名照写**）：
```ts
interface Stats {
  generated_at: string;
  viewer: { actor_id: string; display_name: string; role_view: string; watched_projects: string[] };
  projects: ProjectStat[];
  dims: { agent: KV[]; skill: KV[]; tool: KV[] };   // 三独立维度；tool 缺省键 "无"
  developers: { actor_id: string; display_name: string; tokens: number; active_hours: number; tasks_done: number }[];
}
interface KV { k: string; tokens: number }
interface NodeStat {
  level: "P"|"E"|"S"|"T"; id: string; name: string; status: ZhStatus|"";
  plan: { estimate_tokens: [number,number]; estimate_hours: number|null };
  actual: { tokens: number; active_hours: number; sessions: number; turns: number };
  deviation: { tokens: number|null; hours: number|null };  // null=无计划基线
  source_url: string|null;          // §7 计算好的可点链接
  gantt: { start: string|null; end: string|null; status4: "未开始"|"执行中"|"已挂起"|"已关闭"; blocked: boolean; critical: boolean; deps: string[] };
  children: NodeStat[];
}
interface ProjectStat extends Omit<NodeStat,"level"> { level: "P"; epics: NodeStat[] }
```
计算规则：
- **树**：project → epics(E) → sprints(S) → tasks(T)，E/S/T 来自最新 plan 快照；actual 来自 instrumentation 按 `(epic,sprint,task)` 归因（`.fpg/current-task` 已写入 `turn_complete.attrs`）。某层 actual = 自身直接归因 + 后代汇总。
- **actual.tokens** = Σ `turn_total_tokens`（沿用现有 `turnTokens`）。**active_hours** = 现有「相邻 turn 间隔 <30min」近似，按 `(epic,sprint,task)` 归集（扩展 `metrics`，新增 `active_hours_by_task`）。**sessions/turns** 计数同理。
- **deviation.tokens** = `actual.tokens − mid`，`mid=round((lo+hi)/2)`；`lo=hi=0`（无估算）→ `null`。**deviation.hours** = `estimate_hours!=null ? round(actual.active_hours−estimate_hours,1) : null`。
- **plan 缺失**（没跑过 plan_sync）：该节点只有 instrumentation 归因时，仍建节点（id 来自归因），`plan.estimate_*` 取 0/null、`deviation` null、`status:""`、`source_url:null`。看板优雅降级。
- **dims**：`agent` 按 `event.tool`，`skill` 按 `event.skill`（含非内置如 `superpowers:tdd`），`tool` 按 `turn_complete.attrs.mcp_tools[]`/`tool_hook` 记录的 mcp 工具名；某 turn 无 tool → 计入键 `"无"`。三者**并列、不嵌套**。
- **developers**：按 `events.actor_id` 分组，名字 `resolveName`。

## 7. 源链接（在 TS 里算，可测）

`buildSourceUrl(source): string|null`：
- `repo_url` 非空 → `${repo_url}/blob/${commit}/${path}#${githubSlug(heading)}`。
- 否则 `abs_path` 非空 → `vscode://file/${abs_path}:${line}`。
- 都没有 → `null`。

`githubSlug(heading)`（GitHub 兼容，CJK 保留）：① 去首尾空白；② 转小写；③ 删除除「字母/数字/中日韩/空格/连字符」外的字符（即删标点括号）；④ 空格→`-`。
例：`"E002 统计细化（需求实现过程精细化度量）"` → `"e002-统计细化需求实现过程精细化度量"`。**必须配单测**（含 CJK、括号、多空格）。

## 8. 状态 → 甘特四态映射（固定，配图例）

| 甘特四态 | 颜色/纹理 | 治理状态 |
|---|---|---|
| 未开始 | 灰/虚边 | 未开始 |
| 执行中 | 蓝（`阻塞`额外 `blocked:true` 红点角标） | 执行中、阻塞、已实现、已验证 |
| 已挂起 | 斜纹黄 | 搁置 |
| 已关闭 | 绿 | 已完成 |

`status4` 与 `blocked` 在 `/stats` 算好，前端只渲染。

## 9. 甘特时间轴

- `gantt.start/end`：优先 `planned_start/planned_end`；否则用该节点 instrumentation 的 **实测跨度** = [最早归因 turn ts, 最晚归因 turn ts]；都没有 → `start=end=null`（前端渲染为「未排期」0 宽标记，仍出现在清单）。
- E 级跨度 = 后代 min(start)/max(end)。
- 粒度 时/天/周 是**纯前端**缩放（轴刻度与窗口），不改 `/stats`。
- 同项目重叠 Epic 前端按「首个结束≤后者开始」贪心分泳道（原型已实现）。

## 10. 关键路径（在 TS 里算，可测）

`criticalPath(nodes_same_level): Set<id>`：
- 以 `deps` 建有向图（`dep → node`），权重 `w(node)=mid(estimate_tokens) || 1`。
- 求**最长加权路径**（DAG 拓扑 DP），返回路径上的 node id 集合，置 `critical:true`。
- **无任何边**（都没声明 deps）→ 返回空集（全 `critical:false`），前端隐藏关键路径行并提示「未声明依赖」。
- 每个父节点对其直接子级各算一次（E 对 S、S 对 T）。**必须配单测**（线性链、分叉、无边三种）。

## 11. 看板信息架构（原生单页，对齐已审批原型）

`dashboard.ts` 输出单个 HTML（内联 `<style>`+`<script>`，零构建链、零外部依赖），启动后 `fetch('/stats?...')` 渲染：
- **总览**：KPI 行（按 `role_view` 选组合）+ 并行甘特（时/天/周、分泳道、四态+图例+关键路径行）+ Agent/Skill/Tool 三维度块。
- **下钻**：项目→E→S→T 树表，每行 `计划 | 实际 | 偏差`（token；工时仅实测，`deviation.hours=null` 显「—」）+ 中文状态 + `原文↗`(`source_url`)；叶子可展开。
- **开发者维度**：选 `actor` 看其贡献（`developers` + 树过滤）。
- **视角**：boss/dev/product/qa 仅切 KPI 预设与默认筛选（前端 + `role_view`）。
- **关注**：多选项目存 `/api/prefs`，过滤/高亮甘特。
> 看板交互逻辑可直接移植本 Epic 会话里已审批的 3 个原型（甘特分泳道/四态/关键路径、下钻偏差表、关注弹窗）。

## 12. 阶段口径（ADR-019）

取消阶段 cycle-time 主指标；计时挂 Skill 调用与 E·S·T 切片；`phase` 仅作软标签；审核/验收＝`verification` 事件喂返工率/AC 通过率。**本 Epic 不实现阶段时长视图。**

## 13. API 汇总与鉴权

| 方法 路径 | 作用 | 鉴权 | 错误 |
|---|---|---|---|
| GET `/health` | 现有 | 无 | — |
| POST `/events` | 现有；需接受 schema 2 + plan_sync | `authorized()` | 400 bad json / 422 全拒 |
| GET `/stats?project=&actor=` | 看板数据 | 无 | — |
| GET `/report` | 看板 HTML | 无 | — |
| GET `/api/actors` | 列 actor | 无 | — |
| PUT `/api/actors/:id` | upsert 显示名/角色 | `authorized()` | 400 空名 |
| GET `/api/prefs?actor=` | 取偏好（含派生默认） | 无 | 400 缺 actor |
| PUT `/api/prefs?actor=` | upsert 偏好 | `authorized()` | 400 缺 actor |

`authorized()` 复用现有 Bearer 逻辑（`FPG_TELEMETRY_TOKEN` 未设则放行）。

## 14. install.sh 身份询问

- 取默认 `ACTOR_ID=${USER}`（现已如此）。新增交互：`printf '遥测显示名 [Allen]: '; read NAME; NAME=${NAME:-Allen}`（`--user` / 非交互场景默认 Allen，不卡住）。
- 写 `~/.fpg-telemetry/env.sh`：`FPG_ACTOR_ID`（不变）+ 新增 `FPG_ACTOR_NAME`（仅记录）。
- best-effort `curl -m 2 PUT $FPG_TELEMETRY_ENDPOINT/api/actors/$ACTOR_ID {display_name,role}`（失败静默——迁移默认 Allen 兜底，用户可后续在看板改名）。沿用 emit.sh 的「不可达不报错」。

## 15. 兼容、回滚、测试

- `schema_version` 升 2；老事件（无 plan、无 actors/prefs 行）看板优雅降级。`store.migrate()` 只加表/索引，不改历史行。
- 回滚：`plan_sync` 与新表是叠加式；停用 `plan-sync.sh` 调用即回到纯 instrumentation 视图。
- **`bun test` 必加用例**（每个都要有）：
  1. `validateEvent` 接受合法 `plan_sync`、拒无 `root`/`nodes`、丢弃坏 node 留好 node。
  2. `latestPlanSnapshots` 对同 `(project,root)` 多次 plan_sync 取最新。
  3. `githubSlug`：英文、CJK、括号标点、多空格。
  4. `criticalPath`：线性链 / 分叉取高权重 / 无边返空。
  5. `buildStats`：deviation.tokens（含 lo=hi=0→null）、deviation.hours（estimate_hours 有/无）、plan 缺失降级、dims 三维独立与「无」键、active_hours_by_task 归集。
  6. `actors`：迁移回填 Allen；改名后 `events.actor_id` 不变、`resolveName` 返回新名；无行回退字面 id。
  7. `user_prefs`：upsert 往返；无行派生默认。
  8. `buildSourceUrl`：repo permalink / vscode 兜底 / null。
  9. `plan-sync.sh --dry-run`：对 `test/fixtures/` 一个样例 epic 目录输出预期快照 JSON（Bun.spawn 跑 shell，断言 JSON）。
