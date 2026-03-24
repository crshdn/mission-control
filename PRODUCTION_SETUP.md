# Production Setup Guide

This guide walks you through setting up Mission Control for production use with proper configuration management.

## ⚠️ Security First

**NEVER commit sensitive data to the repository!** This includes:
- IP addresses
- User paths
- Authentication tokens
- API keys
- Database credentials

All sensitive values go in `.env.local` (which is gitignored).

## 🔒 Security & Authorization Model

### Single-Operator Model

Mission Control uses a **single bearer token** (`MC_API_TOKEN`) for all API authentication.
This token grants access to **all workspaces and tasks** — there is no per-workspace authorization.

- `workspace_id` on tasks is a **filter**, not a security boundary.
- Any valid token + any task ID = full access.
- This is by design for single-operator / small-team deployments.

**If you need multi-tenant workspace isolation**, implement per-workspace token scoping before exposing this to untrusted users.

### Webhook Security

Both webhook endpoints (`/api/webhooks/agent-completion` and `/api/webhooks/github`) validate HMAC signatures **only when their respective secrets are configured**:

| Variable | Webhook | Behavior when unset |
|----------|---------|---------------------|
| `WEBHOOK_SECRET` | Agent completion | Unsigned requests accepted |
| `GITHUB_WEBHOOK_SECRET` | GitHub events | Unsigned requests accepted |

**For production**, always set these secrets:
```bash
# .env.local
WEBHOOK_SECRET=$(openssl rand -hex 32)
GITHUB_WEBHOOK_SECRET=$(openssl rand -hex 32)
```

Without these, anyone who can reach the endpoint can forge webhook events (trigger rollbacks, mark tasks done, etc.).

### Health Endpoint

`GET /api/health` bypasses token auth. Unauthenticated requests receive only `{status, uptime_seconds, version}`. Detailed diagnostics (DB integrity, agent counts, cost caps) require a valid bearer token or same-origin request.

## 🚧 Known Feature Gaps

### full_auto vs semi_auto

The `full_auto` automation tier is currently **functionally identical** to `semi_auto`.
Both tiers run the same webhook handler logic (post-merge health monitoring, CI-failure rollback).
The upstream intent for full_auto (fully autonomous idea → deployed feature) is not yet implemented.

### A/B Test Variant Routing

A/B test CRUD and metrics comparison are implemented. However, the `split_mode` (concurrent vs alternating)
is **not enforced during research/ideation execution** — ideas are not routed to variant A vs B based on the split configuration. A/B tests currently serve as a manual comparison framework.

## 📦 Initial Setup

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/mission-control.git
cd mission-control
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

```bash
cp .env.example .env.local
```

Edit `.env.local` with your configuration:

```bash
# Database
DATABASE_PATH=./mission-control.db

# OpenClaw Gateway
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=your-token-here

# Workspace Paths
WORKSPACE_BASE_PATH=~/Documents/Shared
PROJECTS_PATH=~/Documents/Shared/projects

# API URL (auto-detected if not set)
MISSION_CONTROL_URL=http://localhost:4000
```

### 4. Initialize Database

```bash
npm run db:seed
```

This creates the database and seeds it with:
- the master agent
- Sample tasks
- Default business

### 5. Start Development Server

```bash
npm run dev
```

