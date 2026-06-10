# 变更档案：效率与成本优化（efficiency-overhaul）

> 用于追溯本次改造的基线、意图、决策与任务清单。本仓库自身**不**套用 E/S/T 治理流程（负责人确认），用本档案做轻量追溯。

| 项 | 内容 |
|---|---|
| 基线版本 | `45d7813`（task 粒度调整，master @ 2026-06-10） |
| 分支 | `worktree-efficiency-overhaul`（独立 worktree，不影响 industry 项目对 master 的软链） |
| 发起意图 | 实际使用中**规模不大的 Epic 耗时过长、token 消耗惊人**；在保持"稳定推进、过程可量化"的前提下提效降本 |
| 复盘方式 | 全仓审查 + 对照 Anthropic/OpenAI 公开最佳实践（见 `docs/10` 研究报告，本次结论与其 §4 上下文工程、§6 持久化指导 vs 运行时强制、§13 反模式清单一致） |

## 1. 诊断结论（为什么慢、为什么贵）

每次 `sprint-develop` 调用的固定开销估 25–40k token 进场读取 + 5–10k 离场记账；
小 Epic（3 Sprint × 3 切片）≈ 300k token 纯流程税。三个结构性问题：

1. **模型在伪造度量**：`实际Token / 主动耗时 / 等待耗时` 要求模型回填，但模型测不到自己的用量与墙钟时间——花真 token 生成假指标；而 hooks 侧（`telemetry/hooks/tool_hook.sh`）拿得到真实数据却未采集 token。
2. **治理文本三重加载**：终止契约/熔断/blocked-external 同时存在于 iteration-governance §10、epic-termination-contract.md 全文、sprint-develop 与 sprint-plan 的内联复述，每会话被读 2–3 遍。
3. **用长文 prose 做运行时强制**：与本仓研究报告 §6 结论（纯文档遵从率 25–40%，机械强制 ~95%）相悖；每次复盘失败就加一段 prose（E001 S004–S006、§11 深度闸门），harness 只增不减。

内容三分类：
- **模型已擅长、应删**：methodology.md 教学内容（INVEST/MoSCoW/GWT 定义示例）、平台指南中的标准框架模式、testing/deployment 中的教科书代码块。
- **模型做不好、必须保留但机械化**：终止契约、预算熔断、blocked-external 禁派生、范围守卫、生成者≠评估者、会话起步冒烟、单一真源。规则留执行卡，强制交脚本。
- **缺失、应补**：真实 token/耗时自动采集（instrumentation）、机械校验脚本（fpg-check）、渐进披露（执行卡 vs 全文）、记账合并、度量看板。

## 2. 本次决策（2026-06-10，负责人确认）

| # | 决策 | 说明 |
|---|---|---|
| D1 | **度量测量值全部移出文档，完全靠 instrumentation** | plan.md 删除 实际Token/主动耗时/等待耗时/创建·开始·结束时间 列及回填规则 |
| D2 | plan.md 保留 `状态`、`证据`；Epic/Sprint 级保留 `估计Token` | 状态/证据是跨会话恢复与验收真源（非度量）；估计Token 是预算熔断的规划输入，Task 级不再写 |
| D3 | **Codex 先行**接入 token 采集 | Codex session JSONL 含逐 turn 用量；Claude Code（Stop hook 的 transcript_path）后续补 |
| D4 | E/S/T 归因用 `.fpg/current-task` 标记文件 | Skill 切片开始写一行，hook 上报时附带；替代 SKILL 内大段 emit 示例 |
| D5 | 增加度量看板 | bun server 聚合端点 + 静态 HTML：阶段/skill × 耗时/token/命中，无新依赖 |
| D6 | 本仓不套用 E/S/T 流程 | 变更追溯用本档案 |
| D7 | 部署验证不动 master | worktree 分支 `install.sh --project-dir <试点>` 装到试点项目体验，满意后合回 |

## 3. 任务清单

### P0（本次执行）✅ 全部完成（2026-06-10）
- [x] **T1a** 遥测自动采集：schema 增 usage 字段；`tool_hook.sh` 读 Codex session JSONL 真实 token；`.fpg/current-task` 归因；emit.sh 支持 usage。
- [x] **T1b** 文档去度量化：iteration-governance 指标表 13 列→精简；删除手工回填规则；同步 sprint-plan / sprint-develop / project-qa SKILL 与模板。
- [x] **T2** 治理去重 + 分层披露：termination-contract 并入 governance（单份真源）；新建 ~40 行执行卡给 sprint-develop；删 SKILL 内联复述；同会话多切片免重读。
- [x] **T3** `fpg-check.sh`（落点 `project-template/bin/`，软链为项目 `.fpg/bin/`）：plan-lint / gate（熔断算术、契约存在性）/ budget；SKILL 改为"跑命令看结果"。
- [x] **看板**：telemetry 聚合报表端点 `GET /report` + 一页 HTML。
- [x] **验证**：`cd telemetry && bun test` 全绿；fpg-check 自检；SKILL <500 行、引用有效。

### P1（后续批次）
- [ ] T4 methodology.md 319→~50 行（删教学，留项目决定值）。
- [ ] T5 四份平台指南各瘦身至 ~80 行（只留项目特异约定 + 验证命令）。
- [ ] T6 收尾记账 5 处→2 处（worklog/smoke-report 异常才写；普通切片只回填 plan 行 + PROGRESS 一行）。
- [ ] T7 testing-strategy / deployment-guide 示例代码转可复制模板。
- [ ] T8 Claude Code 侧 token 采集（transcript_path）。

