# E002 统计细化（需求实现过程精细化度量）

> 本 Epic 属于 M2「强制与工件」延伸。目标：让 AI 辅助开发过程**可控、可见、可量化、可改进**——把已有 `plan.md` 治理结构（下级清单、依赖图、关键路径、中文状态、估算）接入遥测，与工具 hook 的实测值（token/耗时）在看板上对齐，并提供多维下钻、并行甘特与按用户的关注/视角。
> 详细技术设计见 [design.md](design.md)。本文只保留计划、状态、终止契约与子项清单。

## 目标

- 把**计划侧数据**（E/S/T 编号+描述+分类+前置依赖+中文状态+估算+源链接）经新增 `plan_sync` 事件并入遥测；计划变更可重发覆盖（即「计划变更同步到统计中心」）。
- 把**实测值**（token、活跃耗时）继续只由工具 hook 采集，在 `GET /stats` 与看板上与计划侧 **join**，得到 计划/实际/偏差 三口径。
- 身份 **id/name 分离**：`actor_id` 不可变，显示名可改且**改名不影响已统计的历史数据**；安装时询问并默认 `Allen`；历史数据默认归属 `Allen`。
- 维度澄清：**Agent / Skill / Tool(MCP)** 三者各自独立成维，互不混；未调用 tool 记「无」。
- 看板从单页扁平表格升级为：项目→E→S→T **下钻**、并行项目**甘特**（时/天/周粒度、重叠 Epic 分泳道、四态、关键路径、图例）、按 `actor_id` 持久化的**关注配置与视角**、按**开发者**维度查看，每层可跳回原始 `plan.md`。

## 范围

**包含**
- `telemetry/`：`schema`/`store` 增 `plan_sync` 事件与计划快照存储；`actors`、`user_prefs` 两张表；`metrics`/`/stats` 聚合（计划 ⨝ 实测）；`dashboard` 重构为原生单页（总览/下钻/开发者/视角/关注）。
- `emit.sh` 增 `plan_sync` 支持；新增 `telemetry/plan-sync.sh` 解析 `plan.md`（下级清单 + Mermaid 前置 + 中文状态）生成快照并上报。
- `install.sh` 安装时询问/确认显示名（默认 `Allen`）；历史 `actor_id` 默认显示名 `Allen`。
- `sprint-plan` / `project-requirements` 收尾接入 `plan-sync.sh`（自动同步 + 变更覆盖）；治理规范/执行卡补一行说明。

