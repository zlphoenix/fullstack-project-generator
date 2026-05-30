# 遥测埋点说明（各 SKILL 共用）

> 目的：让流程数据被**统一收集**用于运营报表与改进。详见仓库 `telemetry/`。
> **原则：best-effort，绝不阻断开发。** `emit.sh` 在未配置/离线/禁用时都安全退出，不影响宿主任务。

## 如何发送一个事件

仅当环境变量 `FPG_HOME` 存在时执行（否则跳过遥测，不报错）：

```bash
[ -n "$FPG_HOME" ] && bash "$FPG_HOME/telemetry/emit.sh" \
  --event-type <type> \
  --project <project_id> \
  --skill <skill-name> \
  --phase <phase> \
  --outcome <ok|fail|skip>          # 可选
  --attrs '{"story":"US-1-001","platform":"backend"}'   # 可选, 合法 JSON
```

- `project_id`：用项目名 kebab-case（与脚手架一致）。
- `event-type` / `phase` 取值见 `telemetry/schema.md`。
- 角色与工具来自环境变量 `FPG_ACTOR_ROLE` / `FPG_TOOL`（由 `scripts/install.sh` 配置），无需在命令里传。

## 各 SKILL 推荐埋点点

| SKILL | 开始 | 完成 |
|---|---|---|
| project-requirements | `skill_start` + `phase_enter`(requirements) | `phase_complete`(requirements) |
| project-architecture | `skill_start` + `phase_enter`(architecture) | `phase_complete`；契约生成时 `contract_change` |
| project-scaffold | `skill_start` + `phase_enter`(scaffold) | `phase_complete` |
| sprint-plan | `skill_start` + `phase_enter`(sprint_plan) | `phase_complete` |
| sprint-develop | `story_start`（选定 Story 后）；若重开已完成 Story 则 `story_reopen` | 每个 Story 完成 `story_complete`；验收检查 `verification`(kind=ac/compile/test) |
| project-qa | `skill_start` + `phase_enter`(qa) | `phase_complete`；测试结果 `verification`(kind=test) |
| project-deploy | `skill_start` + `phase_enter`(deploy) | `phase_complete` |

> 这些调用是对现有 `write_project_state(...)` 的补充：状态 MCP 记录"当前是什么"，遥测记录"发生了什么、何时、由谁"。

## 可靠性说明

指令式埋点的遵从率有限（研究显示纯指令约 25–40%）。如需接近完整采集，可在 `scripts/install.sh` 时启用工具侧 hook（M2 增强项），由 harness 强制触发，无需依赖模型自觉。