### P2
- [ ] T9 独立验收子 Agent 最小模板（只带 AC + 运行命令）。
- [ ] T10 harness 减法复审制度化（条文标注补偿的失效模式；每 N 个 Epic 复盘删除未触发条文）。
- [ ] T11 用遥测对比改造前后试点 Epic 的 token/调用次数/返工率，量化本次改造收益。

## 4. 执行记录

### 2026-06-10 P0 批次（worktree-efficiency-overhaul）

**T1a 遥测自动采集（Codex 先行）**
- 新增 `telemetry/hooks/codex_usage.sh`：按 session_id 定位 Codex rollout JSONL，取最后一条 `total_token_usage`，状态文件求差得回合增量 `turn_total_tokens`。⚠️ 字段名按宽松匹配实现，**部署后需用真实 Codex 会话抽查一条事件验证解析**。
- `telemetry/hooks/tool_hook.sh`：turn_complete 自动附 `attrs.usage`（codex）、`attrs.session_id`；读 `<cwd>/.fpg/current-task` 标记做 E/S/T 归因（epic/sprint/task/story/platform 进 attrs，skill/phase/milestone 覆盖事件字段）。
- `telemetry/emit.sh` 新增 `--usage` 参数（合并进 attrs.usage）；`telemetry/schema.md` 增补 usage 与归因标记说明、新派生指标。

**T1b 文档去度量化**
- `iteration-governance.md` 新增 §0 度量原则；清单列 13 → 7（`ID/名称/分类/前置/可并行/状态/证据`）；删除 §5 指标表字段/启动结束回填/状态更新时机大表；Token 预算上限只写 Epic 终止契约。
- `sprint-plan-template.md`：删 估计/实际Token 列与 Token 预算列；止损自检改为跑 fpg-check。
- `project-template/AGENTS.md` §5 重写：测量值 instrumentation-only + 归因标记两行命令；SKILL 事件不再携带 token/耗时。

**T2 治理去重 + 分层披露**
- `epic-termination-contract.md`（80 行）并入 `iteration-governance.md` §9，文件删除；治理全文 329 行（249+80）→ ~190 行。
- 新增 `execution-card.md`（~40 行）：执行期唯一治理文本（起步/红线/验收/收尾）。
- `sprint-develop/SKILL.md` 116 → ~55 行：删全部内联治理复述与 3 段 emit 示例，改挂执行卡；明示"同会话已读不重读"。
- `sprint-plan/SKILL.md`、`project-qa/SKILL.md` 同步去重；`skills/AGENTS.md`、仓库 `AGENTS.md`/`CLAUDE.md` 更新约定（顺带修正两处陈旧表述：project-state MCP、1 Story×1 平台）。

**T3 机械闸门**
- 新增 `project-template/bin/fpg-check.sh`：`plan-lint`（清单表头/状态枚举/Mermaid/终止契约/结构决策/废除测量列/INDEX.md）、`gate`（契约存在性=STOP、Sprint 预算熔断 ceil(计划×1.2)=STOP、blocked-external=WARN）、`budget`。退出码 0/1/2=OK/WARN/STOP。
- `install.sh` 增加 `.fpg/bin` 软链部署与卸载。

**看板**
- 新增 `telemetry/src/dashboard.ts`（`GET /report` 与 `report.ts --format html` 共用）：token 总量/活跃耗时/会话回合 KPI、按阶段/Skill/EST 的 token 表、活跃耗时表、skill 命中表。
- `metrics.ts` 新增：tokens_by_phase/skill/task、active_hours_by_phase（同 session 相邻 turn 间隔，>30min 剔除）、by_skill、sessions/turns；新增对应单测。

**每切片固定开销变化（估）**：进场 25–40k → ~10–15k（执行卡 40 行替代治理全文+契约+SKILL复述；连续切片更低）；离场 5–10k → ~2–4k（无 13 列回填、无 token 估算、emit 改一行标记）。

**预期外回退点**：若 Codex rollout 格式解析失败，事件照发但无 usage——看板 token 为 0 即此信号，修 `codex_usage.sh` 的字段匹配即可，不影响其他链路。

**验证结果（2026-06-10）**
- `cd telemetry && bun test`：15 pass / 0 fail（含 token 聚合、活跃耗时剔除、skill 命中新增用例）。
- 全部 shell 脚本 `bash -n` 语法通过。
- fpg-check 夹具自检：plan-lint 合规 plan 全 OK（exit 0）；缺终止契约 → STOP（exit 2）；Sprint 4 > 硬上限 3 → STOP budget_breach（exit 2）；budget 输出 已用/计划/上限。
- hook 端到端模拟（伪造 Codex rollout + `.fpg/current-task`）：`codex_usage.sh` 两次调用增量正确（1500 → 0）；`tool_hook.sh` 产出事件 JSON 合法，attrs 含 usage 与 epic/sprint/task/platform 归因，skill/phase 被标记覆盖；无 endpoint 时正确落盘 `queue/`。
- 残留引用核查：`epic-termination-contract` 在 md 中无引用残留；`实际Token/主动耗时/等待耗时` 仅存在于 fpg-check 的废除检测规则中。
- 行数：sprint-develop SKILL 116→50；治理文本 329（249+80）→ 174+38（全文+执行卡）；全部 SKILL < 500 行。
- 另更新 `SETUP.md` 为一站式使用手册（安装/使用/度量查看/数据位置）。
