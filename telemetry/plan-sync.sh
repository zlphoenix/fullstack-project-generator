#!/usr/bin/env bash
# plan.md -> plan_sync snapshot client.
# Pure shell client, best-effort: never blocks the host and always exits 0.
set -u

EPIC_DIR=""
PROJECT=""
ENDPOINT="${FPG_TELEMETRY_ENDPOINT:-}"
DRY_RUN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --epic-dir) EPIC_DIR="${2:-}"; shift 2;;
    --project) PROJECT="${2:-}"; shift 2;;
    --endpoint) ENDPOINT="${2:-}"; shift 2;;
    --dry-run) DRY_RUN=1; shift;;
    *) shift;;
  esac
done

[ -z "$PROJECT" ] && PROJECT="unknown"

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" 2>/dev/null && pwd -P)"
EMIT_SH="$SCRIPT_DIR/emit.sh"

json_escape() {
  awk 'BEGIN{ORS=""}{gsub(/\\/,"\\\\"); gsub(/"/,"\\\""); gsub(/\t/,"\\t"); gsub(/\r/,""); gsub(/\n/,"\\n"); print}' <<EOF
$1
EOF
}

trim() {
  printf '%s' "$1" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
}

strip_md() {
  printf '%s' "$1" | sed -E 's/\[([^]]+)\]\([^)]+\)/\1/g; s/`//g' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
}

cell_value() {
  # $1=row, $2=1-based index
  [ -z "${2:-}" ] && { printf ''; return; }
  printf '%s' "$1" | awk -F'|' -v idx="$2" '{gsub(/^[ \t]+|[ \t]+$/, "", $idx); print $idx}'
}

header_index() {
  # $1=header row, $2=column name; prints 1-based awk field index, including leading empty field.
  printf '%s' "$1" | awk -F'|' -v name="$2" '
    {
      for (i = 1; i <= NF; i++) {
        v = $i
        gsub(/^[ \t]+|[ \t]+$/, "", v)
        if (v == name) { print i; exit }
      }
    }'
}

normalize_status() {
  case "$(strip_md "$1")" in
    "未开始"|"执行中"|"阻塞"|"已实现"|"已验证"|"已完成"|"搁置") strip_md "$1";;
    "Planned") printf '未开始';;
    "In Progress") printf '执行中';;
    "Blocked") printf '阻塞';;
    "Implemented") printf '已实现';;
    "Verified") printf '已验证';;
    "Done") printf '已完成';;
    "Deferred") printf '搁置';;
    *) printf '%s' "${2:-未开始}";;
  esac
}

normalize_category() {
  case "$(strip_md "$1")" in
    "Must Deliver"|"Must Verify"|"Supporting"|"Backlog") strip_md "$1";;
    *) printf '';;
  esac
}

deps_json() {
  printf '%s\n' "$@" | tr ',，/、 ' '\n' | grep -Eo '^[EST][0-9]+' | awk '
    !seen[$0]++ { vals[++n] = $0 }
    END {
      printf "["
      for (i = 1; i <= n; i++) {
        if (i > 1) printf ","
        printf "\"%s\"", vals[i]
      }
      printf "]"
    }'
}

estimate_tokens_json() {
  local raw parts count a b
  raw="$(strip_md "$1" | tr -d ',')"
  if [ -z "$raw" ] || [ "$raw" = "—" ]; then
    printf '[0,0]'
    return
  fi
  parts="$(printf '%s' "$raw" | grep -Eo '[0-9]+(\.[0-9]+)?[[:space:]]*[kK]?' || true)"
  count="$(printf '%s\n' "$parts" | sed '/^$/d' | wc -l | tr -d ' ')"
  if [ "$count" -ge 2 ]; then
    a="$(printf '%s\n' "$parts" | sed -n '1p')"
    b="$(printf '%s\n' "$parts" | sed -n '2p')"
    printf '[%s,%s]' "$(token_part "$a")" "$(token_part "$b")"
  elif [ "$count" -eq 1 ]; then
    a="$(printf '%s\n' "$parts" | sed -n '1p')"
    a="$(token_part "$a")"
    printf '[%s,%s]' "$a" "$a"
  else
    printf '[0,0]'
  fi
}

