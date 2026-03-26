# Spec: Autopilot Restart Resilience + Live Activity Feed

**Author:** Charlie  
**Date:** 2026-03-18  
**Status:** Draft  
**Scope:** Product Autopilot subsystem (research cycles, ideation cycles, live UI feedback)

---

## Problem 1: Restart Resilience

### Current Behavior

When a research or ideation cycle is running:
1. A `research_cycles` or `ideas` row is created with status `running`
2. An async function starts making LLM calls via OpenClaw `chat.send`
3. If the Node process restarts mid-cycle, the async work dies silently
4. The DB row stays `running` forever — orphaned, never completed, never retried

The product data, ideas, swipe history, and configuration all survive restarts fine (SQLite). Only **in-flight orchestration** is lost.

### Design: Checkpoint-Based Recovery

#### Principle
Each cycle is broken into discrete **phases**. Each phase writes its output to the DB when complete. On startup, any cycle still marked `running` is re-queued from its last completed phase.

#### Research Cycle Phases

| Phase | Name | Description |
|-------|------|-------------|
| 1 | `init` | Cycle created, prompt built |
| 2 | `llm_submitted` | Message sent to OpenClaw session |
| 3 | `llm_polling` | Actively polling for LLM response |
| 4 | `report_received` | Raw LLM response received and parsed |
| 5 | `completed` | Report stored, cost recorded, events broadcast |

#### Ideation Cycle Phases

| Phase | Name | Description |
|-------|------|-------------|
| 1 | `init` | Cycle created, research report + swipe history loaded |
| 2 | `llm_submitted` | Message sent to OpenClaw session |
| 3 | `llm_polling` | Actively polling for LLM response |
| 4 | `ideas_parsed` | Raw LLM response parsed into individual ideas |
| 5 | `ideas_stored` | Ideas written to `ideas` table |
| 6 | `completed` | Costs recorded, events broadcast, research_cycle updated |

#### Schema Changes

```sql
-- Add phase tracking to research_cycles
ALTER TABLE research_cycles ADD COLUMN current_phase TEXT DEFAULT 'init';
ALTER TABLE research_cycles ADD COLUMN phase_data TEXT; -- JSON: partial results from completed phases
ALTER TABLE research_cycles ADD COLUMN session_key TEXT; -- OpenClaw session key for resumption
ALTER TABLE research_cycles ADD COLUMN last_heartbeat TEXT; -- ISO timestamp, updated during polling

-- Add similar tracking to a new ideation_cycles table
-- (Currently ideation doesn't have its own tracking table — ideas go straight to `ideas`)
CREATE TABLE IF NOT EXISTS ideation_cycles (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  research_cycle_id TEXT REFERENCES research_cycles(id),
  status TEXT NOT NULL DEFAULT 'running',
  current_phase TEXT DEFAULT 'init',
  phase_data TEXT,
  session_key TEXT,
  last_heartbeat TEXT,
  ideas_generated INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT
);
```

#### Startup Recovery Routine

On app boot (in the DB initialization or a startup hook):

```typescript
function recoverOrphanedCycles(): void {
  // 1. Find all running research cycles
  const staleResearch = queryAll<ResearchCycle>(
    `SELECT * FROM research_cycles WHERE status = 'running'`
  );

  for (const cycle of staleResearch) {
    const phase = cycle.current_phase;
    const phaseData = cycle.phase_data ? JSON.parse(cycle.phase_data) : {};

    if (phase === 'init' || phase === 'llm_submitted') {
      // Haven't gotten a response yet — safe to re-run from scratch
      console.log(`[Recovery] Re-queuing research cycle ${cycle.id} from phase: ${phase}`);
      requeueResearchCycle(cycle);
    } else if (phase === 'llm_polling') {
      // Was actively polling — check if the OpenClaw session still has a response
      console.log(`[Recovery] Resuming poll for research cycle ${cycle.id}`);
      resumeResearchPoll(cycle);
    } else if (phase === 'report_received') {
      // Report was parsed but not fully stored — complete the final steps
      console.log(`[Recovery] Completing research cycle ${cycle.id} from phase: ${phase}`);
      completeResearchCycle(cycle, phaseData.report);
    }
  }

  // 2. Find all running ideation cycles
  const staleIdeation = queryAll(
    `SELECT * FROM ideation_cycles WHERE status = 'running'`
  );

  for (const cycle of staleIdeation) {
    // Same logic — re-queue or resume based on phase
    requeueIdeationCycle(cycle);
  }

  // 3. Timeout check: if last_heartbeat is older than 10 minutes, mark as interrupted
  const timeoutThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  run(
    `UPDATE research_cycles SET status = 'interrupted', error_message = 'Process restart during execution'
     WHERE status = 'running' AND last_heartbeat < ? AND last_heartbeat IS NOT NULL`,
    [timeoutThreshold]
  );
}
```

