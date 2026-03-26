# Default Workspace Baseline

`default` is the generic Mission Control / OpenClaw baseline workspace.

It is intentionally small and reusable:

- `Coordinator` is the single neutral master orchestrator
- `Builder`, `Tester`, `Reviewer`, and `Learner` form the core pipeline
- every baseline agent has explicit OpenClaw routing via `session_key_prefix`
- every baseline agent has non-empty `soul_md`, `user_md`, and `agents_md`

## Purpose

The baseline workspace exists to give new workspaces a safe starting point without baking in company-specific policy.

Use `default` for:

- generic local demos
- clean bootstrap for newly-created workspaces
- validating platform behavior without inheriting product-specific rules

Do not treat `default` as the canonical operating model for a specialized workspace.

## Communication Contract

The baseline agent docs assume:

- Mission Control is the system of record for task state, deliverables, approvals, and handoffs
- operator feedback can arrive through queued notes, direct messages, or convoy mail
- every handoff includes evidence, known gaps, and the exact next owner
- failures route back with evidence instead of vague dissatisfaction

These are platform-safe defaults, not product policy.

## Specialization

Custom workspaces are expected to layer their own governance on top of this baseline.

Examples of specialization:

- role-specific operating rules
- product or company approval paths
- richer runbooks and desk structure
- additional non-baseline specialists

Cutline is the canonical example in this repo of a specialized workspace. It keeps the baseline pipeline mechanics, but adds stronger operating rules, desk-specific roles, and explicit company governance. That specialization should not be copied back into `default`.

## Hygiene Rules

- Keep `default` limited to the baseline agents unless a user intentionally expands it
- keep validation or smoke products out of `default` after they finish
- if historical agents must be preserved for completed-task references, move them out of `default` rather than letting the baseline drift
