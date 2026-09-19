param(
  [ValidateSet('staged','all')]
  [string]$Mode = 'staged'
)

$ErrorActionPreference = 'Stop'
$Root = (& git rev-parse --show-toplevel 2>$null).Trim()
if (-not $Root) { exit 0 }
Set-Location $Root

if ($Mode -eq 'staged') {
  $Files = @(& git diff --cached --name-only --diff-filter=ACMR)
} else {
  $Files = @(& git ls-files)
}

$Files = @($Files | Where-Object { $_ -and (Test-Path -LiteralPath $_) })
if ($Files.Count -eq 0) { exit 0 }

$SkipContentScan = @(
  'scripts/secret-guard.ps1',
  'scripts/install-git-guards.ps1',
  '.github/workflows/secret-guard.yml'
)

$Blocked = New-Object System.Collections.Generic.List[string]

function Add-Block([string]$Path, [string]$Rule) {
  $Key = "$Path::$Rule"
  if (-not $Blocked.Contains($Key)) { $Blocked.Add($Key) }
}

$SensitivePathPatterns = @(
  '(?i)(^|/).env($|.)',
  '(?i)(^|/)(vault|secrets?|credentials?|wallets?)(.local)?.(json|ya?ml|txt|csv|env)$',
  '(?i).(pem|p12|pfx|seed|mnemonic|recovery)$',
  '(?i)(^|/)(id_rsa|id_ed25519|private[-_]?key)$'
)

$Rules = @(
  @{ Name='private-key-block'; Pattern='-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----' },
  @{ Name='extended-private-key'; Pattern='(?<![A-Za-z0-9])xprv[A-Za-z0-9]{80,}' },
  @{ Name='github-token'; Pattern='(?<![A-Za-z0-9_])(ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})' },
  @{ Name='aws-access-key'; Pattern='(?<![A-Z0-9])AKIA[0-9A-Z]{16}(?![A-Z0-9])' },
  @{ Name='openai-secret-key'; Pattern='(?<![A-Za-z0-9_-])sk-(?:proj-)?[A-Za-z0-9_-]{20,}' },
  @{ Name='crypto-private-key-assignment'; Pattern='(?im)(private[_ -]?key|wallet[_ -]?key)s*[:=]s*["'']?(0x)?[0-9a-f]{64}(?![0-9a-f])' },
  @{ Name='seed-or-recovery-phrase'; Pattern='(?im)(mnemonic|seed[_ -]?phrase|recovery[_ -]?phrase)s*[:=]s*["'']?([a-z]{3,12}s+){11,23}[a-z]{3,12}' },
  @{ Name='bitcoin-wif-private-key'; Pattern='(?<![1-9A-HJ-NP-Za-km-z])[5KL][1-9A-HJ-NP-Za-km-z]{50,51}(?![1-9A-HJ-NP-Za-km-z])' }
)

foreach ($Path in $Files) {
  $Normalized = $Path -replace '\\','/'
  foreach ($Pattern in $SensitivePathPatterns) {
    if ($Normalized -match $Pattern -and $Normalized -notmatch '(?i).env.example$') {
      Add-Block $Path 'sensitive-local-file'
      break
    }
  }

  if ($SkipContentScan -contains $Normalized) { continue }

  try {
    $Info = Get-Item -LiteralPath $Path -ErrorAction Stop
    if ($Info.Length -gt 2MB) { continue }
    $Content = Get-Content -LiteralPath $Path -Raw -ErrorAction Stop
  } catch { continue }

  foreach ($Rule in $Rules) {
    if ($Content -match $Rule.Pattern) { Add-Block $Path $Rule.Name }
  }
}

if ($Blocked.Count -gt 0) {
  Write-Host ''
  Write-Host '[ReversenUI Secret Guard] Commit/push blocked.' -ForegroundColor Red
  Write-Host 'Possible secret material was detected. Secret values are intentionally not printed.' -ForegroundColor Yellow
  foreach ($Item in $Blocked) { Write-Host ("  - " + $Item) -ForegroundColor Yellow }
  Write-Host ''
  Write-Host 'Move local credentials into ReversenUI Vault or another ignored local file, then stage again.' -ForegroundColor Gray
  exit 23
}

Write-Host ("[ReversenUI Secret Guard] OK (" + $Mode + ").") -ForegroundColor DarkGreen
exit 0
