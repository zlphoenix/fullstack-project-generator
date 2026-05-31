# GEMINI.md - 项目指令

## 项目概览
**fullstack-project-generator** 是一套 "Skill"（指令集）工具包，旨在引导 AI Agent（如 Claude Code、Codex 和 Gemini CLI）完成复杂全栈项目开发与维护的全生命周期。它强调契约驱动开发、单一职责 Skill 流水线以及集中式遥测，以确保多 Agent 协作的一致性与质量。

- **架构**: 线性的 Skill 流水线：`requirements`（需求）→ `architecture`（架构）→ `scaffold`（脚手架）→ `sprint-plan`（迭代计划）→ `sprint-develop`（开发）→ `qa`（质量保证）→ `deploy`（部署）。
- **技术栈**: 
  - **项目核心**: Bash, Bun (TypeScript), Python (旧版/脚手架)。
  - **支持目标**: Java (Spring Boot), iOS (SwiftUI), Android (Compose), Web (Next.js)。
- **关键组件**:
  - `skills/`: 各阶段的指令集 (`SKILL.md`)。
  - `telemetry/`: 使用情况跟踪与性能度量（基于 Bun）。
  - `scripts/install.sh`: 用于将 Skill 链接到目标项目的分发工具。
  - `docs/`: 关于方法论（ADRs、路线图）的详尽文档。

## 构建与运行
本项目本身是脚本和指令的集合。主要的可运行组件是遥测（telemetry）子系统。

### 遥测操作 (需要 Bun >= 1.1)
- **运行测试**: `(cd telemetry && bun test)`
- **启动收集器**: `(cd telemetry && bun run collector)`
- **生成报表**: `(cd telemetry && bun run report --format md)`

### 分发与安装
- **安装 Skill**: 使用 `bash scripts/install.sh --project-dir <target_path>` 来链接 Skill 并部署项目模板。
- **预览安装 (Dry Run)**: `bash scripts/install.sh --project-dir <target_path> --dry-run`

## 开发规范
所有贡献和修改必须遵守 `AGENTS.md` 中定义的内核行为准则。

### 核心指令
1.  **先思考再编码**: 显式陈述假设和权衡。如果不确定，在实现前先询问。
2.  **外科手术式改动**: 只修改必要的部分。匹配现有风格，避免"顺手"进行无关的重构。
3.  **简洁优先**: 倾向于最简单的解决方案。避免过度设计或投机性设计。
4.  **目标驱动执行**: 在实现更改前定义成功标准（例如：复现测试）。

### Skill 开发 (SKILL.md)
- **字数限制**: `SKILL.md` 正文必须控制在 500 行以内。深度内容请使用 `references/`。
- **结构**: 必须包含 frontmatter（`name`, `description`），并使用 "前置检查 → 执行 → 状态持久化" 流程。
- **禁止新增 Python**: 所有新脚本应使用 TypeScript (Bun) 或 Shell 编写。现有的 Python 脚本为旧版，计划移除。
- **遥测**: 新的 Skill 或重大更改必须在 `project-template/AGENTS.md` 的遥测跟踪器中登记。

### 仓库结构
- `AGENTS.md`: 所有 AI 工具的单一事实源。
- `CLAUDE.md`: Claude Code 的专属补充。
- `docs/00-决策记录.md`: 了解架构决策 (ADRs) 的必读文档。
- 每个主要目录（如 `skills/`、`telemetry/`）都包含各自的 `AGENTS.md`，提供该目录专属的指令。在子目录工作时，务必先阅读当地的 `AGENTS.md`。
