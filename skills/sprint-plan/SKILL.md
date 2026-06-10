---
name: sprint-plan
description: |
  使用 Scrum 方法论为全栈项目规划 Sprint，生成包含 User Stories、验收标准和任务分解的 Sprint 计划文档。
  当用户需要规划下一阶段开发内容、确定 Sprint 目标、分解功能任务时使用。
  触发场景：「计划Sprint」「这个Sprint做什么」「sprint planning」「下一个迭代」「规划功能」
  「sprint计划」「迭代计划」「backlog」「user stories」「任务分解」「plan sprint」。
  前置条件：docs/PRD.md 必须存在，建议同时有 api/openapi.yaml。
  输出：docs/iteration/epics/E###-*/sprints/S###-*/plan.md（含 Stories、Given/When/Then AC、Task 分解、并行边界、API 变更清单）。
---

# sprint-plan — Sprint 迭代计划

**目标：** 从 PRD Backlog 选取本次 Sprint 的 User Stories，生成详细计划。
**治理依据：** `.fpg/references/iteration-governance.md`（规划期加载全文；执行期各 Skill 只用执行卡）。方法论见 `.fpg/references/methodology.md`。

---

## 1. 前置准备（从产物确定进度）

1. 读 `.fpg/references/iteration-governance.md`、`.fpg/references/methodology.md`、`docs/PRD.md`（全部 Story 与优先级）、`api/openapi.yaml`（若有）。
2. 读 `docs/iteration/plan.md`（若有）与 `PROGRESS.md` 确认已交付内容；旧项目兼容 `docs/sprint-N.md`，新计划优先 E/S/T 结构。
3. **确定编号**：选定或创建 Epic `E###`；在该 Epic 下扫描 `sprints/S###-*` 取最大编号 +1。短编号输入（`e1-s2-t5`）按治理规范归一化。
4. 写归因标记（token/耗时由 hook 自动采集，不手工估算）：
   ```bash
   mkdir -p .fpg && printf 'epic=E###\nsprint=S###\nskill=sprint-plan\nphase=sprint_plan\n' > .fpg/current-task
   ```

### 1.1 Epic 灵魂拷问闸门（新建/重启 Epic 时必过，答不出即阻塞）

进入 Backlog 选取与 Sprint 拆分**之前**，按 `templates/plan-premortem-checklist.md` 逐条回答 7 条灵魂拷问（DoD 现实性、pre-mortem、最硬外部依赖、范围反向定义、最小可证伪切片、证据真实性边界、杀死条件）。

- **每条答案必须是具体产物/事实/路径，不是 yes/no**；任一条只能给 yes/no 或「会想清楚」式回答 → **阻塞**，回到 `project-requirements`/`project-architecture` 澄清。
- 第 2 条 pre-mortem 尽量由生成者以外的视角过一遍（独立会话/子 Agent/人）。
- 第 1/3/4/7 条答案直接写入 Epic `plan.md`「终止契约」区块（治理规范 §9）；一次问答同时产出契约。
- 仅在已存在 Epic 下新增 Sprint 时跳过本闸门，但仍按「范围守卫」核对新 Sprint 能追溯到某条 Epic 成功标准。

**过闸门后立即判定「结构决策」（治理规范 §10 深度闸门）**：数本 Epic 的独立退出场景 → 决定**扁平**（<2 个独立验证里程碑，Epic plan 直接挂执行切片）还是 **Epic + N Sprint**（1 Sprint==1 独立退出场景）。写入 Epic `plan.md`「结构决策」一行并冻结；执行期不再判层数，改深度须 re-baseline。警惕碎片化：薄 Sprint 不立项；可搁置的独立交付物优先拆独立 Epic。

---

## 2. Backlog 选取

展示未分配 Sprint 的 Story，按 MoSCoW 排序，与用户选定：

- **Sprint 1（MVP）**：1–2 个核心 Must-Have（如：认证 + 1 个主要实体 CRUD）；后续先完成剩余 Must-Have，再 Should-Have。
- 每条估小/中/大；过大的先拆分（粒度按"人可一次审查"）。
- 标出 Must Deliver、Must Verify、Supporting、Backlog（治理规范 §6）；Must Deliver 必须是编码或可运行交付，排关键路径最前。
- **粒度从粗**：每 Sprint Task 数 ≤ 4（含验证）；Task 默认是清单行不建目录；同一上下文边界的多个小步骤合成一个 Task，别按"契约/路由/desktop/cloud/gate"机械拆。
- 规划/拆分开销不超过本 Sprint 预算的 10–15%；超限停止规划，进入 Must Deliver。

---

## 3. 生成 Sprint 计划文档

按治理规范生成或更新（目录结构见 §2，单一真源见 §3）：

- `docs/iteration/plan.md`：Epic 清单。
- `E###/plan.md`：Epic 目标、范围、**终止契约**（§9，缺契约不得进入 Sprint 拆分）、**结构决策**、Sprint 清单（含「追溯成功标准」列）、Sprint 依赖图。**Token 预算上限写在终止契约里**（熔断输入；实际消耗看遥测看板，不手工记账）。
- `S###/plan.md`：Sprint 目标、选定 Story（每条 ≥3 个 Given/When/Then 场景）、Task 清单（`| ID | 名称 | 分类 | 前置 | 可并行 | 状态 | 证据 |`，每 Task 写明目标、允许/禁止修改范围、验收标准）、Task 依赖图（Mermaid）、并行边界（前置条件、合并点、冲突文件、总账负责人）、API/DB 变更清单。
- Sprint 目录：`worklog.md`、`smoke-report.md`、`evidence/`（每 Sprint 各一份）。
- 状态初始化为 `未开始`；不进入当前 Sprint 的标 `搁置` 并写原因。
- 不新增 `INDEX.md`，不在多个文件复制同一层级状态。

---

## 4. 校验与收尾

1. **机械校验**：对新建/更新的每级 plan.md 跑 `bash .fpg/bin/fpg-check.sh plan-lint <plan.md>`，输出非 OK 先修复。
2. 列出本 Sprint 风险（第三方依赖、新技术点）。
3. 更新 `PROGRESS.md`（当前 Sprint、目标、下一步=开发）；删除归因标记 `rm -f .fpg/current-task`。
4. 提示：
   > "Sprint 计划已保存至 docs/iteration/epics/E###-.../sprints/S###-.../plan.md。下一步请使用 **sprint-develop** 实现（一次 1 个上下文切片，可含同边界多个清单 Task）。"
