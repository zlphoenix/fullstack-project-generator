#!/usr/bin/env bash
# fpg-check —— 迭代治理硬规则的机械校验（替代"靠模型记住 prose 条文"）。
# 依据：.fpg/references/iteration-governance.md（纯文档遵从率 ~25-40%，机械强制 ~95%）。
#
# 用法：
#   fpg-check.sh plan-lint <plan.md>    # 结构：必备区块、清单列、状态枚举、废除的测量值列
#   fpg-check.sh gate <epic-dir>        # 止损：终止契约存在性、Sprint 预算熔断、blocked-external
#   fpg-check.sh budget <epic-dir>      # 预算：已用 / 上限（token 实际消耗看遥测看板）
#   fpg-check.sh narrative-consistency <epic-dir> [--term <词>] [--slice <词>]
#                                           # 叙述文档横向勾稽：状态词 grep + 已知矛盾模式
#
# 输出每条 "OK|WARN|STOP <code>: 说明"，末尾一行总判定。
# 退出码（二元，便于 agent/CI 判断）：0 = 无 STOP（含仅 WARN，可继续）；2 = 有 STOP（必须停止）。
# **WARN 是提示、不阻断、退出码仍为 0**；只有 STOP 非零，且不可被执行线程绕过（执行卡约定）。
set -u

RC=0; WARN_N=0; STOP_N=0
ok()   { printf 'OK   %s: %s\n' "$1" "$2"; }
warn() { printf 'WARN %s: %s\n' "$1" "$2"; WARN_N=$((WARN_N + 1)); }   # 提示，不改退出码
stop() { printf 'STOP %s: %s\n' "$1" "$2"; STOP_N=$((STOP_N + 1)); RC=2; }

STATUSES='未开始|执行中|阻塞|已实现|已验证|已完成|搁置'
STATUSES_EN='Planned|In Progress|Blocked|Implemented|Verified|Done|Deferred'

trim() {
  printf '%s' "$1" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
}

cell_value() {
  [ -z "${2:-}" ] && { printf ''; return; }
  printf '%s' "$1" | awk -F'|' -v idx="$2" '{gsub(/^[ \t]+|[ \t]+$/, "", $idx); print $idx}'
}

header_index() {
  printf '%s' "$1" | awk -F'|' -v name="$2" '
    {
      for (i = 1; i <= NF; i++) {
        v = $i
        gsub(/^[ \t]+|[ \t]+$/, "", v)
        if (v == name) { print i; exit }
      }
    }'
}

first_task_table_header() {
  awk '/^\|/ && /ID/ && /名称/ { print; exit }' "$1"
}

first_task_table_rows() {
  awk '
    /^\|/ && /ID/ && /名称/ { seen=1; next }
    seen == 1 && /^\|[[:space:]]*:?-{3,}/ { seen=2; next }
    seen == 2 && /^\|/ { print; next }
    seen == 2 && !/^\|/ { exit }
  ' "$1"
}

plan_direct_child_kind() {
  case "$1" in
    */epics/E*/sprints/S*/plan.md) printf 'T Task';;
    */epics/E*/plan.md) printf 'S Sprint';;
    */iteration/plan.md) printf 'E Epic';;
    *) printf '';;
  esac
}

direct_child_identity_check() {
  local f="$1" kind label header idx_id row row_id count=0
  local info
  info="$(plan_direct_child_kind "$f")"
  [ -z "$info" ] && return
  kind="${info%% *}"
  label="${info#* }"

  header="$(first_task_table_header "$f")"
  [ -z "$header" ] && return
  idx_id="$(header_index "$header" "ID")"
  [ -z "$idx_id" ] && return

  while IFS= read -r row; do
    row_id="$(trim "$(cell_value "$row" "$idx_id")")"
    [ -z "$row_id" ] && continue
    count=$((count + 1))
    case "$kind:$row_id" in
      E:E[0-9][0-9][0-9]|S:S[0-9][0-9][0-9]|T:T[0-9][0-9][0-9]) ;;
      *) stop task_id "${label} 清单 ID 必须是精确 ${kind}###，不得使用组合/范围/别名：${row_id}";;
    esac
  done <<EOF
