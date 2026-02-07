# Real-Time Features - Quick Start Guide

## 🚀 Getting Started

### 1. Pull Latest Code

```bash
cd ~/Documents/Shared/mission-control
git pull origin main
npm install
```

### 2. Start Development Server

```bash
npm run dev
```

Open: http://localhost:4000

### 3. Verify Real-Time is Working

1. Open Mission Control in your browser
2. Open browser DevTools → Console
3. Look for: `[SSE] Connected` ← This means real-time is active!
4. Open a second browser window side-by-side
5. Create a task in one window
6. Watch it appear in the other window **instantly**

That's it! Real-time is now active. 🎉

## 🎯 What's New: Key Features

### 1. Live Updates (No Refresh Needed!)
- Create/move tasks → All browsers update instantly
- ~100ms latency
- Works across Chrome, Firefox, Safari

### 2. Task Details Enhanced
When you click on a task, you now see **4 tabs**:

#### Overview Tab
- Same as before: edit title, description, status, etc.

#### Activity Tab (NEW! 📝)
- Complete history of everything that happened to this task
- Who did what, when
- Automatically tracked

#### Deliverables Tab (NEW! 📦)
- Files, URLs, and artifacts created for this task
- Click to open files
- Auto-populated by sub-agents

#### Sessions Tab (NEW! 🤖)
- Shows sub-agents that worked on this task
- Session duration
- Active status (green pulsing dot = currently running)

### 3. Agent Counter (NEW!)
- Sidebar now shows: "Active Sub-Agents: X"
- Live count of running sub-agents
- Updates every 10 seconds

## 🛠️ For Charlie: API Integration

### Logging Activities

When orchestrating tasks, log activities so users can see what's happening:

```typescript
// Log when you triage a task
await fetch(`http://localhost:4000/api/tasks/${taskId}/activities`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    activity_type: 'updated',
    message: 'Task triaged and assigned to Developer agent',
    agent_id: myAgentId,
  })
});
```

**Activity Types:**
- `spawned` - Sub-agent created
- `updated` - Task modified
- `completed` - Work finished
- `file_created` - New file produced
- `status_changed` - Status transition

### Tracking Deliverables

When a sub-agent creates files:

```typescript
await fetch(`http://localhost:4000/api/tasks/${taskId}/deliverables`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    deliverable_type: 'file', // or 'url', 'artifact'
    title: 'Implementation Report',
    path: '~/Documents/report.md',
    description: 'Detailed implementation'
  })
});
```

### Registering Sub-Agents

When spawning a sub-agent:

```typescript
// 1. Spawn the sub-agent (your existing code)
const session = await spawnSubAgent(task);

// 2. Register it in Mission Control
await fetch(`http://localhost:4000/api/tasks/${taskId}/subagent`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    openclaw_session_id: session.id,
    agent_name: 'Developer Sub-Agent'
  })
});
```

## 🧪 Quick Test

### Test Real-Time Updates

1. **Open two browser windows:**
   - Window 1: http://localhost:4000
   - Window 2: http://localhost:4000

2. **Create a task in Window 1:**
   - Click "+ New Task"
   - Title: "Test Real-Time"
   - Save

3. **Watch Window 2:**
   - Task should appear in INBOX **without refreshing**
   - If it does → Real-time is working! ✅

4. **Move the task:**
   - Drag to ASSIGNED in Window 1
   - Should move in Window 2 instantly

### Test Activity Log

Using your terminal:

```bash
# Create a test task (copy the ID from response)
curl -X POST http://localhost:4000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "Test Activity Log", "status": "inbox"}'

# Log an activity (replace TASK_ID)
curl -X POST http://localhost:4000/api/tasks/TASK_ID/activities \
  -H "Content-Type: application/json" \
  -d '{"activity_type": "updated", "message": "This is a test activity"}'

# Now open the task in UI and click Activity tab
# You should see your test activity!
```

## 📊 What to Expect

### Visual Indicators

**SSE Connection Status:**
- Browser console shows `[SSE] Connected` = good
- If disconnected, it auto-reconnects in 5 seconds

**Agent Counter:**
- Sidebar shows "Active Sub-Agents: X" when sub-agents are running
- Updates every 10 seconds
- Green highlight when >0

**Activity Log:**
- Newest activities at top
- Icons for each activity type (🚀 spawned, ✏️ updated, ✅ completed)
- Relative timestamps ("5 mins ago")

**Deliverables:**
- File icon for files, link icon for URLs
- Monospace font for paths
- "Open" button for URLs

**Sessions:**
- Green pulsing dot = active
- Checkmark = completed
- Duration displayed (e.g., "2h 15m")

## 🔧 Troubleshooting

### "Real-time not working"

1. Check browser console:
   - Should see `[SSE] Connected`
   - If not, check Network tab for `/api/events/stream`

2. Hard refresh:
   - Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)

3. Check server is running:
   - Terminal should show `✓ Ready in XXXXms`

### "Activity tab is empty"

Activities only appear after you start logging them via API. Old tasks won't have activities.

### "Agent counter stuck at 0"

Counter only shows sub-agents with:
- `session_type = 'subagent'`
- `status = 'active'`

Make sure you're registering sub-agents via the `/api/tasks/[id]/subagent` endpoint.

## 📚 More Information

- **Full Testing Guide:** `docs/TESTING_REALTIME.md`
- **Implementation Details:** `REALTIME_IMPLEMENTATION_SUMMARY.md`
- **API Specification:** `docs/REALTIME_SPEC.md`
- **Changelog:** `CHANGELOG.md`

## 🎉 You're All Set!

Real-time integration is now active. Everything you do in Mission Control will broadcast to all connected users instantly.

Enjoy the new transparency! 🦞✨

---

**Questions?** Check the docs above or ask Charlie.
