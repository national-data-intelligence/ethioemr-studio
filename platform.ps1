# One entry point for the platform stack (team distro + platform overlay). Run from anywhere:
#   .\platform.ps1 up            # start (the first start imports the DB, builds the search index and loads content: an hour or more)
#   .\platform.ps1 content-pass  # fresh install only, once the first start finished: second content pass (team procedure)
#   .\platform.ps1 overlay       # (re)build work/spa-overlay from modules/ (after start, and after a module rebuild)
#   .\platform.ps1 status    # containers and health
#   .\platform.ps1 logs [service]
#   .\platform.ps1 stop      # stop, keep data
#   .\platform.ps1 down      # remove containers, keep data volumes
#   .\platform.ps1 config    # print the merged compose file (validation)
#   .\platform.ps1 demo-check [full]  # before a demo: every service, then a browser walk-through of each demo feature
#   .\platform.ps1 snapshot  # save the loaded database and OpenMRS data to database/snapshots/ (after a full first start):
#                            # 'up' on an empty install then restores it in minutes instead of loading for an hour
param([Parameter(Position = 0)][string]$Command = "status", [Parameter(Position = 1)][string]$Service = "")
# Windows PowerShell 5.1 turns any stderr line of a native command (e.g. a docker warning) into an error;
# keep going and check exit codes instead.
$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot
# The team compose file reads ${HOME}/.m2/settings.xml (build secret); PowerShell does not set HOME.
if (-not $env:HOME) { $env:HOME = $env:USERPROFILE }
$compose = @("compose", "--project-directory", ".", "-f", "distro/docker-compose.yml", "-f", "docker-compose.platform.yml")
if (-not (Test-Path .env)) { Copy-Item .env.example .env; Write-Host "Created .env from .env.example: set AI_SERVICE_API_KEY in it." }
New-Item -ItemType Directory -Force work/spa-overlay/modules | Out-Null

# Data volumes that hold the loaded state (the backend-spa-config volume is refilled from the image on start).
$volumes = @{ "ethioemr-platform_platform-mysql-data" = "mysql-data.tgz"; "ethioemr-platform_openmrs-data" = "openmrs-data.tgz" }
$snapDir = Join-Path $PSScriptRoot "database\snapshots"
$tarImage = "ethioemr-platform/gateway:local"   # any local image with tar (built by this repo)

