<p align="center">
  <img src="mission-control.png" alt="Mission-Claw" width="600" />
</p>

<h1 align="center">🦞 Mission-Claw</h1>

<p align="center">
  <strong>AI Agent Orchestration — Powered by Discord + OpenClaw</strong><br>
  The nerve center of the GearSwitchr agent swarm.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.2.0-blue?style=flat-square" alt="Version" />
  <img src="https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/SQLite-3-003B57?style=flat-square&logo=sqlite&logoColor=white" alt="SQLite" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="MIT License" />
</p>

---

## What is Mission-Claw?

Mission-Claw is a fork and significant extension of [Mission-Control](https://github.com/crshdn/mission-control) — a beautiful open-source AI agent orchestration dashboard built by [@crshdn](https://github.com/crshdn) and contributors. We owe the original team a huge debt. The Kanban UI, SSE real-time layer, SQLite persistence, and core agent dispatch architecture are all their work.

**What Mission-Claw adds:**

Mission-Control is a dashboard you *visit*. Mission-Claw is a system that *operates* — primarily through Discord and OpenClaw, with the web UI as secondary visibility.

The key difference: **Discord is the primary operator interface.** You don't need to open a browser to create tasks, monitor agents, or get notified when work completes. Everything flows through the Discord ↔ OpenClaw ↔ Mission-Claw triangle.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      DISCORD                            │
│  Human operator lives here. Creates tasks, reads        │
│  notifications, monitors agent progress.                │
└─────────────────┬───────────────────────┬───────────────┘
                  │ commands               │ notifications
                  ▼                       ▲
┌─────────────────────────────────────────────────────────┐
│                      OPENCLAW                           │
│  AI backbone. Routes messages, manages agent sessions,  │
│  parses completion signals (TASK_COMPLETE, BLOCKED,     │
│  PROGRESS_UPDATE), dispatches work to sub-agents.       │
└─────────────────┬───────────────────────┬───────────────┘
                  │ tasks/dispatch         │ SSE events
                  ▼                       ▲
┌─────────────────────────────────────────────────────────┐
│                    MISSION-CLAW                         │
│  Persistent store (SQLite). Kanban UI. Task lifecycle.  │
│  Agent roster. Real-time event bus. Webhook receiver.   │
│  The source of truth for what's happening.              │
└─────────────────────────────────────────────────────────┘
```

---

## The Loop (Plain English)

1. **Discord command** — Operator types `!task <title> | <description>` in the `#mission-claw` channel
2. **OpenClaw ingestion** — The Discord observer parses the command, creates a task in Mission-Claw via API
3. **Auto-assign** — Task is assigned to the appropriate agent based on type (code → Developer, research → Researcher, etc.)
4. **Agent dispatch** — OpenClaw sends a structured prompt to the agent's session with full context
5. **Agent works** — Agent emits `PROGRESS_UPDATE:`, `BLOCKED:`, or `TASK_COMPLETE:` signals in its output
6. **Completion** — OpenClaw parses the signal, hits the webhook, Mission-Claw moves task to `review`, broadcasts SSE
7. **Discord notification** — Relay picks up the `task_completed` event and posts back to Discord: `✅ Task completed: <title>`

The web UI reflects all of this in real-time, but you never *need* to open it.

---

## Key Features

### From Mission-Control (upstream)
- Kanban board with task lifecycle: `inbox → planning → assigned → in_progress → testing → review → done`
- AI planning phase with structured Q&A before dispatch
- Real-time SSE event bus with live feed UI
- Agent roster with persistent identity and session tracking
- Deliverables + activity log per task
- File preview and upload

### Mission-Claw Extensions
- **Discord command ingestion** — Create MC tasks from Discord with `!task`
- **Discord relay** — Task events (created, updated, completed, activities, deliverables) relayed back to Discord
- **OpenClaw session bridge** — Agents maintain persistent sessions across tasks; session state tracked in DB
- **Completion signal parsing** — `TASK_COMPLETE:`, `PROGRESS_UPDATE:`, `BLOCKED:` parsed automatically from agent output
- **Auto-dispatch** — Tasks assigned to agents trigger immediate dispatch without manual intervention
- **Diagnostics layer** — All OpenClaw ↔ MC handoffs are logged for debugging (`/api/openclaw/diagnostics`)
- **Bootstrap** — One-shot agent session initialization from MC UI

---

## Agent Roster

| Agent | Role | ID |
|---|---|---|
| **Orchestrator** | Routes tasks, multi-agent coordination | `0d6529a4-22e5-4182-b82c-15654c0ac0f6` |
| **Developer** | Code, PRs, infrastructure | `72e5814f-3932-4249-81bb-049cda09d7cf` |
| **Researcher** | Web research, competitive analysis | `1354b64e-8a51-4773-aab9-ee88612e7768` |
| **Writer** | Blog posts, docs, copy | `74f764ae-f22c-47b1-a766-5ae9d7a37155` |
| **Blueprint** | Architecture, planning, ADRs | `813008d4-26dd-4c7a-b303-fb04c9ba511b` |
| **SEO Content Editor** | SEO-optimized content | `39b73ae6-124c-42fd-accf-9adb27b84b41` |

---

## Discord Commands

| Command | Description |
|---|---|
| `!task <title> \| <description>` | Create a new task in Mission-Claw inbox |

Commands are rate-limited per user and require the sender to be on the allowlist configured in `DISCORD_TASK_COMMAND_ALLOWLIST`.

---

## Setup

### Prerequisites
- Node.js 18+
- OpenClaw running and accessible
- Discord bot configured in OpenClaw with a relay channel

### Environment Variables

```env
# OpenClaw connection
OPENCLAW_GATEWAY_URL=http://localhost:3001
OPENCLAW_API_KEY=your-api-key

# Discord relay — the OpenClaw session key for the Discord channel
DISCORD_RELAY_SESSION_KEY=agent:main:discord:channel:<channel-id>

# Discord task command ingestion
DISCORD_TASK_COMMAND_ENABLED=true
DISCORD_TASK_COMMAND_ALLOWLIST=user-id-1,user-id-2

# File paths
PROJECTS_PATH=~/projects
NEXT_PUBLIC_PROJECTS_PATH=~/projects

# App
NODE_ENV=production
PORT=4000
```

### Local Development

```bash
git clone https://github.com/your-org/mission-claw
cd mission-claw
npm install
cp .env.example .env.local  # fill in your values
npm run dev
```

App runs at `http://localhost:3000`.

### Docker (Production)

```bash
docker-compose up -d
```

Default port: `4000`. MC dashboard: `http://<host>:4000/workspace/default`.

### PM2

```bash
npm run build
pm2 start ecosystem.config.cjs
pm2 save
```

---

## API Reference (Quick)

| Method | Path | Description |
|---|---|---|
| `GET/POST` | `/api/tasks` | List / create tasks |
| `PATCH` | `/api/tasks/:id` | Update task status/fields |
| `POST` | `/api/tasks/:id/activities` | Log activity |
| `POST` | `/api/tasks/:id/deliverables` | Log deliverable |
| `POST` | `/api/tasks/:id/dispatch` | Dispatch task to agent |
| `GET` | `/api/events/stream` | SSE event stream |
| `POST` | `/api/webhooks/agent-completion` | Agent completion webhook (called by OpenClaw) |
| `GET` | `/api/openclaw/status` | OpenClaw connection status |
| `GET` | `/api/openclaw/diagnostics` | Integration diagnostics log |

---

## Credits

Mission-Claw is built on top of **[Mission-Control](https://github.com/crshdn/mission-control)** by [@crshdn](https://github.com/crshdn) and contributors. The core architecture, UI design, and agent orchestration patterns are their work. We've extended it for our specific Discord-first, OpenClaw-integrated workflow — but none of this exists without the foundation they built.

If you're looking for a clean, standalone agent orchestration dashboard without the GearSwitchr-specific integrations, check out the upstream project.

---

## License

MIT — same as upstream Mission-Control.
