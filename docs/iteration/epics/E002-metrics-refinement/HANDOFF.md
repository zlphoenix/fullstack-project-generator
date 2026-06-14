# E002 开发交接（给 Codex / 外部开发 agent）

> 你将实现 E002「统计细化」。**唯一权威实现契约是 [design.md](design.md)**；任务拆分与验收在 [plan.md](plan.md) 与 `sprints/S001*/plan.md`、`sprints/S002*/plan.md`。本文给执行顺序、铁律与「完成的定义」。

## 0. 在哪做、用什么

- 仓库：`fullstack-project-generator`；改动集中在 `telemetry/`，少量在 `scripts/install.sh`、`skills/sprint-plan/`、`skills/project-requirements/`、`project-template/references/`。
- 语言：**仅 TypeScript(Bun) + shell**，**零外部依赖**（用 `bun:sqlite`、`Bun.serve`）。不引前端框架、不加 npm 依赖、**不写 Python**。
- 客户端铁律：`emit.sh` / `plan-sync.sh` **永不阻断宿主**（始终 `exit 0`，无 stdout 干扰；网络不可达不报错）。
- 每个 Task 结束必须：`cd telemetry && bun test` 全绿；`bash project-template/bin/fpg-check.sh plan-lint <改到的 plan.md>` 无 STOP。
- 详细目录规范见 [telemetry/AGENTS.md](../../../telemetry/AGENTS.md)，决策见 [ADR-019](../../../00-决策记录.md)。

## 1. 执行顺序（依赖严格）

```
S001.T001 (schema+store)           ← 公共前置，先合
   ├─ S001.T002 (plan-sync.sh)     ┐ 可并行
   └─ S001.T003 (身份 id/name)      ┘
        └─ S001.T004 (Skill 接入，依赖 T002)
S002.T001 (/stats 契约)            ← 依赖 S001 全部
   ├─ S002.T002 (看板单页)          ┐ 可并行
   └─ S002.T003 (prefs 路由+控件)   ┘
```

每个 Task **独立提交/PR**，标题 `E002/S00x/T00y <名称>`。一次只动该 Task 的「冲突文件」（见各 Sprint plan「并行边界」）。

## 2. 完成的定义（每个 Task 都满足）

1. 行为与 design.md 对应章节**逐字一致**（类型名、字段名、DDL、算法、默认值、错误码照写）。
2. 该 Task 在 design §15 列出的单测**全部新增并通过**。
3. `bun test` 全绿；不破坏现有用例（`telemetry/test/metrics.test.ts` 等）。
4. 向后兼容：旧事件（schema 1、无 plan、无 actors 行）仍能入库、看板优雅降级。
5. 不留 TODO 占位实现；不偏离契约——若发现契约有错，**先改 design.md 并在 PR 说明**，不要静默改行为。

## 2.5 验证节奏（Task 自测 / Sprint 审核 —— 重要）

两种验证分两个节奏，不要混：

- **自动门禁**（`bun test` + `fpg-check`）：**每个 Task 完成就跑**，你自己负责，未全绿不得进下一个 Task。
- **人工审核**（本文 §3 清单）：**按 Sprint 边界批量做**，不逐 Task 审——多数 Task（如 T001 schema/store）单独没有可观测行为，要等同 Sprint 的消费方就绪才看得见。依据治理规范 §8「验证集中、每 Sprint 末一次」。

因此你的**停顿点**只有这些：
1. **S001.T001 完成后**：贴一份「地基摘要」——`schema.ts` 新增类型 + `store.ts` 的 DDL/迁移，对照 [design §2/§4/§5](design.md) 标出你的实现与决定。停下等一次**轻量地基检查（只读、不跑完整 §3）**，通过再继续。理由：后续 3 个 Task 全压在这层 schema/DDL 上，地基歪了 Sprint 末才发现要连带返工。
2. **每个 Sprint 全部 Task 完成后**：贴该 Sprint 的 DoD 证据（§4）+ 各 Task 变更摘要 + `bun test` 输出。停下等**完整审核**，通过再进下一个 Sprint。
3. 其余相邻 Task 之间**不必停**，连续做（各自跑门禁即可）。

## 3. 我（审核方）会逐条对照检查