$(first_task_table_rows "$f")
EOF

  if [ "$kind" = "T" ] && [ "$count" -gt 4 ]; then
    stop task_granularity "Sprint Task 数 ${count} > 4：拆分过细或 Sprint 过大；合并同上下文边界 Task，或拆成独立 Sprint"
  fi
}

status_is_started() {
  case "$1" in
    "执行中"|"已实现"|"已验证"|"已完成") return 0;;
    *) return 1;;
  esac
}

status_consistency_check() {
  local f="$1" header idx_status row status child_started=0 child_count=0 child_done=0 parent_status=""
  header="$(first_task_table_header "$f")"
  [ -z "$header" ] && return
  idx_status="$(header_index "$header" "状态")"
  [ -z "$idx_status" ] && return
  while IFS= read -r row; do
    status="$(trim "$(cell_value "$row" "$idx_status")")"
    [ -z "$status" ] && continue
    child_count=$((child_count + 1))
    [ "$status" = "已完成" ] && child_done=$((child_done + 1))
    if status_is_started "$status"; then child_started=1; fi
  done <<EOF
$(first_task_table_rows "$f")
EOF

  parent_status="$(parent_status_for_plan "$f")"
  if [ "$child_started" -eq 1 ] && [ "$parent_status" = "未开始" ]; then
    warn status_consistency "状态过期：父级应至少为执行中"
  fi
  if [ "$child_count" -gt 0 ] && [ "$child_done" -eq "$child_count" ] && [ "$parent_status" != "已完成" ]; then
    warn status_consistency "应收口父级状态"
  fi
}

parent_status_for_plan() {
  local f="$1" dir base parent_file parent_id top_file
  dir="$(dirname "$f")"
  base="$(basename "$dir")"
  parent_id="$(printf '%s' "$base" | grep -Eo '^[EST][0-9]+' || true)"

  case "$f" in
    */epics/E*/sprints/S*/plan.md)
      parent_file="$(cd "$dir/../.." 2>/dev/null && pwd -P)/plan.md"
      parent_status_from_table "$parent_file" "$parent_id"
      ;;
    */epics/E*/plan.md)
      top_file="$(cd "$dir/../.." 2>/dev/null && pwd -P)/plan.md"
      parent_status_from_table "$top_file" "$parent_id"
      ;;
    *)
      printf ''
      ;;
  esac
}

parent_status_from_table() {
  local f="$1" id="$2" header idx_id idx_status row row_id
  [ -f "$f" ] || { printf ''; return; }
  header="$(first_task_table_header "$f")"
  [ -z "$header" ] && { printf ''; return; }
  idx_id="$(header_index "$header" "ID")"
  idx_status="$(header_index "$header" "状态")"
  [ -z "$idx_id" ] || [ -z "$idx_status" ] && { printf ''; return; }
  while IFS= read -r row; do
    row_id="$(trim "$(cell_value "$row" "$idx_id")")"
    if [ "$row_id" = "$id" ]; then
      trim "$(cell_value "$row" "$idx_status")"
      return
    fi
  done <<EOF
$(first_task_table_rows "$f")
EOF
  printf ''
}

