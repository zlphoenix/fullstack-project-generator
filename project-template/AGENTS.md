# AGENTS.md（项目级 · 由 fullstack-project-generator 部署）

> 本文件是**本项目所有 AI 编码工具（Claude Code / Codex 等）与所有 SKILL 都假定遵守的通用约定**。
> 由 `fullstack-project-generator` 的 `install.sh` 部署进项目根目录。平台/方法论等参考见 `.fpg/references/`。
> 项目专属约定请在本文件内补充；**所有 SKILL 通用的条目都应集中在这里统一维护**。

## 0. 本项目怎么运作
- **迭代模式**：以 **Sprint** 为最小交付周期；每个迭代结束做回顾，用遥测观测指标评估并持续改进。
- **迭代治理**：采用 **Epic(E) → Sprint(S) → Task(T)**；每级 `plan.md` 是唯一计划、直接子项清单与状态真源。**规划期**读 `.fpg/references/iteration-governance.md` 全文；**执行期**只读 `.fpg/references/execution-card.md`（执行卡）；硬规则由 `.fpg/bin/fpg-check.sh` 机械校验。
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
- Story 粒度按"人可一次审查"切；执行按上下文切片：一次 1 个平台/上下文边界（可含同边界多个清单 Task）。
- 方法论细节见 `.fpg/references/methodology.md`。

## 4. 技术栈与平台规范
| 平台 | 规范参考 |
|---|---|
| 后端 Java/Spring | `.fpg/references/backend-guide.md` |
| Web (Next.js/TS) | `.fpg/references/web-guide.md` |
| iOS (SwiftUI) | `.fpg/references/ios-guide.md` |
| Android (Compose) | `.fpg/references/android-guide.md` |
| API 设计 | `.fpg/references/api-design.md` |
| 迭代治理（规划期全文） | `.fpg/references/iteration-governance.md` |
| 执行卡（执行期唯一治理文本） | `.fpg/references/execution-card.md` |

> 实现必须与 `api/openapi.yaml` 契约一致；契约变更先改契约、记 CHANGELOG，再改代码。

## 5. 度量（instrumentation，模型零记账）
> **测量值（token 用量、耗时）由工具 hook 自动采集**（`session_start`/`turn_complete` 事件，含真实 usage），模型**不估算、不自报、不回填**。查看走遥测看板：`telemetry` 收集器的 `GET /report`。未安装/离线/禁用（`FPG_TELEMETRY_DISABLED=1`）都安全跳过，绝不阻断开发。

模型唯一要做的：**切片开始时写归因标记，结束时删除**——

```bash
mkdir -p .fpg && printf 'epic=E001\nsprint=S001\ntask=T001\nplatform=backend\nskill=sprint-develop\nphase=sprint_develop\n' > .fpg/current-task
# …… 切片收尾 ……
rm -f .fpg/current-task
```

hook 自动把标记附到每个遥测事件上，token/耗时即归因到对应 E/S/T。`.fpg/current-task` 应加入 `.gitignore`。
业务里程碑事件（`story_complete`/`contract_change`/`verification` 等）仍可由 SKILL 调 `emit.sh` best-effort 发出（字段见生成器仓库 `telemetry/schema.md`），但**不再要求携带任何 token/耗时数字**。

> 隐私：只采流程元数据，不采代码/PII。度量用于改进，不作个人考核。

## 6. 进度文件 PROGRESS.md
长程开发用 `PROGRESS.md` 做结构化笔记：记录已完成功能、当前进行项、未决问题、下一步。新会话先读它 + 最新 E/S `plan.md` + 跑端到端冒烟，再开始新功能。
