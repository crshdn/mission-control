#!/usr/bin/env bash
# ARIA ↔ Mission Control Bridge (thin bash wrapper)
#
# Usage:
#   mc-bridge.sh agent-start --agent "Researcher" --task "Research Axe 2" [--label "researcher-1900"]
#   mc-bridge.sh agent-done  --agent "Researcher" --task-id <ID> --summary "Found 6 ideas"
#   mc-bridge.sh agent-error --agent "Researcher" --task-id <ID> --error "API timeout"
#   mc-bridge.sh status
#
# For the full Python version with label mapping, use mc-bridge.py instead.
# This bash version is a lightweight alternative using curl.

set -euo pipefail

MC_URL="${MC_URL:-http://localhost:3000}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

mc_get() {
  curl -sf --max-time 5 "${MC_URL}$1" 2>/dev/null
}

mc_post() {
  curl -sf --max-time 5 -X POST "${MC_URL}$1" \
    -H 'Content-Type: application/json' \
    -d "$2" 2>/dev/null
}

mc_patch() {
  curl -sf --max-time 5 -X PATCH "${MC_URL}$1" \
    -H 'Content-Type: application/json' \
    -d "$2" 2>/dev/null
}

# Find agent ID by name (case-insensitive via jq)
find_agent_id() {
  local name="$1"
  local agents
  agents=$(mc_get "/api/agents") || { echo "⚠️  Mission Control unreachable" >&2; return 1; }
  echo "$agents" | python3 -c "
import json, sys
agents = json.load(sys.stdin)
name = '${name}'.lower()
for a in agents:
    if a['name'].lower() == name:
        print(a['id'])
        sys.exit(0)
sys.exit(1)
" 2>/dev/null
}

# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

cmd_agent_start() {
  local agent="" task="" label="" description="" priority="normal"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --agent) agent="$2"; shift 2;;
      --task) task="$2"; shift 2;;
      --label) label="$2"; shift 2;;
      --description) description="$2"; shift 2;;
      --priority) priority="$2"; shift 2;;
      *) echo "Unknown option: $1" >&2; exit 1;;
    esac
  done

  [[ -z "$agent" ]] && { echo "❌ --agent required" >&2; exit 1; }
  [[ -z "$task" ]] && { echo "❌ --task required" >&2; exit 1; }

  local agent_id
  agent_id=$(find_agent_id "$agent") || { echo "❌ Agent not found: $agent" >&2; exit 1; }

  # Create task
  local body
  body=$(python3 -c "
import json
d = {
    'title': $(python3 -c "import json; print(json.dumps('$task'))"),
    'status': 'in_progress',
    'priority': '$priority',
    'assigned_agent_id': '$agent_id',
    'created_by_agent_id': '$agent_id',
    'workspace_id': 'default'
}
if '$description':
    d['description'] = $(python3 -c "import json; print(json.dumps('$description'))")
print(json.dumps(d))
")

  local result
  result=$(mc_post "/api/tasks" "$body") || { echo "❌ Failed to create task" >&2; exit 1; }

  local task_id
  task_id=$(echo "$result" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")

  # Set agent to working
  mc_patch "/api/agents/$agent_id" '{"status":"working"}' >/dev/null

  # Log activity
  local activity_msg="$agent started working"
  [[ -n "$label" ]] && activity_msg="$activity_msg (label: $label)"
  mc_post "/api/tasks/$task_id/activities" "{\"activity_type\":\"spawned\",\"message\":\"$activity_msg\",\"agent_id\":\"$agent_id\"}" >/dev/null

  # Output task ID
  echo "$task_id"
}

cmd_agent_done() {
  local agent="" task_id="" summary="Task completed" force_done=false

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --agent) agent="$2"; shift 2;;
      --task-id) task_id="$2"; shift 2;;
      --summary) summary="$2"; shift 2;;
      --done) force_done=true; shift;;
      *) echo "Unknown option: $1" >&2; exit 1;;
    esac
  done

  [[ -z "$agent" ]] && { echo "❌ --agent required" >&2; exit 1; }
  [[ -z "$task_id" ]] && { echo "❌ --task-id required" >&2; exit 1; }

  local agent_id
  agent_id=$(find_agent_id "$agent") || { echo "❌ Agent not found: $agent" >&2; exit 1; }

  local status="review"
  [[ "$force_done" == "true" ]] && status="done"

  mc_patch "/api/tasks/$task_id" "{\"status\":\"$status\"}" >/dev/null
  mc_patch "/api/agents/$agent_id" '{"status":"standby"}' >/dev/null
  mc_post "/api/tasks/$task_id/activities" "{\"activity_type\":\"completed\",\"message\":\"$agent: $summary\",\"agent_id\":\"$agent_id\"}" >/dev/null

  echo -e "${GREEN}✅ $agent → $status | $summary${NC}"
}

