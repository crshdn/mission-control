# Mission Control 🦞

AI Agent Orchestration Dashboard for OpenClaw.

![Mission Control](https://via.placeholder.com/800x400?text=Mission+Control+Dashboard)

## Features

- **Agent Management**: Create, configure, and monitor AI agents with custom personalities (SOUL.md, USER.md, AGENTS.md)
- **Mission Queue**: Kanban-style task board with drag-and-drop (INBOX → ASSIGNED → IN PROGRESS → REVIEW → DONE)
- **Agent Chat**: Real-time agent-to-agent conversations - watch your team collaborate
- **Live Feed**: Real-time event stream showing all activity
- **OpenClaw Integration**: Connects to your local OpenClaw Gateway

## Quick Start

### Prerequisites

- Node.js 20+
- OpenClaw running locally (`openclaw gateway`)
- npm or pnpm

### Installation

```bash
# Clone or navigate to the project
cd mission-control

# Install dependencies
npm install

# Seed the database with Charlie and sample data
npm run db:seed

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see Mission Control.

### Environment Variables

Copy `.env.example` to `.env.local` and configure:

```bash
cp .env.example .env.local
```

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENCLAW_GATEWAY_URL` | `ws://127.0.0.1:18789` | OpenClaw Gateway WebSocket URL |
| `DATABASE_PATH` | `./mission-control.db` | SQLite database file path |

## Architecture

```
mission-control/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/               # API routes
│   │   │   ├── agents/        # Agent CRUD
│   │   │   ├── tasks/         # Task CRUD
│   │   │   ├── conversations/ # Chat/conversations
│   │   │   ├── events/        # Live feed events
│   │   │   └── openclaw/      # OpenClaw integration
│   │   ├── layout.tsx
│   │   └── page.tsx           # Main dashboard
│   ├── components/            # React components
│   │   ├── Header.tsx
│   │   ├── AgentsSidebar.tsx
│   │   ├── AgentModal.tsx
│   │   ├── MissionQueue.tsx
│   │   ├── TaskModal.tsx
│   │   ├── ChatPanel.tsx
│   │   └── LiveFeed.tsx
│   └── lib/
│       ├── db/                # SQLite database
│       ├── openclaw/          # OpenClaw client
│       ├── store.ts           # Zustand state
│       └── types.ts           # TypeScript types
├── mission-control.db         # SQLite database (created on seed)
└── package.json
```

## Agent Personalities

Each agent can have three markdown files defining their personality:

### SOUL.md
Defines the agent's core identity, personality traits, and communication style.

### USER.md
Context about the human(s) the agent works with - preferences, communication style, goals.

### AGENTS.md
Awareness of other agents in the system - who they are, how to collaborate.

## API Endpoints

### Agents
- `GET /api/agents` - List all agents
- `POST /api/agents` - Create agent
- `GET /api/agents/[id]` - Get agent
- `PATCH /api/agents/[id]` - Update agent
- `DELETE /api/agents/[id]` - Delete agent

### Tasks
- `GET /api/tasks` - List tasks (with filters)
- `POST /api/tasks` - Create task
- `GET /api/tasks/[id]` - Get task
- `PATCH /api/tasks/[id]` - Update task
- `DELETE /api/tasks/[id]` - Delete task

### Conversations
- `GET /api/conversations` - List conversations
- `POST /api/conversations` - Create conversation
- `GET /api/conversations/[id]/messages` - Get messages
- `POST /api/conversations/[id]/messages` - Send message

### Events
- `GET /api/events` - List events (live feed)
- `POST /api/events` - Create event

### OpenClaw
- `GET /api/openclaw/status` - Check connection status

## Charlie - The Master Orchestrator 🦞

Charlie is the default master agent who coordinates all other agents. Charlie:

- Receives and triages incoming tasks
- Assigns work to appropriate agents
- Facilitates team collaboration
- Monitors progress and quality
- Reports to the human

## Development

```bash
# Run development server with hot reload
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run database migrations
npm run db:migrate

# Seed database
npm run db:seed

# Lint code
npm run lint
```

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: SQLite (better-sqlite3)
- **State**: Zustand
- **Drag & Drop**: @hello-pangea/dnd
- **Icons**: Lucide React

## License

MIT
