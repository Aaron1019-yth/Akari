import { spawn } from "node:child_process";

const children = new Set();
let shuttingDown = false;

function start(name, command, args) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    detached: process.platform !== "win32",
  });
  children.add(child);

  child.on("exit", (code, signal) => {
    children.delete(child);
    if (!shuttingDown && code !== 0) {
      console.error(`[dev:web] ${name} exited with ${signal ?? code}`);
      shutdown(code ?? 1);
    }
  });

  return child;
}

function terminate(child, signal) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform !== "win32" && child.pid) {
      process.kill(-child.pid, signal);
    } else {
      child.kill(signal);
    }
  } catch {}
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) terminate(child, "SIGTERM");

  setTimeout(() => {
    for (const child of children) terminate(child, "SIGKILL");
    process.exit(exitCode);
  }, 1500).unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("SIGHUP", () => shutdown(0));
process.on("exit", () => {
  for (const child of children) terminate(child, "SIGTERM");
});

start("api", "npm", ["run", "dev:api"]);
start("vite", "npm", ["run", "dev"]);
