#!/usr/bin/env python3
"""
ARIA ↔ Mission Control Bridge
Syncs agent activity with Mission Control via its REST API.

Usage:
  mc-bridge.py agent-start --agent "Researcher" --task "Research Axe 2" [--label "researcher-1900"]
  mc-bridge.py agent-done  --agent "Researcher" --task-id <ID> --summary "Found 6 ideas"
  mc-bridge.py agent-error --agent "Researcher" --task-id <ID> --error "API timeout"
  mc-bridge.py status

Requires: Python 3 stdlib only (no pip install)
"""

import argparse
import json
import os
import sys
import urllib.request
import urllib.error

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BASE_URL = os.environ.get("MC_URL", "http://localhost:3000")
WORKSPACE_ID = os.environ.get("MC_WORKSPACE", "default")

# Label prefix → Mission Control agent name
LABEL_MAP = [
    # (prefix_list, agent_name)
    (["researcher"],                       "Researcher"),
    (["coder", "fix-", "dev-"],            "Coder"),
    (["brainstorm"],                       "Brainstorm"),
    (["qa", "test-"],                      "QA"),
    (["linkedin", "writer"],               "LinkedIn Writer"),
    (["synth", "brief", "morning"],        "Synthesizer"),
    (["archiv", "journal"],                "Archivist"),
    (["diving", "casar"],                  "Diving"),
    (["home", "tv-", "sonos-"],            "Home"),
    (["monitor"],                          "Monitor"),
]

# ---------------------------------------------------------------------------
# HTTP helpers  (stdlib only – no requests/httpx)
# ---------------------------------------------------------------------------

def _request(method: str, path: str, body: dict | None = None, quiet: bool = False) -> dict | list | None:
    """Make an HTTP request to Mission Control. Returns parsed JSON or None on error."""
    url = f"{BASE_URL}{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={"Content-Type": "application/json"} if data else {},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        err_body = e.read().decode() if e.fp else ""
        if not quiet:
            print(f"⚠️  HTTP {e.code} on {method} {path}: {err_body}", file=sys.stderr)
        return None
    except urllib.error.URLError as e:
        if not quiet:
            print(f"⚠️  Mission Control unreachable ({BASE_URL}): {e.reason}", file=sys.stderr)
        return None
    except Exception as e:
        if not quiet:
            print(f"⚠️  Request failed: {e}", file=sys.stderr)
        return None


def api_get(path: str, quiet: bool = False):
    return _request("GET", path, quiet=quiet)

def api_post(path: str, body: dict, quiet: bool = False):
    return _request("POST", path, body, quiet=quiet)

def api_patch(path: str, body: dict, quiet: bool = False):
    return _request("PATCH", path, body, quiet=quiet)

# ---------------------------------------------------------------------------
# Agent resolution
# ---------------------------------------------------------------------------

_agent_cache: list | None = None

def get_agents() -> list:
    global _agent_cache
    if _agent_cache is None:
        result = api_get("/api/agents")
        _agent_cache = result if isinstance(result, list) else []
    return _agent_cache


def resolve_agent_name(label: str) -> str | None:
    """Map a Clawdbot session label to a Mission Control agent name."""
    label_lower = label.lower()
    for prefixes, agent_name in LABEL_MAP:
        for prefix in prefixes:
            if label_lower.startswith(prefix):
                return agent_name
    return None


def find_agent(name: str) -> dict | None:
    """Find an agent by name (case-insensitive) in Mission Control."""
    agents = get_agents()
    name_lower = name.lower()
    for a in agents:
        if a.get("name", "").lower() == name_lower:
            return a
    return None


def find_agent_by_name_or_label(name_or_label: str) -> dict | None:
    """Try to find agent by exact name first, then by label prefix mapping."""
    # Direct name match
    agent = find_agent(name_or_label)
    if agent:
        return agent
    # Try label mapping
    mapped_name = resolve_agent_name(name_or_label)
    if mapped_name:
        return find_agent(mapped_name)
    return None

# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

