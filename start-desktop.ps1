$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

if (-not (Get-Command python -ErrorAction SilentlyContinue)) { throw 'Python 3.11+ is required.' }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'Node.js/npm is required.' }

$VenvPython = Join-Path $Root 'backend\.venv\Scripts\python.exe'
if (-not (Test-Path $VenvPython)) {
  Write-Host '[ReversenUI] Creating Python environment...'
  python -m venv backend\.venv
}

Write-Host '[ReversenUI] Installing/updating backend...'
& $VenvPython -m pip install -e backend

Write-Host '[ReversenUI] Building frontend...'
Push-Location frontend
if (-not (Test-Path 'node_modules')) { npm install }
npm run build
Pop-Location

Write-Host '[ReversenUI] Preparing Electron desktop shell...'
Push-Location desktop
if (-not (Test-Path 'node_modules')) { npm install }
npm run check
Write-Host '[ReversenUI] Launching desktop workbench...'
npm start
Pop-Location
