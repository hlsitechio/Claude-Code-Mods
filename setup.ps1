# ============================================================================
#  Claude Code Mods — Windows installer
# ============================================================================
#  Run with:
#    irm https://raw.githubusercontent.com/hlsitechio/Claude-Code-Mods/main/setup.ps1 | iex
#
#  What this does, in order:
#    1. Shows the BETA warning + where to report bugs
#    2. Checks prerequisites (Node 20+, git, Claude Code CLI)
#    3. SCANS (read-only) for any existing Claude installs — and never
#       touches them. Your data is safe.
#    4. Asks WHERE to put this install (isolated directory)
#    5. Asks for consent before creating the local data backend
#    6. Clones + installs, then writes a one-click launcher
#
#  This script makes ZERO changes outside the install folder you choose and
#  its own data folder. It does not modify the registry, system PATH, or any
#  existing Claude / Claude Code / Claude Desktop installation.
# ============================================================================

$ErrorActionPreference = 'Stop'
$RepoUrl     = 'https://github.com/hlsitechio/Claude-Code-Mods.git'
$IssuesUrl   = 'https://github.com/hlsitechio/Claude-Code-Mods/issues'
$RawBase     = 'https://raw.githubusercontent.com/hlsitechio/Claude-Code-Mods/main'

function Write-Head($t) { Write-Host "`n$t" -ForegroundColor Cyan }
function Write-OK($t)   { Write-Host "  [OK]   $t" -ForegroundColor Green }
function Write-Warn($t) { Write-Host "  [WARN] $t" -ForegroundColor Yellow }
function Write-Err($t)  { Write-Host "  [ERR]  $t" -ForegroundColor Red }
function Write-Info($t) { Write-Host "  $t" -ForegroundColor Gray }

# ── Banner + BETA warning ───────────────────────────────────────────────────
# NOTE: single-quoted here-string (@'...'@) so the art is taken literally —
# a double-quoted here-string would treat any backtick/$ as PowerShell syntax.
Clear-Host
Write-Host @'

  ==========================================================
   CLAUDE  CODE  MODS
   The missing desktop layer for the Claude Code CLI
  ==========================================================

'@ -ForegroundColor DarkCyan

Write-Host "  +--------------------------------------------------------------+" -ForegroundColor Yellow
Write-Host "  |  BETA RELEASE — expect rough edges and the occasional bug.   |" -ForegroundColor Yellow
Write-Host "  |  Please report anything broken (with steps to reproduce) at: |" -ForegroundColor Yellow
Write-Host "  |  $IssuesUrl   " -ForegroundColor Yellow
Write-Host "  +--------------------------------------------------------------+" -ForegroundColor Yellow
Write-Host ""
Write-Info "This installer is SAFE: it only writes to the folder you choose."
Write-Info "It never modifies an existing Claude / Claude Desktop / Claude Code install."
Write-Host ""

$proceed = Read-Host "  Continue? [Y/n]"
if ($proceed -and $proceed.Trim().ToLower() -eq 'n') { Write-Info "Cancelled."; return }

# ── Step 1: prerequisites ───────────────────────────────────────────────────
Write-Head "Step 1/5  -  Checking prerequisites"

$nodeOk = $false
try {
  $nodeVer = (& node --version) 2>$null
  if ($nodeVer -match 'v(\d+)\.') {
    $major = [int]$Matches[1]
    if ($major -ge 20) { Write-OK "Node.js $nodeVer"; $nodeOk = $true }
    else { Write-Err "Node.js $nodeVer found, but 20+ is required (Vite 8 needs Node 20.19+/22.12+)." }
  }
} catch { Write-Err "Node.js not found." }
if (-not $nodeOk) {
  Write-Info "Install Node 20+ from https://nodejs.org then re-run this installer."
  return
}

$gitOk = $false
try { $gv = (& git --version) 2>$null; if ($gv) { Write-OK "$gv"; $gitOk = $true } } catch {}
if (-not $gitOk) {
  Write-Err "git not found. Install from https://git-scm.com/download/win then re-run."
  return
}

$claudeCmd = Get-Command claude -ErrorAction SilentlyContinue
if ($claudeCmd) { Write-OK "Claude Code CLI ($($claudeCmd.Source))" }
else {
  Write-Warn "Claude Code CLI not found in PATH."
  Write-Info  "CCM drives the official CLI — install it from"
  Write-Info  "https://github.com/anthropics/claude-code and authenticate (run 'claude' once)."
  Write-Info  "You can install CCM now and add the CLI afterward."
}

# ── Step 2: scan for existing installs (READ-ONLY) ──────────────────────────
Write-Head "Step 2/5  -  Scanning for existing Claude installs (read-only)"
Write-Info "Nothing below will be modified, moved, or deleted."

$found = @()
$scanTargets = @(
  @{ Name = "Official Claude Desktop (Anthropic)"; Path = (Join-Path $env:LOCALAPPDATA 'AnthropicClaude') },
  @{ Name = "Official Claude Desktop (Anthropic)"; Path = (Join-Path $env:APPDATA      'Claude') },
  @{ Name = "Existing CCM / claude-code-desktop data"; Path = (Join-Path $env:APPDATA 'claude-code-desktop') },
  @{ Name = "Claude Code CLI config"; Path = (Join-Path $env:USERPROFILE '.claude') }
)
foreach ($t in $scanTargets) {
  if (Test-Path $t.Path) {
    Write-Warn "Found: $($t.Name)"
    Write-Info "       -> $($t.Path)   (will NOT be touched)"
    $found += $t
  }
}
if ($found.Count -eq 0) { Write-OK "No existing Claude installs detected — clean machine." }
else {
  Write-Host ""
  Write-Info "Detected $($found.Count) existing item(s) above. To guarantee none of them"
  Write-Info "are shared or overwritten, this install will keep ALL of its data in its"
  Write-Info "own isolated folder (you choose where, next step)."
}