token_part() {
  local raw="$1" n
  n="$(printf '%s' "$raw" | grep -Eo '[0-9]+(\.[0-9]+)?' | head -1 || true)"
  [ -z "$n" ] && { printf '0'; return; }
  case "$raw" in
    *k*|*K*) awk -v n="$n" 'BEGIN{printf "%d", int(n * 1000 + 0.5)}';;
    *) awk -v n="$n" 'BEGIN{printf "%d", int(n + 0.5)}';;
  esac
}

estimate_hours_json() {
  [ "$2" = "0" ] && { printf 'null'; return; }
  local n
  n="$(strip_md "$1" | grep -Eo '[0-9]+(\.[0-9]+)?' | head -1 || true)"
  [ -z "$n" ] && printf 'null' || printf '%s' "$n"
}

repo_url() {
  local url
  url="$(git -C "$EPIC_DIR" remote get-url origin 2>/dev/null || true)"
  url="${url%.git}"
  printf '%s' "$url" | sed -E 's#^git@([^:]+):(.+)$#https://\1/\2#'
}

git_head() {
  git -C "$EPIC_DIR" rev-parse HEAD 2>/dev/null || true
}

source_path() {
  local file="$1" root rel
  rel="$(git -C "$EPIC_DIR" ls-files --full-name -- "$file" 2>/dev/null || true)"
  if [ -n "$rel" ]; then
    printf '%s' "$rel"
    return
  fi
  root="$(git -C "$EPIC_DIR" rev-parse --show-toplevel 2>/dev/null || true)"
  if [ -n "$root" ]; then
    case "$file" in
      "$root"/*) printf '%s' "${file#"$root"/}"; return;;
    esac
  fi
  printf '%s' "$file"
}

source_json() {
  local file="$1" heading="$2" line="$3" abs_path
  abs_path="$(cd "$(dirname "$file")" 2>/dev/null && pwd -P)/$(basename "$file")"
  printf '{"repo_url":"%s","commit":"%s","path":"%s","heading":"%s","line":%s,"abs_path":"%s"}' \
    "$(json_escape "$REPO_URL")" \
    "$(json_escape "$COMMIT")" \
    "$(json_escape "$(source_path "$abs_path")")" \
    "$(json_escape "$heading")" \
    "${line:-0}" \
    "$(json_escape "$abs_path")"
}

first_h1_heading() {
  grep -nE '^# .+' "$1" | head -1 | sed -E 's/^[0-9]+:# //'
}

first_h1_line() {
  grep -nE '^# .+' "$1" | head -1 | cut -d: -f1
}

section_heading_before_line() {
  awk -v max="$2" '
    NR >= max { exit }
    /^#{2,6}[[:space:]]+/ { h = $0; sub(/^#{2,6}[[:space:]]+/, "", h) }
    END { print h }' "$1"
}

table_rows_after_heading() {
  # Prints line_number TAB row for first Markdown table after exact heading text.
  awk -v heading="$2" '
    $0 ~ "^#{2,6}[[:space:]]+" heading "[[:space:]]*$" { seen=1; next }
    seen && /^\|/ {
      if (!header) { header=$0; next }
      if (!divider) { divider=$0; next }
      print NR "\t" $0
      next
    }
    seen && header && !/^\|/ { exit }
  ' "$1"
}

table_header_after_heading() {
  awk -v heading="$2" '
    $0 ~ "^#{2,6}[[:space:]]+" heading "[[:space:]]*$" { seen=1; next }
    seen && /^\|/ { print; exit }
  ' "$1"
}

task_table_heading() {
  awk '
    /^#{2,6}[[:space:]]+/ { h = $0; sub(/^#{2,6}[[:space:]]+/, "", h) }
    /^\|/ && /ID/ && /名称/ { print h; exit }
  ' "$1"
}

task_table_header() {
  awk '
    /^\|/ && /ID/ && /名称/ { print; exit }
  ' "$1"
}

task_table_rows() {
  awk '
    /^\|/ && /ID/ && /名称/ { seen=1; next }
    seen == 1 && /^\|[[:space:]]*:?-{3,}/ { seen=2; next }
    seen == 2 && /^\|/ { print NR "\t" $0; next }
    seen == 2 && !/^\|/ { exit }
  ' "$1"
}

mermaid_deps_for() {
  # $1=file $2=target id
  awk -v target="$2" '
    /^```mermaid[[:space:]]*$/ { m=1; next }
    m && /^```[[:space:]]*$/ { m=0; next }
    m {
      line=$0
      if (match(line, /[EST][0-9]+[^\n-]*-->[[:space:]]*[EST][0-9]+/)) {
        left=line; sub(/-->.*/, "", left)
        right=line; sub(/.*-->[[:space:]]*/, "", right)
        if (match(left, /[EST][0-9]+/)) dep=substr(left, RSTART, RLENGTH); else dep=""
        if (match(right, /[EST][0-9]+/)) tgt=substr(right, RSTART, RLENGTH); else tgt=""
        if (tgt == target && dep != "") print dep
      }
    }' "$1"
}

