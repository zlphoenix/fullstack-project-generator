# E001 迭代治理与并行任务规范固化

> 本 Epic 属于 M2「强制与工件」。目标是把近期 Codex 迭代开发经验固化进 Skill 和目标项目模板，形成可复用、可度量、低冲突的迭代治理模式。

## 目标

- 将用户项目迭代层级统一为 **Epic(E) -> Sprint(S) -> Task(T)**。
- 规定每一级 `plan.md` 是唯一的计划、直接子项清单、状态与指标真源，避免 `INDEX.md` 与 `plan.md` 双写。
- 统一 Sprint 目录、Task 过程记录、短编号定位、并行任务边界、验收证据、token 与耗时回填规范。
- 更新现有 `sprint-plan`、`sprint-develop`、`project-qa`，让规范在真实流程中稳定触发。

## 范围

**包含**
- 新增 `project-template/references/iteration-governance.md`。
- 更新 `project-template/AGENTS.md`，增加迭代治理入口。
- 更新 `skills/sprint-plan/SKILL.md`，用于创建 Epic/Sprint/Task 目录、分解清单、并行边界和估算。
- 更新 `skills/sprint-develop/SKILL.md`，用于 Task 执行、worklog、smoke-report、实际 token/耗时回填。
- 更新 `skills/project-qa/SKILL.md`，用于独立验收、golden case、测试缺口记录。
- 必要时补充模板文件，减少 Skill 正文膨胀。

**不包含**
- 不新建独立 Skill。
- 不在用户项目迭代层级中引入 Milestone；Epic 承担阶段目标与跨 Sprint 汇总。
- 不实现自动 token 采集；本阶段只固化估算、回填和汇总字段。
- 不引入独立 `INDEX.md`；清单与指标统一放入各级 `plan.md`。

## Sprint 清单与指标

| ID | 名称 | 目标 | 状态 | 创建时间 | 开始时间 | 结束时间 | 主动耗时 | 等待耗时 | 估计Token | 实际Token | 偏差原因 | 证据 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| S001 | 规范与模板 | 新增 iteration-governance 参考和目标项目入口 | 已完成 | 2026-06-03 | 2026-06-03 15:00 CST | 2026-06-03 15:04 CST | 4m | 0m | 25k-45k | ~22k | 直接沉淀为 reference 和 AGENTS 入口，未拆 Task 子目录；后续补充短编号和 evidence 命名 | [reference](../../../../project-template/references/iteration-governance.md) |
| S002 | Skill 集成 | 将治理规范接入 sprint-plan、sprint-develop、project-qa | 已完成 | 2026-06-03 | 2026-06-03 15:04 CST | 2026-06-03 15:08 CST | 4m | 0m | 35k-60k | ~25k | 采用兼容式改造，保留旧 docs/sprint-N.md 读取路径 | [sprint-plan](../../../../skills/sprint-plan/SKILL.md) |
| S003 | 验证与文档收口 | 验证 SKILL 约束、更新里程碑与改进计划 | 已完成 | 2026-06-03 | 2026-06-03 15:08 CST | 2026-06-03 15:09 CST | 1m | 0m | 15k-30k | ~8k | 只跑固定 telemetry 测试，未新增脚本级自动校验 | `cd telemetry && bun test` |
| S004 | Sprint 复盘规则合并 | 从 industry Sprint 4 复盘合入关键路径、任务粒度和 token 预算闸门 | 已完成 | 2026-06-04 | 2026-06-04 14:50 CST | 2026-06-04 14:59 CST | 9m | 0m | 20k-35k | ~18k | 只合入规则，不合入旧 docs/sprint-N.md 与 1 Story 执行模型 | [reference](../../../../project-template/references/iteration-governance.md) |
| S005 | 下级清单与依赖图 | 每级 plan.md 增加下级分解清单、关键路径和 Mermaid 前序依赖图 | 已完成 | 2026-06-04 | 2026-06-04 15:18 CST | 2026-06-04 15:22 CST | 4m | 0m | 10k-20k | ~12k | 参考 industry Sprint 4 plan 抽象规则，未复制项目专属内容 | [reference](../../../../project-template/references/iteration-governance.md) |
| S006 | 中文状态与流转时机 | 将 E/S/T 下级清单状态统一为中文，并明确状态更新时机 | 已完成 | 2026-06-04 | 2026-06-04 16:00 CST | 2026-06-04 16:06 CST | 6m | 0m | 8k-15k | ~10k | 保留英文状态为旧文档兼容别名，新建和回填必须用中文 | [reference](../../../../project-template/references/iteration-governance.md) |

