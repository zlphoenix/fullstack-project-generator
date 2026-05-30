#!/usr/bin/env bash
# 统一工具 hook → FPG 遥测（Codex Hooks 与 Claude Code hooks 通用）。
# 自动在会话开始 / 每个回合结束时上报，不依赖模型在 SKILL 里自觉调用 emit。
#
# 用法（在工具 hook 配置的 command 里）：
#   bash /ABS/PATH/telemetry/hooks/tool_hook.sh codex      # Codex
#   bash /ABS/PATH/telemetry/hooks/tool_hook.sh claude     # Claude Code
#
# 两个工具都通过 STDIN 传 JSON（字段近似）：
#   {"hook_event_name":"Stop"|"SessionStart"|"SubagentStop", "cwd":"...", "session_id":"...", "turn_id":"..."}
#
# 铁律：永不阻断工具——始终 exit 0、快速、失败静默、无 stdout（避免被当作决策输出）。
set -u

# 自带环境：hook 进程不一定继承到 shell profile，从安装生成的 env 文件加载
[ -f "$HOME/.fpg-telemetry/env.sh" ] && . "$HOME/.fpg-telemetry/env.sh" 2>/dev/null
export FPG_TOOL="${1:-${FPG_TOOL:-unknown}}"
[ -z "${FPG_HOME:-}" ] && exit 0                      # 未安装遥测 → 静默退出
[ "${FPG_TELEMETRY_DISABLED:-0}" = "1" ] && exit 0

input=$(cat 2>/dev/null)
ev=$(printf '%s' "$input"     | sed -n 's/.*"hook_event_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
cwd=$(printf '%s' "$input"    | sed -n 's/.*"cwd"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
turnid=$(printf '%s' "$input" | sed -n 's/.*"turn_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
proj="${FPG_PROJECT:-$(basename "${cwd:-$PWD}")}"

case "$ev" in
  SessionStart)       etype="session_start";;
  Stop|SubagentStop)  etype="turn_complete";;
  *)                  etype="turn_complete";;
esac

bash "$FPG_HOME/telemetry/emit.sh" \
  --event-type "$etype" --project "$proj" --skill "$FPG_TOOL" --phase turn \
  --milestone "${FPG_MILESTONE:-}" --outcome ok \
  --attrs "{\"hook\":\"${ev:-unknown}\",\"turn_id\":\"$turnid\"}" >/dev/null 2>&1

exit 0
