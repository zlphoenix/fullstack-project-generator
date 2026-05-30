# AGENTS.md — skills/ 目录指引

> 指导 AI Agent 在 `skills/` 目录的工作。根级规范见 [../AGENTS.md](../AGENTS.md)（单一事实源）。

## 目录作用与目标
存放构成开发流水线的 **Skill**。每个 `skills/<name>/` 是一个独立、单一职责的 Skill，由 Claude Code / Codex 在触发时加载执行。目标：让"需求 → 架构 → 脚手架 → 计划 → 开发 → 测试 → 部署"各阶段可被 Agent 一致、可接续地执行。

```
skills/<name>/
  SKILL.md       # 指令文件（被工具加载）；以"前置检查"开头、"write_project_state"结尾
  templates/     # 复制进用户项目的模板
  references/    # 执行时按需读取（不复制进用户项目）
  scripts/       # Skill 调用的脚本
skills/shared/references/   # 跨 Skill 共享：methodology.md、各平台 guide、telemetry-points.md
```

流水线顺序：`project-requirements → project-architecture → project-scaffold → sprint-plan → sprint-develop → project-qa → project-deploy`。

## 在此目录工作的规范（编写/修改 Skill）
遵循 Anthropic/OpenAI 的 Skill 最佳实践（详见 [../CONTRIBUTING.md](../CONTRIBUTING.md)）：
- **frontmatter** 必含 `name`（小写+连字符，不含保留字）与 `description`（第三人称，写清做什么+何时用+触发词）。
- **渐进式披露**：`SKILL.md` 正文 **< 500 行**；细节拆到 `references/`，引用**只下钻一层**；>100 行参考带目录。
- **结构**：以"前置检查（读 `project-state` MCP）"开始，以"`write_project_state` 持久化"结束。
- **范围**：`sprint-develop` 严格 **1 Story × 1 平台**。
- **遥测**：在关键时机调用 `$FPG_HOME/telemetry/emit.sh`（best-effort），并在 `shared/references/telemetry-points.md` 登记埋点。
- **方法论**：保留 Sprint 迭代模式（[ADR-009](../docs/00-决策记录.md)）；多 Agent **按上下文拆分，不按角色**（[ADR-008](../docs/00-决策记录.md)）。
- **脚本**：仅用 Python/TypeScript(Bun)/shell；显式错误处理；无魔数；路径用正斜杠。
- **改完自检**：正文行数、frontmatter、引用层级、路径有效性。
