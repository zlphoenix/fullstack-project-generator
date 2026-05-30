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
