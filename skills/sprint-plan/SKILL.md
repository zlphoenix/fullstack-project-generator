---
name: sprint-plan
description: |
  使用 Scrum 方法论为全栈项目规划 Sprint，生成包含 User Stories、验收标准和任务分解的 Sprint 计划文档。
  当用户需要规划下一阶段开发内容、确定 Sprint 目标、分解功能任务时使用。
  触发场景：「计划Sprint」「这个Sprint做什么」「sprint planning」「下一个迭代」「规划功能」
  「sprint计划」「迭代计划」「backlog」「user stories」「任务分解」「plan sprint」。
  前置条件：docs/PRD.md 必须存在，建议同时有 api/openapi.yaml。
  输出：docs/sprint-N.md（含 Stories、Given/When/Then AC、多平台任务分解、API 变更清单）。
---

# sprint-plan — Sprint 迭代计划

**目标：** 从 PRD Backlog 选取本次 Sprint 的 User Stories，生成详细计划。
**方法论依据：** `.fpg/references/methodology.md`（始终加载）。

> 以 Sprint 为最小交付周期（项目根 `AGENTS.md`）；通用约定与遥测同。

---

## 1. 前置准备（从产物确定进度）

1. 读 `.fpg/references/methodology.md`、`docs/PRD.md`（全部 Story 与优先级）、`api/openapi.yaml`（若有）。
2. **确定 Sprint 编号**：扫描 `docs/sprint-*.md`，取最大编号 +1（无则为 1）；并读 `PROGRESS.md` 确认已交付内容。
3. 遥测（best-effort）：`phase_enter`（phase=sprint_plan，skill=sprint-plan，`--milestone Sprint-N`）。

---

## 2. Backlog 选取

展示未分配 Sprint 的 Story，按 MoSCoW 排序，与用户选定：
- **Sprint 1（MVP）**：1–2 个核心 Must-Have（如：认证 + 1 个主要实体 CRUD）。
- 后续：先完成剩余 Must-Have，再 Should-Have。
- 每条估小/中/大；**> 2 天的先拆分**再入选（粒度按"人可一次审查"）。

---

## 3. 生成 Sprint 计划文档

读取 `./templates/sprint-plan-template.md`，填充：
- 元信息（编号、一句话目标、选定 Story 列表）。
- 每条 Story：描述 + ≥3 个 Given/When/Then 场景 + **任务分解表**。
- **并行分组（契约驱动）**：标注前置条件——前端∥后端（前置：API 契约确认）；测试仅当只依赖 AC（黑盒）时才独立并行（按上下文隔离，不按角色拆，见 `AGENTS.md`）。
- **API 变更 / DB 变更**清单。

输出 `docs/sprint-N.md`（Write 工具）。

---

## 4. 风险评估与收尾

列出本 Sprint 风险（第三方依赖、新技术点）。然后：
1. 更新 `PROGRESS.md`（当前里程碑=Sprint-N、目标、下一步=开发）。
2. 遥测：`phase_complete`（phase=sprint_plan，`--milestone Sprint-N`，`--outcome ok`）。
3. 提示：
   > "Sprint N 计划已保存至 docs/sprint-N.md。下一步请使用 **sprint-develop** 实现具体功能（一次 1 Story × 1 平台）。"
