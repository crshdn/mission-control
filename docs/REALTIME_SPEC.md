# Real-Time Integration Specification

## Goal
Full transparency and real-time updates for Mission Control task orchestration.

## Requirements

### 1. Database Schema Extensions

#### task_activities table
```sql
CREATE TABLE task_activities (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES agents(id),
  activity_type TEXT NOT NULL, -- 'spawned', 'updated', 'completed', 'file_created', 'status_changed'
  message TEXT NOT NULL,
  metadata TEXT, -- JSON with extra context
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_activities_task ON task_activities(task_id, created_at DESC);
```

#### task_deliverables table
```sql
CREATE TABLE task_deliverables (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  deliverable_type TEXT NOT NULL, -- 'file', 'url', 'artifact'
  title TEXT NOT NULL,
  path TEXT, -- file path or URL
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_deliverables_task ON task_deliverables(task_id);
```

#### openclaw_sessions table (enhance existing)
Add columns:
```sql
ALTER TABLE openclaw_sessions ADD COLUMN session_type TEXT DEFAULT 'persistent'; -- 'persistent' or 'subagent'
ALTER TABLE openclaw_sessions ADD COLUMN task_id TEXT REFERENCES tasks(id);
ALTER TABLE openclaw_sessions ADD COLUMN ended_at TEXT;
```

### 2. WebSocket Server

#### Implementation
- Use Next.js API route with WebSocket upgrade
- Endpoint: `/api/ws`
- Broadcast events to all connected clients

#### Events to broadcast
```typescript
type WSEvent = 
  | { type: 'task_updated', payload: Task }
  | { type: 'task_created', payload: Task }
  | { type: 'activity_logged', payload: TaskActivity }
  | { type: 'deliverable_added', payload: TaskDeliverable }
  | { type: 'agent_spawned', payload: { taskId: string, sessionId: string, agentName: string } }
  | { type: 'agent_completed', payload: { taskId: string, sessionId: string, summary: string } }
```

### 3. Backend API Endpoints

#### POST /api/tasks/[id]/activities
Log activity for a task
```typescript
{
  activity_type: 'spawned' | 'updated' | 'completed' | 'file_created' | 'status_changed',
  message: string,
  agent_id?: string,
  metadata?: object
}
```

#### GET /api/tasks/[id]/activities
Get all activities for a task (sorted by created_at DESC)

#### POST /api/tasks/[id]/deliverables
Add deliverable to a task
```typescript
{
  deliverable_type: 'file' | 'url' | 'artifact',
  title: string,
  path: string,
  description?: string
}
```

#### GET /api/tasks/[id]/deliverables
Get all deliverables for a task

#### POST /api/tasks/[id]/subagent
Register a sub-agent session for a task
```typescript
{
  openclaw_session_id: string,
  agent_name: string
}
```

### 4. Frontend Changes

#### Task Detail Modal
Add tabs:
- **Overview** (existing content)
- **Activity Log** (chronological list of all activities)
- **Deliverables** (list of output files/links with download/open buttons)
- **Sessions** (list of OpenClaw sub-agent sessions)

#### WebSocket Client
```typescript
// Connect to WebSocket
const ws = new WebSocket('ws://localhost:4000/api/ws');

// Listen for events
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch (data.type) {
    case 'task_updated':
      // Update task in UI
      break;
    case 'activity_logged':
      // Add activity to log
      break;
    case 'deliverable_added':
      // Show new deliverable
      break;
    case 'agent_spawned':
      // Increment active agent count
      break;
  }
};
```

#### Live Updates
- Auto-update Kanban columns when tasks change
- Show toast notifications for important events
- Real-time activity feed in task detail
- Agent counter updates live

#### Agent Counter
Display in sidebar:
```
Active Sub-Agents: 2
```
Counts openclaw_sessions where status='active' and session_type='subagent'

### 5. Orchestration Integration

Charlie's workflow when orchestrating tasks:

```typescript
// 1. Task found in inbox
const task = await fetch('http://localhost:4000/api/tasks?status=inbox').then(r => r.json());

// 2. Log triage activity
await fetch(`http://localhost:4000/api/tasks/${task.id}/activities`, {
  method: 'POST',
  body: JSON.stringify({
    activity_type: 'updated',
    message: 'Task triaged and assigned to Developer agent',
    agent_id: charlieAgentId
  })
});

// 3. Update status
await fetch(`http://localhost:4000/api/tasks/${task.id}`, {
  method: 'PATCH',
  body: JSON.stringify({ status: 'assigned' })
});

