#!/usr/bin/env bash
# 从 Claude Code 会话 transcript JSONL 中提取真实 token 用量（instrumentation，替代模型自报）。
#
# 用法：claude_usage.sh <transcript_path> <session_id>
# 输出：一个 JSON 对象（stdout），如：
#   {"input_tokens":1200,"cache_creation_input_tokens":253593,"cached_input_tokens":11306,
#    "output_tokens":1355,"total_tokens":266150,"turn_total_tokens":266150,"source":"claude_transcript"}
# 找不到文件 / 解析失败时：无输出，exit 0（永不阻断调用方）。
#
# 原理：
# - Claude Code 的 Stop hook payload 带 transcript_path，指向整段会话的 JSONL。
# - 每条 type=assistant 的 message.usage 含 input/cache_creation/cache_read/output_tokens；
#   累加全部 assistant 消息得会话累计用量（每次 API 调用都重发上下文，累加即真实吞吐/计费量）。
# - 用状态文件记录上次累计，差值 = 本回合（turn）增量 turn_total_tokens。
# - awk 单遍解析：每行只取 message.usage 顶层第一次出现的字段（避开 iterations 数组里的重复）。
set -u

TRANSCRIPT="${1:-}"
SESSION_ID="${2:-}"
[ -z "$TRANSCRIPT" ] || [ ! -r "$TRANSCRIPT" ] && exit 0

# 单遍累加：每条 assistant 行，取 "usage":{ 之后、第一个嵌套 { 之前的扁平段里的 4 个字段
sums=$(awk '
  function num(str, key,   t) {
    if (match(str, "\"" key "\":[0-9]+")) {
      t = substr(str, RSTART, RLENGTH); sub("\"" key "\":", "", t); return t + 0
    }
    return 0
  }
  /"type":"assistant"/ && /"usage":\{/ {
    # 整行取每个字段第一次出现：message.usage 在 iterations 数组之前，首次出现即顶层值
    inp += num($0, "input_tokens")
    cc  += num($0, "cache_creation_input_tokens")
    cr  += num($0, "cache_read_input_tokens")
    out += num($0, "output_tokens")
  }
  END { printf "%d %d %d %d", inp, cc, cr, out }
' "$TRANSCRIPT" 2>/dev/null)

set -- $sums
inp="${1:-0}"; cc="${2:-0}"; cr="${3:-0}"; out="${4:-0}"
total=$(( inp + cc + cr + out ))
[ "$total" -le 0 ] && exit 0

# 回合增量：当前累计 − 上次累计（状态文件按 session 记录）
STATE_DIR="${FPG_TELEMETRY_STATE:-$HOME/.fpg-telemetry/state}"
mkdir -p "$STATE_DIR" 2>/dev/null || true
state="$STATE_DIR/claude-${SESSION_ID:-default}.total"
prev=0
[ -f "$state" ] && prev=$(cat "$state" 2>/dev/null) && case "$prev" in ''|*[!0-9]*) prev=0;; esac
delta=$(( total - prev ))
[ "$delta" -lt 0 ] && delta=$total
printf '%s' "$total" > "$state" 2>/dev/null || true

printf '{"input_tokens":%s,"cache_creation_input_tokens":%s,"cached_input_tokens":%s,"output_tokens":%s,"total_tokens":%s,"turn_total_tokens":%s,"source":"claude_transcript"}' \
  "$inp" "$cc" "$cr" "$out" "$total" "$delta"
exit 0
