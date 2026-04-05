<h1 align="center">Autensa</h1>

<p align="center">
  <em>The World's First Autonomous Product Engine</em><br>
  <a href="https://autensa.com">autensa.com</a>
</p>

<p align="center">
  <strong>Your products improve themselves — 24/7 — while you sleep.</strong><br>
  Research → Ideation → Swipe → Build → Test → Review → Pull Request — fully automated.
</p>

<p align="center">
I highly recommend getting Hetzner VPS to run this. <a href="https://hetzner.cloud/?ref=WYxriOUHyTil">You can sign up here.</a>
</p>

<p align="center">
  <img src="https://img.shields.io/github/stars/crshdn/mission-control?style=flat-square" alt="GitHub Stars" />
  <img src="https://img.shields.io/github/issues/crshdn/mission-control?style=flat-square" alt="GitHub Issues" />
  <img src="https://img.shields.io/github/license/crshdn/mission-control?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square" alt="PRs Welcome" />
  <img src="https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/SQLite-3-003B57?style=flat-square&logo=sqlite&logoColor=white" alt="SQLite" />
</p>

<p align="center">
  <a href="https://missioncontrol.ghray.com"><strong>🎮 Live Demo</strong></a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-docker">Docker</a> •
  <a href="#-whats-new-in-v240">What's New</a> •
  <a href="#-features">Features</a> •
  <a href="#-how-it-works">How It Works</a> •
  <a href="#-configuration">Configuration</a> •
  <a href="#-contributors">Contributors</a>
</p>

<p align="center">
  <a href="https://ghray.com/Autensa_v2.mp4"><strong>▶️ Watch the Autensa v2 Introduction</strong></a>
</p>

---

## 🚀 What's New in v2.4.0

### Agent Skill Creation Loop
- **Agents learn reusable procedures** — When a task completes, the system extracts structured skills (build steps, deploy scripts, config patterns) from what the agent did. Skills are stored as executable playbooks with commands, prerequisites, and verification.
- **Skills improve with use** — Agents report whether a skill worked. Bayesian confidence scoring promotes proven skills and deprecates unreliable ones. No manual curation needed.
- **Injected at dispatch** — Matched skills are the first thing an agent sees, not a footnote. Agent #1 figures out the build process, Agent #2 gets it as primary instructions.

### Previous Releases

<details>
<summary>v2.3.x — Idea Dedup, Chat, Undo, A/B Testing, Rollback</summary>

- Idea similarity detection & auto-deduplication
- Floating operator chat widget with @mentions
- 10-second swipe undo + batch review mode
- Product program A/B testing
- Automated rollback pipeline via GitHub webhooks
</details>

### Idea Similarity Detection
- **Auto-deduplication** — New ideas are compared against existing ones. Ideas >90% similar to rejected ideas are auto-suppressed. Similar ideas get a warning badge. Full audit trail.

### Operator Chat Widget
- **Chat from anywhere** — Floating chat widget with threaded conversations per task. `@agent` mentions, command palette (`/status`, `/nudge`, `/checkpoint`), and unread badges.

### Swipe Undo & Batch Review
- **10-second undo** — Full rollback of any swipe including task deletion. Batch review mode for table-view multi-select actions.

### Product Program A/B Testing
- **Test your product program** — Run concurrent or alternating A/B tests on product program variants. Research and ideation run against each variant. Statistical comparison of approval rates.

### Automated Rollback Pipeline
- **Auto-revert failed deploys** — GitHub webhook monitors merged PRs. Post-merge health checks. Auto-creates revert PRs when failures detected.

### Activity Dashboard Picker
- **Workspace selector** — `/activity` lists all workspaces instead of hardcoding to one.

### Previous Releases

<details>
<summary>v2.2.1 — Health Check & Backup API</summary>

- `/api/health` and `/api/health/metrics` for monitoring integration
- Database backup API with optional S3 upload
</details>

<details>
<summary>v2.2.0 — Preference Learning & Token Tracking</summary>

- Swipe-driven preference learning (Karpathy AutoResearch pattern)
- Token counts now recorded in activity log and cost tracker
</details>

<details>
<summary>v2.1.x — Server-Side Pipeline, Error Reporting & Badges</summary>

- Server-side research → ideation pipeline (fire-and-forget)
- LLM retry with exponential backoff
- Toast notifications with one-click error reporting
- Pending ideas badges on product cards
- One-click error reporting via mailto (pre-filled with system logs)
- Pending ideas badge on product cards (iPhone-style notification count)
</details>

