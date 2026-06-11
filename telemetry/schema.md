# 遥测事件 Schema（v1）

所有埋点客户端（`emit.sh`）发送、收集器（collector）入库、报表（report）消费的统一事件结构。
**原则：只采集流程元数据，不采集代码内容或个人隐私（PII）。**

## 事件字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `schema_version` | int | ✅ | 固定为 `1`，用于演进兼容 |
| `event_id` | string | ✅ | 客户端生成的唯一 ID（uuid 或 时间戳+随机） |
| `ts` | string(ISO8601 UTC) | ✅ | 事件发生时间，如 `2026-05-30T08:12:30Z` |
| `actor_role` | enum | ✅ | `dev` \| `product` \| `qa` \| `ops` \| `pm` \| `unknown` |
| `actor_id` | string | ⬜ | 不透明标识（建议哈希后的工号/邮箱），缺省 `anonymous` |
| `tool` | enum | ✅ | `claude` \| `codex` \| `unknown`（运行的 Agent 工具） |
| `project_id` | string | ✅ | 项目标识（建议用项目名 kebab-case） |
| `milestone` | string | ⬜ | 项目当前里程碑（如 `M1`/`M2`/`Sprint-3`），用于"进展到哪"维度 |
| `skill` | string | ⬜ | 触发的 Skill 名，如 `sprint-develop` |
| `phase` | string | ⬜ | 阶段：`requirements`\|`architecture`\|`scaffold`\|`sprint_plan`\|`sprint_develop`\|`qa`\|`deploy` |
| `event_type` | enum | ✅ | 见下表 |
| `outcome` | enum | ⬜ | `ok` \| `fail` \| `skip` \| `null` |
| `attrs` | object(JSON) | ⬜ | 轻量附加元数据，如 `{"story":"US-1-001","platform":"backend"}` |

## event_type 取值

| event_type | 触发时机 | 关键 attrs |
|---|---|---|
| `skill_start` | 某 Skill 开始执行 | — |
| `skill_complete` | 某 Skill 完成 | `outcome` |
| `phase_enter` | 进入某阶段 | — |
| `phase_complete` | 完成某阶段 | — |
| `story_start` | 开始实现某 Story | `story`, `platform` |
| `story_complete` | 某 Story 完成 | `story`, `platform` |
| `story_reopen` | 已完成 Story 被重新打开（**返工**信号） | `story`, `reason?` |
| `contract_change` | API 契约变更 | `version?` |
| `verification` | 一次验证/验收（编译/测试/AC） | `kind`(compile\|test\|ac\|e2e), `outcome` |
| `session_start` | 会话开始（**工具 hook 自动**：Claude SessionStart） | `hook`, `session_id` |
| `turn_complete` | 一个 agent 回合结束（**工具 hook 自动**：Codex notify / Claude Stop） | `codex_event`/`hook`, `turn_id`, `session_id`, `usage`, E/S/T 归因 |

> `session_start` / `turn_complete` 由**工具侧 hook 自动发出**（见 `hooks/`），不依赖模型在 SKILL 里自觉调用 emit——这是"使用即度量"可靠性的关键。其余事件仍由 SKILL 在关键时机 best-effort 发出。

## attrs.usage —— 真实 token 用量（instrumentation，模型零参与）

> **原则：所有"测量值"（token、耗时）一律由工具侧 instrumentation 采集，不要求（也不信任）模型自报。**
> plan.md 等项目文档只保留计划值（状态、证据、Epic/Sprint 级估计 token 预算），见 ADR/变更档案 2026-06-10。

`turn_complete` 事件可携带 `attrs.usage`：

```json
{ "input_tokens": 1200, "cached_input_tokens": 800, "output_tokens": 300,
  "total_tokens": 1500, "turn_total_tokens": 420, "source": "codex_rollout" }
```

- `total_tokens` 等为**会话累计**值；`turn_total_tokens` 为**本回合增量**（聚合用它，避免重复累计）。
- 来源：Codex 由 `hooks/codex_usage.sh` 从会话 rollout JSONL 提取；Claude Code 由 `hooks/claude_usage.sh` 从 Stop hook 的 `transcript_path` 提取。两者均已支持。
- `emit.sh --usage '<json>'` 可显式附带（hook 内部已自动处理）。

## attrs 中的 E/S/T 归因 —— `.fpg/current-task` 标记文件

token/耗时归因到 Epic/Sprint/Task 靠项目根的 `.fpg/current-task`（k=v 每行），由 Skill 在**切片开始时写一次**、切片结束时删除：

```text
epic=E001
sprint=S001
task=T003
platform=backend
skill=sprint-develop
phase=sprint_develop
```

hook 上报时自动读取：`epic/sprint/task/story/platform` 并入 attrs；`skill/phase/milestone` 覆盖事件同名字段。文件不存在时事件照常发出（仅无归因）。该文件应加入用户项目 `.gitignore`。

## 示例

```json
{
  "schema_version": 1,
  "event_id": "f1c2-...-9a",
  "ts": "2026-05-30T08:12:30Z",
  "actor_role": "dev",
  "actor_id": "anonymous",
  "tool": "claude",
  "project_id": "my-bookstore",
  "skill": "sprint-develop",
  "phase": "sprint_develop",
  "event_type": "story_complete",
  "outcome": "ok",
  "attrs": { "story": "US-1-001", "platform": "backend" }
}
```

## 派生指标（report 消费）

- **阶段周期时间**：`phase_complete.ts − phase_enter.ts`（按 project_id + phase 配对）
- **Story 交付时长**：`story_complete.ts − story_start.ts`
- **返工率**：`count(story_reopen) / count(story_complete)`
- **契约变更次数**：`count(contract_change)`
- **AC 通过率**：`count(verification[kind=ac].outcome=ok) / count(verification[kind=ac])`
- **各角色/项目分布**：按 `actor_role` / `project_id` 分组
- **token 用量**：`sum(turn_complete.attrs.usage.turn_total_tokens)`，按 project / phase / skill / epic / sprint / task 分组
- **活跃耗时（近似）**：同一 `session_id` 内相邻 `turn_complete` 的时间差（超过 30 分钟视为空闲、不计入），按 phase/skill 归集
- **skill 命中**：各事件按 `skill` 字段分组计数（哪些 Skill 被触发、频次）