# —— plan-lint <plan.md> ——————————————————————————————————————————
plan_lint() {
  local f="$1"
  [ -f "$f" ] || { stop missing_plan "文件不存在：$f"; return; }
  local content; content=$(cat "$f")

  # 1) 下级清单表：表头需含 ID/名称/状态/证据
  if printf '%s' "$content" | grep -qE '^\|.*ID.*\|.*名称.*\|' ; then
    if printf '%s' "$content" | grep -E '^\|.*ID.*\|.*名称.*\|' | head -1 | grep -q '状态' ; then
      ok list_header "下级清单表头含 ID/名称/状态"
    else
      warn list_header "下级清单表头缺「状态」列（统一列：| ID | 名称 | 分类 | 前置 | 可并行 | 状态 | 证据 |）"
    fi
  else
    warn list_missing "未找到下级清单表（每级 plan.md 必须含直接下级清单）"
  fi

  # 1.5) 直接子级 ID 必须是精确编号；Sprint Task 最多 4 个
  direct_child_identity_check "$f"

  # 2) 状态值合法性（仅检查清单数据行的状态列值是否出现非法词难度高 → 检查是否存在任何合法状态词）
  if printf '%s' "$content" | grep -qE "$STATUSES"; then
    ok status_vocab "检测到中文状态值"
  elif printf '%s' "$content" | grep -qE "$STATUSES_EN"; then
    warn status_vocab "仅检测到英文状态别名（兼容旧文档；新建/回填必须用中文状态）"
  else
    warn status_vocab "未检测到任何状态值（未开始/执行中/阻塞/已实现/已验证/已完成/搁置）"
  fi

  # 3) Mermaid 依赖图
  if printf '%s' "$content" | grep -q '```mermaid'; then
    ok mermaid "含 Mermaid 依赖图"
  else
    warn mermaid "缺 Mermaid 前序依赖图（E 级画 Sprint 关系，S 级画 Task 关系）"
  fi

  # 4) Epic 级 plan：终止契约 + 结构决策
  case "$f" in
    */epics/E*/sprints/S*/plan.md)
      ;;
    */epics/E*/plan.md)
      if printf '%s' "$content" | grep -q '终止契约'; then
        ok termination_contract "含「终止契约」区块"
        printf '%s' "$content" | grep -q 'Definition-of-Done' || warn dod "终止契约缺 Definition-of-Done 行"
        printf '%s' "$content" | grep -qE 'Sprint *预算上限' || warn sprint_budget "终止契约缺「Sprint 预算上限」行（熔断输入）"
      else
        stop termination_contract "Epic plan 缺「终止契约」区块——缺契约不得进入 Sprint 拆分/执行（治理规范 §9）"
      fi
      if printf '%s' "$content" | grep -q '结构决策'; then
        ok structure_decision "含「结构决策」行"
      else
        warn structure_decision "缺「结构决策」行（扁平 / Epic+N Sprint，规划期一次定死，治理规范 §10）"
      fi
      ;;
  esac

  # 5) 废除的手工测量值列（D1：测量值全靠 instrumentation）
  if printf '%s' "$content" | grep -qE '实际Token|主动耗时|等待耗时'; then
    warn manual_metrics "检测到手工测量值列（实际Token/主动耗时/等待耗时）——已废除，删除后改看遥测看板 GET /report"
  fi

  # 6) 同级 INDEX.md（单一真源）
  local dir; dir=$(dirname "$f")
  [ -f "$dir/INDEX.md" ] && warn index_md "存在同级 INDEX.md——违反单一真源，清单应只在 plan.md"

  # 7) 状态一致性：纯 plan WARN，不阻断。
  status_consistency_check "$f"
}

# —— 从 Epic plan 提取计划 Sprint 数与硬上限 ——
_planned_sprints() { # $1=epic plan.md → 输出 "planned cap"；提取失败输出空
  local row n cap
  row=$(grep -E 'Sprint *预算上限' "$1" 2>/dev/null | head -1)
  n=$(printf '%s' "$row" | grep -oE '[0-9]+' | head -1)
  [ -z "$n" ] && return 0
  cap=$(( (n * 12 + 9) / 10 ))   # ceil(n × 1.2)
  printf '%s %s' "$n" "$cap"
}

_actual_sprints() { # $1=epic-dir → 实际 Sprint 目录数
  find "$1/sprints" -maxdepth 1 -type d -name 'S[0-9]*' 2>/dev/null | wc -l | tr -d ' '
}

