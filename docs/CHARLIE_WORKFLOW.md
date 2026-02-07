# Charlie's Task Orchestration Workflow

This guide explains how Charlie (master agent) should orchestrate sub-agents to properly integrate with Mission Control.

## Overview

When Charlie spawns a sub-agent to work on a task, **all activities, deliverables, and session info must be logged** to Mission Control so the UI shows real-time progress.

## Import the Helper

```typescript
// From Node.js context (Charlie's environment)
import * as charlie from '@/lib/charlie-orchestration';

// Or use direct fetch calls if TypeScript module isn't available
```

## Workflow Steps

### 1. When Spawning a Sub-Agent

**Immediately after spawning**, register the session:

```typescript
await charlie.onSubAgentSpawned({
  taskId: 'task-abc123',                           // From Mission Control task
  sessionId: 'agent:main:subagent:xyz789',         // Sub-agent's OpenClaw session ID
  agentName: 'fix-mission-control-integration',    // Descriptive name
  description: 'Fix real-time updates and logging', // Optional details
});
```

**What this does:**
- Creates activity log entry: "Sub-agent spawned: fix-mission-control-integration"
- Registers session in `openclaw_sessions` table with `session_type='subagent'`
- Broadcasts SSE event so UI updates immediately
- Agent counter in sidebar updates from 0 → 1

### 2. During Sub-Agent Work

Log significant activities as work progresses:

```typescript
await charlie.logActivity({
  taskId: 'task-abc123',
  activityType: 'updated',
  message: 'Fixed SSE broadcast in dispatch endpoint',
  metadata: { file: 'src/app/api/tasks/[id]/dispatch/route.ts' }
});

await charlie.logActivity({
  taskId: 'task-abc123',
  activityType: 'file_created',
  message: 'Created orchestration helper',
  metadata: { file: 'src/lib/charlie-orchestration.ts' }
});
```

**Activity Types:**
- `spawned` - Sub-agent started
- `updated` - General progress update
- `completed` - Sub-agent finished
- `file_created` - File created/modified
- `status_changed` - Status change occurred

### 3. When Sub-Agent Completes

**Before marking task as review**, log completion with deliverables:

```typescript
await charlie.onSubAgentCompleted({
  taskId: 'task-abc123',
  sessionId: 'agent:main:subagent:xyz789',
  agentName: 'fix-mission-control-integration',
  summary: 'All integration issues fixed and tested',
  deliverables: [
    {
      type: 'file',
      title: 'Updated dispatch route',
      path: 'src/app/api/tasks/[id]/dispatch/route.ts'
    },
    {
      type: 'file',
      title: 'Orchestration helper',
      path: 'src/lib/charlie-orchestration.ts'
    },
    {
      type: 'file',
      title: 'Fixed Header component',
      path: 'src/components/Header.tsx'
    }
  ]
});
```

**What this does:**
- Logs completion activity
- Marks session as `status='completed'`, sets `ended_at` timestamp
- Logs all deliverables to `task_deliverables` table
- Broadcasts events so UI updates
- Agent counter decrements back to 0

### 4. Review & Approval

**Before approving** (moving task from `review` → `done`), verify deliverables exist:

```typescript
const hasDeliverables = await charlie.verifyTaskHasDeliverables('task-abc123');

if (!hasDeliverables) {
  console.log('⚠️ Task has no deliverables - cannot approve');
  console.log('📋 Ask sub-agent to provide deliverables or log them manually');
  return;
}

// Now safe to approve
await fetch('http://localhost:4000/api/tasks/task-abc123', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    status: 'done',
    updated_by_agent_id: 'charlie-agent-id'  // Charlie's agent ID
  })
});
```

**Backend validation:**
- Endpoint will reject `review` → `done` transition if no deliverables
- Only Charlie (master agent) can approve tasks
- This ensures quality control

## Direct API Usage (Without Helper)

If you can't import the TypeScript module, use direct fetch:

```typescript
// Register sub-agent
await fetch('http://localhost:4000/api/tasks/TASK_ID/subagent', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    openclaw_session_id: 'agent:main:subagent:xyz',
    agent_name: 'my-subagent-name'
  })
});

// Log activity
await fetch('http://localhost:4000/api/tasks/TASK_ID/activities', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    activity_type: 'updated',
    message: 'Did something important'
  })
});

// Log deliverable
await fetch('http://localhost:4000/api/tasks/TASK_ID/deliverables', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    deliverable_type: 'file',
    title: 'My deliverable',
    path: 'path/to/file.ts'
  })
});

// Complete session
await fetch('http://localhost:4000/api/openclaw/sessions/SESSION_ID', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    status: 'completed',
    ended_at: new Date().toISOString()
  })
});
```

## Testing Checklist

After implementing this workflow, verify:

- ✅ Task status changes appear without page refresh
- ✅ Agent counter shows "1" when sub-agent is working
- ✅ Activities tab shows timestamped log of all work
- ✅ Deliverables tab shows all files/artifacts created
- ✅ Sessions tab shows sub-agent info with start/end times
- ✅ Header shows accurate "X agents active, Y tasks in queue"
- ✅ Cannot approve task without deliverables

## Common Pitfalls

1. **Forgetting to register session** → Agent counter stays at 0
2. **Not logging deliverables** → Cannot approve task
3. **Wrong session ID format** → Session not found
4. **Not completing session** → Agent counter never decrements
5. **Approving without verification** → Backend rejects with 400 error

## Example: Complete Workflow

```typescript
// 1. Spawn sub-agent
const sessionId = await spawnSubAgent({
  label: 'fix-integration',
  task: taskDescription
});

// 2. Register immediately
await charlie.onSubAgentSpawned({
  taskId: task.id,
  sessionId: sessionId,
  agentName: 'fix-integration',
  description: 'Fix Mission Control integration'
});

// 3. Monitor and log progress
// (Sub-agent does work)

// 4. When complete, log everything
await charlie.onSubAgentCompleted({
  taskId: task.id,
  sessionId: sessionId,
  agentName: 'fix-integration',
  summary: 'Fixed all integration issues',
  deliverables: [
    { type: 'file', title: 'Fixed route', path: 'src/api/...' }
  ]
});

// 5. Move to review
await updateTaskStatus(task.id, 'review');

// 6. Verify and approve
const hasDeliverables = await charlie.verifyTaskHasDeliverables(task.id);
if (hasDeliverables) {
  await updateTaskStatus(task.id, 'done', { updated_by_agent_id: charlieId });
} else {
  console.log('⚠️ Cannot approve - no deliverables');
}
```

---

**Remember:** Every sub-agent action should be visible in Mission Control. If it's not logged, it didn't happen!
