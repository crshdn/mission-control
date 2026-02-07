# Real-Time Integration Testing Guide

## Quick Start

```bash
cd ~/Documents/Shared/mission-control
npm install
npm run dev
```

Open http://localhost:4000 (production server) or http://localhost:4000 (local)

## Test Scenarios

### 1. SSE Connection Test

**What to verify:**
- Open browser DevTools → Network tab → Filter by "stream"
- Should see `/api/events/stream` connection with status `(pending)` or `200`
- Connection stays open (not immediately closing)
- Console should log: `[SSE] Connected`

**Expected behavior:**
- Connection established within 1-2 seconds
- Keep-alive pings every 30 seconds
- Auto-reconnect if connection drops

### 2. Real-Time Task Updates

**Test steps:**
1. Open Mission Control in two browser windows side-by-side
2. In Window 1: Create a new task (click "+ New Task")
3. In Window 2: Task should appear in INBOX column **without refresh**
4. In Window 1: Drag task to ASSIGNED column
5. In Window 2: Task should move to ASSIGNED **without refresh**

**Expected behavior:**
- Tasks appear/move in real-time across all connected clients
- No need to refresh the page
- Changes reflected within 1 second

### 3. Activity Log Test

**Test steps:**
1. Create a task via API or UI
2. Open the task detail modal
3. Click the "Activity" tab
4. Send POST request to log activities:

```bash
curl -X POST http://localhost:4000/api/tasks/TASK_ID/activities \
  -H "Content-Type: application/json" \
  -d '{
    "activity_type": "updated",
    "message": "Task triaged and assigned to Developer agent",
    "agent_id": "AGENT_ID"
  }'
```

5. Activity should appear in the log immediately

**Expected behavior:**
- Activities appear in chronological order (newest first)
- Each activity shows: icon, agent info, message, timestamp
- Relative timestamps ("2 mins ago", "1 hour ago")

### 4. Deliverables Test

**Test steps:**
1. Open a task detail modal
2. Click "Deliverables" tab
3. Send POST request to add a deliverable:

```bash
curl -X POST http://localhost:4000/api/tasks/TASK_ID/deliverables \
  -H "Content-Type: application/json" \
  -d '{
    "deliverable_type": "file",
    "title": "Implementation Report",
    "path": "~/Documents/report.md",
    "description": "Detailed implementation report"
  }'
```

4. Deliverable should appear in the list immediately

**Expected behavior:**
- Deliverables show with icon, title, description, path
- File paths displayed in monospace font
- "Open" button for URLs (opens in new tab)

### 5. Sub-Agent Tracking Test

**Test steps:**
1. Open a task detail modal
2. Click "Sessions" tab
3. Register a sub-agent via API:

```bash
curl -X POST http://localhost:4000/api/tasks/TASK_ID/subagent \
  -H "Content-Type: application/json" \
  -d '{
    "openclaw_session_id": "agent:main:subagent:test-123",
    "agent_name": "Test Sub-Agent"
  }'
```

4. Sub-agent should appear in Sessions list
5. Check sidebar: "Active Sub-Agents" counter should increment

**Expected behavior:**
- Sessions list shows agent avatar, session ID, status, duration
- Active sub-agents (status='active') shown with green pulsing dot
- Sidebar counter updates within 10 seconds (polling interval)

### 6. Task Modal Tabs Test

**Test steps:**
1. Open any existing task
2. Verify tabs: Overview, Activity, Deliverables, Sessions
3. Click each tab and verify content loads
4. Save/Delete buttons should only appear on Overview tab

**Expected behavior:**
- Tabs switch without closing modal
- Content loads independently per tab
- Overview tab shows form (editable)
- Other tabs show read-only data

### 7. Multi-Client SSE Test

**Test steps:**
1. Open Mission Control in 3 different browsers (Chrome, Firefox, Safari)
2. Create/update a task in Browser 1
3. Verify all browsers receive the update simultaneously

**Expected behavior:**
- All clients receive SSE events
- Updates appear in real-time across all browsers
- No duplicate events
- Console logs show event receipt in each browser

### 8. Database Schema Test

**Verify tables exist:**
```bash
cd ~/Documents/Shared/mission-control
sqlite3 mission-control.db

.tables
# Should include: task_activities, task_deliverables

.schema task_activities
.schema task_deliverables
.schema openclaw_sessions
```

**Expected behavior:**
- All new tables exist
- Indexes created: `idx_activities_task`, `idx_deliverables_task`, `idx_openclaw_sessions_task`
- `openclaw_sessions` has new columns: `session_type`, `task_id`, `ended_at`

## Integration Test: Full Workflow

**Scenario: Agent orchestration flow**

1. **Charlie (main agent) creates task:**
   ```bash
   curl -X POST http://localhost:4000/api/tasks \
     -H "Content-Type: application/json" \
     -d '{
       "title": "Build authentication system",
       "description": "Implement JWT-based auth",
       "status": "inbox",
       "priority": "high"
     }'
   ```

