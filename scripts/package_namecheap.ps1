$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$distDir = Join-Path $root 'dist'
$releaseDir = Join-Path $root 'release'
$stagingDir = Join-Path $releaseDir '_namecheap_staging'
$zipPath = Join-Path $releaseDir 'zeedat-namecheap-upload.zip'

if (-not (Test-Path $distDir)) {
    throw "Missing dist/ directory. Run 'npm run build' first."
}

if (Test-Path $stagingDir) { Remove-Item -Recurse -Force $stagingDir }
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
New-Item -ItemType Directory -Force -Path $stagingDir | Out-Null
New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null

# 1. Root files
Copy-Item (Join-Path $root '.htaccess') (Join-Path $stagingDir '.htaccess')

# 2. Frontend production bundle (dist/)
Copy-Item -Recurse $distDir (Join-Path $stagingDir 'dist')

# 3. API backend (excluding local config.php if any)
$apiDest = Join-Path $stagingDir 'api'
New-Item -ItemType Directory -Force -Path $apiDest | Out-Null
Copy-Item (Join-Path $root 'api\index.php') (Join-Path $apiDest 'index.php')
Copy-Item (Join-Path $root 'api\config.example.php') (Join-Path $apiDest 'config.example.php')
Copy-Item (Join-Path $root 'api\composer.json') (Join-Path $apiDest 'composer.json')
Copy-Item -Recurse (Join-Path $root 'api\public') (Join-Path $apiDest 'public')
Copy-Item -Recurse (Join-Path $root 'api\src') (Join-Path $apiDest 'src')

# 4. Schema files only (exclude local SQLite db & demo raw dump)
$dbDest = Join-Path $stagingDir 'database'
New-Item -ItemType Directory -Force -Path $dbDest | Out-Null
Copy-Item (Join-Path $root 'database\schema.sql') (Join-Path $dbDest 'schema.sql')
if (Test-Path (Join-Path $root 'database\sqlite_schema.sql')) {
    Copy-Item (Join-Path $root 'database\sqlite_schema.sql') (Join-Path $dbDest 'sqlite_schema.sql')
}

# Build ZIP using forward slashes so Linux/cPanel extracts clean folder structure
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    $files = Get-ChildItem -Path $stagingDir -Recurse -File
    foreach ($f in $files) {
        $rel = $f.FullName.Substring($stagingDir.Length + 1).Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $f.FullName, $rel, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
} finally {
    $zip.Dispose()
}

Remove-Item -Recurse -Force $stagingDir
$sizeMb = [Math]::Round((Get-Item $zipPath).Length / 1MB, 2)
Write-Host "[OK] Namecheap package created: $zipPath ($sizeMb MB)"
