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

$SystemPython = Resolve-SystemPython

if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw @'
Node.js/npm was not found.
Install an LTS version of Node.js (Node 22+ recommended) from:
https://nodejs.org/en/download
Then close this window and run ReversenUI.bat again.
'@
}

$NodeMajor = [int]((& node -p "process.versions.node").Split('.')[0])
if ($NodeMajor -lt 22) {
  throw "Node.js 22+ is required for the development launcher. Installed major version: $NodeMajor"
}

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
}
finally {
  Pop-Location
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
