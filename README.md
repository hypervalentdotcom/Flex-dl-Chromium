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
- A Chromium-based browser

## Downloads

- macOS: use the Git installation below (recommended, avoids Gatekeeper
  quarantine)
- [macOS copy-paste commands](INSTALL-macOS.txt)
- [FlexDL for macOS — ZIP fallback](downloads/FlexDL-macOS.zip)
- [FlexDL for Windows](downloads/FlexDL-Windows.zip)

### macOS

The recommended installation uses Git instead of a browser download. This keeps
macOS from adding download quarantine metadata to the launchers.

1. Install `ffmpeg` if it is not already available:

   ```bash
   brew install ffmpeg
   ```

2. Open Terminal and paste:

   ```bash
   mkdir -p "$HOME/Applications"
   git clone https://github.com/hypervalentdotcom/Flex-dl-Chromium.git "$HOME/Applications/FlexDL"
   cd "$HOME/Applications/FlexDL"
   ./Start.command
   ```

3. Load the extension from:

   ```text
   ~/Applications/FlexDL/extension
   ```

You can double-click `Start.command` for future launches. `Stop.command` stops
the local service, and `Status.command` shows whether it is running.

To update FlexDL later:

```bash
cd "$HOME/Applications/FlexDL"
git pull --ff-only
./Start.command
```

#### ZIP fallback

If you use the macOS ZIP instead, the browser may mark it with Gatekeeper
quarantine metadata. Open Terminal in the extracted FlexDL folder and run:

```bash
xattr -dr com.apple.quarantine .
chmod +x ./*.command
```

Only do this for a FlexDL package downloaded from this repository. The command
removes the download quarantine metadata from that extracted folder; it does
not disable Gatekeeper globally.

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

1. Open the extensions page in your Chromium-based browser.
2. Enable **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select the `extension` folder containing `manifest.json`.
5. Pin the extension to the browser toolbar.

Keep the project folder on your computer: the extension needs its local service
to download and convert media.

### How it works:

Start the local service and open a supported media page. When you open FlexDL,
the extension automatically fills the link field with the URL of the active
tab. Choose **Video** or **MP3**, select a quality, and click **Download**. You
can still paste a different link manually. The service uses `yt-dlp` to retrieve
the media and `ffmpeg` to merge or convert it. The browser then saves the
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
- Automatic detection of the active tab URL
- Multiple video and audio quality options
- Support for links handled by `yt-dlp`, including major media platforms
- Automatic H.264/AAC conversion for QuickTime compatibility
- Direct saving to the browser's configured Downloads folder
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

Tech stack: Chromium Manifest V3, vanilla JavaScript, Downloads API, Storage
API, Node.js, `yt-dlp`, `ffmpeg`, and `ffprobe`.

---

*Last updated: July 25, 2026*