cmd_agent_error() {
  local agent="" task_id="" error_msg=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --agent) agent="$2"; shift 2;;
      --task-id) task_id="$2"; shift 2;;
      --error) error_msg="$2"; shift 2;;
      *) echo "Unknown option: $1" >&2; exit 1;;
    esac
  done

  [[ -z "$agent" ]] && { echo "❌ --agent required" >&2; exit 1; }
  [[ -z "$task_id" ]] && { echo "❌ --task-id required" >&2; exit 1; }
  [[ -z "$error_msg" ]] && { echo "❌ --error required" >&2; exit 1; }

  local agent_id
  agent_id=$(find_agent_id "$agent") || { echo "❌ Agent not found: $agent" >&2; exit 1; }

  mc_patch "/api/tasks/$task_id" '{"status":"review"}' >/dev/null
  mc_patch "/api/agents/$agent_id" '{"status":"standby"}' >/dev/null
  mc_post "/api/tasks/$task_id/activities" "{\"activity_type\":\"status_changed\",\"message\":\"⚠️ $agent error: $error_msg\",\"agent_id\":\"$agent_id\"}" >/dev/null

  echo -e "${YELLOW}⚠️ $agent → review | Error: $error_msg${NC}"
}

cmd_status() {
  local agents tasks

  agents=$(mc_get "/api/agents") || { echo "⚠️  Mission Control unreachable at $MC_URL" >&2; exit 1; }

  echo "── Agents ──────────────────────────────────"
  echo "$agents" | python3 -c "
import json, sys
agents = json.load(sys.stdin)
icons = {'working': '🟢', 'standby': '⚪', 'offline': '🔴'}
for a in agents:
    s = a.get('status', '?')
    i = icons.get(s, '❓')
    e = a.get('avatar_emoji', '🤖')
    m = ' 👑' if a.get('is_master') else ''
    print(f'  {i} {e} {a[\"name\"]:<20} {s}{m}')
"

  tasks=$(mc_get "/api/tasks?status=in_progress,assigned,review,testing") || tasks="[]"
  echo ""
  echo "── Active Tasks ────────────────────────────"
  echo "$tasks" | python3 -c "
import json, sys
tasks = json.load(sys.stdin)
if not tasks:
    print('  No active tasks')
    sys.exit(0)
icons = {'in_progress': '🔧', 'assigned': '📋', 'review': '👀', 'testing': '🧪'}
for t in tasks:
    s = t.get('status', '?')
    i = icons.get(s, '❓')
    a = t.get('assigned_agent_name', 'unassigned')
    print(f'  {i} [{s:<11}] {t[\"title\"][:50]:<50} → {a}')
    print(f'    id: {t[\"id\"]}')
"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

case "${1:-}" in
  agent-start) shift; cmd_agent_start "$@";;
  agent-done)  shift; cmd_agent_done "$@";;
  agent-error) shift; cmd_agent_error "$@";;
  status)      shift; cmd_status "$@";;
  *)
    echo "ARIA ↔ Mission Control Bridge (bash)"
    echo ""
    echo "Usage:"
    echo "  $0 agent-start --agent NAME --task TITLE [--label LABEL]"
    echo "  $0 agent-done  --agent NAME --task-id ID [--summary TEXT]"
    echo "  $0 agent-error --agent NAME --task-id ID --error TEXT"
    echo "  $0 status"
    echo ""
    echo "For the full version with label mapping, use mc-bridge.py"
    exit 1
    ;;
esac
