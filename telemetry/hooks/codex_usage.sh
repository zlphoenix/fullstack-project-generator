#!/usr/bin/env bash
# 从 Codex 会话 rollout JSONL 中提取真实 token 用量（instrumentation，替代模型自报）。
#
# 用法：codex_usage.sh <session_id>
# 输出：一个 JSON 对象（stdout），如：
#   {"input_tokens":1200,"cached_input_tokens":800,"output_tokens":300,"total_tokens":1500,
#    "turn_total_tokens":420,"source":"codex_rollout"}
# 找不到会话文件 / 解析失败时：无输出，exit 0（永不阻断调用方）。
#
# 原理：
# - Codex 把每个会话写入 ${CODEX_HOME:-~/.codex}/sessions/YYYY/MM/DD/rollout-*-<session_id>.jsonl，
#   其中 token_count 事件携带 total_token_usage（会话累计）。
# - 本脚本取最后一条 total_token_usage 作为累计值；并用状态文件记录上次累计值，
#   差值即本回合（turn）的 token 消耗 turn_total_tokens。
# - 字段名按宽松匹配提取；Codex 版本差异导致解析失败时静默退出（事件仍会发出，只是无 usage）。
set -u

SESSION_ID="${1:-}"
[ -z "$SESSION_ID" ] && exit 0

CODEX_DIR="${CODEX_HOME:-$HOME/.codex}"
SESS_ROOT="$CODEX_DIR/sessions"
[ -d "$SESS_ROOT" ] || exit 0

# 定位会话文件（文件名以 session_id 结尾）；取最新修改的一个
f=$(find "$SESS_ROOT" -type f -name "*${SESSION_ID}.jsonl" 2>/dev/null | head -n 1)
[ -z "$f" ] || [ ! -r "$f" ] && exit 0

line=$(grep '"total_token_usage"' "$f" 2>/dev/null | tail -n 1)
[ -z "$line" ] && exit 0
obj=$(printf '%s' "$line" | sed -n 's/.*"total_token_usage"[[:space:]]*:[[:space:]]*{\([^}]*\)}.*/\1/p')
[ -z "$obj" ] && exit 0

_num() { printf '%s' "$obj" | sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p"; }
input=$(_num input_tokens); cached=$(_num cached_input_tokens)
output=$(_num output_tokens); total=$(_num total_tokens)
[ -z "$total" ] && exit 0
: "${input:=0}" "${cached:=0}" "${output:=0}"

# 回合增量：当前累计 − 上次累计（状态文件按 session 记录）
STATE_DIR="${FPG_TELEMETRY_STATE:-$HOME/.fpg-telemetry/state}"
mkdir -p "$STATE_DIR" 2>/dev/null || true
state="$STATE_DIR/codex-$SESSION_ID.total"
prev=0
[ -f "$state" ] && prev=$(cat "$state" 2>/dev/null) && case "$prev" in ''|*[!0-9]*) prev=0;; esac
delta=$(( total - prev ))
[ "$delta" -lt 0 ] && delta=$total
printf '%s' "$total" > "$state" 2>/dev/null || true

printf '{"input_tokens":%s,"cached_input_tokens":%s,"output_tokens":%s,"total_tokens":%s,"turn_total_tokens":%s,"source":"codex_rollout"}' \
  "$input" "$cached" "$output" "$total" "$delta"
exit 0
