# Mission Control Verification Checklist

This checklist is the current local trust gate for the rebuilt `v2.4.0` Cutline control plane.

Real ideas stay out of Mission Control until every item in `Must Pass` is green on the running system.

## Must Pass

- [x] Mission Control is running from upstream `v2.4.0` (`9379ce7`) on the rebuilt local branch.
- [x] Secure mode works for local validation scripts with `MC_API_TOKEN`.
- [x] OpenClaw Gateway auth is healthy and no longer uses the old embedded service-token install.
- [x] Research runs through Gateway RPC (`agent` + `agent.wait` + `chat.history`) instead of the disabled OpenAI HTTP shim.
- [x] Ideation completes successfully with JSON repair fallback for malformed model output.
- [x] Product cost events record non-zero token usage and priced spend when local OpenClaw model pricing exists.
- [x] Specialist Cutline agents have explicit `session_key_prefix` routing.
- [x] Non-master agents no longer silently fall back to `agent:main:`.
- [x] Agent `model` is no longer treated as an operator-editable dispatch control.
- [x] `npm run test:smoke` passes on the rebuilt stack.
- [x] `npm run cutline:telegram -- submit --lane build --build-mode idea --chat verification --text $'lane: build\ntitle: Verification Build Idea\ngoal: Verify the Telegram build gate.\nwhy now: We need a trusted local intake path.\nconstraints: Keep it local.\ndefinition of done: A preview or confirmed idea succeeds.\ntarget product: Mission Control\nuser problem: Incomplete Telegram ideas create cleanup work.\nrequested change: Keep Mission Control behind a real preview gate.' --confirm` creates both a Mission Control idea and a durable vault note.
- [x] `npm run test:pr-validation` passes end to end with repo-backed workspace, planning, dispatch, workspace edits, task completion, and PR creation.
- [x] `npm run test:self-improvement` passes with learner knowledge creation, later knowledge injection, skill extraction, later skill injection, and skill usage reporting.
- [x] `npm run test:live-callback` passes with a real OpenClaw agent creating a proof artifact, performing authenticated Mission Control callbacks, and advancing task state without verifier-side callback impersonation.
- [x] Learner verification is complete: a finished task produces a knowledge entry and later dispatches receive that knowledge.
- [x] Skill loop verification is complete: a finished task extracts product skills and later dispatches receive matching skills.
- [x] Backup create/list/restore is verified on the rebuilt runtime.
- [x] Automation-tier verification is complete for `supervised`, `semi_auto`, `full_auto`, and rollback.
- [x] Signed GitHub webhook enforcement is verified when `GITHUB_WEBHOOK_SECRET` is set: unsigned and invalidly signed requests are rejected with `401`.

## Current Notes

- `npm run build` is part of the clean local baseline again as of 2026-03-24.
- The disposable PR validation path surfaced and fixed two real issues:
  - server-side retry dispatch used a relative URL
  - secure-mode retry dispatch omitted bearer auth
- The self-improvement loop is verified with `npm run test:self-improvement`, including learner knowledge creation, knowledge injection on a later dispatch, skill extraction, skill injection, and skill usage reporting with deduped per-task accounting.
- `npm run test:live-callback` is the current direct proof that a live OpenClaw agent runtime can authenticate back into Mission Control using inherited `MC_API_TOKEN`.
- Backup verification now uses the live API and confirms create/list/restore against the rebuilt runtime.
- Telegram intake verification is green for the draft gate, confirmed build path, and durable vault note export.
- `npm run test:automation-verification` is green: supervised skips monitors, semi-auto health failures roll back, CI failures roll back, rollback acknowledgement restores the tier, and `full_auto` currently follows the same webhook/rollback path as `semi_auto`.
- When `GITHUB_WEBHOOK_SECRET` is set, the automation verifier also proves GitHub webhook signature rejection by requiring `401` for unsigned and invalidly signed requests before the signed scenarios run.
- The merged GitHub webhook now marks matching task PRs as `merged`, so CI-failure rollback has a natural task lookup path after merge.
- The latest consolidated evidence is captured in [docs/POST_REBUILD_VERIFICATION_REPORT_2026-03-24.md](/Users/jordan/.openclaw/workspace/mission-control/docs/POST_REBUILD_VERIFICATION_REPORT_2026-03-24.md).
- The current machine-state reconciliation is captured in [docs/CUTLINE_RUNTIME_RECONCILIATION_2026-03-25.md](/Users/jordan/.openclaw/workspace/mission-control/docs/CUTLINE_RUNTIME_RECONCILIATION_2026-03-25.md).
- Remaining documentation should be updated against this checklist, not against older “real-time integration” or pre-`v2.4.0` assumptions.
- Convoy mode dispatch loop is now wired: subtask completion auto-dispatches unblocked siblings, agent-completion webhook triggers convoy progress, and SSE heartbeat sweeps active convoys every 2 minutes.
- Product scheduling (`checkAndRunDueSchedules`) is now wired into the SSE heartbeat (60-second tick).
- `full_auto` is documented as functionally identical to `semi_auto` for now. See [PRODUCTION_SETUP.md](PRODUCTION_SETUP.md).
- Webhook signature validation uses timing-safe comparison. Secrets are still optional for dev; must be set for production. See [PRODUCTION_SETUP.md](PRODUCTION_SETUP.md).
- Health endpoint no longer leaks version to unauthenticated requests.

## Known Limitations (Low Severity)

- **Checkpoint recovery**: Checkpoints are on-demand only — agents must proactively call the checkpoint API. There is no automatic checkpoint on crash detection.
- **S3 backup**: `@aws-sdk/client-s3` integration exists in `backup.ts` but has no automated test coverage.
- **Batch review e2e**: Individual components and `batchSwipe()` exist; the full UI → API → state-change flow is not end-to-end tested.
- **Webhook signature rejection helper**: `scripts/test-webhook-rejection.ts` still exists as a focused manual negative-path helper, but GitHub webhook signature rejection is now also covered by `npm run test:automation-verification` when `GITHUB_WEBHOOK_SECRET` is set.
## Required Commands

### Baseline Gate

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm test`

### Targeted Verifiers

- `npm run test:smoke`
- `npm run test:pr-validation`
- `npm run test:self-improvement`
- `npm run test:live-callback`
- `npm run test:automation-verification`
- `GITHUB_WEBHOOK_SECRET=<secret> npm run test:automation-verification`
- `npm run cutline:telegram -- doctor`
- `npm run cutline:telegram -- submit --lane build --build-mode idea --chat verification --text $'lane: build\ntitle: Verification Build Idea\ngoal: Verify the Telegram build gate.\nwhy now: We need a trusted local intake path.\nconstraints: Keep it local.\ndefinition of done: A preview or confirmed idea succeeds.\ntarget product: Mission Control\nuser problem: Incomplete Telegram ideas create cleanup work.\nrequested change: Keep Mission Control behind a real preview gate.' --confirm`

## Evidence To Capture

- Smoke output JSON with product, cycle, idea, and task IDs
- Disposable PR validation output JSON with repo, workspace, and PR URL
- Self-improvement output JSON with learner knowledge entry ID, extracted skill ID, injected skill context, and updated skill confidence
- Live callback output JSON with task ID, session key, completion activity row, deliverable row, and final task state
- Automation verification output JSON with scenario results, rollback IDs, revert PR URLs, and restored tier evidence
- Backup artifact ID plus successful restore confirmation and pre-restore safety backup ID