## 分解与依赖

1. S001 先定义目标项目中的迭代治理参考，输出稳定术语、目录结构、短编号归一化、`plan.md` 模板区块和指标字段。
2. S002 依赖 S001，将引用接入现有 Skill，确保规划和开发阶段都会加载同一份规范。
3. S003 依赖 S002，检查 Skill 行数、frontmatter、引用路径、模板路径和文档一致性。

## 并行边界

- S001 和 S002 不并行：Skill 集成必须依赖已稳定的 reference 内容。
- S002 内部可按文件隔离并行，但同一时间只能由协调线程更新 `project-template/AGENTS.md` 和本 Epic `plan.md`。
- 子任务线程只能修改自己的 Task 目录、对应 Skill 文件或明确授权的模板文件。
- 总账更新只写本文件的「Sprint 清单与指标」，不在其他文件重复维护 Sprint 状态和 token 汇总。

## 验收标准

- `project-template/references/iteration-governance.md` 存在，并明确 E/S/T 编号、短编号定位、目录结构、`plan.md` 唯一真源、耗时/token 字段、并行规则和验收规则。
- Sprint plan 必须包含 Must Deliver、Must Verify、Supporting、Backlog 分类；计划/拆分预算超过 10%-15% 时转入 Must Deliver。
- Supporting 和 quick check 不得抢占关键路径；预计 < 1 小时或 < 10k token 的 smoke/schema/report/check 合并为验收步骤。
- 每级 `plan.md` 必须包含直接下级分解清单、关键路径和 Mermaid 前序依赖图；E 级画 Sprint 关系，S 级画 Task 关系，T 级画内部子步骤关系。
- 下级清单状态必须使用中文：未开始、执行中、阻塞、已实现、已验证、已完成、搁置；状态变化必须在对应父级 `plan.md` 的直接下级行同步。
- `sprint-plan` 明确要求加载 `.fpg/references/iteration-governance.md`，并能生成 Epic/Sprint/Task 分解与指标表。
- `sprint-develop` 明确要求加载 `.fpg/references/iteration-governance.md`，并在 Task 启动/结束时更新对应 `plan.md`。
- `project-qa` 能按该规范记录独立验收证据、golden case 和测试缺口。
- 所有相关 `SKILL.md` 正文仍 < 500 行，frontmatter 含 `name` 与 `description`，引用只下钻一层且路径有效。
- 不新增独立迭代治理 Skill，不新增同级 `INDEX.md`，不复制状态/token/耗时清单。

## 风险与 Backlog

| 项 | 状态 | 优先级 | 复杂度 | 估计Token | 实际Token | 建议阶段 | 依赖 | 不做的危害 | 验收标准 | 不进当前 Sprint 原因 |
|---|---|---|---|---|---|---|---|---|---|---|
| 自动 token 采集 | 搁置 | P1 | High | 40k-80k | TBD | 后续遥测增强 | 工具 hook 与模型用量可见性 | 手工回填成本高、精度有限 | 能从工具事件或报告中自动聚合 token | 当前先固化字段和流程，避免扩大范围 |
| 自动耗时计算脚本 | 搁置 | P2 | Medium | 20k-40k | TBD | M2 后续 | 稳定的 plan.md 表格格式 | 手工计算容易出错 | 根据开始/结束/等待段生成汇总 | 当前可先人工回填，脚本不是固化规范的前置条件 |
