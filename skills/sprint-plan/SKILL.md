---
name: sprint-plan
description: |
  使用 Scrum 方法论为全栈项目规划 Sprint，生成包含 User Stories、验收标准和任务分解的 Sprint 计划文档。
  当用户需要规划下一阶段开发内容、确定 Sprint 目标、分解功能任务时使用。
  触发场景：「计划Sprint」「这个Sprint做什么」「sprint planning」「下一个迭代」「规划功能」
  「sprint计划」「迭代计划」「backlog」「user stories」「任务分解」「plan sprint」。
  前置条件：docs/PRD.md 必须存在，建议同时有 api/openapi.yaml。
  输出：docs/iteration/epics/E###-*/sprints/S###-*/plan.md（含 Stories、Given/When/Then AC、Task 分解、并行边界、指标字段、API 变更清单）。
---

# sprint-plan — Sprint 迭代计划

**目标：** 从 PRD Backlog 选取本次 Sprint 的 User Stories，生成详细计划。
**方法论依据：** `.fpg/references/methodology.md` 与 `.fpg/references/iteration-governance.md`（始终加载）。

> 以 Sprint 为最小交付周期（项目根 `AGENTS.md`）；通用约定与遥测同。

---

## 1. 前置准备（从产物确定进度）

1. 读 `.fpg/references/methodology.md`、`.fpg/references/iteration-governance.md`、`.fpg/references/epic-termination-contract.md`、`docs/PRD.md`（全部 Story 与优先级）、`api/openapi.yaml`（若有）。
2. 读 `docs/iteration/plan.md`（若有）与 `PROGRESS.md` 确认已交付内容；若项目仍只有 `docs/sprint-N.md`，兼容读取但新计划优先采用 E/S/T 目录结构。
3. **确定编号**：选定或创建 Epic `E###`；在该 Epic 下扫描 `sprints/S###-*` 取最大编号 +1；Task 在 Sprint 内从 `T001` 递增。用户输入 `e1-s2-t5` 这类短编号时，先按 `.fpg/references/iteration-governance.md` 归一化为 `E001/S002/T005`。
4. 遥测（best-effort）：`phase_enter`（phase=sprint_plan，skill=sprint-plan，`--milestone E###/S###`）。

### 1.1 Epic 灵魂拷问闸门（新建/重启 Epic 时必过，答不出即阻塞）

新建或重启一个 Epic 时，进入 Backlog 选取与 Sprint 拆分**之前**，按 `templates/plan-premortem-checklist.md` 逐条回答 7 条灵魂拷问（DoD 现实性、pre-mortem、最硬外部依赖、范围反向定义、最小可证伪切片、证据真实性边界、杀死条件）。

- **每条答案必须是具体产物/事实/路径，不是 yes/no**；任一条只能给 yes/no 或「会想清楚」式回答 → **阻塞**，回到 `project-requirements`/`project-architecture` 澄清，不得开始拆分。
- 第 2 条 pre-mortem 尽量由生成者以外的视角过一遍（独立会话/子 Agent/人）。
- 7 条答案中第 1/3/4/7 条直接写入 Epic `plan.md`「终止契约」区块（见 §3 与 `epic-termination-contract.md`），一次问答同时产出契约。
- 仅在已存在 Epic 下新增 Sprint（非新建/重启 Epic）时，跳过本闸门，但仍按「范围守卫」核对新 Sprint 能追溯到某条 Epic 成功标准。

---

## 2. Backlog 选取

展示未分配 Sprint 的 Story，按 MoSCoW 排序，与用户选定：
- **Sprint 1（MVP）**：1–2 个核心 Must-Have（如：认证 + 1 个主要实体 CRUD）。
- 后续：先完成剩余 Must-Have，再 Should-Have。
- 每条估小/中/大；**> 2 天的先拆分**再入选（粒度按"人可一次审查"）。
- 按 `.fpg/references/iteration-governance.md` 先标出 Must Deliver、Must Verify、Supporting、Backlog；Must Deliver 必须是编码或可运行交付，且排在关键路径最前。
- 计划/拆分/目录准备预算不超过本 Sprint 估计 token 的 10%-15%；超限后停止规划，进入 Must Deliver。

---

## 3. 生成 Sprint 计划文档

按 `.fpg/references/iteration-governance.md` 生成或更新：
- `docs/iteration/plan.md`：Epic 清单与 Epic 级汇总指标。
- `docs/iteration/epics/E###-name/plan.md`：Epic 目标、范围、Sprint 清单、Sprint 关键路径分类、Sprint 依赖图与指标。**新建 Epic 必须按 `epic-termination-contract.md` §2 写入「终止契约」区块**（不可变 DoD 绑定真实用户结果、Sprint/Token 预算上限、退出场景、明确不做 out-of-scope、最硬外部依赖与责任人）；缺契约不得进入 Sprint 拆分。Sprint 清单每行新增「追溯成功标准」列，追溯不到或属 out-of-scope 的 Sprint 不立项。
- `docs/iteration/epics/E###-name/sprints/S###-name/plan.md`：Sprint 计划、Task 清单、Task 关键路径分类、Task 依赖图、并行边界、验收标准与指标。
- 每个 Task 目录：`tasks/T###-name/plan.md`、`worklog.md`、`smoke-report.md`、`evidence/`。

Sprint `plan.md` 填充：
- 元信息（E/S 编号、一句话目标、选定 Story 列表）。
- 每条 Story：描述 + ≥3 个 Given/When/Then 场景 + **Task 分解表**。
- 每个 Task：目标、输入、允许/禁止修改范围、验收标准、估计 token、证据路径。
- **关键路径表**：明确 Must Deliver、Must Verify、Supporting、Backlog；预计 < 1 小时或 < 10k token 的 smoke/schema/report/check 合并为验收步骤，不建完整 Task 目录。
- **依赖与并行甬道图**：用 Mermaid 表示直接下级依赖；Epic `plan.md` 画 Sprint 关系，Sprint `plan.md` 画 Task 关系。清单和图必须表达同一组直接子级。
- **状态初始化**：新建 Epic/Sprint/Task 行时状态为 `未开始`；若明确不进入当前 Sprint/Epic，状态为 `搁置` 并写明原因。所有状态只写对应层级 `plan.md` 的直接下级清单。
- **并行分组（契约驱动）**：标注前置条件——前端∥后端（前置：API 契约确认）；测试仅当只依赖 AC（黑盒）时才独立并行（按上下文隔离，不按角色拆，见 `AGENTS.md`）。
- **指标字段**：创建时间、开始时间、结束时间、主动耗时、等待耗时、估计Token、实际Token、偏差原因、证据。
- **API 变更 / DB 变更**清单。

不要新增同级 `INDEX.md`，不要在多个文件复制同一层级的状态/token/耗时清单。若旧项目需要保留 `docs/sprint-N.md`，只写新 `plan.md` 的链接和迁移说明。

---

## 4. 风险评估与收尾

列出本 Sprint 风险（第三方依赖、新技术点）。然后：
1. 更新 `PROGRESS.md`（当前里程碑=Sprint-N、目标、下一步=开发）。
2. 回填对应 Epic/Sprint `plan.md` 的创建时间、估计 token 与 `未开始` 状态；确认 `docs/iteration/plan.md` 只保留 Epic 汇总。
3. 遥测：`phase_complete`（phase=sprint_plan，`--milestone E###/S###`，`--outcome ok`）。
4. 提示：
   > "Sprint 计划已保存至 docs/iteration/epics/E###-.../sprints/S###-.../plan.md。下一步请使用 **sprint-develop** 实现具体 Task（一次 1 Task × 1 平台/上下文边界）。"
