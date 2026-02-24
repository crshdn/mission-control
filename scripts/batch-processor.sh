#!/bin/bash
# Batch processor for overnight tool building
# Handles: planning questions, dispatch, completion detection

MC_URL="http://localhost:4000"
OPENCLAW_AGENTS_DIR="$HOME/.openclaw/agents"
LOG_FILE="/Users/lilly/clawd/projects/mission-control/logs/batch-$(date +%Y%m%d).log"

mkdir -p "$(dirname "$LOG_FILE")"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=== Batch processor run ==="

# 1. Answer any pending planning questions
log "Checking for planning questions..."
PLANNING_TASKS=$(curl -s "$MC_URL/api/tasks?status=planning" | jq -r '.[].id')

for TASK_ID in $PLANNING_TASKS; do
  POLL=$(curl -s "$MC_URL/api/tasks/$TASK_ID/planning/poll")
  HAS_QUESTION=$(echo "$POLL" | jq -r '.currentQuestion != null')
  
  if [ "$HAS_QUESTION" = "true" ]; then
    QUESTION=$(echo "$POLL" | jq -r '.currentQuestion.question')
    log "Task $TASK_ID has question: $QUESTION"
    
    # Auto-answer with 'A' (first option) for batch processing
    curl -s -X POST "$MC_URL/api/tasks/$TASK_ID/planning/answer" \
      -H "Content-Type: application/json" \
      -d '{"answer": "A"}' > /dev/null
    log "Task $TASK_ID: Answered 'A'"
  fi
done

# 2. Dispatch any assigned tasks that haven't been dispatched
log "Checking for tasks needing dispatch..."
ASSIGNED_TASKS=$(curl -s "$MC_URL/api/tasks?status=assigned" | jq -r '.[].id')

for TASK_ID in $ASSIGNED_TASKS; do
  log "Dispatching task $TASK_ID"
  curl -s -X POST "$MC_URL/api/tasks/$TASK_ID/dispatch" \
    -H "Content-Type: application/json" > /dev/null
done

# 3. Check for completed tasks (in_progress with TASK_COMPLETE)
log "Checking for completed tasks..."
IN_PROGRESS=$(curl -s "$MC_URL/api/tasks?status=in_progress" | jq -r '.[] | "\(.id)|\(.assigned_agent_id)"')

while IFS='|' read -r TASK_ID AGENT_ID; do
  if [ -z "$TASK_ID" ]; then continue; fi
  
  # Get agent's gateway_agent_id
  GATEWAY_AGENT_ID=$(curl -s "$MC_URL/api/agents/$AGENT_ID" 2>/dev/null | jq -r '.gateway_agent_id // "builder"')
  
  # Map to folder
  case "$GATEWAY_AGENT_ID" in
    builder) FOLDER="builder" ;;
    researcher) FOLDER="researcher" ;;
    creative) FOLDER="creative" ;;
    marketing) FOLDER="marketing" ;;
    finance) FOLDER="finance" ;;
    *) FOLDER="builder" ;;
  esac
  
  SESSION_DIR="$OPENCLAW_AGENTS_DIR/$FOLDER/sessions"
  RECENT_SESSION=$(find "$SESSION_DIR" -name "*.jsonl" -mmin -60 -exec ls -t {} + 2>/dev/null | head -1)
  
  if [ -n "$RECENT_SESSION" ] && grep -q "TASK_COMPLETE" "$RECENT_SESSION" 2>/dev/null; then
    COMPLETION_MSG=$(grep -o 'TASK_COMPLETE:[^"\\]*' "$RECENT_SESSION" | tail -1 | head -c 200)
    log "Task $TASK_ID: Found TASK_COMPLETE, triggering webhook..."
    
    curl -s -X POST "$MC_URL/api/webhooks/agent-completion" \
      -H "Content-Type: application/json" \
      -d "{\"task_id\": \"$TASK_ID\", \"message\": \"$COMPLETION_MSG\"}" > /dev/null
    
    # Also directly mark as done (webhook puts it in testing)
    sqlite3 /Users/lilly/clawd/projects/mission-control/mission-control.db \
      "UPDATE tasks SET status='done', result='$COMPLETION_MSG', result_captured_at=datetime('now'), updated_at=datetime('now') WHERE id='$TASK_ID';"
    
    log "Task $TASK_ID: Marked done"
  fi
done <<< "$IN_PROGRESS"

# 4. Also check 'testing' tasks and move to done
log "Moving testing tasks to done..."
TESTING_TASKS=$(curl -s "$MC_URL/api/tasks?status=testing" | jq -r '.[].id')

for TASK_ID in $TESTING_TASKS; do
  sqlite3 /Users/lilly/clawd/projects/mission-control/mission-control.db \
    "UPDATE tasks SET status='done', updated_at=datetime('now') WHERE id='$TASK_ID' AND result IS NOT NULL;"
  log "Task $TASK_ID: Moved from testing to done"
done

# Summary
INBOX=$(curl -s "$MC_URL/api/tasks?status=inbox" | jq 'length')
PLANNING=$(curl -s "$MC_URL/api/tasks?status=planning" | jq 'length')
IN_PROGRESS=$(curl -s "$MC_URL/api/tasks?status=in_progress" | jq 'length')
DONE=$(curl -s "$MC_URL/api/tasks?status=done" | jq 'length')

log "Status: inbox=$INBOX planning=$PLANNING in_progress=$IN_PROGRESS done=$DONE"
log "=== Run complete ==="