def cmd_agent_start(args):
    """Agent starts working on a task."""
    # Resolve agent
    agent = find_agent_by_name_or_label(args.agent)
    if not agent:
        # Try label if provided
        if args.label:
            mapped = resolve_agent_name(args.label)
            if mapped:
                agent = find_agent(mapped)
        if not agent:
            print(f"❌ Agent not found: {args.agent}", file=sys.stderr)
            # List available agents for debugging
            agents = get_agents()
            if agents:
                names = [a["name"] for a in agents]
                print(f"   Available: {', '.join(names)}", file=sys.stderr)
            sys.exit(1)

    agent_id = agent["id"]
    agent_name = agent["name"]

    # 1. Create task
    task_body = {
        "title": args.task,
        "status": "in_progress",
        "priority": getattr(args, "priority", "normal") or "normal",
        "assigned_agent_id": agent_id,
        "created_by_agent_id": agent_id,
        "workspace_id": WORKSPACE_ID,
    }
    if args.description:
        task_body["description"] = args.description

    task = api_post("/api/tasks", task_body)
    if not task:
        print("❌ Failed to create task", file=sys.stderr)
        sys.exit(1)

    task_id = task["id"]

    # 2. Set agent status to working
    api_patch(f"/api/agents/{agent_id}", {"status": "working"})

    # 3. Log activity
    api_post(f"/api/tasks/{task_id}/activities", {
        "activity_type": "spawned",
        "message": f"{agent_name} started working" + (f" (label: {args.label})" if args.label else ""),
        "agent_id": agent_id,
    })

    # Output task ID (for ARIA to capture)
    print(task_id)


def cmd_agent_done(args):
    """Agent finished a task."""
    agent = find_agent_by_name_or_label(args.agent)
    if not agent:
        print(f"❌ Agent not found: {args.agent}", file=sys.stderr)
        sys.exit(1)

    agent_id = agent["id"]
    agent_name = agent["name"]
    task_id = args.task_id

    # 1. Move task to review (or done if --done flag)
    target_status = "done" if args.force_done else "review"
    api_patch(f"/api/tasks/{task_id}", {"status": target_status})

    # 2. Set agent back to standby
    api_patch(f"/api/agents/{agent_id}", {"status": "standby"})

    # 3. Log activity
    summary = args.summary or "Task completed"
    api_post(f"/api/tasks/{task_id}/activities", {
        "activity_type": "completed",
        "message": f"{agent_name}: {summary}",
        "agent_id": agent_id,
    })

    print(f"✅ {agent_name} → {target_status} | {summary}")


def cmd_agent_error(args):
    """Agent encountered an error."""
    agent = find_agent_by_name_or_label(args.agent)
    if not agent:
        print(f"❌ Agent not found: {args.agent}", file=sys.stderr)
        sys.exit(1)

    agent_id = agent["id"]
    agent_name = agent["name"]
    task_id = args.task_id

    # 1. Move task to review
    api_patch(f"/api/tasks/{task_id}", {"status": "review"})

    # 2. Set agent back to standby
    api_patch(f"/api/agents/{agent_id}", {"status": "standby"})

    # 3. Log error activity
    error_msg = args.error or "Unknown error"
    api_post(f"/api/tasks/{task_id}/activities", {
        "activity_type": "status_changed",
        "message": f"⚠️ {agent_name} error: {error_msg}",
        "agent_id": agent_id,
        "metadata": json.dumps({"error": error_msg}),
    })

    print(f"⚠️ {agent_name} → review | Error: {error_msg}")


def cmd_agent_update(args):
    """Update task activity without changing status."""
    agent = find_agent_by_name_or_label(args.agent)
    if not agent:
        print(f"❌ Agent not found: {args.agent}", file=sys.stderr)
        sys.exit(1)

    agent_id = agent["id"]
    agent_name = agent["name"]
    task_id = args.task_id

    api_post(f"/api/tasks/{task_id}/activities", {
        "activity_type": "updated",
        "message": f"{agent_name}: {args.message}",
        "agent_id": agent_id,
    })

    print(f"📝 {agent_name}: {args.message}")


