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
# 自动附带（instrumentation，模型零参与）：
#   1. token 用量：Codex 从会话 rollout JSONL 提取真实累计/回合 token（codex_usage.sh）；
#      Claude Code 的 transcript 解析待接入（P1）。
#   2. E/S/T 归因：读 <cwd>/.fpg/current-task 标记文件（k=v 每行，由 Skill 在切片开始时写一次），
#      epic/sprint/task/story/platform 进 attrs；skill/phase/milestone 覆盖事件同名字段。
#
# 铁律：永不阻断工具——始终 exit 0、快速、失败静默、无 stdout（避免被当作决策输出）。
set -u

# 自带环境：hook 进程不一定继承到 shell profile，从安装生成的 env 文件加载
[ -f "$HOME/.fpg-telemetry/env.sh" ] && . "$HOME/.fpg-telemetry/env.sh" 2>/dev/null
export FPG_TOOL="${1:-${FPG_TOOL:-unknown}}"
[ -z "${FPG_HOME:-}" ] && exit 0                      # 未安装遥测 → 静默退出
[ "${FPG_TELEMETRY_DISABLED:-0}" = "1" ] && exit 0

input=$(cat 2>/dev/null)
_field() { printf '%s' "$input" | sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p"; }
ev=$(_field hook_event_name)
cwd=$(_field cwd)
turnid=$(_field turn_id)
sessid=$(_field session_id)
proj="${FPG_PROJECT:-$(basename "${cwd:-$PWD}")}"

case "$ev" in
  SessionStart)       etype="session_start";;
  Stop|SubagentStop)  etype="turn_complete";;
  *)                  etype="turn_complete";;
esac

# —— E/S/T 归因标记（Skill 写入，hook 附带）——
_clean() { printf '%s' "$1" | tr -d '\000-\037"\\' ; }
_attr() { attrs_extra="$attrs_extra,\"$1\":\"$(_clean "$2")\""; }
_is_epic_id() { printf '%s' "$1" | grep -Eq '^E[0-9][0-9][0-9]$'; }
_is_sprint_id() { printf '%s' "$1" | grep -Eq '^S[0-9][0-9][0-9]$'; }
_is_task_id() { printf '%s' "$1" | grep -Eq '^T[0-9][0-9][0-9]$'; }
_table_has_id() { [ -f "$1" ] && grep -Eq "^[|][[:space:]]*$2[[:space:]]*[|]" "$1" 2>/dev/null; }

_project_file() {
  local rel="$1" abs real_project real_file
  [ -n "$rel" ] || return 1
  case "$rel" in
    /*) abs="$rel";;
    *) abs="$project_root/$rel";;
  esac
  [ -f "$abs" ] || return 1
  real_project="$(cd "$project_root" 2>/dev/null && pwd -P)" || return 1
  real_file="$(cd "$(dirname "$abs")" 2>/dev/null && pwd -P)/$(basename "$abs")" || return 1
  case "$real_file" in
    "$real_project"/*) printf '%s' "$real_file";;
    *) return 1;;
  esac
}

_find_epic_plan() {
  local f
  f="$(_project_file "$m_epic_path" 2>/dev/null || true)"
  [ -n "$f" ] && { printf '%s' "$f"; return; }
  for f in "$project_root"/docs/iteration/epics/"$m_epic"-*/plan.md; do
    [ -f "$f" ] && { printf '%s' "$f"; return; }
  done
}

_find_sprint_plan() {
  local f
  f="$(_project_file "$m_sprint_path" 2>/dev/null || true)"
  [ -n "$f" ] && { printf '%s' "$f"; return; }
  for f in "$project_root"/docs/iteration/epics/"$m_epic"-*/sprints/"$m_sprint"-*/plan.md; do
    [ -f "$f" ] && { printf '%s' "$f"; return; }
  done
}

