#!/bin/bash
# Poll for completed tasks and mark them done
# Run via cron every 2 minutes during overnight batch processing

MC_URL="http://localhost:4000"
OPENCLAW_AGENTS_DIR="$HOME/.openclaw/agents"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Checking for completed tasks..."

# Get all in_progress tasks
TASKS=$(curl -s "$MC_URL/api/tasks?status=in_progress" | jq -r '.[] | "\(.id)|\(.assigned_agent_id)"')

if [ -z "$TASKS" ]; then
  echo "No in_progress tasks found"
  exit 0
fi

while IFS='|' read -r TASK_ID AGENT_ID; do
  if [ -z "$TASK_ID" ]; then continue; fi
  
  # Get agent's gateway_agent_id to find session folder
  GATEWAY_AGENT_ID=$(curl -s "$MC_URL/api/agents/$AGENT_ID" | jq -r '.gateway_agent_id // "main"')
  
  # Map gateway_agent_id to folder name
  case "$GATEWAY_AGENT_ID" in
    builder) FOLDER="builder" ;;
    researcher) FOLDER="researcher" ;;
    creative) FOLDER="creative" ;;
    marketing) FOLDER="marketing" ;;
    finance) FOLDER="finance" ;;
    *) FOLDER="main" ;;
  esac
  
  SESSION_DIR="$OPENCLAW_AGENTS_DIR/$FOLDER/sessions"
  
  # Find most recent session file (modified in last 30 min)
  RECENT_SESSION=$(find "$SESSION_DIR" -name "*.jsonl" -mmin -30 -exec ls -t {} + 2>/dev/null | head -1)
  
  if [ -z "$RECENT_SESSION" ]; then
    echo "Task $TASK_ID: No recent session found for $FOLDER"
    continue
  fi
  
  # Check for TASK_COMPLETE in session
  if grep -q "TASK_COMPLETE" "$RECENT_SESSION" 2>/dev/null; then
    echo "Task $TASK_ID: Found TASK_COMPLETE, marking done..."
    
    # Extract the completion message
    COMPLETION_MSG=$(grep -o 'TASK_COMPLETE:[^"]*' "$RECENT_SESSION" | tail -1 | head -c 200)
    
    # Call the webhook
    RESULT=$(curl -s -X POST "$MC_URL/api/webhooks/agent-completion" \
      -H "Content-Type: application/json" \
      -d "{\"task_id\": \"$TASK_ID\", \"message\": \"$COMPLETION_MSG\"}")
    
    echo "Task $TASK_ID: $RESULT"
  else
    echo "Task $TASK_ID: No TASK_COMPLETE yet"
  fi
  
done <<< "$TASKS"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Done."
