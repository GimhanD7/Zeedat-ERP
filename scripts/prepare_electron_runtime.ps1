param(
    [string]$PhpRoot = 'C:/xampp/php',
    [string]$CaBundle = 'C:/xampp/apache/bin/curl-ca-bundle.crt'
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo

if (-not (Test-Path 'dist/index.html')) {
    throw "Missing dist/index.html. Run 'npm run build' first."
}

& node (Join-Path $repo 'scripts/build_patch.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Failed to build patch metadata.' }

$runtimeDir = Join-Path $repo 'electron-runtime'
if (Test-Path $runtimeDir) { Remove-Item -Recurse -Force $runtimeDir }

$phpDest = Join-Path $runtimeDir 'php'
$appDest = Join-Path $runtimeDir 'app'
New-Item -ItemType Directory -Force "$phpDest/ext", "$appDest/api/public", "$appDest/database", "$appDest/scripts", "$appDest/updates" | Out-Null

# App runtime files (mirrors patch payload layout)
Copy-Item 'dist' "$appDest/dist" -Recurse
Copy-Item 'api/src' "$appDest/api/src" -Recurse
Copy-Item 'api/index.php' "$appDest/api/index.php"
Copy-Item 'api/composer.json' "$appDest/api/composer.json"
Copy-Item 'api/public/index.php' "$appDest/api/public/index.php"
Copy-Item 'database/schema.sql' "$appDest/database/schema.sql"
Copy-Item 'database/sqlite_schema.sql' "$appDest/database/sqlite_schema.sql"
Copy-Item 'database/setup.php' "$appDest/database/setup.php"
Copy-Item 'scripts/setup_portable.php', 'scripts/auto_sync_sqlite.php' "$appDest/scripts/"
Copy-Item 'router.php' "$appDest/router.php"
Copy-Item 'updates/patch-manifest.json' "$appDest/updates/patch-manifest.json"

# Bundled PHP runtime + required extensions
Copy-Item "$PhpRoot/php.exe", "$PhpRoot/php8ts.dll", "$PhpRoot/license.txt" "$phpDest/"
foreach ($file in @('libcrypto-3-x64.dll', 'libssl-3-x64.dll', 'libsqlite3.dll', 'libssh2.dll', 'nghttp2.dll')) {
    Copy-Item "$PhpRoot/$file" "$phpDest/"
}
$bundledExtensions = @('pdo_sqlite', 'sqlite3', 'pdo_mysql', 'mysqli', 'curl', 'mbstring', 'openssl', 'fileinfo')
foreach ($extension in $bundledExtensions) {
    Copy-Item "$PhpRoot/ext/php_$extension.dll" "$phpDest/ext/"
}
Copy-Item -LiteralPath $CaBundle -Destination "$phpDest/cacert.pem"

$phpArgs = @('-n', '-d', "extension_dir=$phpDest/ext")
foreach ($extension in $bundledExtensions) {
    $phpArgs += @('-d', "extension=$extension")
}
$modules = & "$phpDest/php.exe" @phpArgs -m
if ($LASTEXITCODE -ne 0 -or 'pdo_sqlite' -notin $modules -or 'pdo_mysql' -notin $modules -or 'curl' -notin $modules -or 'mbstring' -notin $modules) {
    throw 'Bundled PHP extensions failed verification.'
}

# Ensure Windows icon assets exist for Electron shell and NSIS installer
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repo 'scripts/generate_icon.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Icon generation failed.' }

Write-Host "[OK] Electron runtime staged in $runtimeDir"
