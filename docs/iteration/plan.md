# 迭代 Epic 总计划

> 本文件是 `docs/iteration/` 下所有 Epic 的唯一清单与指标真源。每个 Epic 的详细计划在 `epics/<Epic-ID>/plan.md`，本文件只记录 Epic 级汇总，不复制 Sprint 或 Task 明细。

## Epic 清单与指标

| ID | 名称 | 目标 | 状态 | 创建时间 | 开始时间 | 结束时间 | 主动耗时 | 等待耗时 | 估计Token | 实际Token | 偏差原因 | 证据 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| E001 | 迭代治理与并行任务规范固化 | 将 E/S/T 层级、plan.md 唯一真源、中文状态、关键路径、依赖图、耗时/token 度量和并行边界固化进 Skill | 已完成 | 2026-06-03 | 2026-06-03 15:00 CST | 2026-06-04 16:06 CST | 28m | 0m | 113k-205k | ~95k | 追加合入 industry Sprint 4 复盘规则、plan 依赖图要求和中文状态流转；未实现自动 token 采集 | [plan](epics/E001-iteration-governance/plan.md) |

## 汇总指标

| 指标 | 值 |
|---|---|
| Epic 总数 | 1 |
| 已完成 | 1 |
| 执行中 | 0 |
| 未开始 | 0 |
| 搁置 | 0 |
| 总主动耗时 | 28m |
| 总等待耗时 | 0m |
| 总估计Token | 113k-205k |
| 总实际Token | ~95k |

## 规则

- 新增 Epic 时，只在本文件新增一行 Epic 汇总，并创建 `epics/E###-name/plan.md`。
- Epic 启动和结束时，只更新本文件的 Epic 行和汇总指标。
- Sprint 与 Task 明细只写对应 Epic 或 Sprint 的 `plan.md`，不得复制到本文件。
