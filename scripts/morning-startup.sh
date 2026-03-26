#!/bin/zsh

set -euo pipefail

WORKSPACE_ROOT="/Users/jordan/.openclaw/workspace"
MISSION_CONTROL_DIR="$WORKSPACE_ROOT/mission-control"
STARTUP_NOTE="$MISSION_CONTROL_DIR/docs/MORNING_STARTUP.md"
DEFAULT_BRANCH="codex/full-rebuild-v240"
GATEWAY_PORT=18789
MISSION_CONTROL_PORT=4000
MISSION_CONTROL_URL="http://127.0.0.1:${MISSION_CONTROL_PORT}"
LAUNCHER_NAME="Start Cutline Workspace"
GATEWAY_LOG="/tmp/openclaw-gateway-start.log"
MISSION_CONTROL_LOG="/tmp/mission-control-dev.log"

bootstrap_env() {
  source ~/.zshrc >/dev/null 2>&1 || true
  export NVM_DIR="$HOME/.nvm"
  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    . "$NVM_DIR/nvm.sh"
    if [[ -f "$MISSION_CONTROL_DIR/.nvmrc" ]]; then
      nvm use "$(tr -d '[:space:]' < "$MISSION_CONTROL_DIR/.nvmrc")" >/dev/null 2>&1 || true
    else
      nvm use default >/dev/null 2>&1 || true
    fi
  fi
}

read_mission_control_env() {
  local key="$1"
  local env_file
  for env_file in "$MISSION_CONTROL_DIR/.env.local" "$MISSION_CONTROL_DIR/.env"; do
    if [[ -f "$env_file" ]]; then
      local value
      value="$(awk -F= -v target="$key" '
        $1 == target {
          sub(/^[^=]*=/, "", $0)
          print $0
          exit
        }
      ' "$env_file")"
      if [[ -n "$value" ]]; then
        printf '%s' "$value"
        return 0
      fi
    fi
  done
}

resolve_project_node_dir() {
  if [[ -f "$MISSION_CONTROL_DIR/.nvmrc" ]]; then
    local project_version
    project_version="$(tr -d '[:space:]' < "$MISSION_CONTROL_DIR/.nvmrc")"
    if [[ -n "$project_version" ]]; then
      local version_dir="${project_version#node/}"
      if [[ "$version_dir" != v* ]]; then
        version_dir="v$version_dir"
      fi
      printf '%s/.nvm/versions/node/%s/bin' "$HOME" "$version_dir"
      return 0
    fi
  fi

  return 1
}

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

start_background_job() {
  local label="$1"
  local command="$2"

  if [[ "${MORNING_STARTUP_DRY_RUN:-0}" == "1" ]]; then
    printf '[dry-run] start background job: %s\n' "$label"
    printf '[dry-run] command: %s\n' "$command"
    return 0
  fi

  /bin/zsh -lc "$command" >/dev/null 2>&1 &
}

is_port_listening() {
  local port="$1"
  lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
}

listening_pid() {
  local port="$1"
  lsof -tiTCP:"$port" -sTCP:LISTEN | head -n 1
}

mission_control_api_ready() {
  bootstrap_env
  local auth_header=()
  local token
  token="$(read_mission_control_env MC_API_TOKEN)"
  if [[ -n "$token" ]]; then
    auth_header=(-H "Authorization: Bearer $token")
  fi

  local code
  code="$(curl -s -o /tmp/mission-control-startup-workspaces.json -w '%{http_code}' "${auth_header[@]}" "$MISSION_CONTROL_URL/api/workspaces" || true)"
  [[ "$code" == "200" ]]
}

wait_for_port() {
  local port="$1"
  local timeout_seconds="${2:-30}"
  local elapsed=0

  while (( elapsed < timeout_seconds )); do
    if is_port_listening "$port"; then
      return 0
    fi
    sleep 1
    ((elapsed += 1))
  done

  return 1
}

wait_for_mission_control() {
  local timeout_seconds="${1:-45}"
  local elapsed=0

  while (( elapsed < timeout_seconds )); do
    if mission_control_api_ready; then
      return 0
    fi
    sleep 1
    ((elapsed += 1))
  done

  return 1
}

if [[ ! -d "$MISSION_CONTROL_DIR" ]]; then
  echo "Mission Control repo not found at $MISSION_CONTROL_DIR" >&2
  exit 1
fi

bootstrap_env

if NODE_BIN_DIR="$(resolve_project_node_dir)" \
  && [[ -x "$NODE_BIN_DIR/node" ]] \
  && [[ -x "$NODE_BIN_DIR/npm" ]]; then
  NODE_BIN="$NODE_BIN_DIR/node"
  NPM_BIN="$NODE_BIN_DIR/npm"
