# Production-build Form Studio (modules/esm-form-studio-app) into its dist/, where the overlay reads it from.
#   .\scripts\build-form-studio.ps1            # build
#   .\scripts\build-form-studio.ps1 -Check     # also run its unit tests, type check and lint first
# First time: cd modules\esm-form-studio-app; node .yarn/releases/yarn-4.10.3.cjs install
param([switch]$Check)
$ErrorActionPreference = "Stop"
Push-Location (Join-Path $PSScriptRoot "..\modules\esm-form-studio-app")
try {
  $yarn = "node", ".yarn/releases/yarn-4.10.3.cjs"
  if (-not (Test-Path node_modules)) { & $yarn[0] $yarn[1] install --immutable }
  if ($Check) { foreach ($t in "test", "typescript", "lint") { & $yarn[0] $yarn[1] $t; if ($LASTEXITCODE) { exit $LASTEXITCODE } } }
  & $yarn[0] $yarn[1] build
  if ($LASTEXITCODE) { exit $LASTEXITCODE }
  $commit = cmd /c "git log -1 --format=%h 2>nul"   # cmd: PowerShell 5.1 treats git's stderr as an error
  if (-not $commit) { $commit = "(no commits yet)" }
  "built at: $(Get-Date -Format s); commit: $commit" | Out-File -Encoding utf8 dist\BUILD-INFO.txt
} finally { Pop-Location }
Write-Host "Done. Next: .\platform.ps1 overlay"