Visit [http://localhost:4000](http://localhost:4000)

## ⚙️ Configuration Management

Mission Control supports configuration via **two methods**:

### Method 1: Environment Variables (.env.local)

Best for:
- Server-side configuration
- Deployment environments
- Team consistency

Variables in `.env.local`:
```bash
WORKSPACE_BASE_PATH=~/Documents/Shared
PROJECTS_PATH=~/Documents/Shared/projects
MISSION_CONTROL_URL=http://your-server-ip:4000
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
```

### Method 2: Settings UI

Best for:
- User-specific preferences
- Quick adjustments
- Per-user customization

Access via: **Settings** button (top-right) or `/settings`

Settings stored in browser localStorage:
- Workspace base path
- Projects path
- Mission Control API URL
- Default project name

**Priority:** Environment variables override UI settings for server operations.

## 📁 Workspace Structure

Mission Control organizes files in a structured workspace:

```
~/Documents/Shared/              # Base workspace
├── projects/                    # All projects
│   ├── [PROJECT_NAME_1]/       # Individual project
│   │   ├── deliverables/       # Task deliverables
│   │   ├── docs/               # Project docs
│   │   └── README.md
│   └── [PROJECT_NAME_2]/
└── mission-control/             # Mission Control app
    └── mission-control.db       # Database
```

### Configuring Paths

**Via Environment Variables:**
```bash
WORKSPACE_BASE_PATH=~/Documents/Shared
PROJECTS_PATH=~/Documents/Shared/projects
```

**Via Settings UI:**
1. Click **Settings** (gear icon)
2. Update "Workspace Base Path"
3. Update "Projects Path"
4. Click **Save Changes**

### Path Variables

- `~` expands to your home directory
- Paths can be absolute: `/home/user/workspace`
- Paths can be relative: `./workspace`

## 🔌 OpenClaw Gateway Setup

### Local Connection

```bash
# .env.local
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
```

No token required for local connections.

### Remote Connection (Tailscale)

```bash
# .env.local
OPENCLAW_GATEWAY_URL=wss://your-machine.tail12345.ts.net
OPENCLAW_GATEWAY_TOKEN=$(openssl rand -hex 32)
```

**Generate a secure token:**
```bash
openssl rand -hex 32
```

Copy this token to both:
1. Mission Control's `.env.local`
2. OpenClaw's gateway configuration

## 🚀 Production Deployment

### Build for Production

```bash
npm run build
npm start
```

### Environment Variables for Production

Create `.env.production.local`:

```bash
NODE_ENV=production
DATABASE_PATH=/var/lib/mission-control/mission-control.db
WORKSPACE_BASE_PATH=/var/lib/mission-control/workspace
PROJECTS_PATH=/var/lib/mission-control/workspace/projects
MISSION_CONTROL_URL=https://mission-control.yourdomain.com
OPENCLAW_GATEWAY_URL=wss://gateway.yourdomain.com
OPENCLAW_GATEWAY_TOKEN=your-production-token
```

### Database Backups

```bash
# Create an on-demand backup through the live API
curl -X POST http://127.0.0.1:4000/api/admin/backups

# List available backups
curl http://127.0.0.1:4000/api/admin/backups

# Restore a specific backup
curl -X POST http://127.0.0.1:4000/api/admin/backups/restore \
  -H 'Content-Type: application/json' \
  -d '{"filename":"mc-backup-YYYY-MM-DDTHH-MM-SS-sss-v028.db"}'
```

## 🧪 Testing Your Setup

### 1. Verify Configuration

```bash
# Check environment variables
cat .env.local

# Verify OpenClaw auth and service health
openclaw gateway status
```

### 2. Run The Current Trust Gate

```bash
npm run lint
npm test
npm run test:smoke
npm run test:pr-validation
npm run test:self-improvement
npm run test:automation-verification
```

### 3. Verify Backup Roundtrip And Intake

```bash
curl -X POST http://127.0.0.1:4000/api/admin/backups
curl http://127.0.0.1:4000/api/admin/backups
npm run cutline:telegram -- submit --lane build --build-mode idea --product "Mission Control" --text "..." --confirm
```

Use [VERIFICATION_CHECKLIST.md](/Users/jordan/.openclaw/workspace/mission-control/VERIFICATION_CHECKLIST.md) as the source of truth for what must be green before trusting the local stack with real ideas.

## 🔧 Troubleshooting

### Real-Time Updates Not Working

**Symptom:** Task cards don't move when status changes

**Solutions:**
1. Check browser console for SSE errors
2. Verify SSE endpoint: `/api/events/stream`
3. Clear browser cache
4. Restart dev server

### OpenClaw Not Connecting

**Symptom:** Status shows OFFLINE

**Solutions:**
1. Verify Gateway is running: `openclaw gateway status`
2. Check `OPENCLAW_GATEWAY_URL` in `.env.local`
3. For remote: Verify `OPENCLAW_GATEWAY_TOKEN` matches
4. Test WebSocket connection: `wscat -c ws://127.0.0.1:18789`

### Deliverables Button Not Working

**Symptom:** Arrow button does nothing

**Solutions:**
1. Check browser clipboard permissions
2. Look for console errors
3. Try on a task with a file deliverable (not URL)

### Hardcoded Paths in Code

**Symptom:** Paths still reference wrong user

**Solution:** All hardcoded paths have been removed! If you find any:
1. File a bug report
2. Use `getWorkspaceBasePath()` or `getProjectsPath()` from `@/lib/config`

## 📚 Configuration Reference

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_PATH` | `./mission-control.db` | SQLite database file path |
| `WORKSPACE_BASE_PATH` | `~/Documents/Shared` | Base directory for workspace |
| `PROJECTS_PATH` | `~/Documents/Shared/projects` | Directory for project folders |
| `MISSION_CONTROL_URL` | Auto-detected | API URL for agent orchestration |
| `OPENCLAW_GATEWAY_URL` | `ws://127.0.0.1:18789` | Gateway WebSocket URL |
| `OPENCLAW_GATEWAY_TOKEN` | (empty) | Authentication token |

### Settings UI Fields

| Setting | Description |
|---------|-------------|
| Workspace Base Path | Root directory for all Mission Control files |
| Projects Path | Where individual project folders are created |
| Default Project Name | Template name for new projects |
| Mission Control URL | API endpoint (usually auto-detected) |

## 🎯 Next Steps

1. ✅ Configure `.env.local`
2. ✅ Run database seed
3. ✅ Start dev server
4. ✅ Test real-time updates
5. ✅ Configure workspace paths
6. ✅ Verify backups, learner loop, and automation rollback
7. 🚀 Create your first agent!

## 📖 Further Reading

- [Agent Protocol Documentation](docs/AGENT_PROTOCOL.md)
- [Verification Checklist](VERIFICATION_CHECKLIST.md)
- [the orchestrator Orchestration Guide](src/lib/orchestration.ts)

---

**Questions?** File an issue or check the documentation in `/docs`.
