# AGENTS.md

> **本文件是面向所有 AI 编码工具的单一事实源（single source of truth）。**
> Claude Code 与 Codex（以及 Cursor / Copilot / Aider 等支持 AGENTS.md 的工具）都应读取本文件。
> `CLAUDE.md` 仅保留 Claude Code 专属补充并指回本文件，避免重复与漂移。

## 这个仓库是什么

一套引导 **AI 辅助全栈团队开发**（从空白到生产）的 **Skill 集合**。每个 Skill 是 `skills/<name>/SKILL.md`，由 AI 编码工具在触发时加载并执行。仓库本身**没有应用代码**，只有 Skill、脚本、模板、参考文档与遥测子系统。

设计理念与依据见 `docs/10-AI辅助开发最佳实践研究报告.md`（研究报告）与 `docs/20-改进计划.md`（改进计划）。

## 仓库结构

```
skills/<name>/SKILL.md      # 各阶段 Skill（被工具加载执行）
skills/<name>/templates/    # 复制进用户项目的模板
skills/<name>/scripts/      # Skill 调用的脚本
skills/<name>/references/   # 执行时按需读取的参考（不复制）
skills/shared/references/   # 跨 Skill 共享：方法论、平台指南、遥测埋点
scripts/project_state.py    # project-state MCP（跨会话状态，Python FastMCP stdio）
scripts/install.sh          # 跨工具安装（Claude Code + Codex）
telemetry/                  # 集中式遥测：emit.sh → collector(Bun) → report(Bun)
docs/                       # 治理(决策/里程碑)、研究、规划、度量、分发、归档（编号+中文名）
```

> **本项目自身遵循 AI Agent 项目规范**（[ADR-010](docs/00-决策记录.md)）：所有关键决策落地到 `docs/00-决策记录.md`；**每个主要目录都有 `AGENTS.md`**（`skills/`、`scripts/`、`telemetry/`、`docs/`）指引该目录的作用与规范——在某目录工作时先读其 `AGENTS.md`。里程碑与验收标准见 `docs/01-里程碑与验收标准.md`。

## Skill 流水线

线性阶段，每个 Skill 完成时把阶段写入 `project-state` MCP，下一个 Skill 据此接续：

```
project-requirements → project-architecture → project-scaffold
  → sprint-plan → sprint-develop → project-qa → project-deploy
```

| Skill | 输出 | 触发示例 |
|---|---|---|
| project-requirements | docs/PRD.md | "我想做一个电商App" |
| project-architecture | docs/architecture.md + api/openapi.yaml | "设计架构 / 生成API" |
| project-scaffold | 各平台项目骨架 | "初始化项目 / scaffold" |
| sprint-plan | docs/sprint-N.md | "规划第一个Sprint" |
| sprint-develop | 功能代码（每次 1 Story × 1 平台） | "实现用户登录" |
| project-qa | 各平台测试文件 | "写测试策略" |
| project-deploy | docker/ + .github/workflows/ci.yml | "配置Docker部署" |

## 常用命令

```bash
# 验证 MCP 状态服务
python3 scripts/project_state.py --test          # 期望：✅ 所有测试通过！

# 遥测子系统（需要 Bun ≥ 1.1）
cd telemetry && bun test                          # 单元测试
cd telemetry && bun run collector                 # 启动中心收集器
cd telemetry && bun run report --format md        # 生成运营报表

# 跨工具安装（详见 docs/40-分发与部署指南.md）
bash scripts/install.sh --scope user --tools claude,codex --dry-run
```

## 跨工具说明

- **Claude Code**：从 `~/.claude/skills/`（用户级）或项目 `.claude/skills/` 发现 Skill；MCP 配置在 `.claude/settings.local.json`；启动入口 `CLAUDE.md`。
- **Codex**：从 `~/.codex/skills/` 发现 Skill；MCP 配置在 `~/.codex/config.toml`；自动读取本 `AGENTS.md`。
- 两者都通过 `scripts/install.sh` 统一配置。Skill 与 MCP 均为跨工具标准（`SKILL.md` + stdio MCP）。
- 路径引用以 `$FPG_HOME`（仓库根，由 install.sh 设置）为准；**分发时必须保留完整目录结构**，不可只复制 `skills/` 子目录。

## 验证流程（改动后必跑）

1. `python3 scripts/project_state.py --test` 通过。
2. `cd telemetry && bun test` 通过。
3. 改了某个 SKILL.md：确认正文 < 500 行、frontmatter 含 `name`+`description`、引用只下钻一层、无失效路径。
4. 改了脚本：自带或更新对应测试。

---

# 行为准则（降低常见 LLM 编码错误）

**权衡：** 这些准则偏向谨慎而非速度。琐碎任务请用判断力裁剪。

## 1. 先思考再编码
**不要臆测。不要掩盖困惑。把权衡摆出来。**
- 显式陈述假设；不确定就问。
- 存在多种解读时，列出来——不要默默选一个。
- 有更简单的方案就说出来，必要时反驳。
- 有不清楚的地方就停下，指出困惑点，提问。

## 2. 简洁优先
**用解决问题的最少代码，不做投机性设计。**
- 不加未被要求的功能、抽象、"灵活性"。
- 不为不可能的场景写错误处理。
- 200 行能压到 50 行就重写。
- 自问："资深工程师会不会觉得这过度设计了？"是则简化。

## 3. 外科手术式改动
**只动必须动的；只清理自己造成的混乱。**
- 不"顺手改进"相邻代码/注释/格式；不重构没坏的东西。
- 匹配现有风格，即使你有别的偏好。
- 发现无关死代码：指出，别删（除非被要求）。
- 你的改动产生的孤儿（未用 import/变量/函数）要清掉。
- 检验标准：每一行改动都能直接追溯到用户的需求。

## 4. 目标驱动执行
**定义成功标准，循环到验证通过。**
- "加校验" → "为非法输入写测试，再让它通过"。
- "修 bug" → "写一个复现测试，再让它通过"。
- 多步任务先给简短计划：`1. [步骤] → 验证：[检查]`。
- 强成功标准让你能独立循环；弱标准（"让它能用"）会导致反复澄清。

---

**这些准则生效的标志：** diff 里无谓改动更少、因过度设计导致的重写更少、澄清性提问出现在实现之前而非犯错之后。