# ── Step 3: choose install location ─────────────────────────────────────────
Write-Head "Step 3/5  -  Where should Claude Code Mods be installed?"
$defaultDir = Join-Path $env:USERPROFILE 'ClaudeCodeMods'
Write-Info "Default: $defaultDir"
$inputDir = Read-Host "  Install path (Enter for default)"
$installDir = if ([string]::IsNullOrWhiteSpace($inputDir)) { $defaultDir } else { $inputDir.Trim() }

# Refuse to clobber a non-empty, non-CCM directory
if (Test-Path $installDir) {
  $isCcm = Test-Path (Join-Path $installDir 'package.json')
  $hasGit = Test-Path (Join-Path $installDir '.git')
  if ($isCcm -and $hasGit) {
    Write-Warn "An existing install is already here. It will be UPDATED (git pull), not replaced."
    $script:UpdateMode = $true
  } elseif ((Get-ChildItem $installDir -Force | Measure-Object).Count -gt 0) {
    Write-Err "$installDir exists and is not empty (and isn't a CCM clone)."
    Write-Info "Choose an empty folder to avoid data loss. Aborting."
    return
  }
} else {
  $script:UpdateMode = $false
}
Write-OK "Install location: $installDir"

# ── Step 4: consent for the local backend ───────────────────────────────────
Write-Head "Step 4/5  -  Local data backend"
$dataDir = Join-Path $installDir 'data'
Write-Info "Claude Code Mods stores everything LOCALLY — chat sessions, notes, memory,"
Write-Info "agents, browser cookies/profile, window state. Nothing is sent to any server."
Write-Info "To keep this install fully isolated, its data will live at:"
Write-Info "       $dataDir"
Write-Host ""
$consent = Read-Host "  Create the local data backend there? [Y/n]"
if ($consent -and $consent.Trim().ToLower() -eq 'n') {
  Write-Info "Without a data folder CCM can't store sessions. Aborting — re-run when ready."
  return
}

# ── Step 5: clone / update + install + launcher ─────────────────────────────
Write-Head "Step 5/5  -  Installing"

if ($script:UpdateMode) {
  Write-Info "Updating existing clone..."
  Push-Location $installDir
  & git pull --ff-only
  Pop-Location
} else {
  Write-Info "Cloning $RepoUrl ..."
  & git clone --depth 1 $RepoUrl $installDir
}
Write-OK "Source ready."

New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
Write-OK "Data folder ready: $dataDir"

Write-Info "Installing npm dependencies (this can take a minute)..."
Push-Location $installDir
& npm install --no-audit --no-fund
Pop-Location
Write-OK "Dependencies installed."

# Write a one-click launcher that pins the isolated data dir
$launcher = Join-Path $installDir 'Launch-CCM.cmd'
@"
@echo off
REM Auto-generated by setup.ps1 — launches Claude Code Mods with an
REM isolated local data backend so it never touches other installs.
set "CCM_USER_DATA_DIR=$dataDir"
cd /d "$installDir"
call npm run electron:dev
"@ | Set-Content -Path $launcher -Encoding ASCII
Write-OK "Launcher created: $launcher"

# Optional desktop shortcut
$mkShortcut = Read-Host "  Create a Desktop shortcut? [Y/n]"
if (-not ($mkShortcut -and $mkShortcut.Trim().ToLower() -eq 'n')) {
  try {
    $desktop = [Environment]::GetFolderPath('Desktop')
    $lnk = Join-Path $desktop 'Claude Code Mods.lnk'
    $ws = New-Object -ComObject WScript.Shell
    $sc = $ws.CreateShortcut($lnk)
    $sc.TargetPath = $launcher
    $sc.WorkingDirectory = $installDir
    $sc.IconLocation = $launcher
    $sc.Description = 'Claude Code Mods (beta)'
    $sc.Save()
    Write-OK "Desktop shortcut created."
  } catch { Write-Warn "Could not create shortcut: $($_.Exception.Message)" }
}

# ── Done ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host "   Claude Code Mods installed." -ForegroundColor Green
Write-Host "  ============================================================" -ForegroundColor Green
Write-Info "Install : $installDir"
Write-Info "Data    : $dataDir  (isolated — your other installs are untouched)"
Write-Host ""
Write-Info "Launch it:"
Write-Info "   - Double-click 'Launch-CCM.cmd' in the install folder, or"
Write-Info "   - the Desktop shortcut, or"
Write-Info "   - run:  cd `"$installDir`"; `$env:CCM_USER_DATA_DIR='$dataDir'; npm run electron:dev"
Write-Host ""
Write-Host "  Reminder: this is a BETA. Found a bug? Please report it:" -ForegroundColor Yellow
Write-Host "  $IssuesUrl" -ForegroundColor Yellow
Write-Host ""

$launchNow = Read-Host "  Launch Claude Code Mods now? [Y/n]"
if (-not ($launchNow -and $launchNow.Trim().ToLower() -eq 'n')) {
  Write-Info "Starting... (a Vite dev server + Electron window will open)"
  Start-Process -FilePath $launcher
}
