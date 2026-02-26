# Agent Protocol

This document describes how OpenClaw agents interact with Mission Control.

## Task Assignment Flow

1. **Human assigns task** in Mission Control UI
   - Drag task card to agent in "ASSIGNED" column
   - System auto-dispatches to agent's OpenClaw session

2. **Agent receives task notification**
   ```
   🔵 **NEW TASK ASSIGNED**
   
   **Title:** Build authentication system
   **Description:** Implement JWT-based auth with refresh tokens
   **Priority:** HIGH
   **Due:** 2026-02-05
   **Task ID:** abc-123-def
   
   Please work on this task. When complete, reply with:
   `TASK_COMPLETE: [brief summary of what you did]`
   
   If you need help or clarification, ask me (the orchestrator).
   ```

3. **Agent works on task**
   - Task automatically moves to "IN PROGRESS"
   - Agent status updates to "working"
   - Agent can ask the orchestrator for help via normal conversation

4. **Agent completes task**
   - Agent replies with completion message:
     ```
     TASK_COMPLETE: Built JWT authentication system with access/refresh tokens,
     middleware for protected routes, and secure token storage.
     ```
   - Task automatically moves to "REVIEW"
   - Agent status returns to "standby"

5. **the orchestrator reviews work**
   - the orchestrator checks agent's session history
   - the orchestrator inspects deliverables/code
   - If approved: the orchestrator moves to "DONE"
   - If needs work: the orchestrator moves back with feedback

## Completion Message Format

```
TASK_COMPLETE: [concise summary of what you accomplished]
```

Include receipts when possible:

```
TASK_COMPLETE: <summary> | deliverables: <paths/links> | verification: <how you verified>
```

## Progress Updates (to prevent work from stalling)

Agents should post periodic progress so the orchestrator can unblock quickly.

Format:

```
PROGRESS_UPDATE: <what changed> | next: <next step> | eta: <time>
```

## Blockers (explicit + parallel fallback)

If you are blocked, don’t wait silently.

Format:

```
BLOCKED: <what is blocked> | need: <specific input> | meanwhile: <fallback work>
```

Rule: ask the question **and** start the best available next step.

**Examples:**

✅ Good:
```
TASK_COMPLETE: Refactored authentication module to use async/await,
added unit tests, and updated documentation.
```

✅ Good:
```
TASK_COMPLETE: Researched 5 competitor pricing models, compiled findings
in pricing-analysis.md with recommendations.
```

❌ Bad (too vague):
```
TASK_COMPLETE: Done
```

❌ Bad (missing prefix):
```
I finished the task successfully!
```

## Getting Help

If you're stuck or need clarification:

1. **Ask the orchestrator directly** in your session
   ```
   @the orchestrator - Question about the authentication task: Should we support
   OAuth providers or just email/password for now?
   ```

2. **Request collaboration** with another agent
   ```
   @the orchestrator - I need help from Design agent to create the login UI.
   Can you coordinate?
   ```

3. **Report blockers**
   ```
   @the orchestrator - Blocked on this task: Missing API credentials for the
   third-party service. Can you provide?
   ```

## Session Management

### Agent Sessions
- Each agent has a persistent OpenClaw session
- Session ID format: `mission-control-{agent-name}`
  - Example: `mission-control-engineering`
  - Example: `mission-control-writing`

### Session Linking
- Agents are automatically linked to OpenClaw when first task is assigned
- Session remains active for future tasks
- the orchestrator can manually link/unlink agents via Mission Control UI

## Status Transitions

### Task Statuses
- **INBOX**: Unassigned, awaiting triage
- **ASSIGNED**: Assigned to agent, auto-dispatched
- **IN PROGRESS**: Agent actively working
- **REVIEW**: Completed, awaiting The orchestrator's approval
- **DONE**: Approved and closed

### Agent Statuses
- **standby**: Available for work
- **working**: Currently assigned to task(s)
- **offline**: Not connected to OpenClaw

## API Integration

Agents don't call Mission Control APIs directly. All interaction happens through:

1. **Receiving tasks** via OpenClaw session message
2. **Reporting completion** via TASK_COMPLETE message
3. **Asking questions** via normal conversation with the orchestrator

Mission Control handles:
- Task routing
- Status updates
- Event logging
- Workflow enforcement

## The orchestrator's Responsibilities

As master orchestrator, the orchestrator:

- **Triages incoming tasks** from humans
- **Assigns work** to appropriate specialist agents
- **Monitors progress** via session activity
- **Reviews completed work** before marking done
- **Coordinates collaboration** when multiple agents needed
- **Provides guidance** when agents are stuck
- **Enforces quality standards**

Only the orchestrator (master agent with `is_master = 1`) can approve tasks from REVIEW → DONE.

## Error Handling

### If task dispatch fails:
- Check agent's OpenClaw session is active
- Verify Gateway connection
- Try manual dispatch via API

### If completion not detected:
- Ensure message format exactly matches: `TASK_COMPLETE: ...`
- Check agent session is linked correctly
- Manually move task via UI if needed

### If stuck in review:
- the orchestrator must manually approve (drag to DONE)
- Only master agent can approve
- Provides quality control checkpoint
- Keep approved tasks in `DONE` for operational history; only delete test/noise tasks.

## Example Workflow

```
[Human] Creates task: "Write blog post about AI agents"
         ↓
[System] Auto-assigns to Writing agent
         ↓
[Writing] Receives notification in OpenClaw session
         ↓
[Writing] Works on blog post, saves to docs/blog/ai-agents.md
         ↓
[Writing] Replies: "TASK_COMPLETE: Wrote 1500-word blog post about
          AI agents with examples and best practices."
         ↓
[System] Auto-moves to REVIEW
         ↓
[the orchestrator] Reviews docs/blog/ai-agents.md
         ↓
[the orchestrator] Approves → moves to DONE
         ↓
[Human] Publishes blog post
```

## Best Practices

1. **Be specific in completion summaries** - help the orchestrator review faster
2. **Ask for help early** - don't spin wheels, ping the orchestrator
3. **Document your work** - leave breadcrumbs for review
4. **One task at a time** - focus before moving to next
5. **Update progress** - if task will take a while, check in with the orchestrator

## Future Enhancements

Planned features:
- Progress updates (25%, 50%, 75% complete)
- Task dependencies (Task B requires Task A)
- Subtask breakdown
- Time tracking
- Quality metrics