else
  NODE_BIN="$(command -v node)"
  NPM_BIN="$(command -v npm)"
  NODE_BIN_DIR="$(dirname "$NODE_BIN")"
fi

OPENCLAW_BIN="$NODE_BIN_DIR/openclaw"
if [[ ! -x "$OPENCLAW_BIN" ]]; then
  echo "openclaw is not installed in $NODE_BIN_DIR" >&2
  exit 1
fi
NPM_CLI_JS="$NODE_BIN_DIR/../lib/node_modules/npm/bin/npm-cli.js"
OPENCLAW_ENTRY="$NODE_BIN_DIR/../lib/node_modules/openclaw/openclaw.mjs"
NEXT_ENTRY="$MISSION_CONTROL_DIR/node_modules/next/dist/bin/next"
TSX_ENTRY="$MISSION_CONTROL_DIR/node_modules/tsx/dist/cli.mjs"

bootstrap_snippet='source ~/.zshrc >/dev/null 2>&1 || true; export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; nvm use default >/dev/null 2>&1 || true;'
MC_API_TOKEN_VALUE="$(read_mission_control_env MC_API_TOKEN)"
if [[ -n "$MC_API_TOKEN_VALUE" ]]; then
  GATEWAY_ENV_PREFIX="MC_API_TOKEN=$(printf '%q' "$MC_API_TOKEN_VALUE") "
else
  GATEWAY_ENV_PREFIX=""
fi

gateway_background_command="cd '$WORKSPACE_ROOT'; ${GATEWAY_ENV_PREFIX}'$NODE_BIN' '$OPENCLAW_ENTRY' gateway start >'$GATEWAY_LOG' 2>&1"
mission_control_background_command="cd '$MISSION_CONTROL_DIR'; PORT='$MISSION_CONTROL_PORT' '$NODE_BIN' '$NEXT_ENTRY' dev --turbo -p '$MISSION_CONTROL_PORT' >'$MISSION_CONTROL_LOG' 2>&1"
mission_control_window_command="${bootstrap_snippet} cd '$MISSION_CONTROL_DIR'; echo 'Mission Control dev server log tail'; echo; echo 'Node binary: $NODE_BIN'; echo 'npm binary: $NPM_BIN'; echo; tail -n 40 -f '$MISSION_CONTROL_LOG'; exec zsh -l"
doctor_command="${bootstrap_snippet} cd '$MISSION_CONTROL_DIR'; echo 'Mission Control morning check'; echo; echo 'Launcher: $LAUNCHER_NAME'; echo 'Expected branch: $DEFAULT_BRANCH'; echo 'Current branch:'; git branch --show-current; echo; echo 'Node:'; '$NODE_BIN' -v; echo 'npm:'; '$NPM_BIN' -v; echo; echo 'Doctor:'; '$NODE_BIN' '$TSX_ENTRY' scripts/cutline-telegram-intake.ts doctor; echo; echo 'Next command:'; echo 'npm run cutline:telegram -- submit --lane build --build-mode idea --product \"Mission Control\" --text \"Your request here\"'; echo; echo 'Reference note: $STARTUP_NOTE'; exec zsh -l"

if is_port_listening "$GATEWAY_PORT"; then
  echo "OpenClaw Gateway already listening on port $GATEWAY_PORT"
else
  : >"$GATEWAY_LOG"
  start_background_job "OpenClaw Gateway" "$gateway_background_command"
  wait_for_port "$GATEWAY_PORT" 20 || true
fi

if is_port_listening "$MISSION_CONTROL_PORT"; then
  if mission_control_api_ready; then
    echo "Mission Control already listening on port $MISSION_CONTROL_PORT"
  else
    existing_pid="$(listening_pid "$MISSION_CONTROL_PORT")"
    echo "Mission Control is listening on port $MISSION_CONTROL_PORT but failed the workspace check; restarting"
    if [[ -n "${existing_pid:-}" ]]; then
      kill "$existing_pid" >/dev/null 2>&1 || true
      sleep 1
    fi
    : >"$MISSION_CONTROL_LOG"
    start_background_job "Mission Control" "$mission_control_background_command"
  fi
else
  : >"$MISSION_CONTROL_LOG"
  start_background_job "Mission Control" "$mission_control_background_command"
fi

wait_for_mission_control 45 || true
open_terminal_window "Mission Control Log" "$mission_control_window_command"
open_terminal_window "Mission Control Check" "$doctor_command"
run_or_print "/usr/bin/open 'http://localhost:$MISSION_CONTROL_PORT'"