<details>
<summary>v2.0.2 — Session Key Prefix Support</summary>

- Session Key Prefix UI for custom OpenClaw session routing. ([@balaji-g42](https://github.com/balaji-g42))
- Session key sanitization — empty prefixes fall back to defaults.
</details>

<details>
<summary>v2.0.1 — Dispatch Stability & Community Contributions</summary>

- **Product Settings Modal** — Edit product config inline via the gear icon.
- **Import README / Auto-Generate Description** — One-click README import and AI-generated descriptions in the New Product Wizard.
- **Dispatch hang fix** — 30s timeout on all dispatch calls; stale WebSocket force-reconnect.
- **Pre-migration database backups** — Automatic timestamped backups before migrations. ([@cgluttrell](https://github.com/cgluttrell))
- **Migration 013 data guard** — Destructive migration skips databases with existing data. ([@cgluttrell](https://github.com/cgluttrell))
- **Static device identity path** — Removes dynamic filesystem path parameter. ([@org4lap](https://github.com/org4lap))
</details>

### v2.0 Highlights

Autensa v2 is a ground-up expansion from task orchestration dashboard to **the world's first autonomous product improvement engine**. It researches your market, generates feature ideas, lets you decide with a swipe, and builds them — automatically.

### 🔬 Product Autopilot — The Full Pipeline

The headline feature. Point Autensa at any product (repo + live URL) and it runs a continuous improvement loop:

1. **Autonomous Research** — AI agents analyze your codebase, scan your live site, and research your market: competitors, user intent, conversion patterns, SEO gaps, technical opportunities. Runs on configurable schedules — daily, weekly, or on-demand.

2. **AI-Powered Ideation** — Research feeds into ideation agents that generate concrete, scored feature ideas. Each idea includes an impact score, feasibility score, size estimate, technical approach, and a direct link to the research that inspired it.

3. **Swipe to Decide** — Ideas appear as cards in a Tinder-style interface. Four actions:
   - **Pass** — Rejected. The preference model learns from it.
   - **Maybe** — Saved to the Maybe Pool. Resurfaces in 1 week with fresh context.
   - **Yes** — Task created. Build agent starts coding.
   - **Now!** — Urgent dispatch. Priority queue, immediate execution.

4. **Automated Build → PR** — Approved ideas flow through the full agent pipeline: Build agent implements the feature → Test agent runs the suite → Review agent inspects the diff → Pull request created on GitHub with full context.

**Your only job is the swipe.** Everything else is automated.

### 📄 Product Program (Karpathy AutoResearch Pattern)

Inspired by Andrej Karpathy's [AutoResearch](https://github.com/karpathy/autoresearch) architecture. Each product has a **Product Program** — a living document that instructs research and ideation agents on what to look for, what matters, and what to ignore. The program evolves as swipe data accumulates: the system learns your taste, not just patterns.

### 🚛 Convoy Mode — Parallel Multi-Agent Execution

Large features get decomposed into subtasks with a visual dependency graph (DAG). Multiple agents (3–5) work simultaneously with dependency-aware scheduling:

- **Parallel subtask execution** — Independent pieces run concurrently
- **Dependency graph visualization** — See what depends on what
- **Health monitoring** — Detects stalled, stuck, or zombie agents automatically
- **Auto-nudge** — Reassigns or restarts agents that go dark
- **Crash recovery** — Checkpoints save agent progress; work resumes from last checkpoint, not from scratch

### 💬 Operator Chat — Talk to Agents Mid-Build

Don't wait for a PR to give feedback. Two communication modes:

- **Queued Notes** — Add context ("use the existing auth middleware") that gets delivered at the agent's next checkpoint
- **Direct Messages** — Delivered immediately to the agent's active session for real-time course correction

Full chat history preserved per task — every message, note, and response.

### 💰 Cost Tracking & Budget Caps

Granular spend visibility across every dimension:

- **Per-task cost tracking** — See exactly what each feature costs to build
- **Per-product aggregation** — Total spend across all tasks for a product
- **Daily and monthly caps** — Set budget limits that auto-pause dispatch when exceeded
- **Cost breakdown API** — Detailed reports by agent, model, and time period

### 🧠 Knowledge Base & Learner Agent

A dedicated Learner agent captures lessons from every build cycle — what worked, what failed, what patterns emerged. Knowledge entries are injected into future dispatches so agents don't repeat mistakes.

### 📋 Enhanced Planning Phase

Before any build starts, agents run a structured planning phase:

- AI asks clarifying questions about requirements and constraints
- Generates a detailed spec from your answers
- Multi-agent planning specs with sub-agent definitions and execution steps
- Approval gate — you review the plan before any code is written

### 🔄 Checkpoint & Crash Recovery

Agent progress is saved at configurable checkpoints:

- If a session crashes, work resumes from the last checkpoint — not from scratch
- Checkpoint restore API for manual recovery
- Checkpoint history visible per task

### 🎯 Preference Learning

Every swipe trains a per-product preference model:

- Category weights (growth, SEO, UX, etc.) adjust based on approvals/rejections
- Complexity preferences calibrate over time
- Tag pattern recognition refines idea generation
- Ideas get sharper with every iteration

### 🔁 Maybe Pool

Ideas you're not sure about don't disappear:

- Swiped "Maybe" ideas enter a holding pool
- Automatically resurface after a configurable period with new market context
- Batch re-evaluation mode to review accumulated maybes
- Can be promoted to Yes at any time

### 📡 Live Activity Feed

Real-time SSE stream of everything happening across all products:

- Research progress, ideation cycles, swipe events
- Build progress, test results, review outcomes
- Agent health events, cost updates, PR creation
- Filterable by product, agent, and event type

### 🛡️ Automation Tiers

Choose your comfort level per product:

| Tier | Behavior | Best For |
|:-----|:---------|:---------|
| **Supervised** | PRs created automatically. You review and merge manually. | Production apps |
| **Semi-Auto** | PRs auto-merge when CI passes and review agent approves. | Staging & trusted repos |
| **Full Auto** | Everything automated end-to-end. Idea → deployed feature. | Side projects & MVPs |

### 🔀 Workspace Isolation

Each build task gets an isolated workspace:

- **Git Worktrees** for repo-backed projects — isolated branch, no conflicts with other agents
- **Task Sandboxes** for local/no-repo projects — dedicated directory under `.workspaces/task-{id}/`
- **Port allocation** (4200–4299 range) for dev servers — no port conflicts between concurrent builds
- **Serialized merge queue** — completed tasks merge one at a time with conflict detection
- **Product-scoped locking** — concurrent completions for the same product queue automatically

### 📊 Product Scheduling

Configure autonomous cycles per product:

- Research frequency (daily, weekly, custom cron)
- Ideation frequency (after each research cycle, or independent schedule)
- Auto-dispatch rules (immediate on "Yes" swipe, or batch)
- Schedule management UI with enable/disable per schedule

---

## ✨ Features

**Product Autopilot**
- 🔬 Autonomous market research (competitors, SEO, user intent, technical gaps)
- 💡 AI-powered ideation with impact/feasibility scoring
- 👆 Swipe interface for instant approve/reject/maybe decisions
- 📄 Product Program (Karpathy AutoResearch pattern)
- 🎯 Preference learning from swipe history
- 🔁 Maybe Pool with auto-resurface
- 📊 Configurable research & ideation schedules

**Agent Orchestration**
- 🤖 Multi-agent pipeline (Builder → Tester → Reviewer → Learner)
- 🚛 Convoy Mode for parallel multi-agent execution
- 💬 Operator Chat (queued notes + direct messages)
- 💚 Agent health monitoring with auto-nudge
- 🔄 Checkpoint & crash recovery
- 🧠 Knowledge base with cross-task learning
- 🔀 Workspace isolation (git worktrees + task sandboxes)

**Task Management**
- 🎯 Kanban board with drag-and-drop across 7 status columns
- 🧠 AI planning phase with clarifying Q&A
- 📋 Multi-agent planning specs
- 🖼️ Task image attachments (UI mockups, screenshots)
- 📡 Live real-time activity feed (SSE)
- 💰 Per-task, per-product, daily/monthly cost tracking & caps

**Infrastructure**
- 🔌 OpenClaw Gateway integration (WebSocket)
- 🔗 Gateway agent discovery & import
- 🐳 Docker ready (production-optimized)
- 🔒 Bearer token auth, HMAC webhooks, Zod validation
- 🛡️ Privacy first — no trackers, no centralized data collection
- 🌐 Multi-machine support (Tailscale compatible)
- 🛡️ Automation tiers (Supervised / Semi-Auto / Full Auto)

---

## 🛡️ Privacy

Autensa is open-source and self-hosted. The project does **not** include ad trackers, third-party analytics beacons, or a centralized data collector.

Your task data, research results, ideas, swipe history, and product programs stay in your own deployment (SQLite + workspace). If you connect external services (AI providers or remote gateways), only the data you explicitly send to those services leaves your environment.

---

## 🏗 Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                          YOUR MACHINE                                │
│                                                                      │
│  ┌──────────────────┐          ┌──────────────────────────────────┐  │
│  │ Autensa           │◄────────►│    OpenClaw Gateway              │  │
│  │  (Next.js)        │   WS     │  (AI Agent Runtime)              │  │
│  │  Port 4000        │          │  Port 18789                      │  │
│  └────────┬──────────┘          └───────────┬────────────────────┘  │
│           │                                  │                       │
│           ▼                                  ▼                       │
│  ┌──────────────────┐          ┌──────────────────────────────────┐  │
│  │    SQLite DB       │          │     AI Providers                │  │
│  │  (tasks, products, │          │  (Anthropic / OpenAI / etc.)    │  │
│  │   ideas, costs)    │          └──────────────────────────────────┘  │
│  └──────────────────┘                                                │
│           │                                                          │
│           ▼                                                          │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              Autopilot Engine                                  │   │
│  │  Research → Ideation → Swipe → Build → Test → Review → PR     │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

**Autensa** = The dashboard + autopilot engine (this project)
**OpenClaw Gateway** = The AI runtime that executes tasks ([separate project](https://github.com/openclaw/openclaw))

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** v18+ ([download](https://nodejs.org/))
- **OpenClaw Gateway** — `npm install -g openclaw`
- **AI API Key** — Anthropic (recommended), OpenAI, Google, or others via OpenRouter

### Install

```bash
# Clone
git clone https://github.com/crshdn/mission-control.git
cd mission-control

# Install dependencies
npm install

# Setup
cp .env.example .env.local
```

Edit `.env.local`:

```env
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=your-token-here
```

> **Where to find the token:** Check `~/.openclaw/openclaw.json` under `gateway.token`

### Run

```bash
# Start OpenClaw (separate terminal)
openclaw gateway start

# Start Autensa
npm run dev
```

Open **http://localhost:4000** — you're in! 🎉

### Production

```bash
npm run build
npx next start -p 4000
```

---

## 🐳 Docker

You can run Autensa in a container using the included `Dockerfile` and `docker-compose.yml`.

### Prerequisites

- Docker Desktop (or Docker Engine + Compose plugin)
- OpenClaw Gateway running locally or remotely

### 1. Configure environment

Create a `.env` file for Compose:

```bash
cp .env.example .env
```

Then set at least:

```env
OPENCLAW_GATEWAY_URL=ws://host.docker.internal:18789
OPENCLAW_GATEWAY_TOKEN=your-token-here
```

Notes:
- Use `host.docker.internal` when OpenClaw runs on your host machine.
- If OpenClaw is on another machine, set its reachable `ws://` or `wss://` URL instead.

### 2. Build and start

```bash
docker compose up -d --build
```

Open **http://localhost:4000**.

### 3. Useful commands

```bash
# View logs
docker compose logs -f mission-control

# Stop containers
docker compose down

# Stop and remove volumes (deletes SQLite/workspace data)
docker compose down -v
```

### Data persistence

Compose uses named volumes:
- `mission-control-data` for SQLite (`/app/data`)
- `mission-control-workspace` for workspace files (`/app/workspace`)

---

## 🎯 How It Works

### The Autopilot Pipeline

```
RESEARCH → IDEATION → SWIPE → PLAN → BUILD → TEST → REVIEW → PR
   AI          AI      You      AI     Agent   Agent   Agent   Auto
```

1. **Research** — AI analyzes your product's market: competitors, SEO, user intent, technical gaps
2. **Ideation** — Research feeds ideation agents that generate scored feature ideas
3. **Swipe** — You review ideas as cards. Pass / Maybe / Yes / Now!
4. **Plan** — AI asks clarifying questions, generates a detailed spec
5. **Build** — Agent clones repo, creates branch, implements the feature
6. **Test** — Agent runs the test suite. Failures bounce back for auto-fix
7. **Review** — Agent inspects the diff for quality, security, best practices
8. **PR** — Pull request created on GitHub with full context and research backing

### Task Flow (Manual Tasks)

```
PLANNING → INBOX → ASSIGNED → IN PROGRESS → TESTING → REVIEW → DONE
```

Drag tasks between columns or let the system auto-advance them.

### Convoy Mode (Large Features)

```
                    ┌─ Subtask A (Agent 1) ──┐
PARENT TASK ────────┤                        ├──── MERGE & PR
                    ├─ Subtask B (Agent 2) ──┤
                    └─ Subtask C (Agent 3) ──┘
                         (depends on A)
```

Subtasks run in parallel with dependency-aware scheduling. Health monitoring detects stalls. Crash recovery via checkpoints.

---

## ⚙️ Configuration

### Environment Variables

| Variable | Required | Default | Description |
|:---------|:--------:|:--------|:------------|
| `OPENCLAW_GATEWAY_URL` | ✅ | `ws://127.0.0.1:18789` | WebSocket URL to OpenClaw Gateway |
| `OPENCLAW_GATEWAY_TOKEN` | ✅ | — | Authentication token for OpenClaw |
| `MC_API_TOKEN` | — | — | API auth token (enables auth middleware) |
| `WEBHOOK_SECRET` | — | — | HMAC secret for webhook validation |
| `DATABASE_PATH` | — | `./mission-control.db` | SQLite database location |
| `WORKSPACE_BASE_PATH` | — | `~/Documents/Shared` | Base directory for workspace files |
| `PROJECTS_PATH` | — | `~/Documents/Shared/projects` | Directory for project folders |

### Security (Production)

Generate secure tokens:

```bash
# API authentication token
openssl rand -hex 32

# Webhook signature secret
openssl rand -hex 32
```

Add to `.env.local`:

```env
MC_API_TOKEN=your-64-char-hex-token
WEBHOOK_SECRET=your-64-char-hex-token
```

When `MC_API_TOKEN` is set:
- External API calls require `Authorization: Bearer <token>`
- Browser UI works automatically (same-origin requests are allowed)
- SSE streams accept token as query param

See [PRODUCTION_SETUP.md](PRODUCTION_SETUP.md) for the full production guide.

---

## 🌐 Multi-Machine Setup

Run Autensa on one machine and OpenClaw on another:

```env
# Point to the remote machine
OPENCLAW_GATEWAY_URL=ws://YOUR_SERVER_IP:18789
OPENCLAW_GATEWAY_TOKEN=your-shared-token
```

### With Tailscale (Recommended)

```env
OPENCLAW_GATEWAY_URL=wss://your-machine.tailnet-name.ts.net
OPENCLAW_GATEWAY_TOKEN=your-shared-token
```

---

## 🗄 Database

SQLite database auto-created at `./mission-control.db`. Migrations run automatically on startup (21 migrations). As of v2.0.1, a timestamped backup is created before any pending migration runs.

```bash
# Reset (start fresh)
rm mission-control.db

# Inspect
sqlite3 mission-control.db ".tables"
```

Key tables added in v2: `products`, `research_cycles`, `ideas`, `swipe_history`, `preference_models`, `maybe_pool`, `product_feedback`, `cost_events`, `cost_caps`, `product_schedules`, `operations_log`, `convoys`, `convoy_subtasks`, `agent_health`, `work_checkpoints`, `agent_mailbox`, `workspace_ports`, `workspace_merges`.

---

## 📁 Project Structure

```
autensa/
├── src/
│   ├── app/                    # Next.js pages & API routes
│   │   ├── api/
│   │   │   ├── tasks/          # Task CRUD, planning, dispatch, convoy, chat, workspace
│   │   │   ├── products/       # Product CRUD, research, ideation, swipe, schedules
│   │   │   ├── agents/         # Agent management, health, mail, discovery
│   │   │   ├── costs/          # Cost tracking, caps, breakdowns
│   │   │   ├── convoy/         # Convoy mail endpoints
│   │   │   ├── openclaw/       # Gateway proxy endpoints
│   │   │   └── webhooks/       # Agent completion webhooks
│   │   ├── settings/           # Settings page
│   │   └── workspace/[slug]/   # Workspace dashboard
│   ├── components/
│   │   ├── MissionQueue.tsx    # Kanban board
│   │   ├── PlanningTab.tsx     # AI planning interface
│   │   ├── AgentsSidebar.tsx   # Agent panel
│   │   ├── LiveFeed.tsx        # Real-time events
│   │   ├── TaskModal.tsx       # Task create/edit
│   │   ├── TaskChatTab.tsx     # Operator chat
│   │   ├── ConvoyTab.tsx       # Convoy visualization
│   │   ├── DependencyGraph.tsx # DAG visualization
│   │   ├── HealthIndicator.tsx # Agent health badges
│   │   ├── WorkspaceTab.tsx    # Workspace isolation UI
│   │   ├── autopilot/          # SwipeDeck, IdeaCard, ResearchReport, etc.
│   │   └── costs/              # Cost dashboard components
│   └── lib/
│       ├── autopilot/          # Research, ideation, swipe, maybe-pool, scheduling
│       ├── costs/              # Cost tracker, caps, reporting
│       ├── db/                 # SQLite + 21 migrations
│       ├── openclaw/           # Gateway client + device identity
│       ├── convoy.ts           # Convoy orchestration
│       ├── agent-health.ts     # Health monitoring + auto-nudge
│       ├── checkpoint.ts       # Checkpoint save/restore
│       ├── workspace-isolation.ts # Git worktrees + task sandboxes
│       ├── mailbox.ts          # Inter-agent messaging
│       ├── chat-listener.ts    # Operator chat relay
│       ├── learner.ts          # Knowledge base management
│       └── types.ts            # TypeScript types
├── presentation/               # v2 pitch deck + narration script
├── specs/                      # Feature specs
├── scripts/                    # Bridge & hook scripts
└── CHANGELOG.md                # Full version history
```

---

## 🔧 Troubleshooting

### Can't connect to OpenClaw Gateway

1. Check OpenClaw is running: `openclaw gateway status`
2. Verify URL and token in `.env.local`
3. Check firewall isn't blocking port 18789

### Planning questions not loading

1. Check OpenClaw logs: `openclaw gateway logs`
2. Verify your AI API key is valid
3. Refresh and click the task again

### Port 4000 already in use

```bash
lsof -i :4000
kill -9 <PID>
```

### Agent callbacks failing behind a proxy (502 errors)

If you're behind an HTTP proxy (corporate VPN, Hiddify, etc.), agent callbacks to `localhost` may fail because the proxy intercepts local requests.

**Fix:** Set `NO_PROXY` so localhost bypasses the proxy:

```bash
# Linux / macOS
export NO_PROXY=localhost,127.0.0.1

# Windows (cmd)
set NO_PROXY=localhost,127.0.0.1

# Docker
docker run -e NO_PROXY=localhost,127.0.0.1 ...
```

See [Issue #30](https://github.com/crshdn/mission-control/issues/30) for details.

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'feat: add amazing feature'`
4. Push: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## 👏 Contributors

Autensa is built by a growing community. Thank you to everyone who has contributed!

<table>
  <tr>
    <td align="center">
      <a href="https://github.com/superlowburn">
        <img src="https://github.com/superlowburn.png?size=80" width="80" height="80" style="border-radius:50%" alt="Steve" /><br />
        <sub><b>Steve</b></sub>
      </a><br />
      <sub>Device Identity</sub>
    </td>
    <td align="center">
      <a href="https://github.com/rchristman89">
        <img src="https://github.com/rchristman89.png?size=80" width="80" height="80" style="border-radius:50%" alt="Ryan Christman" /><br />
        <sub><b>Ryan Christman</b></sub>
      </a><br />
      <sub>Port Configuration</sub>
    </td>
    <td align="center">
      <a href="https://github.com/nicozefrench">
        <img src="https://github.com/nicozefrench.png?size=80" width="80" height="80" style="border-radius:50%" alt="nicozefrench" /><br />
        <sub><b>nicozefrench</b></sub>
      </a><br />
      <sub>ARIA Hooks</sub>
    </td>
    <td align="center">
      <a href="https://github.com/misterdas">
        <img src="https://github.com/misterdas.png?size=80" width="80" height="80" style="border-radius:50%" alt="GOPAL" /><br />
        <sub><b>GOPAL</b></sub>
      </a><br />
      <sub>Node v25 Support</sub>
    </td>
  </tr>
  <tr>
    <td align="center">
      <a href="https://github.com/joralemarti">
        <img src="https://github.com/joralemarti.png?size=80" width="80" height="80" style="border-radius:50%" alt="Jorge Martinez" /><br />
        <sub><b>Jorge Martinez</b></sub>
      </a><br />
      <sub>Orchestration</sub>
    </td>
    <td align="center">
      <a href="https://github.com/niks918">
        <img src="https://github.com/niks918.png?size=80" width="80" height="80" style="border-radius:50%" alt="Nik" /><br />
        <sub><b>Nik</b></sub>
      </a><br />
      <sub>Planning & Dispatch</sub>
    </td>
    <td align="center">
      <a href="https://github.com/gmb9000">
        <img src="https://github.com/gmb9000.png?size=80" width="80" height="80" style="border-radius:50%" alt="Michael G" /><br />
        <sub><b>Michael G</b></sub>
      </a><br />
      <sub>Usage Dashboard</sub>
    </td>
    <td align="center">
      <a href="https://github.com/Z8Medina">
        <img src="https://github.com/Z8Medina.png?size=80" width="80" height="80" style="border-radius:50%" alt="Z8Medina" /><br />
        <sub><b>Z8Medina</b></sub>
      </a><br />
      <sub>Metabase Integration</sub>
    </td>
  </tr>
  <tr>
    <td align="center">
      <a href="https://github.com/markphelps">
        <img src="https://github.com/markphelps.png?size=80" width="80" height="80" style="border-radius:50%" alt="Mark Phelps" /><br />
        <sub><b>Mark Phelps</b></sub>
      </a><br />
      <sub>Gateway Agent Discovery 💡</sub>
    </td>
    <td align="center">
      <a href="https://github.com/muneale">
        <img src="https://github.com/muneale.png?size=80" width="80" height="80" style="border-radius:50%" alt="Alessio" /><br />
        <sub><b>Alessio</b></sub>
      </a><br />
      <sub>Docker Support</sub>
    </td>
    <td align="center">
      <a href="https://github.com/JamesTsetsekas">
        <img src="https://github.com/JamesTsetsekas.png?size=80" width="80" height="80" style="border-radius:50%" alt="James Tsetsekas" /><br />
        <sub><b>James Tsetsekas</b></sub>
      </a><br />
      <sub>Planning Flow Fixes</sub>
    </td>
    <td align="center">
      <a href="https://github.com/nice-and-precise">
        <img src="https://github.com/nice-and-precise.png?size=80" width="80" height="80" style="border-radius:50%" alt="nice-and-precise" /><br />
        <sub><b>nice-and-precise</b></sub>
      </a><br />
      <sub>Agent Protocol Docs</sub>
    </td>
  </tr>
  <tr>
    <td align="center">
      <a href="https://github.com/JamesCao2048">
        <img src="https://github.com/JamesCao2048.png?size=80" width="80" height="80" style="border-radius:50%" alt="JamesCao2048" /><br />
        <sub><b>JamesCao2048</b></sub>
      </a><br />
      <sub>Task Creation Fix</sub>
    </td>
    <td align="center">
      <a href="https://github.com/davetha">
        <img src="https://github.com/davetha.png?size=80" width="80" height="80" style="border-radius:50%" alt="davetha" /><br />
        <sub><b>davetha</b></sub>
      </a><br />
      <sub>Force-Dynamic & Model Discovery</sub>
    </td>
    <td align="center">
      <a href="https://github.com/pkgaiassistant-droid">
        <img src="https://github.com/pkgaiassistant-droid.png?size=80" width="80" height="80" style="border-radius:50%" alt="pkgaiassistant-droid" /><br />
        <sub><b>pkgaiassistant-droid</b></sub>
      </a><br />
      <sub>Activity Dashboard & Mobile UX</sub>
    </td>
    <td align="center">
      <a href="https://github.com/Coder-maxer">
        <img src="https://github.com/Coder-maxer.png?size=80" width="80" height="80" style="border-radius:50%" alt="Coder-maxer" /><br />
        <sub><b>Coder-maxer</b></sub>
      </a><br />
      <sub>Static Route Fix</sub>
    </td>
  </tr>
  <tr>
    <td align="center">
      <a href="https://github.com/grunya-openclaw">
        <img src="https://github.com/grunya-openclaw.png?size=80" width="80" height="80" style="border-radius:50%" alt="grunya-openclaw" /><br />
        <sub><b>grunya-openclaw</b></sub>
      </a><br />
      <sub>Dispatch & Proxy Bug Reports</sub>
    </td>
    <td align="center">
      <a href="https://github.com/ilakskill">
        <img src="https://github.com/ilakskill.png?size=80" width="80" height="80" style="border-radius:50%" alt="ilakskill" /><br />
        <sub><b>ilakskill</b></sub>
      </a><br />
      <sub>Dispatch Recovery Design</sub>
    </td>
    <td align="center">
      <a href="https://github.com/plutusaisystem-cmyk">
        <img src="https://github.com/plutusaisystem-cmyk.png?size=80" width="80" height="80" style="border-radius:50%" alt="plutusaisystem-cmyk" /><br />
        <sub><b>plutusaisystem-cmyk</b></sub>
      </a><br />
      <sub>Agent Daemon & Fleet View</sub>
    </td>
    <td align="center">
      <a href="https://github.com/nithis4th">
        <img src="https://github.com/nithis4th.png?size=80" width="80" height="80" style="border-radius:50%" alt="nithis4th" /><br />
        <sub><b>nithis4th</b></sub>
      </a><br />
      <sub>2nd Brain Knowledge Base</sub>
    </td>
  </tr>
  <tr>
    <td align="center">
      <a href="https://github.com/davidpellerin">
        <img src="https://github.com/davidpellerin.png?size=80" width="80" height="80" style="border-radius:50%" alt="davidpellerin" /><br />
        <sub><b>davidpellerin</b></sub>
      </a><br />
      <sub>Dynamic Agent Config</sub>
    </td>
    <td align="center">
      <a href="https://github.com/tmchow">
        <img src="https://github.com/tmchow.png?size=80" width="80" height="80" style="border-radius:50%" alt="tmchow" /><br />
        <sub><b>tmchow</b></sub>
      </a><br />
      <sub>Agent Import Improvements</sub>
    </td>
    <td align="center">
      <a href="https://github.com/xiaomiusa87">
        <img src="https://github.com/xiaomiusa87.png?size=80" width="80" height="80" style="border-radius:50%" alt="xiaomiusa87" /><br />
        <sub><b>xiaomiusa87</b></sub>
      </a><br />
      <sub>Session Key Bug Report</sub>
    </td>
    <td align="center">
      <a href="https://github.com/lutherbot-ai">
        <img src="https://github.com/lutherbot-ai.png?size=80" width="80" height="80" style="border-radius:50%" alt="lutherbot-ai" /><br />
        <sub><b>lutherbot-ai</b></sub>
      </a><br />
      <sub>Security Audit</sub>
    </td>
  </tr>
  <tr>
    <td align="center">
      <a href="https://github.com/YitingOU">
        <img src="https://github.com/YitingOU.png?size=80" width="80" height="80" style="border-radius:50%" alt="YITING OU" /><br />
        <sub><b>YITING OU</b></sub>
      </a><br />
      <sub>Cascade Delete Fix</sub>
    </td>
    <td align="center">
      <a href="https://github.com/brandonros">
        <img src="https://github.com/brandonros.png?size=80" width="80" height="80" style="border-radius:50%" alt="Brandon Ros" /><br />
        <sub><b>Brandon Ros</b></sub>
      </a><br />
      <sub>Docker CI Workflow</sub>
    </td>
    <td align="center">
      <a href="https://github.com/nano-lgtm">
        <img src="https://github.com/nano-lgtm.png?size=80" width="80" height="80" style="border-radius:50%" alt="nano-lgtm" /><br />
        <sub><b>nano-lgtm</b></sub>
      </a><br />
      <sub>Kanban UX Improvements</sub>
    </td>
    <td align="center">
      <a href="https://github.com/cammybot1313-collab">
        <img src="https://github.com/cammybot1313-collab.png?size=80" width="80" height="80" style="border-radius:50%" alt="cammybot1313-collab" /><br />
        <sub><b>cammybot1313-collab</b></sub>
      </a><br />
      <sub>Docs Typo Fix</sub>
    </td>
  </tr>
</table>

---

## ⭐ Star History

<a href="https://www.star-history.com/#crshdn/mission-control&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=crshdn/mission-control&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=crshdn/mission-control&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=crshdn/mission-control&type=Date" width="600" />
  </picture>
</a>

---

## 📜 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- **[Andrej Karpathy](https://github.com/karpathy/autoresearch)** — AutoResearch architecture that inspired the Product Program pattern
- **[Mike De'Shazer](https://github.com/mikedeshazer)** — Operator Chat concept

[![OpenClaw](https://img.shields.io/badge/OpenClaw-Gateway-blue?style=for-the-badge)](https://github.com/open-claw/open-claw-gateway)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![SQLite](https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![Anthropic](https://img.shields.io/badge/Anthropic-Claude-orange?style=for-the-badge)](https://www.anthropic.com/)

---

## ☕ Support

If Autensa has been useful to you, consider buying me a coffee!

<a href="https://buymeacoffee.com/crshdn" target="_blank">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="50" />
</a>

---

<p align="center">
  <a href="https://discord.gg/3u62kySzM">
    <img src="https://img.shields.io/badge/Join_Our_Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Join Our Discord" />
  </a>
</p>

<p align="center">
  <strong>Stop managing a backlog. Start shipping on autopilot.</strong> 🚀
</p>