def cmd_status(args):
    """Show current agent and task status."""
    # Agents
    agents = get_agents()
    if not agents:
        print("⚠️  No agents found (is Mission Control running?)")
        return

    print("── Agents ──────────────────────────────────")
    for a in agents:
        emoji = a.get("avatar_emoji", "🤖")
        status = a.get("status", "?")
        indicator = {"working": "🟢", "standby": "⚪", "offline": "🔴"}.get(status, "❓")
        master = " 👑" if a.get("is_master") else ""
        print(f"  {indicator} {emoji} {a['name']:<20} {status}{master}")

    # Active tasks
    tasks = api_get("/api/tasks?status=in_progress,assigned,review,testing")
    if tasks:
        print("\n── Active Tasks ────────────────────────────")
        for t in tasks:
            status = t.get("status", "?")
            agent_name = t.get("assigned_agent_name", "unassigned")
            emoji = {"in_progress": "🔧", "assigned": "📋", "review": "👀", "testing": "🧪"}.get(status, "❓")
            print(f"  {emoji} [{status:<11}] {t['title'][:50]:<50} → {agent_name}")
            print(f"    id: {t['id']}")
    else:
        print("\n  No active tasks")

    # Quick stats
    all_tasks = api_get("/api/tasks", quiet=True)
    if all_tasks:
        by_status = {}
        for t in all_tasks:
            s = t.get("status", "?")
            by_status[s] = by_status.get(s, 0) + 1
        print("\n── Stats ───────────────────────────────────")
        order = ["inbox", "planning", "assigned", "in_progress", "testing", "review", "done"]
        parts = []
        for s in order:
            if s in by_status:
                parts.append(f"{s}: {by_status[s]}")
        print(f"  {' | '.join(parts)}")


def cmd_list_agents(args):
    """List all agents (useful for debugging label mapping)."""
    agents = get_agents()
    if not agents:
        print("⚠️  No agents found")
        return

    print(f"{'Name':<20} {'ID':<38} {'Status':<10} {'Role'}")
    print("─" * 90)
    for a in agents:
        print(f"{a['name']:<20} {a['id']:<38} {a.get('status', '?'):<10} {a.get('role', '')}")

    # Show label mapping
    print("\n── Label Mapping ───────────────────────────")
    for prefixes, agent_name in LABEL_MAP:
        found = find_agent(agent_name)
        status = "✅" if found else "❌ (not in MC)"
        print(f"  {', '.join(prefixes):<30} → {agent_name:<20} {status}")


# ---------------------------------------------------------------------------
# CLI Parser
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="ARIA ↔ Mission Control Bridge",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s agent-start --agent Researcher --task "Research Axe 2 Business"
  %(prog)s agent-done --agent Researcher --task-id abc-123 --summary "Found 6 ideas"
  %(prog)s agent-error --agent Researcher --task-id abc-123 --error "API timeout"
  %(prog)s agent-update --agent Researcher --task-id abc-123 --message "Step 2/5 done"
  %(prog)s status
  %(prog)s agents
        """,
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # -- agent-start --
    p_start = sub.add_parser("agent-start", help="Agent starts working on a task")
    p_start.add_argument("--agent", required=True, help="Agent name or label prefix")
    p_start.add_argument("--task", required=True, help="Task title")
    p_start.add_argument("--label", help="Clawdbot session label (for mapping)")
    p_start.add_argument("--description", help="Task description")
    p_start.add_argument("--priority", choices=["low", "normal", "high", "urgent"], default="normal")
    p_start.set_defaults(func=cmd_agent_start)

    # -- agent-done --
    p_done = sub.add_parser("agent-done", help="Agent finished a task")
    p_done.add_argument("--agent", required=True, help="Agent name or label prefix")
    p_done.add_argument("--task-id", required=True, help="Task ID")
    p_done.add_argument("--summary", help="Completion summary")
    p_done.add_argument("--done", dest="force_done", action="store_true",
                        help="Move directly to done (skip review)")
    p_done.set_defaults(func=cmd_agent_done)

    # -- agent-error --
    p_error = sub.add_parser("agent-error", help="Agent encountered an error")
    p_error.add_argument("--agent", required=True, help="Agent name or label prefix")
    p_error.add_argument("--task-id", required=True, help="Task ID")
    p_error.add_argument("--error", required=True, help="Error message")
    p_error.set_defaults(func=cmd_agent_error)

    # -- agent-update --
    p_update = sub.add_parser("agent-update", help="Log progress without changing status")
    p_update.add_argument("--agent", required=True, help="Agent name or label prefix")
    p_update.add_argument("--task-id", required=True, help="Task ID")
    p_update.add_argument("--message", required=True, help="Progress message")
    p_update.set_defaults(func=cmd_agent_update)

    # -- status --
    p_status = sub.add_parser("status", help="Show current status")
    p_status.set_defaults(func=cmd_status)

    # -- agents --
    p_agents = sub.add_parser("agents", help="List all agents and label mappings")
    p_agents.set_defaults(func=cmd_list_agents)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
