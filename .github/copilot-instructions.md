# Project Guidelines

## Build and validation

- Use `npm run dev` for local development on port `4000` by default.
- Use `npm run build`, `npm run lint`, and `npm run test` before wrapping up meaningful changes.
- `npm run test` uses a temporary SQLite database at `.tmp/mission-control-test.db`; keep tests isolated from the root `mission-control.db`.

## Architecture

- `src/app` contains the Next.js App Router pages and API routes.
- `src/components` contains dashboard, modal, tab, feed, and feature UI components.
- `src/hooks` contains reusable client hooks such as SSE, swipe, unread-count, and error-reporting helpers.
- `src/lib` contains the core runtime and orchestration logic: dispatching, health, checkpoints, mailbox, planning, convoy flows, gateway integration, and related business logic. Treat changes there as high impact and verify the affected workflow afterward.

## Conventions

- Follow the existing TypeScript and Next.js patterns already present in nearby files instead of introducing a new structure for a one-off change.
- Prefer focused edits. If a file in `src/lib` or `src/components` is already doing too much, keep new logic narrowly scoped and avoid unrelated refactors.
- Prefer linking to existing docs over duplicating long workflow explanations in new docs, comments, or instructions.
- Be careful with SQLite helpers and root database files. The repo includes backup, restore, and reset scripts; do not point tests or experiments at production-like data.
- Local integration work assumes OpenClaw Gateway configuration from `.env.local` or `.env`. Preserve that workflow when editing gateway-related code.
- If localhost callbacks fail behind a proxy, check the existing `NO_PROXY=localhost,127.0.0.1` guidance in `README.md` before changing network code.

## Key docs

- `README.md` — setup, environment variables, common commands, and troubleshooting.
- `ORCHESTRATION.md` — task lifecycle, API endpoints, and deliverable/activity expectations.
- `docs/AGENT_PROTOCOL.md` — completion, progress-update, and blocker message formats.
- `docs/HOW-THE-PIPELINE-WORKS.md` and `docs/ORCHESTRATION_WORKFLOW.md` — deeper orchestration and pipeline behavior.
- `QUICKSTART_REALTIME.md`, `docs/REALTIME_SPEC.md`, and `docs/TESTING_REALTIME.md` — realtime behavior and testing notes.
- `PRODUCTION_SETUP.md`, `PR-DATABASE-SAFETY.md`, and `VERIFICATION_CHECKLIST.md` — deployment, database safety, and verification guidance.