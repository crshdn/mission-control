# Changelog

All notable changes to Mission Control will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- OpenClaw diagnostics endpoints for relay/completion tracing:
  - `GET /api/openclaw/diagnostics`
  - `POST /api/openclaw/diagnostics/trigger-completion` (dev-only)
- Discord task command observer for controlled `task: <title> | <description>` ingestion into Mission Control.
- Mission Control -> Discord relay instrumentation with explicit attempt/success/failure markers.

### Changed

- Planning completion dispatch reliability:
  - pre-assigns generated agent before dispatch
  - resolves dispatch target using request origin/configured Mission Control URL
- Completion workflow explicitly treats `TASK_COMPLETE` as `in_progress/assigned -> review` (approval gate remains `review -> done`).
- Session update endpoint now resolves the active matching session deterministically.

### Fixed

- Added migration `008` to enforce one active `openclaw_session_id` mapping at a time via partial unique index.
- Migration `008` auto-deactivates legacy duplicate active session rows before applying the index.
- Session-link/dispatch/bootstrap flows now return clear `409` conflicts instead of opaque failures when a session key is already active on another agent.

### Docs

- Clarified lifecycle policy in docs:
  - Keep approved tasks in `DONE` as operational history.
  - Delete only test/noise/duplicate artifacts.

---

## [1.2.0] - 2026-02-19

### Added

