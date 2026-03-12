<h1 align="center">Autensa</h1>

<p align="center">
  <em>Formerly known as Mission Control</em><br>
  <a href="https://autensa.com">autensa.com</a>
</p>

<p align="center">
  <strong>AI Agent Orchestration Dashboard</strong><br>
  Create tasks. Plan with AI. Dispatch to agents. Watch them work.
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
  <a href="#-features">Features</a> •
  <a href="#-how-it-works">How It Works</a> •
  <a href="#-configuration">Configuration</a> •
  <a href="#-contributors">Contributors</a>
</p>

<p align="center">

https://github.com/user-attachments/assets/76af060c-fdb1-40cb-b575-46c7a807845d

</p>

---

## 🆕 What's New in v1.5.0

- **Task Image Attachments** — Upload reference images to tasks. AI agents see them during dispatch — perfect for UI mockups, screenshots, and visual specs.
- **PORT env var support** — Set `PORT` in `.env.local` and it actually works now.
- **Webhook auth fix** — Split-service deployments no longer have completion callbacks blocked by API token middleware.
- **Agent status fix** — Agents correctly show standby when idle instead of stuck on "Working".

See the full [CHANGELOG](CHANGELOG.md) for details.

---
## ✨ Features

🎯 **Task Management** — Kanban board with drag-and-drop across 7 status columns

🧠 **AI Planning** — Interactive Q&A flow where AI asks clarifying questions before starting work

🤖 **Agent System** — Auto-creates specialized agents, assigns tasks, tracks progress in real-time

🔗 **Gateway Agent Discovery** — Import existing agents from your OpenClaw Gateway with one click — no need to recreate them

🔌 **OpenClaw Integration** — WebSocket connection to [OpenClaw Gateway](https://github.com/openclaw/openclaw) for AI agent orchestration

🐳 **Docker Ready** — Production-optimized Dockerfile and docker-compose for easy deployment

🔒 **Security First** — Bearer token auth, HMAC webhooks, Zod validation, path traversal protection, security headers

🛡️ **Privacy First** — No built-in analytics trackers or centralized user-data collection; data stays in your deployment by default

📡 **Live Feed** — Real-time event stream showing agent activity, task updates, and system events

🌐 **Multi-Machine** — Run the dashboard and AI agents on different computers (supports Tailscale for remote)

---

## 🛡️ Privacy

Mission Control is open-source and self-hosted. The project does **not** include ad trackers, third-party analytics beacons, or a centralized data collector run by us.

By default, your task/project data stays in your own deployment (SQLite + workspace). If you connect external services (for example AI providers or remote gateways), only the data you explicitly send to those services leaves your environment and is governed by their policies.

---

## 🏗 Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                       YOUR MACHINE                           │
│                                                              │
│  ┌─────────────────┐          ┌──────────────────────────┐  │
│  │ Mission Control  │◄────────►│    OpenClaw Gateway      │  │
│  │   (Next.js)      │   WS     │  (AI Agent Runtime)      │  │
│  │   Port 4000      │          │  Port 18789              │  │
│  └────────┬─────────┘          └───────────┬──────────────┘  │
│           │                                │                  │
│           ▼                                ▼                  │
│  ┌─────────────────┐          ┌──────────────────────────┐  │
│  │     SQLite       │          │     AI Provider          │  │
│  │    Database      │          │  (Anthropic / OpenAI)    │  │
│  └─────────────────┘          └──────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

**Mission Control** = The dashboard you interact with (this project)
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

# Start Mission Control
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

You can run Mission Control in a container using the included `Dockerfile` and `docker-compose.yml`.

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

```
 CREATE          PLAN            ASSIGN          EXECUTE         DELIVER
┌────────┐    ┌────────┐    ┌────────────┐    ┌──────────┐    ┌────────┐
│  New   │───►│  AI    │───►│   Agent    │───►│  Agent   │───►│  Done  │
│  Task  │    │  Q&A   │    │  Created   │    │  Works   │    │  ✓     │
└────────┘    └────────┘    └────────────┘    └──────────┘    └────────┘
```

1. **Create a Task** — Give it a title and description
2. **AI Plans It** — The AI asks you clarifying questions to understand exactly what you need
3. **Agent Assigned** — A specialized agent is auto-created based on your answers
4. **Work Happens** — The agent writes code, browses the web, creates files — whatever's needed
5. **Delivery** — Completed work shows up in Mission Control with deliverables

### Task Flow

```
PLANNING → INBOX → ASSIGNED → IN PROGRESS → TESTING → REVIEW → DONE
```

Drag tasks between columns or let the system auto-advance them.

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

Run Mission Control on one machine and OpenClaw on another:

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

SQLite database auto-created at `./mission-control.db`.

```bash
# Reset (start fresh)
rm mission-control.db

# Inspect
sqlite3 mission-control.db ".tables"
```

---

## 📁 Project Structure

```
mission-control/
├── src/
│   ├── app/                    # Next.js pages & API routes
│   │   ├── api/
│   │   │   ├── tasks/          # Task CRUD + planning + dispatch
│   │   │   ├── agents/         # Agent management
│   │   │   ├── openclaw/       # Gateway proxy endpoints
│   │   │   └── webhooks/       # Agent completion webhooks
│   │   ├── settings/           # Settings page
│   │   └── workspace/[slug]/   # Workspace dashboard
│   ├── components/             # React components
│   │   ├── MissionQueue.tsx    # Kanban board
│   │   ├── PlanningTab.tsx     # AI planning interface
│   │   ├── AgentsSidebar.tsx   # Agent panel
│   │   ├── LiveFeed.tsx        # Real-time events
│   │   └── TaskModal.tsx       # Task create/edit
│   └── lib/
│       ├── db/                 # SQLite + migrations
│       ├── openclaw/           # Gateway client + device identity
│       ├── validation.ts       # Zod schemas
│       └── types.ts            # TypeScript types
├── scripts/                    # Bridge & hook scripts
├── src/middleware.ts            # Auth middleware
├── .env.example                # Environment template
└── CHANGELOG.md                # Version history
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

Mission Control is built by a growing community. Thank you to everyone who has contributed!

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

[![OpenClaw](https://img.shields.io/badge/OpenClaw-Gateway-blue?style=for-the-badge)](https://github.com/open-claw/open-claw-gateway)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![SQLite](https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![Anthropic](https://img.shields.io/badge/Anthropic-Claude-orange?style=for-the-badge)](https://www.anthropic.com/)

---

## ☕ Support

If Mission Control has been useful to you, consider buying me a coffee!

<a href="https://buymeacoffee.com/crshdn" target="_blank">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="50" />
</a>

---

<p align="center">
  <strong>Happy orchestrating!</strong> 🚀
</p>
