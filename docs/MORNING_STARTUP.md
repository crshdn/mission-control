# Morning Startup

If you restart your computer and want to get to work fast, use the Desktop launcher:

- Double-click [Start Cutline Workspace.app](/Users/jordan/Desktop/Start%20Cutline%20Workspace.app)

What it does:

- Starts OpenClaw Gateway if it is not already running
- For local authenticated callbacks, forwards `MC_API_TOKEN` from `mission-control/.env.local` or `.env` into the OpenClaw Gateway process environment
- If you are using the managed OpenClaw LaunchAgent instead of a shell-started gateway, keep the same `MC_API_TOKEN` in `~/.openclaw/.env` so agent callbacks still authenticate
- Starts Mission Control on port `4000` if it is not already running
- If port `4000` is occupied by a broken Mission Control process, it restarts it with the repo-pinned Node runtime from `mission-control/.nvmrc`
- Opens a Terminal window that runs `npm run cutline:telegram -- doctor`
- Opens Mission Control in your browser at `http://localhost:4000`

What you do next:

```bash
cd /Users/jordan/.openclaw/workspace/mission-control
npm run cutline:telegram -- submit --lane build --build-mode idea --product "Mission Control" --text "Your request here"
```

If the preview looks right, add `--confirm`.

Notes:

- Mission Control is pinned to Node `24.13.0` via `mission-control/.nvmrc`.
- Repo entrypoints should run through `mission-control/scripts/run-with-project-node.sh`, not ambient `/usr/local/bin/node`.
- The managed OpenClaw gateway currently still warns about using an NVM-backed Node path. That is acceptable for supervised local use, but treat it as an operator caveat until OpenClaw is installed under a non-version-manager runtime path.
- If `npm test` ever shows `NODE_MODULE_VERSION` mismatch, rebuild or reinstall dependencies under the pinned runtime instead of the current shell runtime.
- The launcher is intentionally non-destructive. It does not auto-pull or switch branches for you.
- If you already have local work in progress, it will leave that alone and just show the current branch and repo status in the Mission Control terminal window.
