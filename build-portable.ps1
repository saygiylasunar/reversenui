$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

Write-Host '[1/5] Preparing Python core...' -ForegroundColor Cyan
if (-not (Test-Path '.\backend\.venv\Scripts\python.exe')) {
  python -m venv .\backend\.venv
}
& .\backend\.venv\Scripts\python.exe -m pip install --upgrade pip
& .\backend\.venv\Scripts\python.exe -m pip install -e .\backend 'pyinstaller==6.21.0'

Write-Host '[2/5] Building React frontend...' -ForegroundColor Cyan
Push-Location .\frontend
npm install
npm run build
Pop-Location

Write-Host '[3/5] Freezing standalone ReversenUI core...' -ForegroundColor Cyan
Remove-Item .\desktop\build -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force .\desktop\build\core\backend\.venv\Scripts | Out-Null
& .\backend\.venv\Scripts\pyinstaller.exe `
  --noconfirm `
  --clean `
  --onefile `
  --name python `
  --paths .\backend `
  --add-data 'frontend/dist:frontend/dist' `
  --distpath .\desktop\build\core\backend\.venv\Scripts `
  --workpath .\desktop\build\pyinstaller-work `
  --specpath .\desktop\build `
  .\backend\run_core.py

Write-Host '[4/5] Preparing Electron...' -ForegroundColor Cyan
Push-Location .\desktop
npm install
npm run check

Write-Host '[5/5] Building portable Windows executable...' -ForegroundColor Cyan
npm run build:win
Pop-Location

$Exe = Get-ChildItem .\desktop\dist\ReversenUI-*-portable.exe | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $Exe) { throw 'Portable executable was not produced.' }
Write-Host ''
Write-Host ('DONE: ' + $Exe.FullName) -ForegroundColor Green