attrs_extra=""
m_skill="${FPG_SKILL:-}"; m_phase="turn"; m_milestone="${FPG_MILESTONE:-}"
m_epic=""; m_sprint=""; m_task=""; m_story=""; m_platform=""
m_epic_name=""; m_sprint_name=""; m_task_name=""
m_epic_path=""; m_sprint_path=""; m_task_path=""
marker="${cwd:-$PWD}/.fpg/current-task"
project_root="$(cd "${cwd:-$PWD}" 2>/dev/null && pwd -P)"
[ -n "$project_root" ] && _attr "project_root" "$project_root"
if [ -f "$marker" ]; then
  while IFS='=' read -r k v; do
    [ -z "$k" ] && continue
    v=$(_clean "$v")
    case "$k" in
      skill)     m_skill="$v";;
      phase)     m_phase="$v";;
      milestone) m_milestone="$v";;
      epic)       m_epic="$v";;
      sprint)     m_sprint="$v";;
      task)       m_task="$v";;
      story)      m_story="$v";;
      platform)   m_platform="$v";;
      epic_name)  m_epic_name="$v";;
      sprint_name) m_sprint_name="$v";;
      task_name)  m_task_name="$v";;
      epic_path)  m_epic_path="$v";;
      sprint_path) m_sprint_path="$v";;
      task_path)  m_task_path="$v";;
    esac
  done < "$marker"

  attribution_error=""
  epic_plan=""; sprint_plan=""
  if [ -n "$m_epic" ] && ! _is_epic_id "$m_epic"; then
    attribution_error="epic must match E###: $m_epic"
  elif [ -n "$m_sprint" ] && ! _is_sprint_id "$m_sprint"; then
    attribution_error="sprint must match S###: $m_sprint"
  elif [ -n "$m_task" ] && ! _is_task_id "$m_task"; then
    attribution_error="task must match T###: $m_task"
  elif [ -n "$m_epic" ]; then
    epic_plan="$(_find_epic_plan 2>/dev/null || true)"
    if [ -z "$epic_plan" ]; then
      attribution_error="epic plan not found: $m_epic"
    elif [ -n "$m_sprint" ]; then
      sprint_plan="$(_find_sprint_plan 2>/dev/null || true)"
      if [ -z "$sprint_plan" ]; then
        attribution_error="sprint plan not found: $m_epic/$m_sprint"
      elif ! _table_has_id "$epic_plan" "$m_sprint"; then
        attribution_error="sprint not listed in epic plan: $m_sprint"
      elif [ -n "$m_task" ] && ! _table_has_id "$sprint_plan" "$m_task"; then
        attribution_error="task not listed in sprint plan: $m_task"
      fi
    fi
  fi

  if [ -n "$attribution_error" ]; then
    _attr "attribution_error" "$attribution_error"
    _attr "attribution_valid" "false"
  else
    [ -n "$m_epic" ] && _attr "epic" "$m_epic"
    [ -n "$m_sprint" ] && _attr "sprint" "$m_sprint"
    [ -n "$m_task" ] && _attr "task" "$m_task"
    [ -n "$m_story" ] && _attr "story" "$m_story"
    [ -n "$m_platform" ] && _attr "platform" "$m_platform"
    [ -n "$m_epic_name" ] && _attr "epic_name" "$m_epic_name"
    [ -n "$m_sprint_name" ] && _attr "sprint_name" "$m_sprint_name"
    [ -n "$m_task_name" ] && _attr "task_name" "$m_task_name"
    [ -n "$m_epic_path" ] && _attr "epic_path" "$m_epic_path"
    [ -n "$m_sprint_path" ] && _attr "sprint_path" "$m_sprint_path"
    [ -n "$m_task_path" ] && _attr "task_path" "$m_task_path"
  fi
fi

# —— 真实 token 用量（仅 turn_complete 有意义）——
usage_extra=""
if [ "$etype" = "turn_complete" ]; then
  usage=""
  if [ "$FPG_TOOL" = "codex" ] && [ -n "$sessid" ]; then
    usage=$(bash "$FPG_HOME/telemetry/hooks/codex_usage.sh" "$sessid" 2>/dev/null)
  elif [ "$FPG_TOOL" = "claude" ]; then
    tpath=$(_field transcript_path)   # Claude Stop hook payload 带 transcript 路径
    [ -n "$tpath" ] && usage=$(bash "$FPG_HOME/telemetry/hooks/claude_usage.sh" "$tpath" "$sessid" 2>/dev/null)
  fi
  [ -n "$usage" ] && usage_extra=",\"usage\":$usage"
fi

bash "$FPG_HOME/telemetry/emit.sh" \
  --event-type "$etype" --project "$proj" --skill "$m_skill" --phase "$m_phase" \
  --milestone "$m_milestone" --outcome ok \
  --attrs "{\"hook\":\"${ev:-unknown}\",\"turn_id\":\"$(_clean "$turnid")\",\"session_id\":\"$(_clean "$sessid")\"$attrs_extra$usage_extra}" >/dev/null 2>&1

exit 0
