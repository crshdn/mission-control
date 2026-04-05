# Claude Code Analysis Findings

**Date:** 2026-04-05
**Analyzer:** Claude Code (Opus 4.6)

---

## Executive Summary

| Category | Count | Severity |
|----------|-------|----------|
| Security Issues | 4 | Critical |
| Bugs | 9 | High |
| Architecture Issues | 6 | Medium |
| Performance Issues | 3 | Medium |
| Code Smells | 4 | Low |
| Best Practices | 6 | Medium |
| Type Safety | 3 | Medium |

---

## Critical Security Issues

### 1. Sensitive Credentials in .env.local Exposed
**File:** `.env.local`

The `.env.local` file contains hardcoded credentials:
- `OPENCLAW_GATEWAY_TOKEN=fbc3c7528aa4393ac9abb824ff63b472a184a7ea811ecd8f`
- `MC_API_TOKEN=HorseBatteryCorrectStaple`
- `WEBHOOK_SECRET=HorsteBatteryCorrectStaple`

While `.env.local` is gitignored, these credentials should be rotated immediately if they were ever committed.

### 2. No API Authentication Middleware
**Files:** `src/app/api/**/*.ts`

Despite the `MC_API_TOKEN` environment variable existing, most API routes do not validate it. For example, in `src/app/api/products/[id]/route.ts`, the `GET`, `PATCH`, and `DELETE` handlers have no authentication checks.

### 3. SQL Injection via String Interpolation
**File:** `src/lib/workspace-isolation.ts` (lines 178-180)

```typescript
function markInterrupted(
  table: string,  // <-- passed directly
  cycleId: string,
  ...
): void {
  run(
    `UPDATE ${table} SET status = 'interrupted', ...`,  // <-- string interpolation
    ...
  );
}
```

The `table` parameter is directly interpolated into SQL. While currently limited to `'research_cycles'` or `'ideation_cycles'`, this is a risky pattern.

### 4. Path Traversal Potential in File Access
**Files:** `src/lib/server-file-access.ts`, `src/lib/workspace-isolation.ts`

The `workspace-isolation.ts` uses `execSync` with shell commands constructed from task titles and paths (line 448-449):
```typescript
execSync(`git add -A && git diff --cached --quiet || git commit -m "Autopilot: final changes for ${task.title}"`, {
```
Task titles are not sanitized for shell metacharacters.

---

## Bugs

### 5. SSE Reconnect Race Condition
**File:** `src/hooks/useSSE.ts` (lines 36-41)

```typescript
const connect = () => {
  if (isConnecting || eventSourceRef.current?.readyState === EventSource.OPEN) {
    return;
  }
  isConnecting = true;
  // ...
  eventSource.onerror = (error) => {
    // ...
    eventSource.close();
    reconnectTimeoutRef.current = setTimeout(() => {
      connect();
    }, 5000);
  };
```

The `isConnecting` flag is set to `true` before the connection opens but only reset to `false` in `onopen`. If `onerror` fires before `onopen`, `isConnecting` remains `true`, potentially preventing future connection attempts.

### 6. Memory Leak: Uncleared Chat Listener Pending Replies
**File:** `src/lib/chat-listener.ts` (lines 37-44)

```typescript
export function expectReply(sessionKey: string, taskId: string): void {
  pendingReplies.set(sessionKey, { taskId, sentAt: Date.now() });
  setTimeout(() => {
    const entry = pendingReplies.get(sessionKey);
    if (entry && Date.now() - entry.sentAt >= 300000) {
      pendingReplies.delete(sessionKey);
    }
  }, 300000);  // <-- Timer never cleared on normal completion
}
```

When a reply arrives before the 5-minute timeout, the timeout callback is never cleared, wasting memory.

### 7. SwipeDeck Doesn't Handle API Failures Gracefully
**File:** `src/components/autopilot/SwipeDeck.tsx` (lines 34-47)

If `res.ok` is false, `loading` is set to `false` but no error state is shown to the user - they just see an empty deck.

