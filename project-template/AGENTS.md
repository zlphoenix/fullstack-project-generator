# AGENTS.md（项目级 · 由 fullstack-project-generator 部署）

> 本文件是**本项目所有 AI 编码工具（Claude Code / Codex 等）与所有 SKILL 都假定遵守的通用约定**。
> 由 `fullstack-project-generator` 的 `install.sh` 部署进项目根目录。平台/方法论等参考见 `.fpg/references/`。
> 项目专属约定请在本文件内补充；**所有 SKILL 通用的条目都应集中在这里统一维护**。

## 0. 本项目怎么运作
- **迭代模式**：以 **Sprint** 为最小交付周期；每个迭代结束做回顾，用遥测观测指标评估并持续改进。
- **迭代治理**：采用 **Epic(E) → Sprint(S) → Task(T)**；每级 `plan.md` 是唯一计划、直接子项清单、状态与耗时/token 指标真源，详见 `.fpg/references/iteration-governance.md`。
- **契约先行**：先定 PRD → 架构 → API 契约（`api/openapi.yaml`），再并行开发；契约锁定后前后端/多端可并行。
- **进展从产物派生（无状态文件、无 MCP）**：当前进展由项目真实产物判断——`docs/PRD.md`、`docs/iteration/**/plan.md`、`PROGRESS.md`、`git log`；旧项目兼容 `docs/sprint-N.md`。**新会话/新成员开始前，先读这些产物确定"做到哪了"。**

## 1. 行为准则（降低常见 LLM 编码错误）
1. **先思考再编码**：不臆测、不掩盖困惑；多解读时列出来再选；不清楚就停下提问。
2. **简洁优先**：解决问题的最少代码，不做投机性抽象/配置；过度设计就重写。
3. **外科手术式改动**：只动必须动的；匹配现有风格；不顺手重构没坏的东西；清理自己产生的孤儿代码。
4. **目标驱动**：把任务转成可验证目标（"写复现测试→令其通过"），循环到验证通过。

## 2. 多 Agent 与验收（重要）
- **按可隔离的上下文拆分，绝不按角色/工作类型拆分**；先单 Agent，多 Agent 成本 3–10x，仅在"上下文污染/可并行/需专精"且有据时才上。
  - ✅ 前端 ∥ 后端（API 契约隔离）；❌ 同一 Story 的代码与其紧耦合测试。
- **生成者 ≠ 评估者**：验收/回归尽量在**独立上下文**进行（独立会话/子 Agent 或人），默认"怀疑"，用实际运行而非静态走查。
- **分层验收**：①自动验证（编译/测试/lint）②功能验收 ③代码审查（架构/安全/可维护）。

## 3. 需求与拆分
- User Story 满足 INVEST；验收标准用 Given/When/Then；优先级用 MoSCoW（Must ~60%）。
- Story 粒度按"人可一次审查"切；执行粒度按 Task 管理。
- 方法论细节见 `.fpg/references/methodology.md`。
- Sprint 执行粒度按 Task 管理；开发一次 1 Task × 1 平台/上下文边界，Task 的过程记录和验收证据写入自己的目录。

## 4. 技术栈与平台规范
| 平台 | 规范参考 |
|---|---|
| 后端 Java/Spring | `.fpg/references/backend-guide.md` |
| Web (Next.js/TS) | `.fpg/references/web-guide.md` |
| iOS (SwiftUI) | `.fpg/references/ios-guide.md` |
| Android (Compose) | `.fpg/references/android-guide.md` |
| API 设计 | `.fpg/references/api-design.md` |
| 迭代治理 | `.fpg/references/iteration-governance.md` |

> 实现必须与 `api/openapi.yaml` 契约一致；契约变更先改契约、记 CHANGELOG，再改代码。

## 5. 遥测埋点（统一观测，best-effort）
> 让流程数据被统一收集用于运营报表与改进（详见生成器仓库 `telemetry/`）。**绝不阻断开发**：未配置/离线/禁用都安全跳过。

仅当环境变量 `FPG_HOME` 存在时调用埋点（否则跳过，不报错）：

```bash
[ -n "$FPG_HOME" ] && bash "$FPG_HOME/telemetry/emit.sh" \
  --event-type <type> --project <project_id> --milestone <如 Sprint-3> \
  --skill <skill-name> --phase <phase> \
  --outcome <ok|fail|skip>          # 可选
  --attrs '{"story":"US-1-001","platform":"backend"}'   # 可选, 合法 JSON
```

`actor_role`/`tool` 由环境变量（`FPG_ACTOR_ROLE`/`FPG_TOOL`，由 install.sh 配置）自动带上，无需在命令里传。
事件类型与字段见生成器仓库 `telemetry/schema.md`。各 SKILL 推荐埋点点：

| SKILL | 开始 | 完成 |
|---|---|---|
| project-requirements | `phase_enter`(requirements) | `phase_complete` |
| project-architecture | `phase_enter`(architecture) | `phase_complete`；契约生成 `contract_change` |
| project-scaffold | `phase_enter`(scaffold) | `phase_complete` |
| sprint-plan | `phase_enter`(sprint_plan) | `phase_complete` |
| sprint-develop | `story_start`；重开已完成 Story 则 `story_reopen` | `story_complete`；验收 `verification`(kind=ac/compile/test) |
| project-qa | `phase_enter`(qa) | `phase_complete`；测试结果 `verification`(kind=test) |
| project-deploy | `phase_enter`(deploy) | `phase_complete` |

> 隐私：只采流程元数据，不采代码/PII；可 `FPG_TELEMETRY_DISABLED=1` 关闭。度量用于改进，不作个人考核。

## 6. 进度文件 PROGRESS.md
长程开发用 `PROGRESS.md` 做结构化笔记：记录已完成功能、当前进行项、未决问题、下一步。新会话先读它 + 最新 E/S/T `plan.md` + 跑端到端冒烟，再开始新功能。