#### Heartbeat During Polling

While a cycle is in the `llm_polling` phase, update `last_heartbeat` on each poll iteration:

```typescript
// Inside the polling loop
while (Date.now() < deadline) {
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Update heartbeat so recovery knows we're alive
  run(
    `UPDATE research_cycles SET last_heartbeat = ? WHERE id = ?`,
    [new Date().toISOString(), cycleId]
  );

  // ... existing polling logic
}
```

#### Re-queue vs Resume Logic

- **Phases `init` and `llm_submitted`**: The LLM call may or may not have been received. Safe to re-send — `idempotencyKey` prevents duplicate processing on the OpenClaw side. Re-run from scratch.
- **Phase `llm_polling`**: The session may still exist with a completed response. Try polling first. If no response after 30 seconds, re-run from `init`.
- **Phase `report_received` / `ideas_parsed`**: The expensive LLM work is done. Just complete the DB writes and broadcasts.
- **Phase `completed`**: Nothing to do — shouldn't be in `running` status.

#### Edge Cases

1. **Double recovery**: App crashes during recovery itself. Fine — phases are idempotent. Re-running phase 5 (store + broadcast) when already stored is a no-op (UPSERT or check-before-write).
2. **Stale OpenClaw sessions**: Session keys like `research-{cycleId}` are unique per cycle. If the session expired on the OpenClaw side, the poll will find nothing, and we'll re-run from `init`.
3. **Cost double-counting**: `recordCostEvent` should use the cycle ID as a dedup key to prevent recording costs twice for the same cycle.

---

## Problem 2: Live Activity Feed

### Current Behavior

The main MC page has a right-column activity feed powered by SSE (`/api/events/stream`). The Autopilot page has no real-time visibility into what agents are doing — it's a black box.

### Design: Right-Column Activity Panel

#### Why Not a Modal

- Modal blocks interaction — can't swipe ideas or adjust settings while watching
- Requires constant open/close
- Inconsistent with the main MC page pattern

#### Layout

The Autopilot page gets a **collapsible right column** identical in spirit to the main MC activity panel:

```
┌─────────────────────────────────┬──────────────────────┐
│                                 │  🔴 LIVE             │
│  Product Autopilot              │                      │
│  ┌─────────────────────────┐    │  Research Cycle #3   │
│  │ Research  │ Ideas │ ... │    │  ├─ Scanning comps.. │
│  ├─────────────────────────┤    │  ├─ Found 12 results │
│  │                         │    │  ├─ Analyzing gaps.. │
│  │  Main content area      │    │  └─ ⏳ Synthesizing  │
│  │  (tabs, swipe deck,     │    │                      │
│  │   settings, etc.)       │    │  Cost: $0.04         │
│  │                         │    │  Tokens: 12.4K       │
│  │                         │    │                      │
│  │                         │    │  ──── Earlier ────   │
│  │                         │    │  Research Cycle #2   │
│  │                         │    │  ✅ Completed 2h ago │
│  │                         │    │  Ideas generated: 8  │
│  └─────────────────────────┘    │                      │
└─────────────────────────────────┴──────────────────────┘
```

