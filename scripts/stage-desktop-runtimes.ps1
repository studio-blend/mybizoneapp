$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$stage = Join-Path $repoRoot 'dist/desktop'
$downloads = Join-Path $repoRoot '.cache/release-runtimes'
New-Item -ItemType Directory -Force -Path $stage, $downloads | Out-Null

function Get-VerifiedArchive([string]$Url, [string]$Hash, [string]$Name, [string]$ExpectedHost) {
    if (!$Url -or $Hash -notmatch '^[a-fA-F0-9]{64}$') { throw "$Name requires an explicit URL and SHA-256" }
    $uri = [uri]$Url
    if ($uri.Scheme -ne 'https' -or $uri.Host -ne $ExpectedHost) { throw "$Name must use HTTPS from $ExpectedHost" }
    $archive = Join-Path $downloads "$Name.zip"
    Invoke-WebRequest -Uri $Url -OutFile $archive
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $Hash) { throw "$Name checksum mismatch" }
    $destination = Join-Path $downloads "$Name-expanded"
    Expand-Archive -LiteralPath $archive -DestinationPath $destination -Force
    return $destination
}

if ([string]::IsNullOrWhiteSpace($env:SELLER_LICENSE_TEXT)) { throw 'Seller-approved LICENSE text is required' }
$nodeExtract = Get-VerifiedArchive $env:NODE_RUNTIME_URL $env:NODE_RUNTIME_SHA256 'node' 'nodejs.org'
$pgExtract = Get-VerifiedArchive $env:POSTGRES_RUNTIME_URL $env:POSTGRES_RUNTIME_SHA256 'postgres' 'get.enterprisedb.com'
$nodeBinary = @(Get-ChildItem -LiteralPath $nodeExtract -Filter node.exe -Recurse)
if ($nodeBinary.Count -ne 1) { throw 'Expected exactly one Node.js Windows binary' }
Copy-Item -LiteralPath $nodeBinary[0].Directory.FullName -Destination (Join-Path $stage 'node') -Recurse -Force
Copy-Item -LiteralPath (Join-Path $pgExtract 'pgsql') -Destination (Join-Path $stage 'postgres') -Recurse -Force
foreach ($required in @('node/node.exe', 'postgres/bin/postgres.exe', 'postgres/bin/pg_dump.exe', 'postgres/bin/psql.exe', 'app/apps/web/server.js', 'app/scripts/migrate.mjs')) {
    if (!(Test-Path -LiteralPath (Join-Path $stage $required))) { throw "Missing runtime file: $required" }
}
[IO.File]::WriteAllText((Join-Path $stage 'LICENSE.txt'), $env:SELLER_LICENSE_TEXT)
Write-Output 'Verified Windows runtimes and seller license staged.'