2. **Charlie triages and assigns:**
   ```bash
   TASK_ID="..." # from step 1
   
   # Log triage activity
   curl -X POST http://localhost:4000/api/tasks/$TASK_ID/activities \
     -H "Content-Type: application/json" \
     -d '{
       "activity_type": "updated",
       "message": "Task triaged and assigned to Developer agent"
     }'
   
   # Update status to assigned
   curl -X PATCH http://localhost:4000/api/tasks/$TASK_ID \
     -H "Content-Type: application/json" \
     -d '{"status": "assigned"}'
   ```

3. **Sub-agent spawns:**
   ```bash
   # Register sub-agent
   curl -X POST http://localhost:4000/api/tasks/$TASK_ID/subagent \
     -H "Content-Type: application/json" \
     -d '{
       "openclaw_session_id": "agent:main:subagent:dev-auth",
       "agent_name": "Developer Sub-Agent"
     }'
   
   # Log spawn activity
   curl -X POST http://localhost:4000/api/tasks/$TASK_ID/activities \
     -H "Content-Type: application/json" \
     -d '{
       "activity_type": "spawned",
       "message": "Spawned sub-agent for task execution"
     }'
   ```

4. **Sub-agent creates deliverables:**
   ```bash
   # Add file deliverable
   curl -X POST http://localhost:4000/api/tasks/$TASK_ID/deliverables \
     -H "Content-Type: application/json" \
     -d '{
       "deliverable_type": "file",
       "title": "auth.ts",
       "path": "~/project/src/auth.ts",
       "description": "JWT authentication implementation"
     }'
   
   # Log file creation
   curl -X POST http://localhost:4000/api/tasks/$TASK_ID/activities \
     -H "Content-Type: application/json" \
     -d '{
       "activity_type": "file_created",
       "message": "Created auth.ts with JWT implementation"
     }'
   ```

5. **Sub-agent completes:**
   ```bash
   # Log completion
   curl -X POST http://localhost:4000/api/tasks/$TASK_ID/activities \
     -H "Content-Type: application/json" \
     -d '{
       "activity_type": "completed",
       "message": "Sub-agent completed task in 45 seconds"
     }'
   
   # Move to review
   curl -X PATCH http://localhost:4000/api/tasks/$TASK_ID \
     -H "Content-Type: application/json" \
     -d '{"status": "review"}'
   ```

6. **Verify in UI:**
   - Task moves through columns in real-time
   - Activity log shows complete timeline
   - Deliverables list shows auth.ts
   - Sessions tab shows sub-agent (now completed)
   - Sidebar counter decrements when sub-agent ends

## Performance Tests

### SSE Connection Stress Test

**Test many concurrent clients:**
```javascript
// Run in browser console
const connections = [];
for (let i = 0; i < 50; i++) {
  const es = new EventSource('/api/events/stream');
  es.onmessage = (e) => console.log(`Client ${i}:`, e.data);
  connections.push(es);
}

// Should handle 50+ concurrent connections
// Check memory usage doesn't spike
```

### Broadcast Performance Test

**Send rapid updates:**
```bash
for i in {1..100}; do
  curl -X POST http://localhost:4000/api/tasks/TASK_ID/activities \
    -H "Content-Type: application/json" \
    -d "{\"activity_type\": \"updated\", \"message\": \"Test $i\"}" &
done
wait
```

**Expected behavior:**
- All events broadcast successfully
- No dropped connections
- UI updates smoothly without lag

## Troubleshooting

### SSE Not Connecting

1. Check browser console for errors
2. Verify `/api/events/stream` endpoint returns `text/event-stream`
3. Check for CORS issues
4. Ensure no proxy/nginx buffering SSE responses

### Events Not Broadcasting

1. Check server logs for broadcast calls
2. Verify `broadcast()` is called after DB operations
3. Check SSE client count: browser console should log connection
4. Verify event payload structure matches SSEEvent type

### UI Not Updating

1. Verify SSE connection is active (check Network tab)
2. Check browser console for event receipt logs
3. Ensure Zustand store is updating (`updateTask`, `addTask`)
4. Verify component is subscribed to store changes

### Database Errors

1. Delete `mission-control.db` and restart (recreates schema)
2. Check foreign key constraints are enabled
3. Verify SQLite version supports JSON and indexes
4. Check file permissions on database file

## Success Criteria Checklist

- [ ] SSE connection established automatically on page load
- [ ] Tasks update in real-time across multiple browser windows
- [ ] Activity log shows all task actions chronologically
- [ ] Deliverables display with file paths and open buttons
- [ ] Sub-agent sessions tracked with active status
- [ ] Agent counter shows live sub-agent count
- [ ] Task modal tabs work without closing modal
- [ ] Database migrations work without errors
- [ ] No memory leaks from SSE connections
- [ ] Works on production server after git pull and npm install

## API Endpoint Reference

### SSE Stream
- `GET /api/events/stream` - Connect to SSE stream

### Activities
- `GET /api/tasks/[id]/activities` - List activities
- `POST /api/tasks/[id]/activities` - Log activity

### Deliverables
- `GET /api/tasks/[id]/deliverables` - List deliverables
- `POST /api/tasks/[id]/deliverables` - Add deliverable

### Sub-Agents
- `GET /api/tasks/[id]/subagent` - List sub-agents
- `POST /api/tasks/[id]/subagent` - Register sub-agent

### OpenClaw Sessions
- `GET /api/openclaw/sessions?session_type=subagent&status=active` - Count active sub-agents