- **Desktop**: two-column layout, activity panel on right (collapsible via toggle button)
- **Mobile**: activity panel hidden by default, accessible via floating button (slide-over drawer)
- **Toggle persists** in localStorage so it remembers your preference

#### Event Types

Extend the existing SSE stream with autopilot-specific event types:

```typescript
// New event types for autopilot activity
interface AutopilotEvent {
  type:
    | 'autopilot:research:started'
    | 'autopilot:research:phase'      // Phase transition with description
    | 'autopilot:research:progress'   // Intermediate progress within a phase
    | 'autopilot:research:completed'
    | 'autopilot:research:failed'
    | 'autopilot:ideation:started'
    | 'autopilot:ideation:phase'
    | 'autopilot:ideation:idea_found'  // Each individual idea as it's parsed
    | 'autopilot:ideation:completed'
    | 'autopilot:ideation:failed'
    | 'autopilot:cost:update';         // Real-time cost tick
  payload: {
    productId: string;
    cycleId: string;
    phase?: string;
    message?: string;        // Human-readable description of what's happening
    detail?: string;         // More detailed info (e.g., competitor name found)
    costUsd?: number;        // Running cost total
    tokensUsed?: number;     // Running token count
    timestamp: string;
  };
}
```

#### Emitting Progress Events

The research and ideation orchestration code emits events at each meaningful step:

```typescript
// research.ts — emit progress at each step
function emitProgress(cycleId: string, productId: string, phase: string, message: string, detail?: string) {
  broadcast({
    type: 'autopilot:research:phase',
    payload: { productId, cycleId, phase, message, detail, timestamp: new Date().toISOString() }
  });

  // Also persist to activity_log for page-reload resilience
  run(
    `INSERT INTO autopilot_activity_log (id, product_id, cycle_id, cycle_type, event_type, message, detail, created_at)
     VALUES (?, ?, ?, 'research', ?, ?, ?, ?)`,
    [uuidv4(), productId, cycleId, phase, message, detail || null, new Date().toISOString()]
  );
}

// Usage in the research flow:
emitProgress(cycleId, productId, 'llm_submitted', 'Research prompt sent to agent');
// ... during polling:
emitProgress(cycleId, productId, 'llm_polling', 'Waiting for research agent response...', `Poll attempt ${attempt}`);
// ... on completion:
emitProgress(cycleId, productId, 'report_received', 'Research report received', `${Object.keys(report.sections).length} sections analyzed`);
```

#### Activity Log Table

```sql
CREATE TABLE IF NOT EXISTS autopilot_activity_log (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  cycle_id TEXT NOT NULL,
  cycle_type TEXT NOT NULL CHECK(cycle_type IN ('research', 'ideation')),
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  detail TEXT,
  cost_usd REAL,
  tokens_used INTEGER,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_activity_log_product ON autopilot_activity_log(product_id, created_at DESC);
CREATE INDEX idx_activity_log_cycle ON autopilot_activity_log(cycle_id, created_at);
```

#### Client-Side Component

```typescript
// components/autopilot/ActivityPanel.tsx
'use client';

import { useEffect, useState, useRef } from 'react';
import { useEventStream } from '@/hooks/useEventStream'; // existing SSE hook

interface ActivityEntry {
  id: string;
  cycleId: string;
  cycleType: 'research' | 'ideation';
  eventType: string;
  message: string;
  detail?: string;
  costUsd?: number;
  tokensUsed?: number;
  createdAt: string;
}

export function ActivityPanel({ productId }: { productId: string }) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('autopilot-activity-open') !== 'false';
    }
    return true;
  });
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load historical entries on mount
  useEffect(() => {
    fetch(`/api/products/${productId}/activity?limit=50`)
      .then(r => r.json())
      .then(data => setEntries(data.entries || []));
  }, [productId]);

  // Subscribe to live events
  useEventStream((event) => {
    if (event.type?.startsWith('autopilot:') && event.payload?.productId === productId) {
      const newEntry: ActivityEntry = {
        id: crypto.randomUUID(),
        cycleId: event.payload.cycleId,
        cycleType: event.type.includes('research') ? 'research' : 'ideation',
        eventType: event.payload.phase || event.type,
        message: event.payload.message,
        detail: event.payload.detail,
        costUsd: event.payload.costUsd,
        tokensUsed: event.payload.tokensUsed,
        createdAt: event.payload.timestamp,
      };
      setEntries(prev => [...prev.slice(-99), newEntry]); // Keep last 100
    }
  });

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries.length]);

  // Persist open/closed state
  useEffect(() => {
    localStorage.setItem('autopilot-activity-open', String(isOpen));
  }, [isOpen]);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed right-4 bottom-4 z-50 bg-blue-600 text-white p-3 rounded-full shadow-lg"
        title="Show agent activity"
      >
        📡
      </button>
    );
  }

  return (
    <div className="w-80 border-l border-gray-200 bg-gray-50 flex flex-col h-full">
      <div className="flex items-center justify-between p-3 border-b bg-white">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <span className="font-semibold text-sm">LIVE</span>
        </div>
        <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600">
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {entries.map(entry => (
          <ActivityEntry key={entry.id} entry={entry} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
```

