import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createClipDlServer } from "../service/server.mjs";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const fakeYtDlp = path.join(testsDir, "fake-yt-dlp.mjs");

test("runs a complete local job and serves the result", async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "flexdl-test-"));
  const app = createClipDlServer({
    port: 0,
    tempRoot,
    ytdlpCommand: [process.execPath, fakeYtDlp],
    ffmpegCommand: [process.execPath, "-e", "process.exit(0)", "--"],
    ffprobeCommand: [process.execPath, "-e", "process.exit(0)", "--"],
  });
  t.after(async () => {
    await app.close();
    await rm(tempRoot, { recursive: true, force: true });
  });

  const address = await app.listen();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const health = await fetch(`${baseUrl}/health`).then((response) =>
    response.json(),
  );
  assert.equal(health.ready, true);

  const startedResponse = await fetch(`${baseUrl}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: "https://example.com/media",
      format: "mp3",
      quality: "192",
    }),
  });
  assert.equal(startedResponse.status, 202);
  const started = await startedResponse.json();

  let job = started;
  for (let attempt = 0; attempt < 50 && job.status !== "ready"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    job = await fetch(`${baseUrl}/jobs/${started.id}`).then((response) =>
      response.json(),
    );
  }

  assert.equal(job.status, "ready");
  assert.equal(job.progress, 100);
  assert.equal(job.filename, "Media test [fixture].mp3");

  const fileResponse = await fetch(`${baseUrl}${job.downloadUrl}`);
  assert.equal(fileResponse.status, 200);
  assert.equal(await fileResponse.text(), "fake-media-content");
});
