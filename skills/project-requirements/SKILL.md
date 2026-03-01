---
name: project-requirements
description: |
  通过引导式访谈收集需求，生成结构化的产品需求文档（PRD.md）。
  当用户想要开始一个全新项目、有 App 想法需要梳理、需要写 PRD 或定义 User Stories 时使用。
  触发场景：「我想做一个...」「帮我分析需求」「写PRD」「新项目」「app idea」「需求整理」
  「new project」「requirements」「product requirements」。
  输出：docs/PRD.md（含 MoSCoW 优先级 + User Stories + Given/When/Then 验收标准）。
  如果项目已有 docs/PRD.md，请改用 project-architecture SKILL。
  支持平台：iOS、Android、Web (Next.js)、后台 (Spring Boot)。
---

# project-requirements — 需求分析与 PRD 生成

**目标：** 通过 4 个聚焦问题完成需求访谈，生成规范的产品需求文档。

---

## 前置检查

如果当前目录已存在 `docs/PRD.md`，停止并提示用户：
> "项目已有 PRD 文档，请使用 **project-architecture** SKILL 进行架构设计，或直接告诉我需要修改哪些需求。"

---

## Step 1：需求访谈（单次提问，4 个问题同时发出）

在一条消息中向用户提出以下问题：

1. **产品定位**：这个产品解决什么问题？目标用户是谁？
2. **核心功能**：列出 3-5 个最重要的功能（这些是 Must-Have）
3. **平台选择**：需要哪些客户端？（iOS / Android / Web / 仅后台 API）
4. **非功能需求**：有哪些特殊要求？（如：用户规模、响应时间、离线支持、第三方集成）

等待用户完整回答后再进入 Step 2。

---

## Step 2：生成 PRD

读取模板：`../../assets/docs-templates/PRD-template.md`，按以下规则填充：

**MoSCoW 分配原则：**
- Must Have（~60%）：用户明确说的核心功能
- Should Have（~20%）：对体验重要但非核心
- Could Have（~15%）：锦上添花
- Won't Have（~5%）：明确排除

**User Story 格式（每个 Must-Have 功能至少 1 条）：**
```
US-1-001: 作为 <角色>，我希望 <动作>，以便 <收益>
验收标准：
  Given <前置条件>
  When <操作>
  Then <预期结果>
```

**User Story 规模原则（参考 methodology.md）：**
- 每条 Story 应能在 1 个 Sprint 内完成
- 若功能过大，拆分为多条 Story

输出文件：`docs/PRD.md`（使用 Write 工具创建）

---

## Step 3：确认与收尾

将 PRD 关键内容呈现给用户审核：
- 功能优先级表（MoSCoW）
- User Stories 列表

确认无误后提示：
> "PRD 已生成至 docs/PRD.md。下一步请使用 **project-architecture** SKILL 进行架构设计。"

---

## 参考文档

如用户询问 User Story 格式或 Sprint 规划：读取 `../../references/methodology.md`
