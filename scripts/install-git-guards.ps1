param([switch]$Quiet)

$ErrorActionPreference = 'Stop'
$Root = (& git rev-parse --show-toplevel 2>$null).Trim()
if (-not $Root) { exit 0 }

$Hooks = Join-Path $Root '.git\hooks'
if (-not (Test-Path $Hooks)) { exit 0 }

$PreCommit = @'
#!/bin/sh
ROOT="$(git rev-parse --show-toplevel)"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "$ROOT/scripts/secret-guard.ps1" -Mode staged
exit $?
'@

$PrePush = @'
#!/bin/sh
ROOT="$(git rev-parse --show-toplevel)"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "$ROOT/scripts/secret-guard.ps1" -Mode all
exit $?
'@

Set-Content -LiteralPath (Join-Path $Hooks 'pre-commit') -Value $PreCommit -Encoding ascii
Set-Content -LiteralPath (Join-Path $Hooks 'pre-push') -Value $PrePush -Encoding ascii

if (-not $Quiet) {
  Write-Host '[ReversenUI] Git secret guards installed: pre-commit + pre-push.' -ForegroundColor Green
}