### 8. TaskModal Uses window.location.reload
**File:** `src/components/TaskModal.tsx` (lines 41-43)

```typescript
const handleSpecLocked = useCallback(() => {
  window.location.reload();
}, []);
```

This loses any unsaved form state and is poor UX.

### 9. Unvalidated JSON.parse in Dispatch
**File:** `src/app/api/tasks/[id]/dispatch/route.ts` (lines 208-217)

```typescript
if (rawTask.planning_spec) {
  try {
    const spec = JSON.parse(rawTask.planning_spec);
    // planning_spec may be an object with spec_markdown, or a raw string
    const specText = typeof spec === 'string' ? spec : (spec.spec_markdown || JSON.stringify(spec, null, 2));
```

If `planning_spec` contains malicious content, `JSON.parse` will throw but the error is silently caught.

### 10. SSE Health Check Runs Per-Connection
**File:** `src/app/api/events/stream/route.ts` (lines 41-49)

Every SSE connection creates its own interval to run health checks. While the `getActiveConnectionCount() > 0` guard prevents duplicates, it's inefficient - one interval should run the health check regardless of connection count.

### 11. Inconsistent Error Response Formats
Across API routes, error handling varies:
- Some routes return `{ error: string }` with status codes
- Some routes return generic messages like `{ error: 'Failed to fetch product' }`
- Some routes return validation details, others don't

### 12. Stale Debug State in Zustand Store
**File:** `src/lib/store.ts`

The `debug.store()` calls throughout the store fire regardless of debug mode. However, the store is imported and executed on module load.

---

## Architecture & Design Issues

### 13. Singleton Database in Serverless Context
**File:** `src/lib/db/index.ts` (lines 13-41)

```typescript
let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    // ...
  }
  return db;
}
```

SQLite with `better-sqlite3` is a singleton connection. In Next.js production deployment (which uses multiple Node.js workers), each worker has its own database connection, leading to inconsistent state.

### 14. Global SSE Client Set Memory Leak Risk
**File:** `src/lib/events.ts` (lines 9-10)

```typescript
// Store active SSE client connections
const clients = new Set<ReadableStreamDefaultController>();
```

This in-memory set grows with each connected client. If clients disconnect without calling `unregisterClient`, the set grows indefinitely.

### 15. Workspace Merge Lock Race Condition
**File:** `src/lib/workspace-isolation.ts` (lines 678-688)

```typescript
const MERGE_LOCKS = new Map<string, boolean>();

export function acquireMergeLock(productId: string): boolean {
  if (MERGE_LOCKS.get(productId)) return false;
  MERGE_LOCKS.set(productId, true);
  return true;
}
```

This in-memory lock is per-process. In a multi-worker deployment, different workers have different lock maps, potentially allowing concurrent merges.

### 16. No Request Timeout on External Fetch Calls
**File:** `src/lib/autopilot/swipe.ts` (lines 359-368)

While `swipe.ts` uses a timeout, many other `fetch` calls throughout the codebase don't set timeouts, risking hung requests.

### 17. Debug Module Exposes to Window
**File:** `src/lib/debug.ts` (lines 57-61)

```typescript
if (typeof window !== 'undefined') {
  (window as unknown as { mcDebug: { enable: () => void; disable: () => void } }).mcDebug = {
    enable: enableDebug,
    disable: disableDebug
  };
}
```

Exposing debug controls on `window.mcDebug` in production is unnecessary.

### 18. ESLint Configuration Disables Important Checks
**File:** `eslint.config.mjs`

```javascript
rules: {
  '@typescript-eslint/no-unused-vars': 'off',
  '@typescript-eslint/no-explicit-any': 'off',
  'react-hooks/purity': 'off',
  'react-hooks/set-state-in-effect': 'off',
}
```

Disabling these rules allows significant code quality issues to proliferate.

---

## Performance Issues

### 19. Zustand Store Updates Without Selectors
**File:** `src/lib/store.ts`

