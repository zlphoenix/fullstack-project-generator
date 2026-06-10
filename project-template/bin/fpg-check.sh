#!/usr/bin/env bash
# fpg-check —— 迭代治理硬规则的机械校验（替代"靠模型记住 prose 条文"）。
# 依据：.fpg/references/iteration-governance.md（纯文档遵从率 ~25-40%，机械强制 ~95%）。
#
# 用法：
#   fpg-check.sh plan-lint <plan.md>    # 结构：必备区块、清单列、状态枚举、废除的测量值列
#   fpg-check.sh gate <epic-dir>        # 止损：终止契约存在性、Sprint 预算熔断、blocked-external
#   fpg-check.sh budget <epic-dir>      # 预算：已用 / 上限（token 实际消耗看遥测看板）
#
# 输出每条 "OK|WARN|STOP <code>: 说明"；退出码：0=全 OK，1=有 WARN，2=有 STOP。
# STOP 不可被执行线程绕过：必须停止并升级人类（执行卡约定）。
set -u

RC=0
ok()   { printf 'OK   %s: %s\n' "$1" "$2"; }
warn() { printf 'WARN %s: %s\n' "$1" "$2"; [ "$RC" -lt 1 ] && RC=1; }
stop() { printf 'STOP %s: %s\n' "$1" "$2"; RC=2; }

STATUSES='未开始|执行中|阻塞|已实现|已验证|已完成|搁置'
STATUSES_EN='Planned|In Progress|Blocked|Implemented|Verified|Done|Deferred'

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
      stop budget_breach "实际 Sprint 数 $actual 已超硬上限 $cap（计划 $planned × 1.2）——自动 STOP，进人类 re-baseline（收口/砍范围/批准扩预算 三选一）"
    elif [ "$actual" -ge "$cap" ]; then
      warn budget_edge "实际 Sprint 数 $actual 已达硬上限 $cap——本 Sprint 必须收口，不得再开新 Sprint"
    else
      ok budget "Sprint 预算：已用 $actual / 硬上限 $cap（计划 $planned）"
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

cmd="${1:-}"; target="${2:-}"
case "$cmd" in
  plan-lint) [ -n "$target" ] || { echo "用法: fpg-check.sh plan-lint <plan.md>"; exit 2; }; plan_lint "$target";;
  gate)      [ -n "$target" ] || { echo "用法: fpg-check.sh gate <epic-dir>"; exit 2; };      gate "$target";;
  budget)    [ -n "$target" ] || { echo "用法: fpg-check.sh budget <epic-dir>"; exit 2; };    budget "$target";;
  *) echo "用法: fpg-check.sh {plan-lint <plan.md> | gate <epic-dir> | budget <epic-dir>}"; exit 2;;
esac
exit "$RC"
