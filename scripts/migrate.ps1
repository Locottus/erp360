param(
  [ValidateSet("local","validation","production")]
  [string]$Environment = "local",
  [string]$Container = "erp360-db",
  [string]$Database = "erp360"
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$migrationDirectory = Join-Path $root "database\migrations"
$files = Get-ChildItem -LiteralPath $migrationDirectory -Filter "*.sql" | Sort-Object Name

foreach ($file in $files) {
  $ledgerExists = docker exec $Container psql -U erp360 -d $Database -tAc "SELECT to_regclass('public.migration_ledger') IS NOT NULL"
  if ($ledgerExists.Trim() -ne "t") {
    # 0036 is the migration that creates the ledger. Before it exists, apply files in order.
  } else {
    $applied = docker exec $Container psql -U erp360 -d $Database -tAc "SELECT EXISTS(SELECT 1 FROM migration_ledger WHERE filename='$($file.Name)')"
    if ($applied.Trim() -eq "t") { continue }
  }

  if ($Environment -ne "validation") {
    $backup = & (Join-Path $PSScriptRoot "backup.ps1")
  } else {
    $backup = $null
  }
  $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLower()
  Get-Content -LiteralPath $file.FullName -Raw |
    docker exec -i $Container psql -v ON_ERROR_STOP=1 -U erp360 -d $Database
  if ($LASTEXITCODE -ne 0) { throw "Migration failed: $($file.Name)" }

  $ledgerExists = docker exec $Container psql -U erp360 -d $Database -tAc "SELECT to_regclass('public.migration_ledger') IS NOT NULL"
  if ($ledgerExists.Trim() -eq "t") {
    $hashEscaped = $hash.Replace("'","''")
    $backupEscaped = ($backup ?? "").Replace("'","''")
    docker exec $Container psql -U erp360 -d $Database -v ON_ERROR_STOP=1 -c "INSERT INTO migration_ledger(filename,sha256,applied_by,environment,rollback_backup_path) VALUES('$($file.Name)','$hashEscaped','$env:USERNAME','$Environment',NULLIF('$backupEscaped','')) ON CONFLICT(filename) DO NOTHING"
  }
  Write-Output "Applied $($file.Name)"
}
