# Codebase Findings

_Read-only scan completed on 2026-04-04._

This document captures issue-ready findings from a repository scan without creating GitHub issues in the upstream repository. Each finding is intended to be actionable for later triage or issue creation.

## Summary

| Priority | Area | Candidate issue |
| --- | --- | --- |
| High | Security | Harden `/api/files/preview` path validation to use canonical paths instead of prefix checks |
| High | Security / Ops | Harden file upload/download endpoints around `PROJECTS_PATH` resolution and missing base directories |
| Medium | UI reliability | Guard `ActivityLog` metadata rendering against invalid JSON and mixed metadata shapes |
| Medium | Realtime UX | Make `AgentLiveTab` recover cleanly from transient SSE failures |
| High | Test coverage / Docs | Add tests and setup documentation for `/api/tasks/[id]/test` Playwright validation flow |
| High | CI / DX | Add CI workflow for lint/test/build plus a single local validation script |

## Findings

## 1. Harden `/api/files/preview` path validation to use canonical paths instead of prefix checks

**Priority:** High  
**Area:** Security

### Problem — preview route authorization

`src/app/api/files/preview/route.ts` authorizes preview access using a normalized path prefix check:

- `allowedPaths` is derived from `WORKSPACE_BASE_PATH` and `PROJECTS_PATH`
- access is granted when `normalizedPath.startsWith(path.normalize(allowed))`

This is brittle because prefix checks can be bypassed by sibling paths that share a prefix, and the route does not canonicalize symlinks before authorizing access.

### Evidence — preview route authorization

- `src/app/api/files/preview/route.ts:28`
- `src/app/api/files/preview/route.ts:33`
- `src/app/api/files/preview/route.ts:34`

### Impact — preview route authorization

- Possible unauthorized preview of files outside intended base directories
- Security depends on string comparisons rather than resolved filesystem boundaries

### Suggested fix — preview route authorization

- Canonicalize requested and allowed paths with `realpathSync` after existence checks
- Replace prefix matching with `path.relative` boundary validation
- Add explicit rejection for symlink escapes and sibling-prefix paths

### Acceptance criteria — preview route authorization

- Preview requests succeed only for canonical paths inside configured bases
- Symlink traversal outside the base is rejected
- Sibling-prefix paths such as `/foo/project-evil` do not pass validation for `/foo/project`
- Tests cover valid in-base files, sibling-prefix paths, symlink escapes, and invalid base config

## 2. Harden file upload/download endpoints around `PROJECTS_PATH` resolution and missing base directories

**Priority:** High  
**Area:** Security / Operations

### Problem — projects base resolution

Both file transfer endpoints derive `PROJECTS_BASE` from:

`(process.env.PROJECTS_PATH || '~/projects').replace(/^~/, process.env.HOME || '')`

That creates a few risks:

- If `HOME` is unset, the fallback effectively becomes `/projects`
- `download` calls `realpathSync(PROJECTS_BASE)` without first ensuring the base exists
- `upload` silently creates the base directory, which can hide bad configuration

### Evidence — projects base resolution

- `src/app/api/files/download/route.ts:16`
- `src/app/api/files/download/route.ts:89`
- `src/app/api/files/upload/route.ts:16`
- `src/app/api/files/upload/route.ts:57`

### Impact — projects base resolution

- Unexpected writes to `/projects` in certain environments
- Brittle behavior when the configured base does not exist
- Misconfiguration is hidden instead of surfaced clearly

### Suggested fix — projects base resolution

- Require a valid explicit `PROJECTS_PATH` or strictly validate the fallback
- Fail clearly on invalid base configuration
- Avoid silently creating an unsafe root-level fallback path
- Guard `realpathSync(PROJECTS_BASE)` with an existence check and clear error handling

### Acceptance criteria — projects base resolution

- Missing or invalid `PROJECTS_PATH` produces a clear error response
- `download` does not throw when the base directory is absent
- `upload` does not silently create an unsafe root-level fallback path
- Tests cover missing `PROJECTS_PATH`, missing `HOME`, non-existent base paths, and valid configured bases

## 3. Guard `ActivityLog` metadata rendering against invalid JSON and mixed metadata shapes

**Priority:** Medium  
**Area:** UI reliability

### Problem — activity metadata rendering

`src/components/ActivityLog.tsx` renders metadata using:

- raw string output for string metadata
- `JSON.stringify(JSON.parse(activity.metadata), null, 2)` for non-string metadata

This can throw during render if metadata is already an object, malformed JSON, or otherwise not parseable.

### Evidence — activity metadata rendering

- `src/components/ActivityLog.tsx:143`
- `src/components/ActivityLog.tsx:145`
- `src/components/ActivityLog.tsx:147`

### Impact — activity metadata rendering

