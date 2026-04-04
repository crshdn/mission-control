# Mission Control Agent Notes

Start with `.github/copilot-instructions.md` for the workspace-wide guidance that should drive most edits.

## Start here

- `README.md` — setup, commands, environment variables, and troubleshooting.
- `ORCHESTRATION.md` — task lifecycle, API usage, and deliverable/activity flows.
- `docs/AGENT_PROTOCOL.md` — required task completion, progress, and blocker formats.
- `docs/HOW-THE-PIPELINE-WORKS.md` and `docs/ORCHESTRATION_WORKFLOW.md` — pipeline and orchestration details.
- `QUICKSTART_REALTIME.md`, `docs/REALTIME_SPEC.md`, and `docs/TESTING_REALTIME.md` — realtime architecture and verification.
- `PRODUCTION_SETUP.md`, `PR-DATABASE-SAFETY.md`, and `VERIFICATION_CHECKLIST.md` — production and safety guidance.

## Repo note

- `src/lib` contains the core orchestration and runtime logic. Changes there are high impact, so prefer small edits and verify the affected flow.
