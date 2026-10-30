#!/usr/bin/env node
// Cross-platform helper to free the ports used by `npm run dev` (Express + Vite HMR)
// before starting a new instance. Prevents stale server processes (left running from
// a previous session/terminal) from holding port 3000 and causing EADDRINUSE or
// confusing "it works sometimes" / 404 behavior when a new dev server can't bind.
const { execSync } = require('child_process');

const PORTS = [Number(process.env.PORT) || 3000, 24678, 24679, 24680, 24681, 24682];
const isWindows = process.platform === 'win32';

function run(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  } catch {
    return '';
  }
}

function killWindows(port) {
  const out = run(`netstat -ano | findstr :${port}`);
  const pids = new Set();
  out.split(/\r?\n/).forEach((line) => {
    const match = line.trim().match(/LISTENING\s+(\d+)\s*$/);
    if (match) pids.add(match[1]);
  });
  pids.forEach((pid) => {
    run(`taskkill /F /PID ${pid}`);
    console.log(`Stopped PID ${pid} (port ${port})`);
  });
}

function killPosix(port) {
  // Prefer lsof when available; fall back to fuser.
  let pidsOut = run(`lsof -ti tcp:${port}`);
  if (!pidsOut) pidsOut = run(`fuser ${port}/tcp 2>/dev/null`);
  const pids = pidsOut
    .split(/\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  pids.forEach((pid) => {
    run(`kill -9 ${pid}`);
    console.log(`Stopped PID ${pid} (port ${port})`);
  });
}

PORTS.forEach((port) => {
  if (isWindows) killWindows(port);
  else killPosix(port);
});

console.log('Stopped listeners on dev ports (if any).');