- **Gateway Agent Discovery** — Import existing agents from your OpenClaw Gateway into Mission Control. New "Import from Gateway" button in the agent sidebar opens a discovery modal that lists all Gateway agents, shows which are already imported, and lets you bulk-import with one click. Imported agents display a `GW` badge for provenance tracking. ([#22](https://github.com/crshdn/mission-control/issues/22) — thanks [@markphelps](https://github.com/markphelps)!)
- **Docker Support** — Production-ready multi-stage Dockerfile, docker-compose.yml with persistent volumes, and `.dockerignore`. Runs as non-root, uses `dumb-init` for signal handling, includes health checks. ([#21](https://github.com/crshdn/mission-control/pull/21) — thanks [@muneale](https://github.com/muneale)!)
- **Agent Protocol Conventions** — Added `PROGRESS_UPDATE` and `BLOCKED` message formats to the Agent Protocol docs to prevent agent stalling. ([#24](https://github.com/crshdn/mission-control/pull/24) — thanks [@nice-and-precise](https://github.com/nice-and-precise)!)

### Fixed

- **Planning Flow Improvements** — Refactored polling to prevent stale state issues, fixed "Other" free-text option (case mismatch bug), made `due_date` nullable, increased planning timeout to 90s for larger models, auto-start polling on page load. ([#26](https://github.com/crshdn/mission-control/pull/26) — thanks [@JamesTsetsekas](https://github.com/JamesTsetsekas)!)
- **WebSocket RPC Deduplication Bug** — The event deduplication cache was silently dropping repeated RPC responses with the same payload hash, causing request timeouts. RPC responses now bypass dedup entirely.
- **Next.js Response Caching** — Dynamic API routes that query live state (e.g., agent discovery) now use `force-dynamic` to prevent stale cached responses.

---

## [1.1.0] - 2026-02-16

### 🔒 Security

- **API Authentication Middleware** — Bearer token authentication for all API routes. Set `MC_API_TOKEN` in `.env.local` to enable. Same-origin browser requests are automatically allowed.
- **Webhook HMAC-SHA256 Validation** — Agent completion webhooks now require a valid `X-Webhook-Signature` header. Set `WEBHOOK_SECRET` in `.env.local` to enable.
- **Path Traversal Protection** — File download endpoint now uses `realpathSync` to resolve symlinks and validate all paths are within the allowed directory.
- **Error Message Sanitization** — API error responses no longer leak internal details (stack traces, file paths) in production.
- **Security Headers** — Added `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy` headers via Next.js config.
- **Input Validation (Zod)** — Request payloads for tasks, agents, and workspaces are validated with Zod schemas before processing.
- **Repository Audit** — Purged sensitive files from git history, updated `.gitignore` to block database files and backups.

### Added

- **Ed25519 Device Identity** — Gateway pairing now uses Ed25519 key-based device identity for secure handshakes.
- **ARIA Hook** — Real-time agent tracking bridge between ARIA and Mission Control (`scripts/aria-mc-hook.sh`).
- **Planning Poll Endpoint** — New `POST /api/tasks/[id]/planning/poll` for long-poll planning updates.
- **Retry Dispatch** — New `POST /api/tasks/[id]/planning/retry-dispatch` to retry failed task dispatches.
- **Auto-Dispatch Module** — `src/lib/auto-dispatch.ts` for automatic task assignment after planning.
- **Planning Utilities** — `src/lib/planning-utils.ts` with shared planning logic.
- **MC Bridge Scripts** — Python and shell bridge scripts for external integrations.

### Changed

- **Node.js v25 Support** — Updated `better-sqlite3` to v12.6.2 for Node v25 compatibility.
- **Default Port** — Mission Control now defaults to port 4000 (previously 3000).
- **Improved Planning Tab** — Enhanced UI with better question rendering, progress tracking, and error handling.
- **Agent Sidebar Improvements** — Better status display, model selection, and agent management.
- **Activity Log Overhaul** — Cleaner timeline UI with better type icons and formatting.
- **Live Feed Improvements** — Better real-time event display with filtering options.

### Fixed

- **Same-origin browser requests** — Auth middleware no longer blocks the UI's own API calls.

---

## [1.0.1] - 2026-02-04

### Changed

- **Clickable Deliverables** - URL deliverables now have clickable titles and paths that open in new tabs
- Improved visual feedback on deliverable links (hover states, external link icons)

---

## [1.0.0] - 2026-02-04

### 🎉 First Official Release

This is the first stable, tested, and working release of Mission Control.

### Added

- **Task Management**
  - Create, edit, and delete tasks
  - Drag-and-drop Kanban board with 7 status columns
  - Task priority levels (low, normal, high, urgent)
  - Due date support

- **AI Planning Mode**
  - Interactive Q&A planning flow with AI
  - Multiple choice questions with "Other" option for custom answers
  - Automatic spec generation from planning answers
  - Planning session persistence (resume interrupted planning)

- **Agent System**
  - Automatic agent creation based on task requirements
  - Agent avatars with emoji support
  - Agent status tracking (standby, working, idle)
  - Custom SOUL.md personality for each agent

- **Task Dispatch**
  - Automatic dispatch after planning completes
  - Task instructions sent to agent with full context
  - Project directory creation for deliverables
  - Activity logging and deliverable tracking

- **OpenClaw Integration**
  - WebSocket connection to OpenClaw Gateway
  - Session management for planning and agent sessions
  - Chat history synchronization
  - Multi-machine support (local and remote gateways)

- **Dashboard UI**
  - Clean, dark-themed interface
  - Real-time task updates
  - Event feed showing system activity
  - Agent status panel
  - Responsive design

- **API Endpoints**
  - Full REST API for tasks, agents, and events
  - File upload endpoint for deliverables
  - OpenClaw proxy endpoints for session management
  - Activity and deliverable tracking endpoints

### Technical Details

- Built with Next.js 15 (App Router)
- SQLite database with automatic migrations
- Tailwind CSS for styling
- TypeScript throughout
- WebSocket client for OpenClaw communication

---

## [0.1.0] - 2026-02-03

### Added

- Initial project setup
- Basic task CRUD
- Kanban board prototype
- OpenClaw connection proof of concept

---

## Roadmap

- [x] Multiple workspaces
- [x] Webhook integrations
- [x] API authentication & security hardening
- [ ] Team collaboration
- [ ] Task dependencies
- [ ] Agent performance metrics
- [ ] Mobile-responsive improvements
- [ ] Dark/light theme toggle

---

[1.1.0]: https://github.com/crshdn/mission-control/releases/tag/v1.1.0
[1.0.1]: https://github.com/crshdn/mission-control/releases/tag/v1.0.1
[1.0.0]: https://github.com/crshdn/mission-control/releases/tag/v1.0.0
[0.1.0]: https://github.com/crshdn/mission-control/releases/tag/v0.1.0
