# Workspace Instructions Design

## Goal

Add lightweight agent-facing guidance for Autensa without duplicating the repository's existing setup and workflow documentation.

## Files

- `.github/copilot-instructions.md` — authoritative workspace instruction file for coding agents.
- `AGENTS.md` — minimal landing page for agents and tools that look for an `AGENTS.md` entrypoint.

## Chosen approach

Use an intentionally asymmetrical two-file setup:

1. Put all actionable workspace guidance in `.github/copilot-instructions.md`.
2. Keep `AGENTS.md` minimal and link-heavy so it routes readers to the authoritative instruction file and existing docs.

This keeps the user-requested dual-file setup while avoiding two competing rulebooks.

## Content decisions

### `.github/copilot-instructions.md`

Include only the sections that help on most tasks:

- build and validation commands
- architecture boundaries for `src/app`, `src/components`, `src/hooks`, and `src/lib`
- repo-specific guardrails around orchestration code, SQLite usage, gateway assumptions, and doc-linking
- links to deeper docs for setup, orchestration, realtime, production, and verification

### `AGENTS.md`

Keep it intentionally short:

- one sentence pointing to `.github/copilot-instructions.md`
- a compact list of the most important repo docs
- one high-signal repo note about `src/lib` being high-impact runtime code

## Constraints

- Follow the "link, don't embed" principle from the workspace-instructions reference.
- Avoid copying large sections from `README.md` or the docs directory.
- Preserve room for future area-specific instructions if the repo later adds scoped instruction files.

## Validation criteria

- A new agent can quickly find setup commands, architectural boundaries, and the right deeper docs.
- The two files do not contradict each other.
- `AGENTS.md` stays minimal and does not become a second policy document.
