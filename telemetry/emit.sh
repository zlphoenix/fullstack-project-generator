#!/usr/bin/env bash
# fullstack-project-generator 遥测埋点客户端
#
# 由各 SKILL.md 在关键时机调用，向中心收集器发送一个流程事件。
# 设计目标：跨工具（Claude Code / Codex）、零编译依赖（仅需 curl）、
#          永不让宿主 Skill 失败（始终 exit 0）、网络不可达时离线缓冲、下次补传。
#
# 用法：
#   emit.sh --event-type story_complete --project my-app --milestone M1 --skill sprint-develop \
#           --phase sprint_develop --outcome ok --attrs '{"story":"US-1-001","platform":"backend"}'
#
# 配置（环境变量，建议写入 shell profile 或 .claude/.codex 配置）：
#   FPG_TELEMETRY_ENDPOINT  收集器地址，如 https://telemetry.example.com（未设置则仅本地缓冲）
#   FPG_TELEMETRY_TOKEN     可选鉴权令牌（作为 Bearer）
#   FPG_TELEMETRY_DISABLED  设为 1 完全关闭埋点
#   FPG_ACTOR_ROLE          dev|product|qa|ops|pm（缺省 unknown）
#   FPG_ACTOR_ID            不透明标识（缺省 anonymous）
#   FPG_TOOL                claude|codex（缺省 unknown）
#   FPG_TELEMETRY_QUEUE     离线缓冲目录（缺省 ~/.fpg-telemetry/queue）

set -u

# —— 关闭开关：直接退出，绝不影响宿主 ——
[ "${FPG_TELEMETRY_DISABLED:-0}" = "1" ] && exit 0

ENDPOINT="${FPG_TELEMETRY_ENDPOINT:-}"
TOKEN="${FPG_TELEMETRY_TOKEN:-}"
ROLE="${FPG_ACTOR_ROLE:-unknown}"
ACTOR="${FPG_ACTOR_ID:-anonymous}"
TOOL="${FPG_TOOL:-unknown}"
QUEUE_DIR="${FPG_TELEMETRY_QUEUE:-$HOME/.fpg-telemetry/queue}"

# —— 解析参数 ——
EVENT_TYPE=""; PROJECT=""; MILESTONE=""; SKILL=""; PHASE=""; OUTCOME=""; ATTRS="{}"
while [ $# -gt 0 ]; do
  case "$1" in
    --event-type) EVENT_TYPE="$2"; shift 2;;
    --project)    PROJECT="$2"; shift 2;;
    --milestone)  MILESTONE="$2"; shift 2;;
    --skill)      SKILL="$2"; shift 2;;
    --phase)      PHASE="$2"; shift 2;;
    --outcome)    OUTCOME="$2"; shift 2;;
    --attrs)      ATTRS="$2"; shift 2;;
    *) shift;;
  esac
done

# event_type 与 project 是最低要求；缺失则静默放弃（不报错）
[ -z "$EVENT_TYPE" ] && exit 0
[ -z "$PROJECT" ] && PROJECT="unknown"

# —— 基础字段 ——
if command -v uuidgen >/dev/null 2>&1; then
  EVENT_ID="$(uuidgen)"
else
  EVENT_ID="$(date -u +%s)-$RANDOM-$RANDOM"
fi
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# —— 最小化 JSON 字符串转义（反斜杠、双引号、控制字符）——
_json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr -d '\000-\037'
}

# outcome 为空 → JSON null；否则带引号
if [ -z "$OUTCOME" ]; then OUTCOME_JSON="null"; else OUTCOME_JSON="\"$(_json_escape "$OUTCOME")\""; fi
# attrs 期望已是合法 JSON 对象；为空或非法时退化为 {}
case "$ATTRS" in
  ''|'{}') ATTRS="{}";;
esac

PAYLOAD=$(cat <<JSON
{"schema_version":1,"event_id":"$(_json_escape "$EVENT_ID")","ts":"$TS","actor_role":"$(_json_escape "$ROLE")","actor_id":"$(_json_escape "$ACTOR")","tool":"$(_json_escape "$TOOL")","project_id":"$(_json_escape "$PROJECT")","milestone":"$(_json_escape "$MILESTONE")","skill":"$(_json_escape "$SKILL")","phase":"$(_json_escape "$PHASE")","event_type":"$(_json_escape "$EVENT_TYPE")","outcome":$OUTCOME_JSON,"attrs":$ATTRS}
JSON
)

mkdir -p "$QUEUE_DIR" 2>/dev/null || true

# —— 发送函数：成功返回 0 ——
_post() {
  local body="$1"
  [ -z "$ENDPOINT" ] && return 1
  if [ -n "$TOKEN" ]; then
    curl -s -o /dev/null -w '%{http_code}' --max-time 2 \
      -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" \
      -X POST "$ENDPOINT/events" -d "$body" 2>/dev/null | grep -q '^2' && return 0
  else
    curl -s -o /dev/null -w '%{http_code}' --max-time 2 \
      -H 'Content-Type: application/json' \
      -X POST "$ENDPOINT/events" -d "$body" 2>/dev/null | grep -q '^2' && return 0
  fi
  return 1
}

# —— 先尝试补传队列中的历史事件（best-effort）——
if [ -n "$ENDPOINT" ]; then
  for f in "$QUEUE_DIR"/*.json; do
    [ -e "$f" ] || break
    if _post "$(cat "$f" 2>/dev/null)"; then rm -f "$f" 2>/dev/null; else break; fi
  done
fi

# —— 发送本次事件；失败则落盘缓冲 ——
if ! _post "$PAYLOAD"; then
  printf '%s' "$PAYLOAD" > "$QUEUE_DIR/${TS//[:]/-}-$EVENT_ID.json" 2>/dev/null || true
fi

exit 0