# —— gate <epic-dir> ——————————————————————————————————————————————
gate() {
  local d="$1" plan="$1/plan.md"
  [ -f "$plan" ] || { stop missing_plan "找不到 $plan"; return; }

  # 1) 终止契约存在性（执行前置）
  if ! grep -q '终止契约' "$plan"; then
    stop termination_contract "Epic plan 缺「终止契约」——不得执行，先回 sprint-plan 补契约"
  fi

  # 2) Sprint 预算熔断（计划 × 1.2 硬上限）
  local nums planned cap actual
  nums=$(_planned_sprints "$plan")
  if [ -n "$nums" ]; then
    planned=${nums% *}; cap=${nums#* }
    actual=$(_actual_sprints "$d")
    if [ "$actual" -gt "$cap" ]; then
      stop budget_breach "实际 Sprint 数 ${actual} 已超硬上限 ${cap}（计划 ${planned} × 1.2）——自动 STOP，进人类 re-baseline（收口/砍范围/批准扩预算 三选一）"
    elif [ "$actual" -ge "$cap" ]; then
      warn budget_edge "实际 Sprint 数 ${actual} 已达硬上限 ${cap}——本 Sprint 必须收口，不得再开新 Sprint"
    else
      ok budget "Sprint 预算：已用 ${actual} / 硬上限 ${cap}（计划 ${planned}）"
    fi
  else
    warn budget_unparsed "无法从终止契约解析「Sprint 预算上限」数字——熔断无法机械判定"
  fi

  # 3) blocked-external：终态，须升级人类，禁止派生相邻工作
  if grep -rqE 'blocked-external' "$plan" "$d/sprints" 2>/dev/null; then
    warn blocked_external "存在 blocked-external 项——终态：升级人类，禁止为其派生相邻脚手架；其余 DoD 达成可收口转 Backlog"
  fi

  # 4) token 预算提示（实际消耗看遥测看板，机械熔断由人对照看板执行）
  grep -qE 'Token *预算上限' "$plan" \
    && ok token_budget "终止契约含 Token 预算上限（实际消耗对照遥测看板 GET /report）" \
    || warn token_budget "终止契约缺「Token 预算上限」行"
}

# —— budget <epic-dir> ————————————————————————————————————————————
budget() {
  local d="$1" plan="$1/plan.md"
  [ -f "$plan" ] || { stop missing_plan "找不到 $plan"; return; }
  local nums planned cap actual
  nums=$(_planned_sprints "$plan"); actual=$(_actual_sprints "$d")
  if [ -n "$nums" ]; then
    planned=${nums% *}; cap=${nums#* }
    printf 'Sprint: 已用 %s / 计划 %s / 硬上限 %s\n' "$actual" "$planned" "$cap"
  else
    printf 'Sprint: 已用 %s / 计划 ?（终止契约未解析出预算上限）\n' "$actual"
  fi
  grep -E 'Token *预算上限' "$plan" | head -1 || printf 'Token 预算上限：未填写\n'
  printf 'Token 实际消耗：看遥测看板 GET /report（instrumentation，不手工记账）\n'
  RC=0
}

narrative_file_list() {
  local d="$1"
  find "$d" -type f \( \
    -name 'plan.md' \
    -o -name 'smoke-report.md' \
    -o -name 'checklist*.md' \
    -o -name '*review*.md' \
    -o -name 'worklog.md' \
    -o -name 'test-regression-review.md' \
  \) 2>/dev/null | sort
}

project_root_for_epic() {
  local d="$1" root
  root="$(cd "$d/../../../.." 2>/dev/null && pwd -P)" || return 1
  printf '%s' "$root"
}

grep_narrative() {
  local d="$1" pattern="$2" f
  narrative_file_list "$d" | while IFS= read -r f; do
    [ -n "$f" ] || continue
    grep -InE -e "$pattern" "$f" 2>/dev/null || true
  done
}

slugify_term() {
  printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^[:alnum:]]+/-/g; s/^-+//; s/-+$//'
}

term_file_pattern() {
  local term="$1" slug
  slug="$(slugify_term "$term")"
  case "$term" in
    *parser*|*Parser*) printf 'parser'; return;;
    *配置*parser*|*配置*Parser*) printf 'config|parser'; return;;
  esac
  if [ -n "$slug" ]; then
    printf '%s' "$slug"
  else
    printf '%s' "$term"
  fi
}