node_json() {
  local level="$1" id="$2" parent="$3" name="$4" category="$5" status="$6" deps="$7" tokens="$8" hours="$9" source="${10}"
  [ -z "$parent" ] && parent_json='null' || parent_json="\"$(json_escape "$parent")\""
  printf '{"level":"%s","id":"%s","parent":%s,"name":"%s","category":"%s","status":"%s","deps":%s,"estimate_tokens":%s,"estimate_hours":%s,"source":%s,"planned_start":null,"planned_end":null}' \
    "$level" "$(json_escape "$id")" "$parent_json" "$(json_escape "$name")" "$(json_escape "$category")" \
    "$(json_escape "$status")" "$deps" "$tokens" "$hours" "$source"
}

sprint_plan_file() {
  find "$EPIC_DIR/sprints" -maxdepth 1 -type d -name "$1-*" 2>/dev/null | sort | head -1 | sed 's#$#/plan.md#'
}

epic_status() {
  local root top header idx_id idx_status line row id
  root="$1"
  top="$(git -C "$EPIC_DIR" rev-parse --show-toplevel 2>/dev/null)/docs/iteration/plan.md"
  [ -f "$top" ] || { printf '执行中'; return; }
  header="$(task_table_header "$top")"
  [ -z "$header" ] && { printf '执行中'; return; }
  idx_id="$(header_index "$header" "ID")"
  idx_status="$(header_index "$header" "状态")"
  while IFS="$(printf '\t')" read -r line row; do
    id="$(cell_value "$row" "$idx_id")"
    [ "$id" = "$root" ] && { normalize_status "$(cell_value "$row" "$idx_status")" "执行中"; return; }
  done <<EOF
$(task_table_rows "$top")
EOF
  printf '执行中'
}

SNAPSHOT='{"root":"","generated_at":"","nodes":[]}'
if [ -n "$EPIC_DIR" ] && [ -d "$EPIC_DIR" ] && [ -f "$EPIC_DIR/plan.md" ]; then
  ROOT="$(basename "$EPIC_DIR" | grep -Eo '^E[0-9]+' || true)"
  if [ -n "$ROOT" ]; then
    REPO_URL="$(repo_url)"
    COMMIT="$(git_head)"
    EPIC_PLAN="$EPIC_DIR/plan.md"
    GENERATED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    NODES=""
    H1="$(first_h1_heading "$EPIC_PLAN")"
    H1_LINE="$(first_h1_line "$EPIC_PLAN")"
    E_NODE="$(node_json "E" "$ROOT" "" "$H1" "" "$(epic_status "$ROOT")" "[]" "$(estimate_tokens_json "$(grep 'Token 预算上限' "$EPIC_PLAN" | head -1)")" "null" "$(source_json "$EPIC_PLAN" "$H1" "${H1_LINE:-1}")")"
    NODES="$E_NODE"

    EPIC_HEADER="$(table_header_after_heading "$EPIC_PLAN" "Sprint 清单与指标")"
    IDX_ID="$(header_index "$EPIC_HEADER" "ID")"
    IDX_NAME="$(header_index "$EPIC_HEADER" "名称")"
    IDX_CAT="$(header_index "$EPIC_HEADER" "分类")"
    IDX_DEPS="$(header_index "$EPIC_HEADER" "前置")"
    IDX_STATUS="$(header_index "$EPIC_HEADER" "状态")"
    IDX_TOKENS="$(header_index "$EPIC_HEADER" "估计Token")"
    IDX_HOURS="$(header_index "$EPIC_HEADER" "估计工时")"
    HAS_HOURS=0; [ -n "$IDX_HOURS" ] && HAS_HOURS=1
    while IFS="$(printf '\t')" read -r line row; do
      [ -z "$row" ] && continue
      ID="$(cell_value "$row" "$IDX_ID")"
      [ -z "$ID" ] && continue
      SP_FILE="$(sprint_plan_file "$ID")"
      if [ -n "$SP_FILE" ] && [ -f "$SP_FILE" ]; then
        SP_H="$(first_h1_heading "$SP_FILE")"
        SP_L="$(first_h1_line "$SP_FILE")"
        SRC="$(source_json "$SP_FILE" "$SP_H" "${SP_L:-1}")"
      else
        SRC="$(source_json "$EPIC_PLAN" "Sprint 清单与指标" "$line")"
      fi
      D_FIELD="$(cell_value "$row" "$IDX_DEPS")"
      M_DEPS="$(mermaid_deps_for "$EPIC_PLAN" "$ID" | tr '\n' ' ')"
      NODE="$(node_json "S" "$ID" "$ROOT" "$(cell_value "$row" "$IDX_NAME")" "$(normalize_category "$(cell_value "$row" "$IDX_CAT")")" "$(normalize_status "$(cell_value "$row" "$IDX_STATUS")")" "$(deps_json "$D_FIELD" "$M_DEPS")" "$(estimate_tokens_json "$(cell_value "$row" "$IDX_TOKENS")")" "$(estimate_hours_json "$(cell_value "$row" "$IDX_HOURS")" "$HAS_HOURS")" "$SRC")"
      NODES="$NODES,$NODE"
    done <<EOF
