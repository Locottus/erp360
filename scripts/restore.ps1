param(
  [Parameter(Mandatory=$true)]
  [string]$BackupPath,
  [string]$DatabaseName = "erp360"
)

$ErrorActionPreference = "Stop"
if (!(Test-Path -LiteralPath $BackupPath)) { throw "Backup file not found: $BackupPath" }
$resolved = (Resolve-Path -LiteralPath $BackupPath).Path
$container = "erp360-db"
$containerPath = "/tmp/erp360-restore.backup"
docker cp $resolved "${container}:${containerPath}"
if ($LASTEXITCODE -ne 0) { throw "Could not copy backup to database container." }
docker exec $container pg_restore --clean --if-exists --no-owner --no-privileges -U erp360 -d $DatabaseName $containerPath
if ($LASTEXITCODE -ne 0) { throw "Database restore failed." }
docker exec $container rm -f $containerPath
Write-Output "Restore completed for $DatabaseName"
