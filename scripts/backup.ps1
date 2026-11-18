param(
  [string]$BackupDirectory = ".\backups",
  [switch]$IncludeDump
)

$ErrorActionPreference = "Stop"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$directory = Resolve-Path -LiteralPath $PSScriptRoot | ForEach-Object { Join-Path $_ ".." } | Resolve-Path
$target = Join-Path $directory $BackupDirectory
New-Item -ItemType Directory -Force -Path $target | Out-Null
$container = "erp360-db"
$containerPath = "/tmp/erp360-$timestamp.backup"
$hostPath = Join-Path $target "erp360-$timestamp.backup"

docker exec $container pg_dump -U erp360 -d erp360 -Fc -f $containerPath
if ($LASTEXITCODE -ne 0) { throw "Database dump failed." }
docker cp "${container}:${containerPath}" $hostPath
if ($LASTEXITCODE -ne 0) { throw "Could not copy database backup." }
docker exec $container rm -f $containerPath

if ($IncludeDump) {
  $dumpPath = Join-Path $target "erp360-$timestamp.sql"
  docker exec $container pg_dump -U erp360 -d erp360 --clean --if-exists > $dumpPath
}

Write-Output $hostPath
