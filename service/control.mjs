import {
  execFileSync,
  spawn,
  spawnSync,
} from "node:child_process";
import {
  closeSync,
  existsSync,
  openSync,
} from "node:fs";
import {
  mkdir,
  readFile,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serviceDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(serviceDir, "..");
const serverPath = path.join(serviceDir, "server.mjs");
const setupPath = path.join(serviceDir, "setup.mjs");
const servicePort = Number(process.env.DL_SERVICE_PORT || 43110);
const runtimeDir = process.env.DL_RUNTIME_DIR
  ? path.resolve(process.env.DL_RUNTIME_DIR)
  : path.join(projectDir, ".runtime");
const statePath = path.join(runtimeDir, "service.json");
const logPath = path.join(runtimeDir, "service.log");
const healthUrl = `http://127.0.0.1:${servicePort}/health`;
const action = process.argv[2] || "status";

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function processCommand(pid) {
  try {
    if (process.platform === "win32") {
      return execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `(Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" -ErrorAction SilentlyContinue).CommandLine`,
        ],
        { encoding: "utf8" },
      ).trim();
    }
    return execFileSync("ps", ["-p", String(pid), "-o", "command="], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

function listeningServicePids() {
  try {
    const output =
      process.platform === "win32"
        ? execFileSync(
            "powershell.exe",
            [
              "-NoProfile",
              "-NonInteractive",
              "-Command",
              `(Get-NetTCPConnection -LocalPort ${servicePort} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique) -join [Environment]::NewLine`,
            ],
            { encoding: "utf8" },
          )
        : execFileSync(
            "lsof",
            ["-nP", `-iTCP:${servicePort}`, "-sTCP:LISTEN", "-t"],
            { encoding: "utf8" },
          );
    return output
      .split(/\s+/)
      .map(Number)
      .filter((pid) => Number.isInteger(pid) && pid > 1);
  } catch {
    return [];
  }
}

function listensOnServicePort(pid) {
  return listeningServicePids().includes(pid);
}

function isOwnedService(pid) {
  if (!processExists(pid)) return false;
  const command = processCommand(pid).toLowerCase();
  return (
    command.includes(serverPath.toLowerCase()) ||
    command.includes(path.join("service", "server.mjs").toLowerCase()) ||
    listensOnServicePort(pid)
  );
}

function findListeningService() {
  return listeningServicePids().find((pid) => isOwnedService(pid)) || null;
}

async function readState() {
  try {
    const state = JSON.parse(await readFile(statePath, "utf8"));
    return Number.isInteger(state.pid) ? state : null;
  } catch {
    return null;
  }
}

async function clearState() {
  await unlink(statePath).catch(() => {});
}

async function saveState(pid) {
  await mkdir(runtimeDir, { recursive: true });
  await writeFile(
    statePath,
    `${JSON.stringify(
      {
        pid,
        port: servicePort,
        server: serverPath,
        startedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function health() {
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1200) });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function ensureDependencies() {
  const venvPython =
    process.platform === "win32"
      ? path.join(serviceDir, ".venv", "Scripts", "python.exe")
      : path.join(serviceDir, ".venv", "bin", "python");

  if (!existsSync(venvPython)) {
    console.log("Installing yt-dlp for the first time…");
    const setup = spawnSync(process.execPath, [setupPath], {
      cwd: projectDir,
      stdio: "inherit",
      windowsHide: true,
    });
    if (setup.status !== 0) {
      throw new Error("yt-dlp installation failed.");
    }
  }

  const ffmpeg = spawnSync("ffmpeg", ["-version"], {
    stdio: "ignore",
    windowsHide: true,
  });
  if (ffmpeg.status !== 0) {
    throw new Error(
      "ffmpeg is required and must be available on PATH. On macOS, run: brew install ffmpeg",
    );
  }
}

async function startService() {
  await mkdir(runtimeDir, { recursive: true });

  const currentHealth = await health();
  if (currentHealth?.ready) {
    const existingPid = findListeningService();
    if (existingPid) {
      await saveState(existingPid);
      console.log(`Service is already running (PID ${existingPid}).`);
      return;
    }
    throw new Error(
      `Port ${servicePort} is already in use by another process.`,
    );
  }

  const state = await readState();
  if (state && isOwnedService(state.pid)) {
    console.log(`Service is already running (PID ${state.pid}).`);
    return;
  }
  await clearState();
  ensureDependencies();

  const logDescriptor = openSync(logPath, "a");
  const child = spawn(process.execPath, [serverPath], {
    cwd: projectDir,
    detached: true,
    env: { ...process.env, DL_SERVICE_PORT: String(servicePort) },
    stdio: ["ignore", logDescriptor, logDescriptor],
    windowsHide: true,
  });
  closeSync(logDescriptor);
  child.unref();
  await saveState(child.pid);

  await delay(600);
  if (!isOwnedService(child.pid)) {
    await clearState();
    const log = await readFile(logPath, "utf8").catch(() => "");
    const tail = log.split(/\r?\n/).filter(Boolean).slice(-5).join("\n");
    throw new Error(tail || "The service could not start.");
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const status = await health();
    if (status?.ready) {
      console.log(`Service started (PID ${child.pid}).`);
      console.log(`Log: ${logPath}`);
      return;
    }
    await delay(300);
  }

  throw new Error(`The service is not responding. Check: ${logPath}`);
}

async function stopService() {
  const state = await readState();
  const currentHealth = await health();
  const pid =
    state && isOwnedService(state.pid)
      ? state.pid
      : currentHealth?.service === "FlexDL"
        ? findListeningService()
        : null;

  if (!pid) {
    await clearState();
    console.log("The service is already stopped.");
    return;
  }

  process.kill(pid, "SIGTERM");
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (!processExists(pid)) {
      await clearState();
      console.log("Service stopped.");
      return;
    }
    await delay(100);
  }

  if (!isOwnedService(pid)) {
    throw new Error("The process changed before it could be fully stopped.");
  }
  process.kill(pid, "SIGKILL");
  await clearState();
  console.log("The service was force-stopped.");
}

async function showStatus() {
  const status = await health();
  const state = await readState();
  const pid =
    state && isOwnedService(state.pid)
      ? state.pid
      : findListeningService();

  if (status?.ready) {
    console.log(`Service running${pid ? ` (PID ${pid})` : ""}.`);
    console.log(`yt-dlp: ${status.ytdlp ? "OK" : "missing"}`);
    console.log(`ffmpeg: ${status.ffmpeg ? "OK" : "missing"}`);
    return;
  }
  console.log("Service stopped.");
}

try {
  if (action === "start") await startService();
  else if (action === "stop") await stopService();
  else if (action === "status") await showStatus();
  else throw new Error(`Unknown command: ${action}`);
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}
