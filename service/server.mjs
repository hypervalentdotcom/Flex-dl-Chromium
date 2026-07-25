import { spawn } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import {
  mkdir,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import {
  buildYtDlpArgs,
  isQuickTimeCompatible,
  normalizeJobOptions,
  parseProgress,
  safeFilename,
} from "./media.mjs";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = Number(process.env.DL_SERVICE_PORT || 43110);
const MAX_BODY_SIZE = 16 * 1024;
const JOB_TTL_MS = 60 * 60 * 1000;

function defaultYtDlpCommand() {
  if (process.env.DL_YTDLP_BIN) return [process.env.DL_YTDLP_BIN];
  const pythonPath =
    process.platform === "win32"
      ? path.join(moduleDir, ".venv", "Scripts", "python.exe")
      : path.join(moduleDir, ".venv", "bin", "python");
  return existsSync(pythonPath) ? [pythonPath, "-m", "yt_dlp"] : ["yt-dlp"];
}

function defaultFfprobeCommand(ffmpegCommand) {
  const ffmpegBin = ffmpegCommand[0];
  const filename = path.basename(ffmpegBin).toLowerCase();
  if (filename === "ffmpeg" || filename === "ffmpeg.exe") {
    const extension = filename.endsWith(".exe") ? ".exe" : "";
    return ffmpegBin === path.basename(ffmpegBin)
      ? [`ffprobe${extension}`]
      : [path.join(path.dirname(ffmpegBin), `ffprobe${extension}`)];
  }
  return ["ffprobe"];
}

function commandWorks(command, versionArgs = ["--version"]) {
  return new Promise((resolve) => {
    const [bin, ...baseArgs] = command;
    const child = spawn(bin, [...baseArgs, ...versionArgs], {
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("error", () => resolve(false));
    child.once("exit", (code) => resolve(code === 0));
  });
}

function runCaptured(command, args) {
  return new Promise((resolve, reject) => {
    const [bin, ...baseArgs] = command;
    const child = spawn(bin, [...baseArgs, ...args], {
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk.toString("utf8")}`.slice(-6000);
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim() || `${bin} failed (${code}).`));
    });
  });
}

async function ensureQuickTimeVideo(output, ffmpegCommand, ffprobeCommand) {
  let probe = null;
  try {
    const result = await runCaptured(ffprobeCommand, [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_name,codec_type,pix_fmt",
      "-of",
      "json",
      output.fullPath,
    ]);
    probe = JSON.parse(result.stdout);
  } catch {
    // A failed probe falls through to a safe H.264/AAC conversion.
  }

  if (isQuickTimeCompatible(probe, path.extname(output.name))) return output;

  const parsed = path.parse(output.fullPath);
  const finalPath = path.join(parsed.dir, `${parsed.name}.mp4`);
  const temporaryPath = path.join(parsed.dir, `${parsed.name}.quicktime.mp4`);
  await runCaptured(ffmpegCommand, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    output.fullPath,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-map_metadata",
    "0",
    "-sn",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    temporaryPath,
  ]);

  await rm(output.fullPath, { force: true });
  await rename(temporaryPath, finalPath);
  const info = await stat(finalPath);
  return {
    fullPath: finalPath,
    name: path.basename(finalPath),
    mtime: info.mtimeMs,
  };
}

function allowedOrigin(origin) {
  return !origin || origin.startsWith("chrome-extension://");
}

function applyCors(request, response) {
  const origin = request.headers.origin;
  if (allowedOrigin(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin || "*");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    response.setHeader("Vary", "Origin");
  }
}

function json(request, response, status, body) {
  applyCors(request, response);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        reject(new Error("Request body is too large."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(new Error("The received JSON is invalid."));
      }
    });
    request.on("error", reject);
  });
}

async function findOutputFile(jobDir, format) {
  const entries = await readdir(jobDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (
      !entry.isFile() ||
      entry.name.endsWith(".part") ||
      entry.name.endsWith(".ytdl")
    ) {
      continue;
    }
    const fullPath = path.join(jobDir, entry.name);
    const info = await stat(fullPath);
    files.push({ fullPath, name: entry.name, mtime: info.mtimeMs });
  }
  const preferredExtension = format === "mp3" ? ".mp3" : ".mp4";
  files.sort((a, b) => {
    const aPreferred = a.name.toLowerCase().endsWith(preferredExtension);
    const bPreferred = b.name.toLowerCase().endsWith(preferredExtension);
    if (aPreferred !== bPreferred) return aPreferred ? -1 : 1;
    return b.mtime - a.mtime;
  });
  return files[0] || null;
}

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    format: job.format,
    quality: job.quality,
    filename: job.filename || null,
    downloadUrl: job.filename ? `/files/${job.id}` : null,
    error: job.error || null,
  };
}

function contentType(filename) {
  const extension = path.extname(filename).toLowerCase();
  if (extension === ".mp3") return "audio/mpeg";
  if (extension === ".mp4") return "video/mp4";
  if (extension === ".webm") return "video/webm";
  if (extension === ".m4a") return "audio/mp4";
  return "application/octet-stream";
}

export function createClipDlServer(options = {}) {
  const host = options.host || DEFAULT_HOST;
  const port = Number(options.port ?? DEFAULT_PORT);
  const ytdlpCommand = options.ytdlpCommand || defaultYtDlpCommand();
  const ffmpegCommand = options.ffmpegCommand || [
    process.env.DL_FFMPEG_BIN || "ffmpeg",
  ];
  const ffprobeCommand =
    options.ffprobeCommand || defaultFfprobeCommand(ffmpegCommand);
  const tempRoot =
    options.tempRoot || path.join(os.tmpdir(), "flexdl-service");
  const jobs = new Map();

  async function runJob(job) {
    job.status = "downloading";
    const args = buildYtDlpArgs(job);
    const [bin, ...baseArgs] = ytdlpCommand;
    const child = spawn(bin, [...baseArgs, ...args], {
      cwd: job.jobDir,
      windowsHide: true,
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });
    job.child = child;
    let lastOutput = "";

    const handleOutput = (chunk) => {
      const text = chunk.toString("utf8");
      lastOutput = `${lastOutput}${text}`.slice(-4000);
      const progress = parseProgress(text);
      if (progress !== null) {
        job.progress = job.format === "video" ? progress * 0.9 : progress;
      }
    };
    child.stdout.on("data", handleOutput);
    child.stderr.on("data", handleOutput);

    child.once("error", (error) => {
      job.status = "error";
      job.error = `Unable to start yt-dlp: ${error.message}`;
      job.child = null;
    });

    child.once("exit", async (code, signal) => {
      job.child = null;
      if (job.status === "cancelled") return;
      if (code !== 0) {
        job.status = "error";
        const concise = lastOutput
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(-3)
          .join(" ");
        job.error =
          concise || `yt-dlp exited with code ${code ?? signal}.`;
        return;
      }

      try {
        let output = await findOutputFile(job.jobDir, job.format);
        if (!output) throw new Error("No file was produced.");
        if (job.format === "video") {
          job.status = "converting";
          job.progress = 92;
          output = await ensureQuickTimeVideo(
            output,
            ffmpegCommand,
            ffprobeCommand,
          );
        }
        job.filePath = output.fullPath;
        job.filename = safeFilename(output.name);
        job.progress = 100;
        job.status = "ready";
      } catch (error) {
        job.status = "error";
        job.error = error.message;
      }
    });
  }

  const server = http.createServer(async (request, response) => {
    if (!allowedOrigin(request.headers.origin)) {
      json(request, response, 403, { error: "Origin not allowed." });
      return;
    }
    if (request.method === "OPTIONS") {
      applyCors(request, response);
      response.writeHead(204);
      response.end();
      return;
    }

    const url = new URL(request.url, `http://${request.headers.host || host}`);
    const jobMatch = url.pathname.match(/^\/jobs\/([a-f0-9-]+)$/i);
    const fileMatch = url.pathname.match(/^\/files\/([a-f0-9-]+)$/i);

    try {
      if (request.method === "GET" && url.pathname === "/health") {
        const [ytdlp, ffmpeg, ffprobe] = await Promise.all([
          commandWorks(ytdlpCommand),
          commandWorks(ffmpegCommand, ["-version"]),
          commandWorks(ffprobeCommand, ["-version"]),
        ]);
        json(request, response, 200, {
          ready: ytdlp && ffmpeg && ffprobe,
          ytdlp,
          ffmpeg,
          ffprobe,
          service: "FlexDL",
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/jobs") {
        const [ytdlp, ffmpeg, ffprobe] = await Promise.all([
          commandWorks(ytdlpCommand),
          commandWorks(ffmpegCommand, ["-version"]),
          commandWorks(ffprobeCommand, ["-version"]),
        ]);
        if (!ytdlp || !ffmpeg || !ffprobe) {
          json(request, response, 503, {
            error: !ytdlp
              ? "yt-dlp is missing. Run npm run setup."
              : "ffmpeg or ffprobe is missing. Install ffmpeg, then restart the service.",
          });
          return;
        }

        const normalized = normalizeJobOptions(await readJsonBody(request));
        const id = randomUUID();
        const jobDir = path.join(tempRoot, id);
        await mkdir(jobDir, { recursive: true });
        const job = {
          id,
          ...normalized,
          jobDir,
          status: "preparing",
          progress: 0,
          createdAt: Date.now(),
          child: null,
          filename: null,
          filePath: null,
          error: null,
        };
        jobs.set(id, job);
        runJob(job);
        json(request, response, 202, publicJob(job));
        return;
      }

      if (request.method === "GET" && jobMatch) {
        const job = jobs.get(jobMatch[1]);
        if (!job) {
          json(request, response, 404, { error: "Download not found." });
          return;
        }
        json(request, response, 200, publicJob(job));
        return;
      }

      if (request.method === "DELETE" && jobMatch) {
        const job = jobs.get(jobMatch[1]);
        if (!job) {
          json(request, response, 404, { error: "Download not found." });
          return;
        }
        job.status = "cancelled";
        if (job.child && !job.child.killed) job.child.kill("SIGTERM");
        jobs.delete(job.id);
        await rm(job.jobDir, { recursive: true, force: true });
        json(request, response, 200, { ok: true });
        return;
      }

      if (request.method === "GET" && fileMatch) {
        const job = jobs.get(fileMatch[1]);
        if (!job || job.status !== "ready" || !job.filePath) {
          json(request, response, 404, { error: "File unavailable." });
          return;
        }
        const info = await stat(job.filePath);
        applyCors(request, response);
        response.writeHead(200, {
          "Content-Type": contentType(job.filename),
          "Content-Length": info.size,
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(job.filename)}`,
          "Cache-Control": "no-store",
        });
        createReadStream(job.filePath).pipe(response);
        return;
      }

      json(request, response, 404, { error: "Unknown route." });
    } catch (error) {
      json(request, response, 400, {
        error: error.message || "Request failed.",
      });
    }
  });

  const cleanupTimer = setInterval(async () => {
    const cutoff = Date.now() - JOB_TTL_MS;
    for (const [id, job] of jobs) {
      if (job.createdAt > cutoff || job.child) continue;
      jobs.delete(id);
      await rm(job.jobDir, { recursive: true, force: true }).catch(() => {});
    }
  }, 10 * 60 * 1000);
  cleanupTimer.unref();

  server.on("close", () => {
    clearInterval(cleanupTimer);
    for (const job of jobs.values()) {
      if (job.child && !job.child.killed) job.child.kill("SIGTERM");
    }
  });

  return {
    server,
    host,
    port,
    jobs,
    listen() {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          resolve(server.address());
        });
      });
    },
    close() {
      return new Promise((resolve) => server.close(resolve));
    },
  };
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const app = createClipDlServer();
  await app.listen();
  console.log(`FlexDL is ready at http://${app.host}:${app.port}`);
  console.log("Keep this window open while downloading.");
}
