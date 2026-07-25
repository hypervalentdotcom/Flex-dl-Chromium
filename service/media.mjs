import net from "node:net";
import path from "node:path";

const VIDEO_QUALITIES = new Set(["best", "2160", "1080", "720", "480"]);
const AUDIO_QUALITIES = new Set(["best", "320", "256", "192", "128"]);

function isPrivateIpv4(address) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

export function validateMediaUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("The link is not valid.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http and https links are accepted.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Links containing credentials are not accepted.");
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    throw new Error("Local addresses are not accepted.");
  }

  const ipVersion = net.isIP(hostname);
  if (
    (ipVersion === 4 && isPrivateIpv4(hostname)) ||
    (ipVersion === 6 &&
      (hostname === "::1" ||
        hostname.startsWith("fc") ||
        hostname.startsWith("fd") ||
        hostname.startsWith("fe80:")))
  ) {
    throw new Error("Private addresses are not accepted.");
  }

  return parsed.toString();
}

export function normalizeJobOptions(input = {}) {
  const url = validateMediaUrl(String(input.url || "").trim());
  const format = input.format === "mp3" ? "mp3" : "video";
  const allowed = format === "mp3" ? AUDIO_QUALITIES : VIDEO_QUALITIES;
  const quality = allowed.has(String(input.quality)) ? String(input.quality) : "best";
  return { url, format, quality };
}

export function buildYtDlpArgs({ url, format, quality, jobDir }) {
  const outputTemplate = path.join(
    jobDir,
    "%(title).160B [%(id)s].%(ext)s",
  );
  const args = [
    "--no-playlist",
    "--newline",
    "--no-colors",
    "--progress",
    "--js-runtimes",
    "node",
    "--windows-filenames",
    "--trim-filenames",
    "180",
    "-o",
    outputTemplate,
  ];

  if (format === "mp3") {
    args.push(
      "-x",
      "--audio-format",
      "mp3",
      "--audio-quality",
      quality === "best" ? "0" : `${quality}K`,
    );
  } else {
    const selector =
      quality === "best"
        ? "bv*+ba/b"
        : `bv*[height<=${quality}]+ba/b[height<=${quality}]`;
    args.push(
      "-f",
      selector,
      "--merge-output-format",
      "mp4/mkv",
    );
  }

  args.push(url);
  return args;
}

export function parseProgress(text) {
  const matches = [...String(text).matchAll(/(\d{1,3}(?:\.\d+)?)%/g)];
  if (!matches.length) return null;
  return Math.max(0, Math.min(100, Number(matches.at(-1)[1])));
}

export function isQuickTimeCompatible(probe, extension) {
  if (String(extension).toLowerCase() !== ".mp4") return false;
  const streams = Array.isArray(probe?.streams) ? probe.streams : [];
  const video = streams.find((stream) => stream.codec_type === "video");
  const audio = streams.find((stream) => stream.codec_type === "audio");
  const compatiblePixels = new Set(["yuv420p", "yuvj420p"]);
  return Boolean(
    video?.codec_name === "h264" &&
      compatiblePixels.has(video.pix_fmt) &&
      (!audio || audio.codec_name === "aac"),
  );
}

export function safeFilename(filename) {
  const base = path.basename(String(filename || "media"));
  const cleaned = base
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/[. ]+$/g, "")
    .slice(0, 180);
  return cleaned || "media";
}
