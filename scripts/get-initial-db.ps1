# Put the starting database into database/initial-db/ (git-ignored). MySQL runs every .sql there, in name order,
# the first time the platform starts on an empty database volume. Team install order:
#   10_base.sql   the base EthioEMR database (openmrs_initial_db_v8_20260910.sql, about 180 MB, made on MySQL 8.0.45)
#   20_icd11.sql  the ICD-11 diagnoses (icd11_diagnosis_full.sql), optional
# Neither file is in git (too large). Ask the team for them and pass their paths:
#   .\scripts\get-initial-db.ps1 -BaseDump <path to the v8 dump> [-Icd11 <path to icd11_diagnosis_full.sql>]
param(
  [string]$BaseDump = (Join-Path $PSScriptRoot "..\..\ethioemr-form-studio\database\initial-db\openmrs_initial_db_v8_20260910.sql"),
  [string]$Icd11 = (Join-Path $PSScriptRoot "..\database\scripts\icd11_diagnosis_full.sql")
)
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$target = Join-Path $root "database\initial-db"
New-Item -ItemType Directory -Force $target | Out-Null
if (-not (Test-Path $BaseDump)) {
  Write-Error "Base dump not found at $BaseDump. Ask the team for openmrs_initial_db_v8_20260910.sql and pass -BaseDump <path>."
}
Get-ChildItem $target -Filter *.sql | Remove-Item     # only these two may be there
Copy-Item $BaseDump (Join-Path $target "10_base.sql")
if (Test-Path $Icd11) { Copy-Item $Icd11 (Join-Path $target "20_icd11.sql") } else { Write-Host "No ICD-11 file at $Icd11; starting without the ICD-11 diagnoses." }
Get-ChildItem $target -Filter *.sql | ForEach-Object { "{0,-14} {1,8:N0} KB" -f $_.Name, ($_.Length / 1KB) }
Write-Host "Initial DB ready (loaded on the first start of an empty database)."
