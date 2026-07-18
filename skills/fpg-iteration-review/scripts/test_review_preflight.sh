#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE="$(mktemp -d)"
trap 'rm -rf "$FIXTURE"' EXIT

mkdir -p "$FIXTURE/docs/iteration/epics/E999-review/sprints/S001-check" "$FIXTURE/tests"
printf '%s\n' '# Progress' > "$FIXTURE/PROGRESS.md"
printf '%s\n' '# Epic plan' > "$FIXTURE/docs/iteration/epics/E999-review/plan.md"
printf '%s\n' '# Sprint plan' > "$FIXTURE/docs/iteration/epics/E999-review/sprints/S001-check/plan.md"
printf '%s\n' '# Smoke report' > "$FIXTURE/docs/iteration/epics/E999-review/sprints/S001-check/smoke-report.md"
printf '%s\n' 'automation_target: tests/present.sh' 'automation_target: tests/missing.sh' 'current_state: pending_approval' > "$FIXTURE/docs/iteration/epics/E999-review/requirements-map.yml"
printf '%s\n' '#!/usr/bin/env bash' > "$FIXTURE/tests/present.sh"

OUTPUT="$($SCRIPT_DIR/review_preflight.sh --project-root "$FIXTURE" --epic-dir docs/iteration/epics/E999-review)"
[[ "$OUTPUT" == *'present: tests/present.sh'* ]]
[[ "$OUTPUT" == *'MISSING: tests/missing.sh'* ]]
[[ "$OUTPUT" == *'Missing automation targets: 1'* ]]
[[ "$OUTPUT" == *'pending_approval'* ]]
echo "review_preflight self-test passed"
