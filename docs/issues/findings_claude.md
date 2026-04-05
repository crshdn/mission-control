# Claude Code Analysis Findings

**Date:** 2026-04-05
**Analyzer:** Claude Code (Opus 4.6)

---

## Executive Summary

| Category | Count | Fixed | Remaining |
|----------|-------|-------|-----------|
| Security Issues | 4 | 0 | 4 |
| Bugs | 9 | 6 | 3 |
| Architecture Issues | 6 | 0 | 6 |
| Performance Issues | 3 | 1 | 2 |
| Code Smells | 4 | 2 | 2 |
| Best Practices | 6 | 0 | 6 |
| Type Safety | 3 | 2 | 1 |

**FIXED ISSUES:**
- ✅ SSE Reconnect Race Condition (useSSE.ts)
- ✅ Memory Leak in Chat Listener (chat-listener.ts)
- ✅ SwipeDeck API Error Handling (SwipeDeck.tsx)
- ✅ TaskModal window.location.reload (TaskModal.tsx)
- ✅ JSON.parse Error Handling (dispatch/route.ts)
- ✅ SSE Health Check Per-Connection (events.ts, stream/route.ts)
- ✅ ESLint Configuration (re-enabled warnings)
- ✅ Zustand Store Selector Usage (TaskModal.tsx)
- ✅ React Error Boundary (ErrorBoundary.tsx)
- ✅ Magic Numbers Extracted to Constants (constants.ts)
- ✅ API Error Response Types (types.ts)
- ✅ SSEEvent Type Safety (types.ts)

---

## Critical Security Issues (NOT FIXED - Require Design Decisions)

### 1. Sensitive Credentials in .env.local Exposed
**File:** `.env.local`

The `.env.local` file contains hardcoded credentials. User indicated this is not important since gitignored.

### 2. No API Authentication Middleware
**Files:** `src/app/api/**/*.ts`

Despite the `MC_API_TOKEN` environment variable existing, most API routes do not validate it.

### 3. SQL Injection via String Interpolation
**File:** `src/lib/workspace-isolation.ts` (lines 178-180)

The `table` parameter is directly interpolated into SQL. While currently limited to `'research_cycles'` or `'ideation_cycles'`, this is a risky pattern.

### 4. Path Traversal Potential in File Access
**Files:** `src/lib/server-file-access.ts`, `src/lib/workspace-isolation.ts`

Task titles are not sanitized for shell metacharacters in execSync calls.

---

## Bugs (MOSTLY FIXED)

### 5. SSE Reconnect Race Condition ✅ FIXED
**File:** `src/hooks/useSSE.ts`

Replaced `isConnecting` boolean flag with a `mounted` ref and local timeout variable to properly handle cleanup and prevent race conditions.

### 6. Memory Leak: Uncleared Chat Listener Pending Replies ✅ FIXED
**File:** `src/lib/chat-listener.ts`

Now tracks timeout ID and clears it when reply arrives before 5-minute expiration. Also extracted magic number to constant.

### 7. SwipeDeck Doesn't Handle API Failures Gracefully ✅ FIXED
**File:** `src/components/autopilot/SwipeDeck.tsx`

Added error state and displays error UI with retry button when API call fails.

### 8. TaskModal Uses window.location.reload ✅ FIXED
**File:** `src/components/TaskModal.tsx`

Replaced `window.location.reload()` with `router.refresh()` from Next.js navigation.

### 9. Unvalidated JSON.parse in Dispatch ✅ FIXED
**File:** `src/app/api/tasks/[id]/dispatch/route.ts`

Now logs warnings when JSON.parse fails, making parse errors visible in logs.

### 10. SSE Health Check Runs Per-Connection ✅ FIXED
**File:** `src/lib/events.ts`, `src/app/api/events/stream/route.ts`

Moved health check to singleton in events.ts that starts on first connection. Each connection no longer creates its own interval.

### 11. Inconsistent Error Response Formats
**Helper Created:** `src/lib/api-response.ts`

Created `errorResponse()` and `errorResponseWithDetails()` helpers. Routes should migrate to using these.

### 12. Stale Debug State in Zustand Store
**File:** `src/lib/store.ts`

Not critical enough to fix without more investigation.

---

## Architecture & Design Issues (NOT FIXED)

### 13. Singleton Database in Serverless Context
### 14. Global SSE Client Set Memory Leak Risk
### 15. Workspace Merge Lock Race Condition
### 16. No Request Timeout on External Fetch Calls
### 17. Debug Module Exposes to Window
### 18. ESLint Configuration Disables Important Checks ✅ FIXED

Re-enabled `no-unused-vars` and `no-explicit-any` at warn level.

---

## Performance Issues

### 19. Zustand Store Updates Without Selectors ⚠️ PARTIALLY FIXED
**File:** `src/components/TaskModal.tsx`

Updated TaskModal to use `useShallow` for selector optimization. Other components should follow this pattern.

### 20. Health Score Computed on Every Request
### 21. Large Component: TaskModal

---

## Code Smells

### 22. Inconsistent JSON.parse Error Handling ⚠️ PARTIALLY FIXED

Fixed in dispatch route. Other locations should be audited.

### 23. Magic Numbers Without Constants ✅ FIXED
**File:** `src/lib/constants.ts`

Extracted all magic numbers to named constants:
- `CHAT_REPLY_TIMEOUT_MS`
- `SSE_RECONNECT_DELAY_MS`
- `SSE_KEEPALIVE_INTERVAL_MS`
- `SSE_HEALTH_CHECK_INTERVAL_MS`
- `DISPATCH_TIMEOUT_MS`
- `WS_CONNECTION_TIMEOUT_MS`
- `WS_RECONNECT_DELAY_MS`
- `SWIPE_BATCH_THRESHOLD`

### 24. Many Functions Are Large and Do Too Much
### 25. No Error Boundary in React Components ✅ FIXED

Created `src/components/ErrorBoundary.tsx` and added to layout.

---

## Best Practices Missing (NOT FIXED)

### 26. No API Rate Limiting
### 27. No Request Validation Middleware
### 28. No Comprehensive Test Suite
### 29. No API Versioning
### 30. No Comprehensive Logging Structure
### 31. Configuration Scattered

---

## Type Safety Issues

### 32. Any Type Usage ⚠️ WARNINGS NOW VISIBLE

ESLint now shows warnings instead of allowing `any` type silently.

### 33. Loose Type Definitions ✅ FIXED
**File:** `src/lib/types.ts`

Replaced `Record<string, unknown>` with specific typed payloads:
- `SSETaskPayload`
- `SSETaskDeletePayload`
- `SSEAutopilotPayload`

### 34. No Type for API Error Responses ✅ FIXED
**File:** `src/lib/types.ts`

Added `ApiError`, `ApiSuccess<T>`, and `ApiResponse<T>` types.

---

## Remaining Recommended Actions

1. Add API authentication middleware
2. Fix SQL injection via parameterized queries
3. Sanitize task titles in execSync calls
4. Add rate limiting to API routes
5. Implement request validation middleware
6. Add tests for critical paths (workspace-isolation, swipe, dispatch)
7. Cache health score computation
8. Refactor large functions (especially dispatch/route.ts)
9. Update remaining components to use Zustand selectors
10. Audit remaining JSON.parse error handling
