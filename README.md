# FlexDL

## Disclaimer

FlexDL is provided "as is". Media platforms change frequently, so an extractor
that works today may need a `yt-dlp` update tomorrow. Login walls, regional
restrictions, rate limits, or a particularly creative platform update can still
interrupt a download.

This extension was built with Codex.

## FlexDL - Installation Guide

### Requirements

- Node.js 22 or newer
- Python 3
- `ffmpeg`
- A Chromium-based browser such as Chrome, Chromium, Brave, or Comet

### macOS

1. Download the ZIP file.
2. Unzip it into a permanent folder. Moving or deleting it later will break the
   extension.
3. Install `ffmpeg` if it is not already available:

   ```bash
   brew install ffmpeg
   ```

4. Open Terminal in the unzipped project folder and run:

   ```bash
   npm run setup
   npm run service:start
   ```

   You can use `Start.command` for future launches. `Stop.command` stops the
   local service, and `Status.command` shows whether it is running.

### Windows

1. Download the ZIP file.
2. Unzip it into a permanent folder.
3. Install Node.js 22 or newer, Python 3, and `ffmpeg`.
4. Make sure `node`, `npm`, `python`, and `ffmpeg` are available from
   PowerShell.
5. Open PowerShell in the unzipped project folder and run:

   ```powershell
   npm run setup
   npm run service:start
   ```

   You can use `Start.bat` for future launches. `Stop.bat` stops the local
   service, and `Status.bat` shows whether it is running. The equivalent
   `npm run service:stop` and `npm run service:status` commands also work.

### Install the extension

1. Open `chrome://extensions` (`comet://extensions` in Comet).
2. Enable **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select the `extension` folder containing `manifest.json`.
5. Pin the extension to the browser toolbar.

Keep the project folder on your computer: the extension needs its local service
to download and convert media.

### How it works:

Start the local service, open FlexDL, paste a supported link, choose **Video**
or **MP3**, select a quality, and click **Download**. The service uses `yt-dlp`
to retrieve the media and `ffmpeg` to merge or convert it. Chrome then saves the
finished file directly to your configured Downloads folder.

Video files are checked before they are saved. When necessary, FlexDL converts
them to QuickTime-compatible H.264/AAC MP4 files, avoiding the classic
"QuickTime cannot open this file" surprise after a long download.

## Short description

Tired of media download websites covered in fake buttons, redirects, pop-ups,
and suspicious "your Mac is infected" warnings? FlexDL skips the circus. Paste
the link, choose MP4 or MP3, and get the file.

There is no remote conversion server, no account, and no download history sent
to us. The extraction and conversion happen on your own computer, while the
media request goes directly from your machine to the original platform.

Using an updateable local `yt-dlp` installation also makes FlexDL more resilient
to changing delivery formats and platform protections than an extension with a
different hard-coded parser for every website.

### Features:

- MP4 video and MP3 audio downloads
- Multiple video and audio quality options
- Support for links handled by `yt-dlp`, including major media platforms
- Automatic H.264/AAC conversion for QuickTime compatibility
- Direct saving to Chrome's configured Downloads folder
- Automatic filename cleanup and duplicate-name handling
- Local processing on `127.0.0.1`
- No remote API, accounts, analytics, or telemetry
- No links, files, or download history visible to the developer
- Updateable extractors for better resilience to platform changes
- Lightweight Manifest V3 popup with no framework

**NB:** FlexDL will not pretend a failed extraction succeeded. If a platform has
changed, run `npm run setup` to update `yt-dlp`, restart the service, and try
again.

## Commands

```bash
npm run setup           # install or update yt-dlp
npm start               # run the service in the foreground
npm run service:start   # start the service in the background
npm run service:stop    # stop the background service
npm run service:status  # show the service status
npm test                # run the tests
npm run check           # check JavaScript syntax
```

Runtime files are stored in `.runtime/`, which is ignored by Git. The Python
environment in `service/.venv/` is also generated locally and should not be
published to GitHub.

Platform launchers are kept at the project root:

- macOS: `Start.command`, `Stop.command`, and `Status.command`
- Windows: `Start.bat`, `Stop.bat`, and `Status.bat`

## Third-party tools

FlexDL does not bundle a remote downloader or conversion service. It installs or
uses the following local tools, whose respective licences and terms apply:

- yt-dlp: <https://github.com/yt-dlp/yt-dlp>
- FFmpeg: <https://ffmpeg.org/>
- Node.js: <https://nodejs.org/>

Tech stack: Chrome Manifest V3, vanilla JavaScript, Chrome Downloads API,
Chrome Storage API, Node.js, `yt-dlp`, `ffmpeg`, and `ffprobe`.

---

*Last updated: July 25, 2026*
