# Workspace Instructions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a primary workspace instruction file plus a minimal `AGENTS.md` entrypoint that mainly links to existing docs.

**Architecture:** Store the real, actionable guidance in `.github/copilot-instructions.md` and keep `AGENTS.md` as a small routing layer. Create supporting design/plan artifacts under `docs/superpowers/` so the customization has lightweight documentation.

**Tech Stack:** Markdown, repository documentation, Next.js/TypeScript project conventions

---

## Task 1: Authoritative Copilot instructions

**Files:**

- Create: `.github/copilot-instructions.md`
- Reference: `README.md`
- Reference: `ORCHESTRATION.md`
- Reference: `docs/AGENT_PROTOCOL.md`

- [ ] **Step 1: Draft the section layout**

```md
# Project Guidelines

## Build and validation

## Architecture

## Conventions

## Key docs
```

- [ ] **Step 2: Fill the file with repo-specific guidance**

```md
- Use `npm run dev`, `npm run build`, `npm run lint`, and `npm run test`.
- Keep tests isolated from the root SQLite database.
- Treat `src/lib` as high-impact orchestration/runtime code.
- Prefer linking to workflow docs rather than copying them.
```

- [ ] **Step 3: Review the doc links and command accuracy**

Run: review the file against `package.json`, `README.md`, and the linked docs.
Expected: every command and linked path matches an existing repository file.

## Task 2: Minimal AGENTS entrypoint

**Files:**

- Create: `AGENTS.md`
- Reference: `.github/copilot-instructions.md`

- [ ] **Step 1: Draft the minimal entrypoint**

```md
# Autensa Agent Notes

Start with `.github/copilot-instructions.md` for workspace-wide guidance.
```

- [ ] **Step 2: Add link-heavy navigation only**

```md
- `README.md`
- `ORCHESTRATION.md`
- `docs/AGENT_PROTOCOL.md`
- `docs/HOW-THE-PIPELINE-WORKS.md`
- `PRODUCTION_SETUP.md`
```

- [ ] **Step 3: Confirm it stays minimal**

Run: compare `AGENTS.md` against `.github/copilot-instructions.md`.
Expected: `AGENTS.md` routes to deeper docs and does not duplicate the main policy text.

## Task 3: Supporting design artifacts and coherence check

**Files:**

- Create: `docs/superpowers/specs/2026-04-04-workspace-instructions-design.md`
- Create: `docs/superpowers/plans/2026-04-04-workspace-instructions.md`

- [ ] **Step 1: Write the short design document**

```md
## Goal
Add lightweight agent-facing guidance without duplicating existing documentation.

## Chosen approach
Use `.github/copilot-instructions.md` as the authority and keep `AGENTS.md` minimal.
```

- [ ] **Step 2: Save the implementation plan**

```md
### Task 1: Authoritative Copilot instructions
### Task 2: Minimal AGENTS entrypoint
### Task 3: Supporting design artifacts and coherence check
```

- [ ] **Step 3: Perform a final coherence review**

Run: read all four files together.
Expected: the design, plan, and two instruction files all describe the same asymmetrical two-file strategy.
