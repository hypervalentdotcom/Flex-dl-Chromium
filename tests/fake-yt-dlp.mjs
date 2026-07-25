import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
if (args.includes("--version")) {
  process.stdout.write("test-1.0.0\n");
  process.exit(0);
}

const outputIndex = args.indexOf("-o");
const outputTemplate = args[outputIndex + 1];
const isMp3 = args.includes("--audio-format");
const extension = isMp3 ? "mp3" : "mp4";
const outputPath = outputTemplate
  .replace("%(title).160B", "Media test")
  .replace("%(id)s", "fixture")
  .replace("%(ext)s", extension);

await mkdir(path.dirname(outputPath), { recursive: true });
process.stdout.write("[download]  25.0% of 1.00MiB\n");
await new Promise((resolve) => setTimeout(resolve, 30));
process.stdout.write("[download] 100.0% of 1.00MiB\n");
await writeFile(outputPath, Buffer.from("fake-media-content"));
