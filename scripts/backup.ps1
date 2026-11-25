param(
  [string]$BackupDirectory = ".\backups",
  [switch]$IncludeDump,
  [string]$Container = "erp360-db",
  [string]$Database = "erp360"
)

$ErrorActionPreference = "Stop"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$directory = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$target = if ([IO.Path]::IsPathRooted($BackupDirectory)) {
  $BackupDirectory
} else {
  Join-Path $directory $BackupDirectory
}
New-Item -ItemType Directory -Force -Path $target | Out-Null
$containerPath = "/tmp/erp360-$timestamp.backup"
$databaseFileName = [regex]::Replace($Database, "[^A-Za-z0-9._-]", "_")
$hostPath = Join-Path $target "$databaseFileName-$timestamp.backup"

docker exec $Container pg_dump -U erp360 -d $Database -Fc -f $containerPath
if ($LASTEXITCODE -ne 0) { throw "Database dump failed." }
docker cp "${Container}:${containerPath}" $hostPath
if ($LASTEXITCODE -ne 0) { throw "Could not copy database backup." }
docker exec $Container rm -f $containerPath

if ($IncludeDump) {
  $dumpPath = Join-Path $target "$databaseFileName-$timestamp.sql"
  docker exec $Container pg_dump -U erp360 -d $Database --clean --if-exists > $dumpPath
}

Write-Output $hostPath
