# telemetry/hooks — 工具侧自动埋点

> 让"使用即度量"**可靠**：由 Claude Code / Codex 的 **hooks** 机制在会话/回合事件上**自动**发遥测，
> 不依赖模型在 SKILL 里"记得"调用 emit（纯指令遵从率仅 ~25–40%，见 `docs/10` §6）。

两类信号互补：
- **工具 hook（本目录）**：可靠的**粗粒度**——会话开始、每个回合结束（谁/角色/工具/项目/时间/活跃度），并自动附带**真实 token 用量**与 **E/S/T 归因**。
- **SKILL 内 emit（best-effort）**：**细粒度**——阶段/Story/契约/AC（模型执行到才有）。**不携带 token/耗时数字**（测量值全由 hook 采集，模型不自报）。

> **身份识别原理（谁/skill/阶段如何识别）、非交互 shell 的 env 注入（`--wire-env` → `~/.zshenv`）、以及卸载机制（`--uninstall`），见 [`docs/31-遥测身份识别与卸载.md`](../../docs/31-遥测身份识别与卸载.md)。**

## 统一脚本 `tool_hook.sh`

Codex Hooks 与 Claude Code hooks 的 payload 高度一致（都经 **stdin** 传 JSON，含 `hook_event_name`/`cwd`/`session_id`/`turn_id`），因此**一个脚本服务两个工具**：

```
bash <FPG_HOME>/telemetry/hooks/tool_hook.sh codex     # Codex
bash <FPG_HOME>/telemetry/hooks/tool_hook.sh claude    # Claude Code
```

- **自带环境**：脚本自行 `source ~/.fpg-telemetry/env.sh`，因此不受"非交互 shell 不读 .zshrc"影响。
- **永不阻断**：始终 `exit 0`、无 stdout、失败静默；未安装遥测则直接退出。
- 事件映射：`SessionStart→session_start`、`Stop`/`SubagentStop→turn_complete`。
- 项目名取自 payload 的 `cwd` 目录名，可用 `FPG_PROJECT` 覆盖。

| hook 事件 | 发出 |
|---|---|
| SessionStart | `session_start` |
| Stop / SubagentStop | `turn_complete`（附 `attrs.usage` 与 E/S/T 归因） |

## 真实 token 用量与 E/S/T 归因（instrumentation）

`tool_hook.sh` 在 `turn_complete` 时自动附带两类数据（模型零参与）：

1. **token 用量**（`attrs.usage`）：
   - **Codex（已支持）**：`codex_usage.sh` 按 `session_id` 定位 `${CODEX_HOME:-~/.codex}/sessions/**/rollout-*-<session_id>.jsonl`，取最后一条 `total_token_usage`（会话累计），并用 `~/.fpg-telemetry/state/` 的状态文件求差得到**本回合增量** `turn_total_tokens`（聚合用增量，避免重复累计）。
   - 解析按宽松匹配实现；Codex 版本差异导致解析失败时静默跳过（事件照发，仅无 usage）。**接入新版本 Codex 后先抽查一条事件确认字段仍能解析。**
   - **Claude Code（已支持）**：`claude_usage.sh` 读 Stop hook payload 的 `transcript_path`，awk 单遍累加每条 assistant 的 `message.usage`（`input_tokens`+`cache_creation_input_tokens`+`cache_read_input_tokens`+`output_tokens`，每个字段取整行首次出现以避开 `iterations` 数组重复），状态文件求差得回合增量。
2. **E/S/T 归因**：读 `<cwd>/.fpg/current-task`（k=v 每行，由 Skill 在切片开始写、结束删）：
   `epic/sprint/task/story/platform` 并入 attrs；`skill/phase/milestone` 覆盖事件同名字段。

聚合结果看 collector 的 **`GET /report` 度量看板**：各阶段/Skill/Task 的 token、活跃耗时、skill 命中。

## Codex 接入（推荐用 Hooks，而非 notify）

Codex 的 `notify` 键**只能有一个**（你机器上已被 Computer Use 占用），且仅 `agent-turn-complete`、payload 无 `cwd`。
**Hooks 更合适**：支持多源共存（不冲突）、支持**项目级** `<repo>/.codex/hooks.json`、stdin 带 `cwd`。

项目级 `<repo>/.codex/hooks.json`（`install.sh --wire-hooks` 可自动写入）：
```json
{
  "hooks": {
    "SessionStart": [{ "matcher": "startup|resume",
      "hooks": [{ "type": "command", "command": "bash <FPG_HOME>/telemetry/hooks/tool_hook.sh codex", "timeout": 5 }]}],
    "Stop": [{ "hooks": [{ "type": "command", "command": "bash <FPG_HOME>/telemetry/hooks/tool_hook.sh codex", "timeout": 5 }]}]
  }
}
```
> 首次运行 Codex 会要求**信任**该 hook（`/hooks` 审阅）。这与已有的 `notify`（Computer Use）并存，互不影响。
> 可选：在 `~/.codex/config.toml` 加 `[shell_environment_policy] set = { FPG_HOME=..., FPG_TELEMETRY_ENDPOINT=..., FPG_ACTOR_ROLE="dev", FPG_TOOL="codex" }`，让 SKILL 内的细粒度 emit 也能在命令 shell 里工作。

## Claude Code 接入（项目 `<repo>/.claude/settings.json`）

```json
{
  "env": { "FPG_TOOL": "claude" },
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "bash <FPG_HOME>/telemetry/hooks/tool_hook.sh claude" }]}],
    "Stop":         [{ "hooks": [{ "type": "command", "command": "bash <FPG_HOME>/telemetry/hooks/tool_hook.sh claude" }]}]
  }
}
```
（写进 `settings.json`，不要动用户已有的 `settings.local.json`。）`install.sh --wire-hooks` 可自动写入。
