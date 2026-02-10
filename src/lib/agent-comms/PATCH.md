# OpenClaw Source Patch: Enable sessions_send for Sub-Agents

## Problem
`sessions_send`/`sessions_list` hardcoded in `DEFAULT_SUBAGENT_TOOL_DENY`. Config allow does NOT override deny.

## Apply Patch
```bash
cd /Users/charlie/.npm-global/lib/node_modules/openclaw
for f in dist/extensionAPI.js dist/commands-DSjmdo4s.js dist/pi-tools.policy-B0NP2v9o.js; do
  cp "$f" "$f.bak"
  sed -i '' 's/"sessions_send",//g' "$f"
  sed -i '' 's/"sessions_list",//g' "$f"
done
# Restart gateway after patching
```

## Tested
2026-02-05: Sender sub-agent successfully called sessions_send to receiver sub-agent. ✅

## Risk
OpenClaw updates overwrite dist files — must re-patch after updates.