Components that use `useMissionControl()` without selectors will re-render on any state change. For example, `TaskModal` does:
```typescript
const { agents, addTask, updateTask, addEvent } = useMissionControl();
```
This subscribes to the entire store.

### 20. Health Score Computed on Every Request
**File:** `src/lib/autopilot/health-score.ts` (lines 439-457)

Every API call to get health recomputes the score from scratch instead of using a cached value except when cache is empty.

### 21. Large Component: TaskModal
**File:** `src/components/TaskModal.tsx`

This component is ~514 lines with 11 tabs. It handles form state, task CRUD, agent selection, planning mode, and more. Should be split into smaller components.

---

## Code Smells

### 22. Inconsistent JSON.parse Error Handling
Multiple patterns across the codebase:
- Silent catch: `try { JSON.parse(...) } catch { /* ignore */ }`
- Some places log, others don't
- No consistent approach to handling parse failures

### 23. Magic Numbers Without Constants
- `300000` in `chat-listener.ts` (5 min timeout)
- `10000` in `client.ts` (connection timeout)
- `120000` in `stream/route.ts` (health check interval)
- `5000` in `useSSE.ts` (reconnect delay)

### 24. Many Functions Are Large and Do Too Much
The `POST` handler in `dispatch/route.ts` is ~475 lines doing:
- Agent catalog sync
- Task retrieval
- Dynamic agent selection
- Gateway connection
- Session management
- Cost cap checking
- Workspace creation
- Message construction
- Dispatch delivery

Should be refactored into smaller functions.

### 25. No Error Boundary in React Components
There's no React error boundary component wrapping the application. Uncaught errors in components will crash the entire page.

---

## Best Practices Missing

### 26. No API Rate Limiting
No rate limiting on any API endpoints. Malicious or accidental rapid requests can overwhelm the server.

### 27. No Request Validation Middleware
While `validation.ts` has Zod schemas, they're not used as middleware - each route manually parses and validates.

### 28. No Comprehensive Test Suite
Many `.test.ts` files exist (ab-testing, health-score, gateway-compat, etc.) but core modules like `workspace-isolation.ts`, `swipe.ts`, and `checkpoint.ts` lack tests despite being critical.

### 29. No API Versioning
All API routes are at `/api/*` with no versioning. Future changes will be harder.

### 30. No Comprehensive Logging Structure
While `logger.ts` exists, there's no structured logging standard. Different modules log with varying levels of detail.

### 31. Configuration Scattered
Configuration is spread across:
- Environment variables (`.env.local`)
- localStorage (`config.ts`)
- Database (`products`, `cost_caps` tables)

No unified configuration management strategy.

---

## Type Safety Issues

### 32. Any Type Usage
**File:** `src/lib/openclaw/client.ts` (line 71)

```typescript
private generateEventId(data: any): string {
```

TypeScript's `no-explicit-any` is disabled in ESLint.

### 33. Loose Type Definitions
**File:** `src/lib/types.ts` (lines 853-864)

```typescript
export interface SSEEvent {
  type: SSEEventType;
  payload: Task | TaskActivity | TaskDeliverable | {
    taskId: string;
    sessionId: string;
    agentName?: string;
    summary?: string;
    deleted?: boolean;
  } | { id: string; } | Record<string, unknown>;
}
```

The `Record<string, unknown>` fallback is too loose and defeats the purpose of type safety.

### 34. No Type for API Error Responses
No consistent `ApiError` or `ApiResponse` types across the API.

---

## Recommended Priority Actions

1. **Rotate all credentials** in `.env.local` immediately
2. **Add API authentication middleware**
3. **Fix ESLint configuration** - enable `no-unused-vars` and `no-explicit-any`
4. **Add error boundaries** to React component tree
5. **Refactor `TaskModal`** into smaller components
6. **Add rate limiting** to API routes
7. **Implement request validation middleware**
8. **Add tests** for critical paths (workspace-isolation, swipe, dispatch)
9. **Fix SSE reconnect logic** to handle race conditions properly
10. **Clean up memory leaks** in chat listener and SSE clients
