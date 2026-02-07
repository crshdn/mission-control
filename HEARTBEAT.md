# Mission Control Orchestrator Instructions

You are the Mission Control orchestrator. Your job is to:
1. Check for new tasks in the INBOX
2. Assign tasks to appropriate agents
3. Spawn sub-agents to execute work
4. Monitor progress and ensure tasks complete

## CRITICAL: You MUST call Mission Control APIs

Every action you take MUST be reflected in Mission Control via API calls. The dashboard at http://YOUR_SERVER_IP:4000 shows task status in real-time.

## On Every Heartbeat

### Step 1: Check for INBOX tasks
```bash
curl -s http://YOUR_SERVER_IP:4000/api/tasks?status=inbox
```

If tasks exist in INBOX, process them. If not, check REVIEW tasks.

### Step 2: Check TESTING tasks (Auto-Test)
```bash
curl -s http://YOUR_SERVER_IP:4000/api/tasks?status=testing
```

For each TESTING task, run automated tests before human review:
```bash
curl -X POST http://YOUR_SERVER_IP:4000/api/tasks/{TASK_ID}/test
```

The test endpoint will:
- Load HTML deliverables in a headless browser
- Check for JavaScript console errors
- Validate CSS syntax (via css-tree)
- Check for broken resources (images, scripts, stylesheets)
- Support URL deliverables (HTTP test for PHP/Python, file:// for static)
- Take screenshots
- Return pass/fail results

**If tests PASS:** Task moves to REVIEW with activity log showing success
**If tests FAIL:** Task auto-moves to ASSIGNED with activity log showing errors

### Step 3: Check IN_PROGRESS tasks
```bash
curl -s http://YOUR_SERVER_IP:4000/api/tasks?status=in_progress
```

For each IN_PROGRESS task, check if work is complete and move to TESTING.

### Step 4: Check ASSIGNED tasks (Rework Loop)
```bash
curl -s http://YOUR_SERVER_IP:4000/api/tasks?status=assigned
```

For each ASSIGNED task, this means it failed automated testing and needs rework:
1. Check the task's activity log for failure reasons
2. Move task to IN_PROGRESS
3. Spawn a sub-agent to fix the issues
4. After fixes, the agent completion webhook moves it back to TESTING

This creates the rework loop: `TESTING (fail) → ASSIGNED → IN_PROGRESS → TESTING`

## When Processing a New INBOX Task

### 1. Move task to IN_PROGRESS
```bash
curl -X PATCH http://YOUR_SERVER_IP:4000/api/tasks/{TASK_ID} \
  -H "Content-Type: application/json" \
  -d '{"status": "in_progress"}'
```

### 2. Log that you're starting
```bash
curl -X POST http://YOUR_SERVER_IP:4000/api/tasks/{TASK_ID}/activities \
  -H "Content-Type: application/json" \
  -d '{"activity_type": "updated", "message": "Starting work on task"}'
```

### 3. Spawn a sub-agent AND register it
When you spawn a subagent session, you MUST also register it with Mission Control:

```bash
# Get your subagent session ID (e.g., from the spawn command)
SUBAGENT_SESSION_ID="your-subagent-session-id"

# Register with Mission Control
curl -X POST http://YOUR_SERVER_IP:4000/api/tasks/{TASK_ID}/subagent \
  -H "Content-Type: application/json" \
  -d '{
    "openclaw_session_id": "'$SUBAGENT_SESSION_ID'",
    "agent_name": "Designer"
  }'
```

### 4. Sub-agent creates files via UPLOAD API

**IMPORTANT: You may be running on a different machine than Mission Control!**
You may not have direct filesystem access. Use the upload API to send files to Mission Control.

```bash
# Upload a file to Mission Control server
curl -X POST http://YOUR_SERVER_IP:4000/api/files/upload \
  -H "Content-Type: application/json" \
  -d '{
    "relativePath": "{project-name}/index.html",
    "content": "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n    <meta charset=\"UTF-8\">\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n    <title>Page Title</title>\n    <style>\n        /* Your CSS here */\n    </style>\n</head>\n<body>\n    <!-- Your content here -->\n</body>\n</html>"
  }'
```

The API will:
- Create the directory structure automatically
- Save the file at `$PROJECTS_PATH/{project-name}/index.html`
- Return the full path in the response

Response example:
```json
{
  "success": true,
  "path": "$PROJECTS_PATH/dashboard-redesign/index.html",
  "relativePath": "dashboard-redesign/index.html",
  "size": 1234
}
```

### 5. Download files for verification (OPTIONAL)

Before registering deliverables, you can verify files exist and read their content:

```bash
# Download via relative path (preferred)
curl -s "http://YOUR_SERVER_IP:4000/api/files/download?relativePath={project-name}/index.html"

# Download via full path
curl -s "http://YOUR_SERVER_IP:4000/api/files/download?path=$PROJECTS_PATH/{project-name}/index.html"

# Get raw file content (no JSON wrapper)
curl -s "http://YOUR_SERVER_IP:4000/api/files/download?relativePath={project-name}/index.html&raw=true"
```

Use this to:
- Verify uploaded files exist before registering deliverables
- Read file content for review tasks
- Check file modifications

### 6. Register the deliverable (use the path from upload response)
```bash
curl -X POST http://YOUR_SERVER_IP:4000/api/tasks/{TASK_ID}/deliverables \
  -H "Content-Type: application/json" \
  -d '{
    "deliverable_type": "file",
    "title": "Homepage Design",
    "path": "$PROJECTS_PATH/{project-name}/index.html",
    "description": "Completed design with responsive layout"
  }'
```

### 7. Log completion
```bash
curl -X POST http://YOUR_SERVER_IP:4000/api/tasks/{TASK_ID}/activities \
  -H "Content-Type: application/json" \
  -d '{"activity_type": "completed", "message": "Task completed successfully"}'
```

### 8. Mark sub-agent session complete
```bash
curl -X PATCH http://YOUR_SERVER_IP:4000/api/openclaw/sessions/{SUBAGENT_SESSION_ID} \
  -H "Content-Type: application/json" \
  -d '{"status": "completed", "ended_at": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}'
```

### 9. Move task to REVIEW
```bash
curl -X PATCH http://YOUR_SERVER_IP:4000/api/tasks/{TASK_ID} \
  -H "Content-Type: application/json" \
  -d '{"status": "review"}'
```

## Output Directory

All project files are stored on the Mission Control server at:
```
$PROJECTS_PATH/{project-name}/
```

**IMPORTANT: Cross-Machine Architecture**
- The orchestrator may run on a different machine than Mission Control
- Mission Control runs on the server at YOUR_SERVER_IP
- You may not have direct filesystem access to the projects directory
- Use the `/api/files/upload` endpoint to send files to Mission Control

## API Base URL

```
http://YOUR_SERVER_IP:4000
```

## Checklist Before Saying HEARTBEAT_OK

Before responding with HEARTBEAT_OK, verify:
- [ ] No tasks in INBOX that need processing
- [ ] All REVIEW tasks have been auto-tested (call /api/tasks/{id}/test)
- [ ] All IN_PROGRESS tasks have active sub-agents working
- [ ] All completed work has been registered as deliverables
- [ ] All completed sub-agents have been marked complete
- [ ] Completed tasks have been moved to REVIEW

If ANY of these are false, take action instead of saying HEARTBEAT_OK.

## Common Mistakes to Avoid

1. **DON'T** try to write files directly to the server filesystem - use the upload API!
2. **DON'T** spawn subagents without registering them via `/api/tasks/{id}/subagent`
3. **DON'T** register deliverables for files that don't exist on the Mission Control server
4. **DON'T** leave tasks stuck in IN_PROGRESS after work is done
5. **DON'T** say HEARTBEAT_OK if there's pending work
6. **DON'T** forget to call Mission Control APIs - the dashboard depends on them!
7. **ALWAYS** use `/api/files/upload` to send files to Mission Control

## Reference

Full API documentation: See ORCHESTRATION.md in the mission-control project.
