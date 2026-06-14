#!/usr/bin/env bash
# Manage the telemetry collector with defaults loaded from telemetry/.env.
set -u

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" 2>/dev/null && pwd -P)"
TELEMETRY_DIR="$(cd "$SCRIPT_DIR/.." 2>/dev/null && pwd -P)"
ENV_FILE="${FPG_TELEMETRY_ENV:-$TELEMETRY_DIR/.env}"
PID_FILE="${FPG_TELEMETRY_PID:-$TELEMETRY_DIR/data/collector.pid}"
LOG_FILE="${FPG_TELEMETRY_LOG:-$TELEMETRY_DIR/data/collector.log}"

load_env() {
  if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$ENV_FILE"
    set +a
  fi
  FPG_TELEMETRY_PORT="${FPG_TELEMETRY_PORT:-10000}"
  FPG_TELEMETRY_DB="${FPG_TELEMETRY_DB:-./data/events.db}"
  FPG_TELEMETRY_TOKEN="${FPG_TELEMETRY_TOKEN:-}"
}

pid_running() {
  local pid="${1:-}"
  [ -n "$pid" ] && kill -0 "$pid" >/dev/null 2>&1
}

current_pid() {
  [ -f "$PID_FILE" ] && cat "$PID_FILE"
}

start() {
  load_env
  local pid
  pid="$(current_pid)"
  if pid_running "$pid"; then
    printf 'collector already running pid=%s port=%s\n' "$pid" "$FPG_TELEMETRY_PORT"
    return 0
  fi
  mkdir -p "$(dirname "$PID_FILE")" "$(dirname "$LOG_FILE")"
  (
    cd "$TELEMETRY_DIR" || exit 1
    FPG_TELEMETRY_PORT="$FPG_TELEMETRY_PORT" \
    FPG_TELEMETRY_DB="$FPG_TELEMETRY_DB" \
    FPG_TELEMETRY_TOKEN="$FPG_TELEMETRY_TOKEN" \
    bun run collector >>"$LOG_FILE" 2>&1
  ) &
  pid="$!"
  printf '%s\n' "$pid" > "$PID_FILE"
  printf 'collector started pid=%s port=%s db=%s log=%s\n' "$pid" "$FPG_TELEMETRY_PORT" "$FPG_TELEMETRY_DB" "$LOG_FILE"
}

stop() {
  local pid
  pid="$(current_pid)"
  if ! pid_running "$pid"; then
    rm -f "$PID_FILE"
    printf 'collector not running\n'
    return 0
  fi
  kill "$pid" >/dev/null 2>&1 || true
  for _ in 1 2 3 4 5; do
    pid_running "$pid" || break
    sleep 0.2
  done
  if pid_running "$pid"; then
    kill -9 "$pid" >/dev/null 2>&1 || true
  fi
  rm -f "$PID_FILE"
  printf 'collector stopped pid=%s\n' "$pid"
}

status() {
  load_env
  local pid
  pid="$(current_pid)"
  if pid_running "$pid"; then
    printf 'collector running pid=%s port=%s db=%s\n' "$pid" "$FPG_TELEMETRY_PORT" "$FPG_TELEMETRY_DB"
  else
    printf 'collector stopped port=%s db=%s\n' "$FPG_TELEMETRY_PORT" "$FPG_TELEMETRY_DB"
  fi
}

config() {
  load_env
  printf 'FPG_TELEMETRY_ENV=%s\n' "$ENV_FILE"
  printf 'FPG_TELEMETRY_PORT=%s\n' "$FPG_TELEMETRY_PORT"
  printf 'FPG_TELEMETRY_DB=%s\n' "$FPG_TELEMETRY_DB"
  if [ -n "$FPG_TELEMETRY_TOKEN" ]; then
    printf 'FPG_TELEMETRY_TOKEN=(set)\n'
  else
    printf 'FPG_TELEMETRY_TOKEN=(empty)\n'
  fi
  printf 'FPG_TELEMETRY_PID=%s\n' "$PID_FILE"
  printf 'FPG_TELEMETRY_LOG=%s\n' "$LOG_FILE"
}

case "${1:-}" in
  start) start;;
  stop) stop;;
  restart) stop; start;;
  status) status;;
  config) config;;
  *)
    printf 'Usage: collector.sh {start|stop|restart|status|config}\n' >&2
    exit 2
    ;;
esac
