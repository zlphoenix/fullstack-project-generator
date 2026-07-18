#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT=""
EPIC_DIR=""

usage() { echo "usage: $0 --project-root <path> --epic-dir <path>" >&2; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-root) PROJECT_ROOT="${2:-}"; shift 2 ;;
    --epic-dir) EPIC_DIR="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done

[[ -n "$PROJECT_ROOT" && -d "$PROJECT_ROOT" ]] || { echo "invalid --project-root" >&2; exit 2; }
if [[ -n "$EPIC_DIR" && "$EPIC_DIR" != /* ]]; then EPIC_DIR="$PROJECT_ROOT/$EPIC_DIR"; fi
[[ -n "$EPIC_DIR" && -d "$EPIC_DIR" ]] || { echo "invalid --epic-dir" >&2; exit 2; }
command -v rg >/dev/null 2>&1 || { echo "rg is required" >&2; exit 2; }

cd "$PROJECT_ROOT"
echo "# FPG Iteration Review Preflight"
echo
echo "- Project: $PROJECT_ROOT"
echo "- Epic: $EPIC_DIR"
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "- Branch: $(git branch --show-current)"
  echo "- HEAD: $(git rev-parse --short HEAD)"
  dirty_count="$(git status --short | wc -l | tr -d ' ')"
  echo "- Dirty paths: $dirty_count"
else
  echo "- Git: unavailable"
fi

echo
echo "## Core Assets"
for path in "$EPIC_DIR/plan.md" "$PROJECT_ROOT/PROGRESS.md"; do
  if [[ -f "$path" ]]; then echo "- present: ${path#$PROJECT_ROOT/}"; else echo "- MISSING: ${path#$PROJECT_ROOT/}"; fi
done
while IFS= read -r sprint_plan; do
  sprint_dir="$(dirname "$sprint_plan")"
  echo "- sprint plan: ${sprint_plan#$PROJECT_ROOT/}"
  [[ -f "$sprint_dir/smoke-report.md" ]] && echo "- smoke report: ${sprint_dir#$PROJECT_ROOT/}/smoke-report.md" || echo "- MISSING smoke report: ${sprint_dir#$PROJECT_ROOT/}/smoke-report.md"
done < <(find "$EPIC_DIR" -path '*/sprints/*/plan.md' -type f | sort)

echo
echo "## Referenced Automation Targets"
target_count=0
missing_count=0
while IFS= read -r target; do
  [[ -n "$target" ]] || continue
  target_count=$((target_count + 1))
  if [[ -e "$PROJECT_ROOT/$target" ]]; then echo "- present: $target"; else echo "- MISSING: $target"; missing_count=$((missing_count + 1)); fi
done < <(rg -No 'automation_target:[[:space:]]*[^#[:space:]]+' "$EPIC_DIR" -g '*.yml' -g '*.yaml' 2>/dev/null | sed -E 's/.*automation_target:[[:space:]]*//' | sort -u || true)
[[ "$target_count" -gt 0 ]] || echo "- none declared"

echo
echo "## Potential Narrative Drift"
drift_pattern='TODO|FIXME|pending_approval|待审批|未实现|blocked|阻塞|[0-9]+ tests.*[1-9][0-9]* failures|MySQL 5\.7|旧API|旧字段'
if ! rg -n -i "$drift_pattern" "$EPIC_DIR" -g '*.md' -g '*.yml' -g '*.yaml' | head -120; then echo "- no common drift terms found"; fi

echo
echo "## Summary"
echo "- Automation targets: $target_count"
echo "- Missing automation targets: $missing_count"
echo "- Note: preflight findings are review leads, not acceptance results."
