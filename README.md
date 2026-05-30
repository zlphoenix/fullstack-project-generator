# fullstack-project-generator

> 一套引导 **AI Agent（Claude Code / Codex 等）协同开发长期维护的复杂全栈项目**的 Skill 集合。
> 用规范、契约、状态与度量弥补模型/Harness 的不足，让多人 + 多 Agent 的开发**更快、更一致、更稳定**。

[![telemetry tests](https://img.shields.io/badge/telemetry-bun%20test-success)](telemetry/) [![docs](https://img.shields.io/badge/docs-中文-blue)](docs/)

---

## 背景与目标

AI 辅助开发的瓶颈已从"模型会不会写代码"转移到"**如何为模型提供恰当的上下文、约束与反馈回路**"。在多人协同的长期项目中，靠口头约定无法保证一致，会出现决策冲突、合并冲突、节奏不齐、质量漂移。

本项目把这些"软约定"固化为**可被工具加载/执行的一等产物**：

- **契约/规范先行** —— 先定 PRD、架构、API 契约，再并行开发，避免前后端不同步与决策冲突。
- **单一职责 Skill 流水线** —— 每个阶段一个 Skill，输入输出清晰，可并行、可接续。
- **跨会话状态** —— `project-state` MCP 持久化阶段/Sprint/Story，跨人跨会话不丢上下文。
- **集中式度量** —— 使用即产生数据，统一收集，用客观指标验证"规范是否真的有效"。

设计依据：[docs/10-AI辅助开发最佳实践研究报告.md](docs/10-AI辅助开发最佳实践研究报告.md)（基于 Anthropic / OpenAI / GitHub / DORA 等公开实践的研究报告）。

---

## 能力总览

线性流水线，每个 Skill 完成后把阶段写入状态服务，下一个 Skill 据此接续：

```
project-requirements → project-architecture → project-scaffold
   → sprint-plan → sprint-develop → project-qa → project-deploy
```

| Skill | 作用 | 输出 |
|---|---|---|
| `project-requirements` | 引导式需求访谈 | `docs/PRD.md`（MoSCoW + User Story + Given/When/Then） |
| `project-architecture` | 架构设计 + 契约生成 | `docs/architecture.md` + `api/openapi.yaml` |
| `project-scaffold` | 多平台脚手架 | 各平台可运行骨架 |
| `sprint-plan` | Sprint 迭代计划 | `docs/sprint-N.md` |
| `sprint-develop` | 功能实现（**1 Story × 1 平台/次**） | 功能代码 + 测试 |
| `project-qa` | 测试金字塔 | 各平台测试文件 |
| `project-deploy` | 容器化 + CI/CD | `docker/` + `.github/workflows/ci.yml` |

**支持平台：** Backend（Spring Boot/Java；TypeScript+Bun 规范规划中）、iOS（SwiftUI）、Android（Compose）、Web（Next.js）。

---

## 快速开始

### 前置依赖
- `python3` + `pip install mcp`（状态服务 `project-state` MCP）
- `bun ≥ 1.1`（仅遥测收集器/报表需要；客户端埋点只需 `curl`）

### 安装（同时配置 Claude Code 与 Codex）

```bash
git clone <repo-url> fullstack-project-generator
cd fullstack-project-generator

# 先预览将要做的更改
bash scripts/install.sh --scope user --tools claude,codex --dry-run

# 确认无误后正式安装（按需替换遥测地址与角色）
bash scripts/install.sh --scope user --tools claude,codex \
  --role dev --telemetry-endpoint https://telemetry.your-team.com
```

安装器会：把各 Skill 软链到 `~/.claude/skills` 与 `~/.codex/skills`、生成可 source 的遥测环境文件、并打印需要并入各工具配置的 MCP 配置块。详见 [分发与部署指南](docs/40-分发与部署指南.md)。

### 验证

```bash
python3 scripts/project_state.py --test     # 期望：✅ 所有测试通过！
(cd telemetry && bun test)                  # 期望：全部 pass
```

---

## 使用方法

在 Claude Code 或 Codex 中，按自然语言触发对应 Skill：

```
你：我想做一个图书商城 App，要 Web 和后台
→ 触发 project-requirements，访谈后生成 docs/PRD.md

你：帮我设计架构并生成 API
→ 触发 project-architecture，生成 architecture.md + openapi.yaml

你：初始化项目 → project-scaffold
你：规划第一个 Sprint → sprint-plan
你：实现用户登录（后台）→ sprint-develop（1 Story × 1 平台）
你：写测试 → project-qa
你：配置 Docker 部署 → project-deploy
```

各 Skill 自动读写 `project-state` 状态，并在关键时机发送遥测事件（best-effort，未配置则跳过）。

---

## 度量与改进

这套 Skill 分发后，成员（研发/产品/测试/运维/PM）**使用即产生度量数据**，由团队自托管的收集器统一汇聚，用于运营报表与持续改进：

```bash
cd telemetry
bun run collector                                  # 启动中心收集器
bun run report --format md                         # 生成报表（返工率/交付时长/AC 通过率…）
```

核心指标与"AI 生产力悖论"警示见 [度量指南](docs/30-度量指南.md)。遥测架构见 [telemetry/README.md](telemetry/README.md)。
> 度量用于发现瓶颈与验证规范有效性，**不作个人绩效考核**；只采流程元数据，不采代码/PII。

---

## 目录结构

```
skills/<name>/        各阶段 Skill（SKILL.md + templates/ + references/ + scripts/）
skills/shared/        跨 Skill 共享：方法论、平台指南、遥测埋点说明
scripts/              project_state.py（MCP）、install.sh（跨工具安装）
telemetry/            集中式遥测：emit.sh + collector(Bun) + report(Bun)
docs/                 治理/研究/规划/度量/分发文档（编号+中文名，见 docs/AGENTS.md）
AGENTS.md             面向所有 AI 工具的单一事实源
CLAUDE.md             Claude Code 专属补充
```

> 本项目自身遵循 AI Agent 项目规范：决策见 [docs/00-决策记录.md](docs/00-决策记录.md)，里程碑见 [docs/01-里程碑与验收标准.md](docs/01-里程碑与验收标准.md)；`skills/`、`scripts/`、`telemetry/`、`docs/` 各有 `AGENTS.md`。

---

## 贡献

欢迎贡献新 Skill、平台指南、模板与改进。请先读 [CONTRIBUTING.md](CONTRIBUTING.md)（含 Skill 编写规范、评估先行、提交前校验）。

## 路线图

当前为 **M1（基座）**：跨工具落地 + 集中式遥测 + 文档分发。后续里程碑见 [docs/20-改进计划.md](docs/20-改进计划.md)：
- **M2**：运行时强制（hooks/CI 门禁、契约一致性校验）、长程 Harness 工件、修复脚手架缺陷。
- **M3**：TypeScript+Bun 后端栈、多项目/多环境隔离、运行时可观测/HA。

## 许可

见仓库 LICENSE（如适用）。
