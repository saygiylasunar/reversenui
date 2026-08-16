$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "ReversenUI" -ForegroundColor Green
Write-Host "Inspect. Understand. Compose. Process." -ForegroundColor DarkGray
Write-Host ""

$pythonCommand = $null
if (Get-Command py -ErrorAction SilentlyContinue) { $pythonCommand = "py" }
elseif (Get-Command python -ErrorAction SilentlyContinue) { $pythonCommand = "python" }
else { throw "Python 3.11+ was not found. Install Python and run start.ps1 again." }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw "Node.js/npm was not found. Install Node.js and run start.ps1 again." }

$venvPython = Join-Path $PSScriptRoot "backend\.venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    Write-Host "[1/4] Creating local Python environment..." -ForegroundColor Cyan
    if ($pythonCommand -eq "py") { & py -3 -m venv backend\.venv } else { & python -m venv backend\.venv }
    & $venvPython -m pip install --upgrade pip
    & $venvPython -m pip install -e backend
} else {
    Write-Host "[1/4] Python environment ready." -ForegroundColor DarkGray
    & $venvPython -c "import fastapi, uvicorn, pydantic, PIL, multipart" 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "      Repairing backend dependencies..." -ForegroundColor Yellow
        & $venvPython -m pip install -e backend
    }
}

if (-not (Test-Path "frontend\node_modules")) {
    Write-Host "[2/4] Installing frontend dependencies..." -ForegroundColor Cyan
    Push-Location frontend
    npm install
    Pop-Location
} else { Write-Host "[2/4] Frontend dependencies ready." -ForegroundColor DarkGray }

Write-Host "[3/4] Building frontend..." -ForegroundColor Cyan
Push-Location frontend
npm run build
Pop-Location

Write-Host "[4/4] Starting local server at http://127.0.0.1:8765" -ForegroundColor Green
Start-Process powershell -WindowStyle Hidden -ArgumentList "-NoProfile", "-Command", "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:8765'"
& $venvPython -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8765
