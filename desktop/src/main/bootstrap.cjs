const { app, BrowserWindow } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const net = require("net");

let backendProcess = null;
const projectRoot = path.resolve(__dirname, "../../..");

const SERVER_SHUTDOWN_GRACE_MS = 17000;
const SERVER_FORCE_KILL_WAIT_MS = 5000;
const SERVER_SHUTDOWN_POLL_MS = 200;

// ── helpers ──

function hasChildExitObserved(proc) {
  if (!proc) return true;
  return proc.exitCode !== null || proc.signalCode !== null;
}

async function waitForProcessExit(proc, pid, timeoutMs) {
  if (!proc && !pid) return true;
  if (hasChildExitObserved(proc)) return true;

  let exitObserved = false;
  let onExit = null;
  if (proc && typeof proc.once === "function") {
    onExit = () => { exitObserved = true; };
    proc.once("exit", onExit);
  }

  try {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (exitObserved || hasChildExitObserved(proc)) return true;
      if (pid) {
        try { process.kill(pid, 0); } catch { return true; }
      }
      const waitMs = Math.min(SERVER_SHUTDOWN_POLL_MS, Math.max(0, deadline - Date.now()));
      if (waitMs <= 0) break;
      await new Promise(r => setTimeout(r, waitMs));
    }
    if (exitObserved || hasChildExitObserved(proc)) return true;
    if (pid) {
      try { process.kill(pid, 0); } catch { return true; }
    }
    return false;
  } finally {
    if (proc && onExit && typeof proc.removeListener === "function") {
      proc.removeListener("exit", onExit);
    }
  }
}

function killPid(pid, force = false) {
  try { process.kill(pid, force ? "SIGKILL" : "SIGTERM"); } catch {}
}

async function shutdownServer() {
  if (!backendProcess || hasChildExitObserved(backendProcess)) return;

  const proc = backendProcess;
  const pid = proc.pid;
  console.log("[desktop] shutdownServer: 正在关闭 owned server...");

  try { proc.kill("SIGTERM"); } catch {}

  let exited = await waitForProcessExit(proc, pid, SERVER_SHUTDOWN_GRACE_MS);
  if (!exited && pid) {
    console.warn(`[desktop] shutdownServer: server PID ${pid} 未在 ${SERVER_SHUTDOWN_GRACE_MS}ms 内退出，强制终止`);
    killPid(pid, true);
    exited = await waitForProcessExit(proc, pid, SERVER_FORCE_KILL_WAIT_MS);
    if (!exited) {
      console.warn(`[desktop] shutdownServer: server PID ${pid} 强制终止后仍未确认退出`);
    }
  }

  if (backendProcess === proc) backendProcess = null;
}

// ── backend ──

function startBackend() {
  if (process.env.AKARI_SKIP_BACKEND === "1") return;

  const probe = new net.Socket();
  probe.connect(8742, "127.0.0.1", () => {
    probe.destroy();
    console.log("[desktop] backend 已在运行，复用现有服务");
  });
  probe.on("error", () => {
    probe.destroy();
    const tsx = path.join(projectRoot, "node_modules", ".bin", "tsx");
    backendProcess = spawn(tsx, ["server/main.ts"], {
      cwd: projectRoot,
      stdio: "inherit",
    });
    backendProcess.unref();
  });
}

// ── window ──

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    title: "Akari",
    backgroundColor: "#f6f4ef",
    webPreferences: {
      preload: path.resolve(__dirname, "../../preload/index.cjs"),
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(projectRoot, "dist", "react", "index.html"));
  }
}

// ── lifecycle ──

app.whenReady().then(() => {
  startBackend();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async (event) => {
  if (backendProcess && !hasChildExitObserved(backendProcess)) {
    event.preventDefault();
    await shutdownServer();
    app.quit();
  }
});
