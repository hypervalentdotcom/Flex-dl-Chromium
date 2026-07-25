[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
Set-Location -LiteralPath $PSScriptRoot

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Refresh-ProcessPath {
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $pathParts = @($machinePath, $userPath)

    $wingetLinks = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links"
    if (Test-Path -LiteralPath $wingetLinks) {
        $pathParts += $wingetLinks
    }

    $windowsApps = Join-Path $env:LOCALAPPDATA "Microsoft\WindowsApps"
    if (Test-Path -LiteralPath $windowsApps) {
        $pathParts += $windowsApps
    }

    $env:Path = ($pathParts | Where-Object { $_ }) -join ";"
}

function Test-Node {
    try {
        $node = Get-Command node.exe -ErrorAction Stop
        $rawVersion = (& $node.Source --version 2>$null | Select-Object -First 1)
        if ($LASTEXITCODE -ne 0 -or -not $rawVersion) {
            return $false
        }
        if ($rawVersion.Trim() -notmatch "^v(?<Major>\d+)\.") {
            return $false
        }
        return [int]$Matches.Major -ge 22
    }
    catch {
        return $false
    }
}

function Test-Python3 {
    $candidates = @(
        @{ Name = "py.exe"; Arguments = @("-3", "--version") },
        @{ Name = "python.exe"; Arguments = @("--version") }
    )

    foreach ($candidate in $candidates) {
        $python = Get-Command $candidate.Name -ErrorAction SilentlyContinue
        if (-not $python) {
            continue
        }

        $pythonArguments = [string[]]$candidate.Arguments
        $output = (& $python.Source $pythonArguments 2>&1 | Select-Object -First 1)
        if ($LASTEXITCODE -eq 0 -and "$output" -match "^Python 3\.") {
            return $true
        }
    }

    return $false
}

function Test-FFmpeg {
    return (
        (Get-Command ffmpeg.exe -ErrorAction SilentlyContinue) -and
        (Get-Command ffprobe.exe -ErrorAction SilentlyContinue)
    )
}

function Get-WinGet {
    $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if (-not $winget) {
        throw @"
Windows Package Manager (winget) is required to install missing dependencies.
Install or update "App Installer" from the Microsoft Store, then run Install.bat again:
https://aka.ms/getwinget
"@
    }
    return $winget
}

function Install-WinGetPackage {
    param(
        [System.Management.Automation.CommandInfo]$WinGet,
        [string]$Id,
        [string]$DisplayName,
        [string]$Scope = ""
    )

    Write-Step "Installing $DisplayName"
    $wingetArguments = @(
        "install",
        "--id", $Id,
        "--exact",
        "--source", "winget",
        "--accept-package-agreements",
        "--accept-source-agreements",
        "--silent",
        "--disable-interactivity"
    )
    if ($Scope) {
        $wingetArguments += @("--scope", $Scope)
    }

    & $WinGet.Source $wingetArguments
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "$DisplayName returned installer exit code $LASTEXITCODE. FlexDL will verify it before continuing."
    }
    Refresh-ProcessPath
}

Refresh-ProcessPath
$needsNode = -not (Test-Node)
$needsPython = -not (Test-Python3)
$needsFFmpeg = -not (Test-FFmpeg)

if ($needsNode -or $needsPython -or $needsFFmpeg) {
    $winget = Get-WinGet

    if ($needsNode) {
        Install-WinGetPackage -WinGet $winget -Id "OpenJS.NodeJS.LTS" -DisplayName "Node.js LTS" -Scope "machine"
    }
    if ($needsPython) {
        Install-WinGetPackage -WinGet $winget -Id "Python.Python.3.13" -DisplayName "Python 3" -Scope "user"
    }
    if ($needsFFmpeg) {
        Install-WinGetPackage -WinGet $winget -Id "Gyan.FFmpeg.Essentials" -DisplayName "FFmpeg" -Scope "user"
    }
}

Refresh-ProcessPath

if (-not (Test-Node)) {
    throw "Node.js 22 or newer is still unavailable. Restart Windows, then run Install.bat again."
}
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw "npm is unavailable even though Node.js was installed. Restart Windows, then run Install.bat again."
}
if (-not (Test-Python3)) {
    throw "Python 3 is still unavailable. Restart Windows, then run Install.bat again."
}
if (-not (Test-FFmpeg)) {
    throw "FFmpeg or ffprobe is still unavailable. Restart Windows, then run Install.bat again."
}

Write-Step "Installing or updating yt-dlp"
& npm.cmd run setup
if ($LASTEXITCODE -ne 0) {
    throw "yt-dlp installation failed with exit code $LASTEXITCODE."
}

Write-Step "Starting the FlexDL local service"
& npm.cmd run service:start
if ($LASTEXITCODE -ne 0) {
    throw "The FlexDL service failed to start with exit code $LASTEXITCODE."
}

$health = Invoke-RestMethod -Uri "http://127.0.0.1:43110/health" -TimeoutSec 5
if (-not $health.ready -or $health.service -ne "FlexDL") {
    throw "FlexDL did not report a healthy local service."
}

Write-Host ""
Write-Host "FlexDL is installed and running." -ForegroundColor Green
Write-Host "You can now load the extension folder in your Chromium-based browser."