switch ($Command) {
  "up" {
    $haveSnap = ($volumes.Values | ForEach-Object { Test-Path (Join-Path $snapDir $_) }) -notcontains $false
    $empty = -not (docker volume ls -q --filter "name=ethioemr-platform_platform-mysql-data")
    if ($haveSnap -and $empty) {
      Write-Host "Empty install and a snapshot found: restoring the loaded database and data (skips the hour-long first start)..."
      docker @compose build gateway | Out-Null
      foreach ($v in $volumes.Keys) {
        docker volume create $v | Out-Null
        docker run --rm -v "${v}:/v" -v "${snapDir}:/b:ro" $tarImage sh -c "tar xzf /b/$($volumes[$v]) -C /v"
        if ($LASTEXITCODE) { Write-Error "Restoring $v failed"; exit 1 }
      }
    } elseif (-not (Get-ChildItem database/initial-db/*.sql -ErrorAction SilentlyContinue)) { & "$PSScriptRoot\scripts\get-initial-db.ps1" }
    docker @compose up -d
    Write-Host "Waiting for the EMR to accept logins on http://localhost:$((Get-Content .env | Select-String '^PLATFORM_HTTP_PORT=(.*)').Matches.Groups[1].Value)/openmrs ..."
  }
  "overlay" { python tools/build-spa-overlay.py; docker @compose restart gateway | Out-Null; Write-Host "Overlay served. Refresh the browser." }
  "content-pass" {
    # Fresh install only, once the first start has finished: the Initializer saves checksums even for files that
    # failed, and some content files reference concepts defined in later files, so clear the checksums and restart.
    docker @compose exec backend sh -c "rm -rf /openmrs/data/configuration_checksums"
    docker @compose restart backend
    Write-Host "Second content pass started. Afterwards check: docker logs ethioemr-platform-backend-1 2>&1 | Select-String 'was processed and [0-9]+ out of' (expect no lines)."
  }
  "status"  { docker @compose ps }
  "logs"    { if ($Service) { docker @compose logs -f --tail 100 $Service } else { docker @compose logs -f --tail 50 } }
  "stop"    { docker @compose stop }
  "down"    { docker @compose down }
  "config"  { docker @compose config }
  "snapshot" {
    New-Item -ItemType Directory -Force $snapDir | Out-Null
    Write-Host "Stopping backend and db for a consistent copy..."
    docker @compose stop backend db | Out-Null
    foreach ($v in $volumes.Keys) {
      docker run --rm -v "${v}:/v:ro" -v "${snapDir}:/b" $tarImage sh -c "tar czf /b/$($volumes[$v]).tmp -C /v . && mv /b/$($volumes[$v]).tmp /b/$($volumes[$v])"
      if ($LASTEXITCODE) { Write-Error "Snapshot of $v failed"; exit 1 }
    }
    docker @compose start db backend | Out-Null
    Get-ChildItem $snapDir *.tgz | ForEach-Object { "{0,-18} {1,8:N0} MB" -f $_.Name, ($_.Length / 1MB) }
    Write-Host "Snapshot saved in database\snapshots (git-ignored). Backend restarting (2 to 3 min)."
  }
  "demo-check" {
    # Before a demo: service checks, then the browser walk-through of every demo feature (tools/demo-check).
    # '.\platform.ps1 demo-check full' also runs Form Studio's unit tests and browser tests (about 40 min).
    $envs = @{}; Get-Content .env | Where-Object { $_ -match '^\s*([A-Z_]+)=(.*)$' } | ForEach-Object { $envs[$Matches[1]] = $Matches[2] }
    $port = if ($envs.PLATFORM_HTTP_PORT) { $envs.PLATFORM_HTTP_PORT } else { "18200" }
    $emr = "http://localhost:$port/openmrs"
    $fails = 0
    function Check($name, $ok, $detail) {
      if ($ok) { Write-Host ("PASS {0}  {1}" -f $name, $detail) } else { Write-Host ("FAIL {0}  {1}" -f $name, $detail) -ForegroundColor Red; $script:fails++ }
    }
    $auth = @{ Authorization = "Basic " + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("admin:Admin123")) }
    function Get-Url($url, $headers = @{}) { try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 20 -Headers $headers $url } catch { $null } }
    $ps = docker @compose ps --format "{{.Service}} {{.State}} {{.Health}}"
    $down = $ps | Where-Object { $_ -notmatch ' running' }
    Check "containers" ((@($ps).Count -ge 4) -and -not $down) ($ps -join "; ")
    $s = Get-Url "$emr/ws/rest/v1/session" $auth
    Check "login (REST session)" ($s -and $s.Content -match '"authenticated":true') ""
    $im = Get-Url "$emr/spa/importmap.json"
    Check "Form Studio and AI assistant in the app list" ($im -and $im.Content -match 'esm-form-studio-app' -and $im.Content -match 'esm-ai-assistant-app') ""
    $cfg = Get-Url "$emr/spa/ai-assistant.config.json"
    Check "AI assistant config served" ($cfg -and $cfg.Content -match 'aiServiceApiKey":"[^"]+') "(key not shown)"
    $aiHealth = curl.exe -s -k -m 20 "$($envs.AI_SERVICE_URL)/health"
    Check "AI service reachable" ($aiHealth -match '"status"') $envs.AI_SERVICE_URL
    $asr = Get-Url "http://localhost:8767/health"
    Check "speech service (Speak)" ($asr -and $asr.Content -match '"ok"') $(if ($asr) { ($asr.Content | ConvertFrom-Json).model } else { "not running: services\asr-service\start-asr.ps1" })
    $pt = Get-Url "$emr/ws/rest/v1/patient?q=Almaz%20Bekele" $auth
    Check "demo patient Almaz Bekele" ($pt -and $pt.Content -match '"uuid"') "(create with: node tools\demo-video\setup-demo-data.mjs --with-vitals)"
    node tools/demo-check/ui-check.mjs
    if ($LASTEXITCODE) { $fails++ }
    if ($Service -eq "full") {
      Push-Location modules/esm-form-studio-app
      $yarn = (Get-ChildItem .yarn/releases/yarn-*.cjs | Select-Object -First 1).FullName
      node $yarn test; if ($LASTEXITCODE) { $fails++ }
      $env:E2E_BASE_URL = $emr; $env:E2E_USER_ADMIN_USERNAME = "admin"; $env:E2E_USER_ADMIN_PASSWORD = "Admin123"
      $env:E2E_LOGIN_DEFAULT_LOCATION_UUID = "7f65d926-57d6-4402-ae10-a5b3bcbf7986"
      node node_modules/@playwright/test/cli.js test --project=chromium; if ($LASTEXITCODE) { $fails++ }
      Pop-Location
    }
    if ($fails) { Write-Host "$fails check(s) failed. See docs\platform\DEMO-RUNBOOK.md." -ForegroundColor Red; exit 1 } else { Write-Host "All demo checks passed." }
  }
  default   { Write-Host "Unknown command '$Command'. See the top of platform.ps1." ; exit 1 }
}
