import test from "node:test";
import assert from "node:assert/strict";
import {
  buildYtDlpArgs,
  isQuickTimeCompatible,
  normalizeJobOptions,
  parseProgress,
  safeFilename,
  validateMediaUrl,
} from "../service/media.mjs";

test("validates public http URLs", () => {
  assert.equal(
    validateMediaUrl("https://www.youtube.com/watch?v=abc"),
    "https://www.youtube.com/watch?v=abc",
  );
});

test("rejects local and private URLs", () => {
  assert.throws(() => validateMediaUrl("http://localhost/video"), /Local/);
  assert.throws(() => validateMediaUrl("http://192.168.1.20/video"), /Private/);
});

test("normalizes format and quality", () => {
  assert.deepEqual(
    normalizeJobOptions({
      url: "https://example.com/video",
      format: "mp3",
      quality: "320",
    }),
    {
      url: "https://example.com/video",
      format: "mp3",
      quality: "320",
    },
  );
});

test("builds video and MP3 arguments without a shell", () => {
  const video = buildYtDlpArgs({
    url: "https://example.com/video",
    format: "video",
    quality: "1080",
    jobDir: "/tmp/job",
  });
  assert.ok(video.includes("bv*[height<=1080]+ba/b[height<=1080]"));
  assert.ok(video.includes("node"));
  assert.equal(video.at(-1), "https://example.com/video");

  const audio = buildYtDlpArgs({
    url: "https://example.com/video",
    format: "mp3",
    quality: "320",
    jobDir: "/tmp/job",
  });
  assert.ok(audio.includes("320K"));
  assert.ok(audio.includes("mp3"));
});

test("parses progress and sanitizes filenames", () => {
  assert.equal(parseProgress("[download]  42.7%"), 42.7);
  assert.equal(safeFilename('../bad:name?.mp4'), "bad_name_.mp4");
});

test("recognizes only QuickTime-safe MP4 streams", () => {
  assert.equal(
    isQuickTimeCompatible(
      {
        streams: [
          { codec_type: "video", codec_name: "h264", pix_fmt: "yuv420p" },
          { codec_type: "audio", codec_name: "aac" },
        ],
      },
      ".mp4",
    ),
    true,
  );
  assert.equal(
    isQuickTimeCompatible(
      {
        streams: [
          { codec_type: "video", codec_name: "vp9", pix_fmt: "yuv420p" },
          { codec_type: "audio", codec_name: "opus" },
        ],
      },
      ".mp4",
    ),
    false,
  );
});