- [ ] `plan_sync` 校验：缺 `root`/`nodes` 拒；坏 node 丢、好 node 留（design §2.2）。
- [ ] `latestPlanSnapshots` 同 `(project,root)` 取最新（§2.3）。
- [ ] `plan-sync.sh --dry-run` 对 `test/fixtures` 输出符合 §2.1：`source`(repo_url 规范化/commit/path/heading/line/abs_path)、`deps`（前置列∪Mermaid）、`estimate_tokens`(k 与区间解析)、`estimate_hours`(无列=null)。
- [ ] `plan-sync.sh` 不可达/无 git 时仍 `exit 0`、字段降级为 `""`/`0`。
- [ ] `githubSlug` 单测含 CJK/括号/多空格；`buildSourceUrl` 三分支（permalink / vscode / null）。
- [ ] `criticalPath` 线性/分叉/无边三例正确；无边时前端提示「未声明依赖」。
- [ ] `buildStats`：deviation.tokens（lo=hi=0→null）、deviation.hours（estimate_hours 有/无）、plan 缺失降级、`dims` 三维独立 + 「无」键、active_hours 按 (E,S,T) 归集、developers 用 `resolveName`。
- [ ] 身份：迁移空表回填 Allen 一次；改名只动 `actors`、`events.actor_id` 不变；无行回退**字面 id**（非 Allen）。
- [ ] API：`PUT` 系列走 `authorized()`；空 `display_name` 400；`/api/prefs` 缺 actor 400；派生默认正确。
- [ ] 看板：零依赖、零构建；总览/下钻/开发者/视角/关注齐全；甘特 时-天-周 + 分泳道 + 四态图例 + 关键路径行；下钻 token 三列 + 工时仅实测 + 原文链接可点。
- [ ] `install.sh`：交互空回车=Allen，非交互默认 Allen 不卡；best-effort PUT 失败静默。
- [ ] 全程无 `实际Token/主动耗时/等待耗时` 手填列回潮；实际值只来自遥测。
- [ ] `schema_version` 升 2；`store.migrate()` 只加表/索引不改历史行。

## 4. 验收证据（放 `evidence/`，DoD 凭据）

- `bun test` 完整输出。
- `plan-sync.sh --dry-run` 对真实 `E002` 目录与 fixtures 的快照 JSON 各一份。
- 浏览器 `GET /report` 下钻截图 + 甘特三粒度截图；`GET /stats` JSON；`/api/actors` 改名前后、`/api/prefs` 往返。

## 5. 常见坑（已知）

- Codex/Claude 用**非交互 shell 不读 `~/.zshrc`**：`plan-sync.sh` 不要依赖交互式环境变量；需要的 `FPG_*` 自 `~/.fpg-telemetry/env.sh` source（参照 `telemetry/hooks/tool_hook.sh`）。
- `case */epics/E*/plan.md` 的 `*` 跨 `/` 匹配，**Sprint plan 也被当 Epic 级**校验 → Sprint plan 必须含「终止契约」「结构决策」（已写好）。
- SQLite 用 `bun:sqlite`，迁移用 `CREATE TABLE IF NOT EXISTS` + `PRAGMA table_info` 补列，**不要** drop/rebuild `events`。

## 6. Codex 启动提示词（在主仓库 master 上启动后粘贴）

> 启动前：`cd /Users/allen/Work/skills/fullstack-project-generator`（master 分支）再起 Codex。

```text
你是本仓库的实现开发者,负责完成 Epic E002「统计细化」。文档为中文,你也用中文沟通。

【环境自检 —— 先做,不对就停】
1. 运行 pwd,必须等于: /Users/allen/Work/skills/fullstack-project-generator
2. 运行 git branch --show-current,必须是: master
   任一不符 → 立即停止并告诉用户"工作目录/分支不对",不要在别处改动。

【先读,后写】
3. 完整读 docs/iteration/epics/E002-metrics-refinement/HANDOFF.md(入口:执行顺序+铁律+验证节奏+审核清单)。
4. 完整读同目录 design.md(唯一权威实现契约:类型/DDL/算法/字段名/默认值/错误码,照写)。
5. 略读 plan.md 与 sprints/S001*/plan.md、sprints/S002*/plan.md(Task 拆分与验收)。

【铁律】
- 只用 TypeScript(Bun) + shell,零外部依赖,不写 Python,不引前端框架/构建链。
- emit.sh / plan-sync.sh 永不阻断宿主(始终 exit 0)。
- 每个 Task 完成后必须跑自动门禁:cd telemetry && bun test 全绿;并对改到的 plan.md 跑
  bash project-template/bin/fpg-check.sh plan-lint <file> 无 STOP。不破坏现有用例。
- 严格按 design.md;若发现契约有错,先改 design.md 并在提交说明里讲清,不要静默偏离。
- 一个 Task 一次提交,提交信息以 "E002/S00x/T00y <名称>" 开头,提交到 master。
- 实现 design.md §15 列出的对应单测,不留 TODO 占位。

【执行顺序】
S001.T001(schema+store) → 然后 S001.T002(plan-sync.sh) 与 S001.T003(身份) 可并行 →
S001.T004(Skill 接入) → S002.T001(/stats 契约) → 然后 S002.T002(看板) 与 S002.T003(prefs) 可并行。

【验证节奏 —— 只在这些点停下,其余连续做】
- S001.T001 完成后:贴「地基摘要」(schema 新类型 + store DDL/迁移,对照 design §2/§4/§5),停下等地基检查,通过再继续。
- 同一 Sprint 内其余 Task 连续做,各自跑 bun test + fpg-check 门禁,不必每个都停。
- 每个 Sprint 全部完成后:贴该 Sprint 的 DoD 证据(HANDOFF §4)+ 各 Task 变更摘要 + bun test 输出,停下等完整审核,通过再进下一个 Sprint。

【现在开始】
从 S001.T001 起步,完成后按上面的节奏贴「地基摘要」并停下。
```