#### API Endpoint for Historical Activity

```
GET /api/products/:id/activity?limit=50&after=<timestamp>
```

Returns the last N activity log entries for the product. Used on page load to backfill the panel with recent history before the SSE stream takes over.

---

## Migration (017)

```sql
-- Migration 017: autopilot_resilience_and_activity

-- Phase tracking for research cycles
ALTER TABLE research_cycles ADD COLUMN current_phase TEXT DEFAULT 'init';
ALTER TABLE research_cycles ADD COLUMN phase_data TEXT;
ALTER TABLE research_cycles ADD COLUMN session_key TEXT;
ALTER TABLE research_cycles ADD COLUMN last_heartbeat TEXT;

-- Ideation cycle tracking (was previously untracked)
CREATE TABLE IF NOT EXISTS ideation_cycles (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  research_cycle_id TEXT REFERENCES research_cycles(id),
  status TEXT NOT NULL DEFAULT 'running',
  current_phase TEXT DEFAULT 'init',
  phase_data TEXT,
  session_key TEXT,
  last_heartbeat TEXT,
  ideas_generated INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT
);

-- Activity log for live feed + historical backfill
CREATE TABLE IF NOT EXISTS autopilot_activity_log (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  cycle_id TEXT NOT NULL,
  cycle_type TEXT NOT NULL CHECK(cycle_type IN ('research', 'ideation')),
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  detail TEXT,
  cost_usd REAL,
  tokens_used INTEGER,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_activity_log_product ON autopilot_activity_log(product_id, created_at DESC);
CREATE INDEX idx_activity_log_cycle ON autopilot_activity_log(cycle_id, created_at);
CREATE INDEX idx_ideation_cycles_product ON ideation_cycles(product_id, started_at DESC);
```

---

## Implementation Order

1. **Migration 017** — Add schema (no functional changes, safe to deploy immediately)
2. **Fix research.ts** — Add phase tracking, heartbeat updates, progress emission
3. **Fix ideation.ts** — Same phase tracking + create ideation_cycles records
4. **Startup recovery** — Add `recoverOrphanedCycles()` to DB init
5. **Activity API endpoint** — `GET /api/products/:id/activity`
6. **ActivityPanel component** — Right column with SSE subscription
7. **Autopilot page layout** — Two-column layout with collapsible panel
8. **Polish** — Mobile drawer, cost display, error states, empty states

Steps 1-4 are backend resilience. Steps 5-8 are the UI. They can be built in parallel.

---

## Open Questions

1. **Should interrupted cycles auto-retry on startup, or just be marked `interrupted` for manual retry?** Recommendation: auto-retry up to 2 times, then mark interrupted and surface in UI.
2. **Activity log retention**: How long to keep entries? Recommendation: 30 days, with a cleanup cron.
3. **Cost tracking granularity**: The current `recordCostEvent` uses `cost_usd: 0` (placeholder). Do we want to query OpenClaw for actual token usage per session? This is possible via `chat.history` but adds complexity.