find_impl_files_for_term() {
  local root="$1" term="$2" pattern
  pattern="$(term_file_pattern "$term")"
  find "$root" -type f \
    ! -path '*/.git/*' \
    ! -path '*/docs/iteration/*' \
    ! -path '*/node_modules/*' \
    ! -path '*/.fpg/*' \
    2>/dev/null \
    | grep -E "$pattern" \
    | grep -E '\.(ts|tsx|js|jsx|java|kt|swift|go|rb|rs|py|sh|yaml|yml|json|md)$' \
    | sort
}

has_code_and_test_for_term() {
  local root="$1" term="$2" files code test f rel
  files="$(find_impl_files_for_term "$root" "$term" || true)"
  code="$(printf '%s\n' "$files" | grep -Ev '(^|/)(test|tests|__tests__)/|(\.|-)(test|spec)\.' | head -1 || true)"
  test="$(printf '%s\n' "$files" | grep -E '(^|/)(test|tests|__tests__)/|(\.|-)(test|spec)\.' | head -1 || true)"
  [ -n "$code" ] && [ -n "$test" ] || return 1
  for f in "$code" "$test"; do
    rel="${f#$root/}"
    printf '%s ' "$rel"
  done
}

line_token() {
  local line="$1" token
  token="$(printf '%s' "$line" | grep -Eo '([A-Z][0-9]{3}(/[A-Z]?[0-9]{3})*|[A-Z][0-9]{3}-[A-Z][0-9]{3})[^|:：，,。;；]*' | head -1 || true)"
  if [ -n "$token" ]; then
    token="$(printf '%s' "$token" | sed -E 's/[[:space:]]*(待审批|待确认|未审批|不在.*|已调整|已按.*|已解决|已实现|已修复|pass|通过).*$//')"
    trim "$token"
    return
  fi
  printf '%s' "$line" | awk -F'|' '{for(i=1;i<=NF;i++){gsub(/^[ \t]+|[ \t]+$/, "", $i); if($i!=""){print $i; exit}}}'
}

same_slice_hit() {
  local text="$1" slice
  shift
  for slice in "$@"; do
    [ -n "$slice" ] || continue
    printf '%s' "$text" | grep -Fq -e "$slice" && return 0
  done
  return 1
}

narrative_emit() {
  local code="$1" msg="$2" text="$3"
  shift 3
  if same_slice_hit "$text" "$@"; then
    stop "$code" "$msg"
  else
    warn "$code" "$msg"
  fi
}

