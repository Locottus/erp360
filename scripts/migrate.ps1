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

$ledgerExists = docker exec $Container psql -U erp360 -d $Database -tAc "SELECT to_regclass('public.migration_ledger') IS NOT NULL"
if ($LASTEXITCODE -ne 0) { throw "Could not inspect the migration ledger." }
if ($ledgerExists.Trim() -ne "t") {
  $schemaExists = docker exec $Container psql -U erp360 -d $Database -tAc "SELECT COUNT(*) > 0 FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'"
  if ($LASTEXITCODE -ne 0) { throw "Could not inspect the database schema." }
  if ($schemaExists.Trim() -eq "t") {
    throw "The database has an existing ERP schema without migration_ledger. Establish the ledger manually before running migrations."
  }

  docker exec $Container psql -v ON_ERROR_STOP=1 -U erp360 -d $Database -c @"
CREATE TABLE migration_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename VARCHAR(128) NOT NULL UNIQUE,
  sha256 CHAR(64) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_by VARCHAR(128) NOT NULL DEFAULT 'operator',
  environment VARCHAR(32) NOT NULL DEFAULT 'local',
  rollback_backup_path TEXT
);
"@
  if ($LASTEXITCODE -ne 0) { throw "Could not initialize the migration ledger." }
}

foreach ($file in $files) {
  $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLower()
  $filenameEscaped = $file.Name.Replace("'","''")
  [string]$recordedHash = docker exec $Container psql -U erp360 -d $Database -tAc "SELECT sha256 FROM migration_ledger WHERE filename='$filenameEscaped'"
  if ($LASTEXITCODE -ne 0) { throw "Could not inspect migration '$($file.Name)'." }
  if ($recordedHash -and $recordedHash.Trim()) {
    if ($recordedHash.Trim() -ne $hash) {
      throw "Migration '$($file.Name)' no longer matches the recorded SHA-256."
    }
    continue
  }

  if ($Environment -ne "validation") {
    $backup = & (Join-Path $PSScriptRoot "backup.ps1") -Container $Container -Database $Database
  } else {
    $backup = $null
  }
  Get-Content -LiteralPath $file.FullName -Raw |
    docker exec -i $Container psql -v ON_ERROR_STOP=1 -U erp360 -d $Database
  if ($LASTEXITCODE -ne 0) { throw "Migration failed: $($file.Name)" }

  $hashEscaped = $hash.Replace("'","''")
  $backupText = if ($null -eq $backup) { "" } else { [string]$backup }
  $backupEscaped = $backupText.Replace("'","''")
  $appliedBy = if ($env:USERNAME) { $env:USERNAME.Replace("'","''") } else { "operator" }
  docker exec $Container psql -U erp360 -d $Database -v ON_ERROR_STOP=1 -c "INSERT INTO migration_ledger(filename,sha256,applied_by,environment,rollback_backup_path) VALUES('$filenameEscaped','$hashEscaped','$appliedBy','$Environment',NULLIF('$backupEscaped',''))"
  if ($LASTEXITCODE -ne 0) { throw "Could not record migration '$($file.Name)'." }
  Write-Output "Applied $($file.Name)"
}
