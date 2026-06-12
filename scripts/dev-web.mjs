import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

const children = new Set();
let shuttingDown = false;

const host = "127.0.0.1";
const ports = [5173, 8742];
const bin = process.platform === "win32" ? ".cmd" : "";
const viteBin = fileURLToPath(new URL(`../node_modules/.bin/vite${bin}`, import.meta.url));
const tsxBin = fileURLToPath(new URL(`../node_modules/.bin/tsx${bin}`, import.meta.url));

async function assertPortFree(port) {
  await new Promise((resolve, reject) => {
    const server = createServer()
      .once("error", reject)
      .once("listening", () => server.close(resolve))
      .listen(port, host);
  }).catch((err) => {
    if (err?.code === "EADDRINUSE") {
      throw new Error(`Port ${port} is already in use. Stop the existing Akari dev server first.`);
    }
    throw err;
  });
}

async function assertPortsFree() {
  await Promise.all(ports.map(assertPortFree));
}

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

try {
  await assertPortsFree();
  start("api", tsxBin, ["--watch", "server/main.ts"]);
  start("vite", viteBin, ["--host", host, "--strictPort"]);
} catch (err) {
  console.error(`[dev:web] ${err instanceof Error ? err.message : String(err)}`);
  shutdown(1);
}