check_approval_conflicts() {
  local d="$1"; shift
  local pending adjusted p_line a_line p_key a_key text
  pending="$(grep_narrative "$d" '待审批|待确认|未审批|不在[^[:space:]]*修改|blocked|TODO' || true)"
  adjusted="$(grep_narrative "$d" '已调整|已按.*审批.*调整|已解决|已实现|已修复|pass|通过' || true)"
  [ -n "$pending" ] && [ -n "$adjusted" ] || return

  while IFS= read -r p_line; do
    [ -n "$p_line" ] || continue
    p_key="$(line_token "${p_line#*:}")"
    [ -n "$p_key" ] || continue
    while IFS= read -r a_line; do
      [ -n "$a_line" ] || continue
      a_key="$(line_token "${a_line#*:}")"
      [ "$p_key" = "$a_key" ] || continue
      text="$p_line"$'\n'"$a_line"
      narrative_emit narrative_conflict "同一叙述项同时出现待处理与已处理口径：${p_key}；请覆盖旧表述，不要追加新行。grep: ${p_line} || ${a_line}" "$text" "$@"
    done <<EOF
$adjusted
EOF
  done <<EOF
$pending
EOF
}

check_deferred_implemented() {
  local d="$1" root="$2"; shift 2
  local terms="$1"; shift
  local deferred line term hits text
  deferred="$(grep_narrative "$d" '推迟|待审批|未实现|未接生产|blocked|TODO|旧API名|旧字段名' || true)"
  [ -n "$deferred" ] || return

  while IFS= read -r term; do
    [ -n "$term" ] || continue
    while IFS= read -r line; do
      [ -n "$line" ] || continue
      printf '%s' "$line" | grep -Fq -e "$term" || continue
      hits="$(has_code_and_test_for_term "$root" "$term" || true)"
      [ -n "$hits" ] || continue
      text="$line"$'\n'"$hits"
      narrative_emit narrative_deferred_implemented "叙述仍标「推迟/待处理」，但对应代码和测试已存在：${term}；请改正旧表述。grep: ${line}；code/test: ${hits}" "$text" "$@"
    done <<EOF
$deferred
EOF
  done <<EOF
$terms
EOF
}

extract_deferred_terms() {
  local d="$1"
  grep_narrative "$d" '推迟|待审批|未实现|未接生产|blocked|TODO|旧API名|旧字段名' \
    | sed -E 's/.*[:：|] *([^|:：，,。;；]+) *(推迟|待审批|未实现|未接生产|blocked|TODO|旧API名|旧字段名).*/\1/; s/.*[-*] *([^，,。;；]+) *(推迟|待审批|未实现|未接生产|blocked|TODO|旧API名|旧字段名).*/\1/' \
    | sed -E 's/^[[:space:]]+|[[:space:]]+$//g' \
    | awk 'length($0) > 0 && length($0) < 80 { print }' \
    | sort -u
}

narrative_consistency() {
  local d="$1"; shift
  [ -d "$d" ] || { stop missing_epic "目录不存在：$d"; return; }
  local root terms="" slices="" arg next
  root="$(project_root_for_epic "$d" 2>/dev/null || true)"
  [ -n "$root" ] || root="$(cd "$d" 2>/dev/null && pwd -P)"

  while [ "$#" -gt 0 ]; do
    arg="$1"; shift
    case "$arg" in
      --term|--slice)
        [ "$#" -gt 0 ] || { stop bad_args "${arg} 缺少参数"; return; }
        next="$1"; shift
        if [ "$arg" = "--term" ]; then
          terms="${terms}${next}
"
        else
          slices="${slices}${next}
"
        fi
        ;;
      *)
        terms="${terms}${arg}
"
        ;;
    esac
  done

  check_approval_conflicts "$d" $slices
  if [ -z "$(trim "$terms")" ]; then
    terms="$(extract_deferred_terms "$d" || true)"
  fi
  check_deferred_implemented "$d" "$root" "$terms" $slices
  [ "$WARN_N" -eq 0 ] && [ "$STOP_N" -eq 0 ] && ok narrative_consistency "未发现已知叙述矛盾模式；仍需按执行卡给出 grep 结果与逐条处置"
}

cmd="${1:-}"; target="${2:-}"
case "$cmd" in
  plan-lint) [ -n "$target" ] || { echo "用法: fpg-check.sh plan-lint <plan.md>"; exit 2; }; plan_lint "$target";;
  gate)      [ -n "$target" ] || { echo "用法: fpg-check.sh gate <epic-dir>"; exit 2; };      gate "$target";;
  budget)    [ -n "$target" ] || { echo "用法: fpg-check.sh budget <epic-dir>"; exit 2; };    budget "$target"; exit 0;;
  narrative-consistency)
             [ -n "$target" ] || { echo "用法: fpg-check.sh narrative-consistency <epic-dir> [--term <词>] [--slice <词>]"; exit 2; }
             shift 2; narrative_consistency "$target" "$@";;
  *) echo "用法: fpg-check.sh {plan-lint <plan.md> | gate <epic-dir> | budget <epic-dir> | narrative-consistency <epic-dir> [--term <词>] [--slice <词>]}"; exit 2;;
esac

# —— 总判定（消除"退出码非零但只有 WARN"的歧义）——
if [ "$STOP_N" -gt 0 ]; then
  printf '判定：STOP（%d 项硬阻断 / %d 项提示）——必须停止并升级人类，不得绕过。\n' "$STOP_N" "$WARN_N"
else
  printf '判定：通过（0 硬阻断 / %d 项提示）——WARN 仅为提示，可继续本切片。\n' "$WARN_N"
fi
exit "$RC"