**不包含**
- 不引入前端框架与构建链：看板为零依赖原生单页（对齐 [ADR-002/016](../../../00-决策记录.md)）。
- 不做远端多租户鉴权/共享收集器（[Backlog](#风险与-backlog)）。
- 不做传统 SDLC「阶段」cycle-time：按 [ADR-019](../../../00-决策记录.md) 取消阶段计时主轴，`phase` 降为软标签，审核/验收为 `verification` 事件。
- 不采集代码内容/PII（[ADR-012](../../../00-决策记录.md)）。

## 终止契约（不可中途放宽）

| 项 | 内容 |
|---|---|
| Definition-of-Done | 针对一个**真实跑过 Sprint 的项目**，在浏览器看板上可下钻 E/S/T 看到「计划 / 实际 / 偏差」三列（实际 token 与耗时来自工具 hook，非手填）、并行甘特与关键路径可读、可改显示名且历史归属不变、可保存关注——全部真实数据驱动。mock/结构同构/单测通过不单独构成 DoD。 |
| DoD 验收证据 | 对本仓库 `docs/iteration`（E001/E002）跑通：`sprint-plan` → `plan-sync.sh` → collector 收到 `plan_sync`；执行期 hook 自动产生带 E/S/T 归因的 `turn_complete`；浏览器 `GET /report` 下钻截图 + `GET /stats` JSON 各一份留 `evidence/`。 |
| Sprint 预算上限 | 2（硬上限 = 计划 × 1.2 ≈ 2，超出即 re-baseline） |
| Token 预算上限 | 170k–330k；硬上限 = 上界 × 1.2 ≈ 396k（实际消耗对照遥测看板，不手工记账） |
| 退出场景（必须全绿） | ①计划入库与同步 ②下钻看偏差 ③并行甘特+关键路径 ④身份改名与关注持久化（见下） |
| 明确不做（out-of-scope） | 前端框架/构建链；远端多租户鉴权；阶段 cycle-time；PII/代码内容采集 |
| 外部依赖与责任人 | 工具 hook 已安装并能产出 `turn_complete`（`claude_usage.sh`/`codex_usage.sh`）——Allen 负责本机配置；无远端依赖 |

### 退出场景（DoD 的真实用户流程）

1. **计划入库与同步**：在本仓库对某 Epic 跑 `sprint-plan` 后，collector 收到 `plan_sync`，`GET /stats` 返回该 Epic 的 E/S/T 树（含描述/分类/前置/中文状态/估计 token/源链接）；改 `plan.md` 后重发能覆盖。
2. **下钻看偏差**：浏览器打开 `/report`，项目→E→S→T 下钻，看到「计划 vs 实际（hook）」的 token/活跃耗时与偏差，原文链接可点跳回 `plan.md` 章节。
3. **并行甘特+关键路径**：甘特按 时/天/周 切换；同项目重叠 Epic 自动分泳道；四态（未开始/执行中/已挂起/已关闭）+ 关键路径标注 + 图例正确。
4. **身份与关注**：改某 `actor` 显示名后，历史事件归属不变、看板显示新名；关注配置按 `actor_id` 保存且重开后保留。

## 结构决策

Epic + 2 Sprint（[治理规范 §10](../../../../project-template/references/iteration-governance.md)）。S001 锚定退出场景 ①④（计划/身份数据进入遥测并可同步）；S002 锚定退出场景 ②③（看板下钻/甘特/偏差/关注）。规划期一次定死，执行期不重判；改深度=re-baseline，须人类批准。

## Sprint 清单与指标

| ID | 名称 | 分类 | 前置 | 可并行 | 状态 | 估计Token | 证据 |
|---|---|---|---|---|---|---|---|
| S001 | 计划侧入遥测与身份 | Must Deliver | — | 否 | 已完成 | 80k–150k | [design.md](design.md) |
| S002 | 看板下钻·甘特·关注 | Must Deliver | S001 | 否 | 已完成 | 90k–175k | [design.md](design.md) |

> Task 级清单在各 Sprint 的 `sprints/S00N-*/plan.md`（执行期由 `sprint-plan` 生成）；本文只记直接下级（Sprint）。S001 预拆：`schema/store + plan_sync` → `plan-sync.sh 客户端` → `身份 id/name + install 询问` → `Skill 接入自动同步`。S002 预拆：`/stats 契约` → `原生单页（甘特/下钻/开发者/视角）` → `关注 prefs 持久化`。实测 token/耗时一律来自遥测，**不在 plan.md 手填实际值**。

## 关键路径

| 分类 | 项 | 说明 |
|---|---|---|
| Must Deliver | S001 → S002 | 计划/实测数据通路（S001）是看板（S002）的前置；二者构成关键路径 |
| Must Verify | 退出场景 ①②③④ 各一次真实 smoke | 合并到对应 Sprint 末，Epic 末整体跑一次 |
| Supporting | git permalink 源链接计算、视角预设 | 限时；超预算转 Backlog |

## Mermaid 前序依赖图（Sprint 关系）

```mermaid
graph LR
  S001[S001 计划侧入遥测与身份] --> S002[S002 看板下钻·甘特·关注]
```

## 并行边界

- S001 与 S002 **不并行**：看板依赖稳定的 `plan_sync` 与 `/stats` 契约。
- S001 内部：`schema/store` 稳定后，`plan-sync.sh` 客户端 与 `身份 id/name` 可按文件隔离并行；`Skill 接入` 依赖客户端就绪。
- 总账只由协调线程更新本 `plan.md`、`telemetry/schema.md`、`telemetry/AGENTS.md`；子线程只改自己的 Task 范围文件。
- 共享文件冲突点：`telemetry/src/schema.ts`、`telemetry/src/store.ts`、`telemetry/src/server.ts` 必须串行改。

## 验收标准

- `plan_sync` 入 `schema`/`store`，`schema_version` 升 2 且向后兼容；`bun test` 覆盖事件校验、计划快照覆盖语义、`/stats` join、偏差与关键路径计算。
- `plan-sync.sh` 能解析 `plan.md` 下级清单 + Mermaid 前置 + 中文状态 → 快照 JSON 上报；同 `project + 节点 id` 重发取最新（计划变更同步）。
- `actors`：`actor_id` 不可变、`display_name` 可改、改名不影响历史事件归属；`install.sh` 安装时询问并默认 `Allen`；历史 `actor_id` 默认显示名 `Allen`；`GET/PUT /api/actors` 可用。
- `GET /stats` 返回 项目→E→S→T 树（估计/实际 token、活跃耗时、偏差、中文状态、计数、源链接）+ Agent/Skill/Tool 三独立维度 + 甘特数据（start/end、状态、deps、关键路径）。
- 看板单页（原生 JS、无构建链）：总览（KPI + 并行甘特 时/天/周 + 泳道 + 四态 + 关键路径 + 图例）、下钻（项目→E→S→T 偏差 + 原文）、开发者维度、视角切换、关注配置（按 `actor_id` 持久化）。
- Tool 维度未调用记「无」；Agent 与 Skill/Tool 不混维。
- 全程不出现手填实测列（已废除的实测 token / 耗时列）；实际值全部来自遥测 hook。
- 改完 `cd telemetry && bun test` 通过；`bash project-template/bin/fpg-check.sh plan-lint` 对本 Epic 与各 Sprint plan 无 STOP。

## 风险与 Backlog

| 项 | 状态 | 优先级 | 复杂度 | 估计Token | 建议阶段 | 依赖 | 不做的危害 | 验收标准 | 不进当前 Sprint 原因 |
|---|---|---|---|---|---|---|---|---|---|
| 关键路径精确算法（按依赖求最长路径）vs 仅标 Must Deliver | 未开始 | P1 | Medium | 20k–40k | S002 内或后续 | plan_sync deps 稳定 | 关键路径不准 | 由 deps 计算的最长路径与人工标注一致 | 先标注 + 近似，精确算法可增量 |
| 远端多用户/共享收集器鉴权 | 搁置 | P2 | High | 40k–80k | 后续 | 现已 `FPG_TELEMETRY_TOKEN` | 多机协作受限 | 多机访问同收集器、prefs 跟人 | 当前本机/单收集器够用 |
| 历史事件回填活动类别软标签 | 搁置 | P3 | Low | 10k–20k | 后续 | 软标签映射表 | 旧数据无类别 | 旧事件按 skill 映射出类别 | 不影响 DoD |
