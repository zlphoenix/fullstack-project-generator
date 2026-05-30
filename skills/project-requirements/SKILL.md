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

> 通用约定与遥测埋点见项目根 `AGENTS.md`；方法论见 `.fpg/references/methodology.md`。

---

## 1. 前置检查（先看产物，判断现状）

- 若当前目录已存在 `docs/PRD.md`：停止并提示
  > "项目已有 PRD，请使用 **project-architecture** 进行架构设计，或告诉我要修改哪些需求。"
- 否则进入访谈。遥测（best-effort，未配置 `FPG_HOME` 则跳过）：
  ```bash
  [ -n "$FPG_HOME" ] && bash "$FPG_HOME/telemetry/emit.sh" --event-type phase_enter \
    --project <项目名kebab> --phase requirements --skill project-requirements
  ```

---

## 2. 需求访谈（一条消息发出 4 个问题）

1. **产品定位**：解决什么问题？目标用户是谁？
2. **核心功能**：列出 3–5 个最重要的功能（这些是 Must-Have）。
3. **平台选择**：需要哪些客户端？（iOS / Android / Web / 仅后台 API）
4. **非功能需求**：用户规模、响应时间、离线支持、第三方集成、安全等。

> 不要臆测缺失信息——不清楚就追问，把假设摆出来再继续（行为准则 §1）。等用户完整回答后再生成。

---

## 3. 生成 PRD

读取模板 `./templates/PRD-template.md`，按规则填充：
- **MoSCoW**：Must(~60%) / Should(~20%) / Could(~15%) / Won't(~5%)。
- **User Story**（每个 Must-Have ≥1 条）满足 INVEST：
  ```
  US-1-001: 作为 <角色>，我希望 <动作>，以便 <收益>
  验收标准（≥3 个场景）：Given <前置> / When <操作> / Then <预期>
  ```
- Story 粒度按"人可一次审查"切；过大则拆分（见 `.fpg/references/methodology.md`）。

输出 `docs/PRD.md`（Write 工具）。

---

## 4. 确认与收尾

向用户呈现 MoSCoW 优先级表 + User Stories 列表审核。确认后：
1. 若项目无 `PROGRESS.md`，创建并填写"当前里程碑/目标/下一步=架构设计"。
2. 遥测：
   ```bash
   [ -n "$FPG_HOME" ] && bash "$FPG_HOME/telemetry/emit.sh" --event-type phase_complete \
     --project <项目名kebab> --phase requirements --skill project-requirements --outcome ok
   ```
3. 提示：
   > "PRD 已生成至 docs/PRD.md。下一步请使用 **project-architecture** 设计架构与 API 契约。"
