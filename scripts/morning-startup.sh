#!/bin/zsh

set -euo pipefail

WORKSPACE_ROOT="/Users/jordan/.openclaw/workspace"
MISSION_CONTROL_DIR="$WORKSPACE_ROOT/mission-control"
STARTUP_NOTE="$MISSION_CONTROL_DIR/docs/MORNING_STARTUP.md"
DEFAULT_BRANCH="codex/full-rebuild-v240"
GATEWAY_PORT=18789
MISSION_CONTROL_PORT=4000

run_or_print() {
  if [[ "${MORNING_STARTUP_DRY_RUN:-0}" == "1" ]]; then
    printf '[dry-run] %s\n' "$1"
    return 0
  fi

  eval "$1"
}

escape_for_osascript() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

open_terminal_window() {
  local title="$1"
  local command="$2"
  local escaped_command
  escaped_command="$(escape_for_osascript "$command")"

  if [[ "${MORNING_STARTUP_DRY_RUN:-0}" == "1" ]]; then
    printf '[dry-run] open terminal window: %s\n' "$title"
    printf '[dry-run] command: %s\n' "$command"
    return 0
  fi

  /usr/bin/osascript <<APPLESCRIPT
tell application "Terminal"
  activate
  do script "$escaped_command"
end tell
APPLESCRIPT
}

is_port_listening() {
  local port="$1"
  lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
}

if [[ ! -d "$MISSION_CONTROL_DIR" ]]; then
  echo "Mission Control repo not found at $MISSION_CONTROL_DIR" >&2
  exit 1
fi

if ! command -v openclaw >/dev/null 2>&1; then
  echo "openclaw is not installed or not on PATH" >&2
  exit 1
fi

gateway_command="source ~/.zshrc >/dev/null 2>&1; openclaw gateway start; exec zsh -l"
mission_control_command="cd '$MISSION_CONTROL_DIR'; git branch --show-current; if [ -n \"\$(git status --short)\" ]; then echo; echo 'Repo has local changes:'; git status --short; echo; fi; npm run dev; exec zsh -l"
doctor_command="cd '$MISSION_CONTROL_DIR'; echo 'Mission Control morning check'; echo; echo 'Expected branch: $DEFAULT_BRANCH'; echo 'Current branch:'; git branch --show-current; echo; echo 'Doctor:'; npm run cutline:telegram -- doctor; echo; echo 'Next command:'; echo 'npm run cutline:telegram -- submit --lane build --build-mode idea --product \"Mission Control\" --text \"Your request here\"'; echo; echo 'Reference note: $STARTUP_NOTE'; exec zsh -l"

if is_port_listening "$GATEWAY_PORT"; then
  echo "OpenClaw Gateway already listening on port $GATEWAY_PORT"
else
  open_terminal_window "OpenClaw Gateway" "$gateway_command"
fi

if is_port_listening "$MISSION_CONTROL_PORT"; then
  echo "Mission Control already listening on port $MISSION_CONTROL_PORT"
else
  open_terminal_window "Mission Control" "$mission_control_command"
fi

open_terminal_window "Mission Control Check" "$doctor_command"
run_or_print "/usr/bin/open 'http://localhost:$MISSION_CONTROL_PORT'"

