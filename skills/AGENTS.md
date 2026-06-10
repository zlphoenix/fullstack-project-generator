# AGENTS.md — skills/ 目录指引

> 指导 AI Agent 在 `skills/` 目录的工作。根级规范见 [../AGENTS.md](../AGENTS.md)（单一事实源）。

## 目录作用与目标
存放构成开发流水线的 **Skill**。每个 `skills/<name>/` 是独立、**自包含**、单一职责的 Skill，由 Claude Code / Codex 触发时加载执行。

```
skills/<name>/
  SKILL.md       # 指令文件（< 500 行）；前置检查从产物判断进度、收尾更新产物 + 发遥测
  references/    # 仅本 Skill 专属参考
  templates/     # 复制进用户项目的模板
  scripts/       # 本 Skill 调用的脚本（init/contract 仍为 Python，M2 移植，见 ADR-014）
```

流水线：`project-requirements → project-architecture → project-scaffold → sprint-plan → sprint-develop → project-qa → project-deploy`。

**通用内容不在这里**（[ADR-015](../docs/00-决策记录.md)）：所有 Skill 通用的约定在**目标项目 `AGENTS.md`**（由 `project-template/` 部署）；平台指南/方法论/API 设计是**项目级公共参考**，Skill 以 `.fpg/references/<file>.md` 引用。

## 在此目录工作的规范（编写/修改 Skill）
遵循 Anthropic/OpenAI 的 Skill 最佳实践（详见 [../CONTRIBUTING.md](../CONTRIBUTING.md)）：
- **frontmatter** 必含 `name`（小写+连字符，不含保留字）与 `description`（第三人称，做什么+何时用+触发词）。
- **渐进式披露**：`SKILL.md` 正文 **< 500 行**；专属细节拆到 `references/`，引用**只下钻一层**。
- **无 MCP / 无状态文件**（[ADR-013](../docs/00-决策记录.md)）：前置检查从**项目产物**（PRD/sprint/PROGRESS/git）判断进度；收尾**更新产物 + `PROGRESS.md`**，不写 `.project-state.json`。
- **范围**：`sprint-develop` 每次 **1 个上下文切片＝1 平台/上下文边界**（可含同边界多个清单 Task）；Story 是需求粒度，Task 是执行粒度。
- **治理分层披露**：规划期 Skill（sprint-plan）加载 `iteration-governance.md` 全文；执行期 Skill（sprint-develop/project-qa）只加载 `execution-card.md`；硬规则交 `.fpg/bin/fpg-check.sh` 机械校验，**不要在 SKILL 正文内联复述治理条文**。
- **遥测**：测量值（token/耗时）由工具 hook 自动采集，SKILL **不估算、不回填**，只负责写/删 `.fpg/current-task` 归因标记；业务里程碑事件仍可调 `$FPG_HOME/telemetry/emit.sh`（best-effort）；字段见 `telemetry/schema.md`。
- **多 Agent**：按上下文拆分、不按角色；生成者≠评估者（[ADR-008](../docs/00-决策记录.md)）。
- **脚本**：M1 客户端仅 shell+curl；不再引入 Python（现存 init/contract 待 M2 移植）；路径正斜杠、显式错误处理、无魔数。
- **改完自检**：行数、frontmatter、引用层级、路径有效性、无 MCP/Python 残留。
