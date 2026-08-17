$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

function Resolve-SystemPython {
  $py = Get-Command py -ErrorAction SilentlyContinue
  if ($py) {
    foreach ($selector in @('-3.13', '-3.12', '-3.11')) {
      & $py.Source $selector -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)" 2>$null
      if ($LASTEXITCODE -eq 0) {
        return @{ Exe = $py.Source; Args = @($selector) }
      }
    }
  }

  $python = Get-Command python -ErrorAction SilentlyContinue
  if ($python) {
    & $python.Source -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)"
    if ($LASTEXITCODE -eq 0) {
      return @{ Exe = $python.Source; Args = @() }
    }
  }

  throw @'
Python 3.11+ was not found.
Install Python 3.13 x64 from:
https://www.python.org/downloads/windows/
Then close this window and run ReversenUI.bat again.
'@
}

function Stop-StaleCore {
  Write-Host '[ReversenUI] Checking localhost:8765...' -ForegroundColor DarkGray
  $listeners = @(Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue)
  foreach ($listener in $listeners) {
    $ownerPid = [int]$listener.OwningProcess
    if ($ownerPid -gt 0 -and $ownerPid -ne $PID) {
      $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ownerPid" -ErrorAction SilentlyContinue
      $description = if ($process) { "$($process.Name) $($process.CommandLine)" } else { "PID $ownerPid" }
      Write-Host ("[ReversenUI] Stopping stale process on 8765: " + $description) -ForegroundColor Yellow
      Stop-Process -Id $ownerPid -Force -ErrorAction SilentlyContinue
    }
  }
  if ($listeners.Count -gt 0) { Start-Sleep -Milliseconds 700 }
}

$SystemPython = Resolve-SystemPython

if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw @'
Node.js/npm was not found.
Install Node.js 20.19+ or 22.12+ from:
https://nodejs.org/en/download
Then close this window and run ReversenUI.bat again.
'@
}

$NodeVersionRaw = (& node -p "process.versions.node").Trim()
$NodeParts = $NodeVersionRaw.Split('.')
$NodeMajor = [int]$NodeParts[0]
$NodeMinor = [int]$NodeParts[1]
$NodeSupported = (($NodeMajor -eq 20) -and ($NodeMinor -ge 19)) -or (($NodeMajor -eq 22) -and ($NodeMinor -ge 12)) -or ($NodeMajor -gt 22)
if (-not $NodeSupported) {
  throw "Vite 8 requires Node.js 20.19+ or 22.12+. Installed version: $NodeVersionRaw"
}
Write-Host ("[ReversenUI] Node.js " + $NodeVersionRaw + " OK") -ForegroundColor DarkGray

Stop-StaleCore

$VenvPython = Join-Path $Root 'backend\.venv\Scripts\python.exe'
if (-not (Test-Path $VenvPython)) {
  Write-Host '[1/4] Creating Python virtual environment...' -ForegroundColor Cyan
  & $SystemPython.Exe @($SystemPython.Args) -m venv backend\.venv
}

Write-Host '[1/4] Installing/updating backend...' -ForegroundColor Cyan
& $VenvPython -m pip install --disable-pip-version-check --upgrade pip
& $VenvPython -m pip install --disable-pip-version-check -e backend

Write-Host '[2/4] Installing/updating frontend dependencies...' -ForegroundColor Cyan
Push-Location frontend
try {
  npm install --no-audit --no-fund
  Write-Host '[2/4] Building frontend...' -ForegroundColor Cyan
  npm run build

  $bundleFiles = @(Get-ChildItem -Path '.\dist\assets' -Filter '*.js' -File -ErrorAction SilentlyContinue)
  if ($bundleFiles.Count -eq 0) { throw 'Frontend build produced no JavaScript bundle.' }
  $diceMarker = Select-String -Path ($bundleFiles.FullName) -Pattern 'Qwen Builder|PROMPT DICE|Prompt Dice' -Quiet
  if (-not $diceMarker) {
    throw 'Fresh frontend bundle does not contain Prompt Dice / Qwen Builder. Source integration is missing.'
  }
  Write-Host '[ReversenUI] Fresh bundle verified: Prompt Dice present.' -ForegroundColor Green
}
finally {
  Pop-Location
}

Write-Host '[ReversenUI] Refreshing local UI cache...' -ForegroundColor DarkGray
$UserDataRoots = @(
  (Join-Path $env:APPDATA 'ReversenUI'),
  (Join-Path $env:APPDATA 'reversenui-desktop')
)
$CachePaths = @(
  'Cache',
  'Code Cache',
  'GPUCache',
  'Partitions\reversenui-reversenui\Cache',
  'Partitions\reversenui-reversenui\Code Cache',
  'Partitions\reversenui-reversenui\GPUCache',
  'Partitions\reversenui-reversenui\Service Worker\CacheStorage'
)
foreach ($UserDataRoot in $UserDataRoots) {
  foreach ($RelativeCache in $CachePaths) {
    $Target = Join-Path $UserDataRoot $RelativeCache
    if (Test-Path $Target) {
      Remove-Item $Target -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

Write-Host '[3/4] Installing/updating Electron desktop dependencies...' -ForegroundColor Cyan
Push-Location desktop
try {
  npm install --no-audit --no-fund
  npm run check

  Write-Host '[4/4] Launching ReversenUI...' -ForegroundColor Green
  npm start
}
finally {
  Pop-Location
}