// 4. Spawn sub-agent
const { childSessionKey } = await spawnSubAgent(task);

// 5. Register sub-agent in Mission Control
await fetch(`http://localhost:4000/api/tasks/${task.id}/subagent`, {
  method: 'POST',
  body: JSON.stringify({
    openclaw_session_id: childSessionKey,
    agent_name: 'Developer Sub-Agent'
  })
});

// 6. Log spawn activity
await fetch(`http://localhost:4000/api/tasks/${task.id}/activities`, {
  method: 'POST',
  body: JSON.stringify({
    activity_type: 'spawned',
    message: 'Spawned sub-agent for task execution',
    metadata: { session_id: childSessionKey }
  })
});

// 7. When sub-agent completes and creates files
await fetch(`http://localhost:4000/api/tasks/${task.id}/deliverables`, {
  method: 'POST',
  body: JSON.stringify({
    deliverable_type: 'file',
    title: 'Test Page',
    path: '~/Documents/Shared/mission-control/test-page.html',
    description: 'HTML test page with styling and dynamic content'
  })
});

// 8. Log completion
await fetch(`http://localhost:4000/api/tasks/${task.id}/activities`, {
  method: 'POST',
  body: JSON.stringify({
    activity_type: 'completed',
    message: 'Sub-agent completed task in 20 seconds'
  })
});

// 9. Update to review
await fetch(`http://localhost:4000/api/tasks/${task.id}`, {
  method: 'PATCH',
  body: JSON.stringify({ status: 'review' })
});
```

## Implementation Notes

### WebSocket Setup (Next.js)
Next.js doesn't natively support WebSocket in API routes. Options:
1. Use `ws` library with custom server
2. Use Server-Sent Events (SSE) instead (simpler, one-way)
3. Use external WebSocket server (overkill)

**Recommendation: Use SSE** (simpler, works with Next.js out of the box)

### SSE Endpoint: /api/events/stream
```typescript
export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Register client
      clients.add(controller);
      
      // Send keep-alive
      const interval = setInterval(() => {
        controller.enqueue(encoder.encode(': keep-alive\n\n'));
      }, 30000);
      
      // Cleanup on close
      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
        clients.delete(controller);
      });
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}
```

### Broadcasting Events
```typescript
// In API routes that modify data
import { broadcast } from '@/lib/events';

// After creating/updating task
broadcast({
  type: 'task_updated',
  payload: task
});
```

## Testing Checklist

- [ ] Database migrations run successfully
- [ ] New API endpoints work (activities, deliverables, subagent)
- [ ] SSE connection established from frontend
- [ ] Real-time updates appear without refresh
- [ ] Activity log shows all actions chronologically
- [ ] Deliverables display with file paths
- [ ] Agent counter updates when sub-agents spawn
- [ ] Charlie's orchestration posts to new endpoints
- [ ] No memory leaks from SSE connections
- [ ] Works on production server after git pull

## Files to Modify/Create

### Backend
- `src/lib/db/schema.ts` - Add new tables
- `src/lib/db/migrations.ts` - Migration runner
- `src/lib/events.ts` - SSE event broadcaster
- `src/app/api/events/stream/route.ts` - SSE endpoint
- `src/app/api/tasks/[id]/activities/route.ts` - Activities CRUD
- `src/app/api/tasks/[id]/deliverables/route.ts` - Deliverables CRUD
- `src/app/api/tasks/[id]/subagent/route.ts` - Sub-agent registration

### Frontend
- `src/components/TaskModal.tsx` - Add tabs (Activity, Deliverables, Sessions)
- `src/components/ActivityLog.tsx` - New component
- `src/components/DeliverablesList.tsx` - New component
- `src/components/SessionsList.tsx` - New component
- `src/hooks/useSSE.ts` - SSE connection hook
- `src/lib/store.ts` - Add event handling to Zustand store
- `src/components/AgentsSidebar.tsx` - Add active sub-agent counter

### Documentation
- Update `README.md` with real-time features
- Update `CHANGELOG.md`

## Success Criteria

1. User adds task to INBOX
2. Within 60 seconds, sees it move to ASSIGNED in real-time (no refresh)
3. Agent counter shows "Active Sub-Agents: 1"
4. Opens task detail, sees Activity Log with entries like:
   - "Task triaged and assigned to Developer agent"
   - "Spawned sub-agent for task execution"
   - "Created file: test-page.html"
   - "Sub-agent completed task in 20 seconds"
5. Sees Deliverables tab with link to test-page.html
6. Task moves to REVIEW in real-time
7. All without refreshing the page
