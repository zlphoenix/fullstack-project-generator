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

**目标：** 从 PRD Backlog 中选取本次 Sprint 的 User Stories，生成详细的 Sprint 计划文档。

**方法论依据：** `../shared/references/methodology.md`（始终加载）

---

## 前置准备

1. 读取 `../shared/references/methodology.md`（Sprint 规划方法论）
2. 读取 `docs/PRD.md`（获取全部 User Stories 和优先级）
3. 读取 `docs/sprint-*.md`（若存在，确定当前 Sprint 编号，自动递增）
4. 读取 `api/openapi.yaml`（若存在，用于识别 API 变更）

**状态读取（project-state MCP）：** 调用 `get_current_phase(project_dir)` — 若返回 `current_sprint > 0`，以该值 +1 作为本次 Sprint 编号（优先于文件系统扫描结果）；`output_dir` 字段即为项目根目录。

**确定 Sprint 编号：** Sprint N = MCP 中 `current_sprint` + 1，首次为 Sprint 1

---

## Step 1：Backlog 选取

展示未分配 Sprint 的 User Stories，按 MoSCoW 排序，询问用户选择：

**Sprint 1 建议（MVP 原则）：**
- 选择 1-2 个核心 Must-Have Stories
- 聚焦：用户认证 + 1 个主要业务实体的 CRUD

**后续 Sprint：**
- 优先完成剩余 Must-Have，再选 Should-Have

每条 Story 预估：小（半天内）/ 中（1-2天）/ 大（需拆分）

> 若 Story 过大（估计 > 2 天），建议拆分后再选入 Sprint。

---

## Step 2：生成 Sprint 计划文档

读取模板：`./templates/sprint-plan-template.md`，填充：

**Sprint 元信息：**
```markdown
Sprint 编号：N
Sprint 目标：[一句话描述本次交付价值]
选定 Stories：[Story ID 列表]
```

**每条 Story 详细展开：**

```markdown
### US-N-001: [Story 名称]
**描述：** 作为 <角色>，我希望 <动作>，以便 <收益>

**验收标准：**
- Given <前置条件> / When <操作> / Then <预期结果>（至少 3 个场景）

**任务分解（并行开发）：**
| 平台 | 任务 | 预估 |
|------|------|------|
| Backend | Controller/Service/Repository 实现 | M |
| iOS | ViewModel + View 实现 | M |
| Android | ViewModel + Composable 实现 | M |
| Web | 页面 + API 调用实现 | S |

**API 变更：**（新增/修改的 endpoint）
**DB 变更：**（新增表或字段）
```

**并行开发说明（依据 API 契约）：**
```
                API Contract (openapi.yaml)
                         |
           +-------------+-------------+
           |             |             |
       Backend       iOS/Android      Web
       Sprint N      Sprint N       Sprint N
```

输出文件：`docs/sprint-N.md`（使用 Write 工具）

---

## Step 3：风险评估与收尾

列出本次 Sprint 的风险项（如：第三方 API 依赖、新技术点）。

**持久化状态（project-state MCP）：** Sprint 计划用户确认后调用：
```json
{
  "phase": "sprint_plan",
  "current_sprint": 1,
  "sprint_stories": { "sprint-1": ["US-1-001", "US-1-002"] }
}
```
（将本次 Sprint 所有 Story ID 写入 `sprint_stories`，供 sprint-develop 通过 `list_open_stories` 读取）

收尾提示：
> "Sprint N 计划已保存至 docs/sprint-N.md。
> 下一步请使用 **sprint-develop** SKILL 开始实现具体功能。"