- One malformed activity payload can break the entire activity log UI
- Historical or mixed-shape data becomes a render-time liability

### Suggested fix — activity metadata rendering

- Add a safe metadata formatter
- Handle strings, objects, arrays, malformed JSON, and unknown values without throwing
- Avoid `JSON.parse` in render unless the input is known to be a JSON string and wrapped safely

### Acceptance criteria — activity metadata rendering

- Activity log still renders when metadata is invalid JSON
- Object metadata renders safely
- Malformed metadata falls back to a safe string representation
- Component-level coverage exists for string, object, and invalid metadata cases

## 4. Make `AgentLiveTab` recover cleanly from transient SSE failures

**Priority:** Medium  
**Area:** Realtime UX

### Problem — agent live stream recovery

`src/components/AgentLiveTab.tsx` opens an `EventSource` to `/api/tasks/${taskId}/agent-stream` and updates UI status on failures, but reconnect behavior is largely implicit.

The current implementation can leave the UI in a stale disconnected state during transient failures because the recovery path is not explicitly defined or tested.

### Evidence — agent live stream recovery

- `src/components/AgentLiveTab.tsx:28`
- `src/components/AgentLiveTab.tsx:87`

### Impact — agent live stream recovery

- Live task monitoring can become unreliable on flaky networks
- Users may think the stream is dead even after backend recovery
- Status transitions are underspecified and difficult to verify

### Suggested fix — agent live stream recovery

- Define reconnect behavior explicitly
- Ensure successful reconnect returns the UI to a healthy state
- Align comments and status transitions with actual behavior
- Add a small test or harness for SSE failure/recovery behavior

### Acceptance criteria — agent live stream recovery

- Temporary stream failures recover without a full page refresh
- UI returns from `disconnected` to a healthy state when the stream resumes
- Reconnect behavior is covered by test or reproducible harness documentation

## 5. Add tests and setup documentation for `/api/tasks/[id]/test` Playwright validation flow

**Priority:** High  
**Area:** Test coverage / Documentation

### Problem — Playwright validation flow

`src/app/api/tasks/[id]/test/route.ts` is a high-impact route that:

- imports `chromium` from `playwright`
- validates deliverables
- writes activity records
- changes task status to `review` or `assigned`

However, visible test files are concentrated under `src/lib/**/*.test.ts`, and the README does not document `npm run test` or Playwright browser setup. The README also still advertises `Next.js-14` while `package.json` uses `next@^16.2.2`.

### Evidence — Playwright validation flow

- `src/app/api/tasks/[id]/test/route.ts`
- `package.json`:
  - `"test": "... tsx --test src/**/*.test.ts"`
  - `"next": "^16.2.2"`
  - `"playwright": "^1.58.1"`
- `README.md:22`
- `README.md:909`
- no README match for `npm run test` in the scan

### Impact — Playwright validation flow

- Review-gating automation can regress without direct coverage
- Fresh installs or CI can fail if Playwright browsers are missing
- Docs currently under-describe the real test workflow

### Suggested fix — Playwright validation flow

- Add API-level tests for pass/fail status transitions on `/api/tasks/[id]/test`
- Document `npm run test` and the temporary SQLite test DB behavior
- Document Playwright prerequisites or add a helper script for browser installation
- Update README version badges to match the actual stack

### Acceptance criteria — Playwright validation flow

- Automated tests cover no deliverables, pass, fail, and resulting task status changes
- README documents `npm run test`, temp DB behavior, and Playwright setup requirements
- README framework version info matches `package.json`

## 6. Add CI workflow for lint/test/build plus a single local validation script

**Priority:** High  
**Area:** CI / Developer experience

### Problem — CI validation workflow

The repository has a Docker publish workflow in `.github/workflows/docker.yml`, but no general pull request verification workflow was found. `package.json` also lacks a single combined validation script such as `check` or `ci`.

### Evidence — CI validation workflow

- `.github/workflows/docker.yml`
- `package.json` contains separate `lint`, `test`, and `build` scripts but no combined validation script

### Impact — CI validation workflow

- Regressions can land without a standard verification gate
- Contributors may run only part of the required checks
- There is no single documented validation command for humans or automation

### Suggested fix — CI validation workflow

- Add a GitHub Actions workflow for pull requests and pushes that runs install, lint, test, and build
- Add a local script such as `npm run check`
- Document the standard validation path for contributors

### Acceptance criteria — CI validation workflow

- CI runs lint, test, and build automatically on pull requests
- The repo exposes a single local verification command
- Contributor-facing docs point to the standard validation workflow

## Notes

- These findings came from a read-only scan and direct file inspection, not from exploit attempts or runtime fault injection.
- Prioritize the file-path hardening items first because they combine security impact with relatively clear remediation paths.