$(table_rows_after_heading "$EPIC_PLAN" "Sprint 清单与指标")
EOF

    for SP_FILE in "$EPIC_DIR"/sprints/S*/plan.md; do
      [ -f "$SP_FILE" ] || continue
      SPRINT_ID="$(basename "$(dirname "$SP_FILE")" | grep -Eo '^S[0-9]+' || true)"
      [ -z "$SPRINT_ID" ] && continue
      HEADER="$(task_table_header "$SP_FILE")"
      HEADING="$(task_table_heading "$SP_FILE")"
      IDX_ID="$(header_index "$HEADER" "ID")"
      IDX_NAME="$(header_index "$HEADER" "名称")"
      IDX_CAT="$(header_index "$HEADER" "分类")"
      IDX_DEPS="$(header_index "$HEADER" "前置")"
      IDX_STATUS="$(header_index "$HEADER" "状态")"
      IDX_TOKENS="$(header_index "$HEADER" "估计Token")"
      IDX_HOURS="$(header_index "$HEADER" "估计工时")"
      HAS_HOURS=0; [ -n "$IDX_HOURS" ] && HAS_HOURS=1
      while IFS="$(printf '\t')" read -r line row; do
        [ -z "$row" ] && continue
        ID="$(cell_value "$row" "$IDX_ID")"
        [ -z "$ID" ] && continue
        D_FIELD="$(cell_value "$row" "$IDX_DEPS")"
        M_DEPS="$(mermaid_deps_for "$SP_FILE" "$ID" | tr '\n' ' ')"
        SRC="$(source_json "$SP_FILE" "$HEADING" "$line")"
        NODE="$(node_json "T" "$ID" "$SPRINT_ID" "$(cell_value "$row" "$IDX_NAME")" "$(normalize_category "$(cell_value "$row" "$IDX_CAT")")" "$(normalize_status "$(cell_value "$row" "$IDX_STATUS")")" "$(deps_json "$D_FIELD" "$M_DEPS")" "$(estimate_tokens_json "$(cell_value "$row" "$IDX_TOKENS")")" "$(estimate_hours_json "$(cell_value "$row" "$IDX_HOURS")" "$HAS_HOURS")" "$SRC")"
        NODES="$NODES,$NODE"
      done <<EOF
$(task_table_rows "$SP_FILE")
EOF
    done
    SNAPSHOT="{\"root\":\"$(json_escape "$ROOT")\",\"generated_at\":\"$(json_escape "$GENERATED_AT")\",\"nodes\":[$NODES]}"
  fi
fi

if [ "$DRY_RUN" -eq 1 ]; then
  printf '%s\n' "$SNAPSHOT"
  exit 0
fi

if [ -n "$ENDPOINT" ]; then
  FPG_TELEMETRY_ENDPOINT="$ENDPOINT" "$EMIT_SH" --event-type plan_sync --project "$PROJECT" --attrs "{\"plan\":$SNAPSHOT}" >/dev/null 2>&1 || true
else
  "$EMIT_SH" --event-type plan_sync --project "$PROJECT" --attrs "{\"plan\":$SNAPSHOT}" >/dev/null 2>&1 || true
fi

exit 0
