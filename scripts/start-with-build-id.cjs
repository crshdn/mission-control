#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const nextBin = require.resolve('next/dist/bin/next');
const args = ['start', ...process.argv.slice(2)];
const cwd = process.cwd();
const buildIdPath = process.env.MC_BUILD_ID_PATH || path.join(cwd, '.next', 'BUILD_ID');
const pollMs = Number(process.env.MC_BUILD_ID_POLL_MS || 2000);
const restartGraceMs = Number(process.env.MC_RESTART_GRACE_MS || 5000);

function readBuildState() {
  try {
    const stat = fs.statSync(buildIdPath);
    const id = fs.readFileSync(buildIdPath, 'utf8').trim() || null;
    if (!id) return null;

    return {
      id,
      signature: `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}`,
    };
  } catch {
    return null;
  }
}

let currentBuildState = readBuildState();
if (!currentBuildState) {
  console.error(`[mc-start] Missing BUILD_ID at ${buildIdPath}. Run npm run build before npm start.`);
  process.exit(1);
}

let child = null;
let shuttingDown = false;
let restarting = false;
let buildUnavailableSinceLastCheck = false;

function startChild(buildState) {
  console.log(`[mc-start] Starting Next with build ${buildState.id}`);

  const nextChild = spawn(process.execPath, [nextBin, ...args], {
    cwd,
    env: process.env,
    stdio: 'inherit',
  });

  nextChild.on('exit', (code, signal) => {
    if (child !== nextChild) return;

    child = null;

    if (restarting) {
      restarting = false;
      const freshBuildState = readBuildState();
      if (!freshBuildState) {
        console.error(`[mc-start] Child stopped for restart but BUILD_ID is missing at ${buildIdPath}.`);
        process.exit(1);
      }

      currentBuildState = freshBuildState;
      startChild(freshBuildState);
      return;
    }

    if (shuttingDown) {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }

      process.exit(code ?? 0);
    }

    if (signal) {
      console.error(`[mc-start] Next exited unexpectedly via ${signal}.`);
    } else {
      console.error(`[mc-start] Next exited unexpectedly with code ${code ?? 0}.`);
    }
    process.exit(code ?? 1);
  });

  child = nextChild;
}

function stopChildForRestart(reason) {
  if (!child || restarting || shuttingDown) return;

  restarting = true;
  console.log(`[mc-start] ${reason}. Restarting Next on the fresh bundle.`);
  child.kill('SIGTERM');

  setTimeout(() => {
    if (child && restarting) {
      console.error('[mc-start] Next did not stop after SIGTERM; sending SIGKILL.');
      child.kill('SIGKILL');
    }
  }, restartGraceMs).unref();
}

function shutdown(signal = 'SIGTERM') {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(watcher);

  if (child && !child.killed) {
    child.kill(signal);
  } else {
    process.exit(0);
  }
}

const watcher = setInterval(() => {
  const observedBuildState = readBuildState();
  if (!observedBuildState) {
    buildUnavailableSinceLastCheck = true;
    return;
  }

  const buildWasReplaced =
    buildUnavailableSinceLastCheck ||
    observedBuildState.id !== currentBuildState.id ||
    observedBuildState.signature !== currentBuildState.signature;

  buildUnavailableSinceLastCheck = false;

  if (!buildWasReplaced) return;

  const reason = observedBuildState.id !== currentBuildState.id
    ? `Detected new build ${observedBuildState.id}`
    : `Detected replaced build artifact for build ${observedBuildState.id}`;

  currentBuildState = observedBuildState;
  stopChildForRestart(reason);
}, pollMs);

startChild(currentBuildState);

['SIGINT', 'SIGTERM', 'SIGHUP'].forEach((signal) => {
  process.on(signal, () => shutdown(signal));
});
