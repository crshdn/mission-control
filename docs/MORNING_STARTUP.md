# Morning Startup

If you restart your computer and want to get to work fast, use the Desktop launcher:

- Double-click [Mission Control Morning Startup.command](/Users/jordan/Desktop/Mission%20Control%20Morning%20Startup.command)

What it does:

- Starts OpenClaw Gateway if it is not already running
- Starts Mission Control on port `4000` if it is not already running
- Opens a Terminal window that runs `npm run cutline:telegram -- doctor`
- Opens Mission Control in your browser at `http://localhost:4000`

What you do next:

```bash
cd /Users/jordan/.openclaw/workspace/mission-control
npm run cutline:telegram -- submit --lane build --build-mode idea --product "Mission Control" --text "Your request here"
```

If the preview looks right, add `--confirm`.

Notes:

- The launcher is intentionally non-destructive. It does not auto-pull or switch branches for you.
- If you already have local work in progress, it will leave that alone and just show the current branch and repo status in the Mission Control terminal window.
