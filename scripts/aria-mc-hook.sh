#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# ARIA → Mission Control Hook
# One-liner wrapper for ARIA to notify MC when agents spawn/finish.
#
# Usage:
#   aria-mc-hook.sh start <label> <task-title>
#     → prints task_id to stdout (capture it for later)
#
#   aria-mc-hook.sh done <label> <task-id> [summary]
#     → marks task complete, agent back to standby
#
#   aria-mc-hook.sh error <label> <task-id> [error-message]
#     → marks task in review with error, agent back to standby
#
#   aria-mc-hook.sh update <label> <task-id> <message>
#     → logs progress activity without changing status
#
#   aria-mc-hook.sh tmux-start <label> <task-title>
#     → same as start, for tmux Claude Code sessions
#
#   aria-mc-hook.sh tmux-done <label> <task-id> [summary]
#     → same as done, for tmux sessions
#
# Examples:
#   TASK_ID=$(aria-mc-hook.sh start researcher-1900 "Research Axe 2 Business")
#   aria-mc-hook.sh done researcher-1900 "$TASK_ID" "Found 6 viable ideas"
#   aria-mc-hook.sh error coder-fix-bug "$TASK_ID" "Build failed"
#
# Design: Fails silently if MC is down (never blocks ARIA).
# ─────────────────────────────────────────────────────────────────

MC_URL="${MC_URL:-http://localhost:3000}"
BRIDGE="$(dirname "$0")/mc-bridge.py"
TIMEOUT=5

# ─── Label → Agent name mapping ────────────────────────────────
resolve_agent() {
  local label
  label=$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')
  case "$label" in
    researcher*)         echo "Researcher" ;;
    coder*|fix-*|dev-*)  echo "Coder" ;;
    brainstorm*)         echo "Brainstorm" ;;
    qa*|test-*)          echo "QA" ;;
    linkedin*|writer*)   echo "LinkedIn Writer" ;;
    synth*|brief*|morning*) echo "Synthesizer" ;;
    archiv*|journal*)    echo "Archivist" ;;
    diving*|casar*)      echo "Diving" ;;
    home*|tv-*|sonos-*)  echo "Home" ;;
    monitor*)            echo "Monitor" ;;
    aria*)               echo "ARIA" ;;
    *)                   echo "" ;;
  esac
}

# ─── Quick health check (non-blocking) ─────────────────────────
mc_alive() {
  curl -sf --max-time 2 "${MC_URL}/api/agents" >/dev/null 2>&1
}

# ─── Main ───────────────────────────────────────────────────────
CMD="${1:-}"
shift 2>/dev/null || true

case "$CMD" in

  start|tmux-start)
    LABEL="${1:?Usage: aria-mc-hook.sh start <label> <task-title>}"
    shift
    TITLE="${*:?Usage: aria-mc-hook.sh start <label> <task-title>}"
    AGENT=$(resolve_agent "$LABEL")

    if [[ -z "$AGENT" ]]; then
      # Unknown label → try as direct agent name
      AGENT="$LABEL"
    fi

    # Fail silently if MC is down
    if ! mc_alive; then
      exit 0
    fi

    # Use the Python bridge (has full label mapping + error handling)
    DESCRIPTION=""
    [[ "$CMD" == "tmux-start" ]] && DESCRIPTION="[tmux session: $LABEL]"

    TASK_ID=$(timeout "$TIMEOUT" python3 "$BRIDGE" agent-start \
      --agent "$AGENT" \
      --task "$TITLE" \
      --label "$LABEL" \
      ${DESCRIPTION:+--description "$DESCRIPTION"} \
      2>/dev/null) || exit 0

    # Output task ID for ARIA to capture
    echo "$TASK_ID"
    ;;

  done|tmux-done)
    LABEL="${1:?Usage: aria-mc-hook.sh done <label> <task-id> [summary]}"
    TASK_ID="${2:?Usage: aria-mc-hook.sh done <label> <task-id> [summary]}"
    SUMMARY="${3:-Task completed}"
    AGENT=$(resolve_agent "$LABEL")

    [[ -z "$AGENT" ]] && AGENT="$LABEL"

    if ! mc_alive; then
      exit 0
    fi

    timeout "$TIMEOUT" python3 "$BRIDGE" agent-done \
      --agent "$AGENT" \
      --task-id "$TASK_ID" \
      --summary "$SUMMARY" \
      --done \
      >/dev/null 2>&1 || exit 0
    ;;

  error)
    LABEL="${1:?Usage: aria-mc-hook.sh error <label> <task-id> [error-message]}"
    TASK_ID="${2:?Usage: aria-mc-hook.sh error <label> <task-id> [error-message]}"
    ERROR_MSG="${3:-Unknown error}"
    AGENT=$(resolve_agent "$LABEL")

    [[ -z "$AGENT" ]] && AGENT="$LABEL"

    if ! mc_alive; then
      exit 0
    fi

    timeout "$TIMEOUT" python3 "$BRIDGE" agent-error \
      --agent "$AGENT" \
      --task-id "$TASK_ID" \
      --error "$ERROR_MSG" \
      >/dev/null 2>&1 || exit 0
    ;;

  update)
    LABEL="${1:?Usage: aria-mc-hook.sh update <label> <task-id> <message>}"
    TASK_ID="${2:?Usage: aria-mc-hook.sh update <label> <task-id> <message>}"
    shift 2
    MESSAGE="${*:?Usage: aria-mc-hook.sh update <label> <task-id> <message>}"
    AGENT=$(resolve_agent "$LABEL")

    [[ -z "$AGENT" ]] && AGENT="$LABEL"

    if ! mc_alive; then
      exit 0
    fi

    timeout "$TIMEOUT" python3 "$BRIDGE" agent-update \
      --agent "$AGENT" \
      --task-id "$TASK_ID" \
      --message "$MESSAGE" \
      >/dev/null 2>&1 || exit 0
    ;;

  *)
    echo "ARIA → Mission Control Hook"
    echo ""
    echo "Usage:"
    echo "  $0 start   <label> <task-title>           → returns task_id"
    echo "  $0 done    <label> <task-id> [summary]     → mark complete"
    echo "  $0 error   <label> <task-id> [error-msg]   → mark error"
    echo "  $0 update  <label> <task-id> <message>     → log progress"
    echo "  $0 tmux-start <label> <task-title>         → tmux session start"
    echo "  $0 tmux-done  <label> <task-id> [summary]  → tmux session done"
    echo ""
    echo "Examples:"
    echo '  TASK_ID=$(aria-mc-hook.sh start researcher-1900 "Research Axe 2")'
    echo '  aria-mc-hook.sh done researcher-1900 "$TASK_ID" "Found 6 ideas"'
    echo '  aria-mc-hook.sh error coder-fix "$TASK_ID" "Build failed"'
    exit 1
    ;;
esac
