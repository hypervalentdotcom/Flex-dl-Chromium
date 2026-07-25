import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serviceDir = path.dirname(fileURLToPath(import.meta.url));
const venvDir = path.join(serviceDir, ".venv");

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 22) {
  throw new Error("Node.js 22 or newer is required for YouTube.");
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: serviceDir,
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}.`));
    });
  });
}

async function findPython() {
  const candidates =
    process.platform === "win32" ? ["py", "python"] : ["python3", "python"];
  for (const candidate of candidates) {
    try {
      const args = candidate === "py" ? ["-3", "--version"] : ["--version"];
      await run(candidate, args);
      return {
        command: candidate,
        prefix: candidate === "py" ? ["-3"] : [],
      };
    } catch {
      // Try the next executable.
    }
  }
  throw new Error("Python 3 is required but was not found.");
}

await mkdir(serviceDir, { recursive: true });
const python = await findPython();
await run(python.command, [...python.prefix, "-m", "venv", venvDir]);

const venvPython =
  process.platform === "win32"
    ? path.join(venvDir, "Scripts", "python.exe")
    : path.join(venvDir, "bin", "python");

await run(venvPython, [
  "-m",
  "pip",
  "install",
  "--upgrade",
  "pip",
  "yt-dlp[default]",
]);
console.log("");
console.log("yt-dlp is installed. You can now run: npm run service:start");
