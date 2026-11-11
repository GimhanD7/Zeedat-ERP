param(
    [string]$PhpRoot = 'C:/xampp/php',
    [string]$CaBundle = 'C:/xampp/apache/bin/curl-ca-bundle.crt'
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
node scripts/build_patch.mjs
if ($LASTEXITCODE -ne 0) { throw 'Update manifest build failed.' }

$staging = Join-Path $repo ('.local/desktop-' + [guid]::NewGuid().ToString('N'))
$payload = Join-Path $staging 'payload'
New-Item -ItemType Directory -Force "$payload/php/ext","$payload/api/public","$payload/database","$payload/scripts","$payload/updates" | Out-Null
Copy-Item updates/patch-manifest.json "$payload/updates/"
Copy-Item dist "$payload/dist" -Recurse
Copy-Item api/src "$payload/api/src" -Recurse
Copy-Item api/index.php "$payload/api/index.php"
Copy-Item api/public/index.php "$payload/api/public/index.php"
Copy-Item database/sqlite_schema.sql "$payload/database/sqlite_schema.sql"
Copy-Item scripts/setup_portable.php,scripts/auto_sync_sqlite.php "$payload/scripts/"
Copy-Item router.php "$payload/router.php"

# Include only PHP runtime files and the extensions used by the local SQLite app.
Copy-Item "$PhpRoot/php.exe","$PhpRoot/php8ts.dll","$PhpRoot/license.txt" "$payload/php/"
foreach ($file in @('libcrypto-3-x64.dll','libssl-3-x64.dll','libsqlite3.dll','libssh2.dll','nghttp2.dll')) {
    Copy-Item "$PhpRoot/$file" "$payload/php/"
}
foreach ($extension in @('pdo_sqlite','sqlite3','curl','mbstring','openssl','fileinfo')) {
    Copy-Item "$PhpRoot/ext/php_$extension.dll" "$payload/php/ext/"
}
Copy-Item -LiteralPath $CaBundle -Destination "$payload/php/cacert.pem"

$phpArguments = @('-n', '-d', "extension_dir=$payload/php/ext")
foreach ($extension in @('pdo_sqlite','sqlite3','curl','mbstring','openssl','fileinfo')) {
    $phpArguments += @('-d', "extension=$extension")
}
$modules = & "$payload/php/php.exe" @phpArguments -m
if ($LASTEXITCODE -ne 0 -or 'pdo_sqlite' -notin $modules -or 'curl' -notin $modules -or 'mbstring' -notin $modules) {
    throw 'Bundled PHP extensions could not load.'
}

$archive = Join-Path $staging 'ZeedatRuntime.zip'
Compress-Archive -Path "$payload/*" -DestinationPath $archive -CompressionLevel Optimal
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$exe = Join-Path $staging 'Zeedat POS Portable.exe'
$sources = @((Join-Path $repo 'launcher/ZeedatPOS.cs'), (Join-Path $repo 'launcher/PortableRuntime.cs'))
& $compiler /nologo /target:winexe /platform:x64 "/out:$exe" "/resource:$archive,ZeedatRuntime.zip" /reference:System.Windows.Forms.dll /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll /reference:System.Web.Extensions.dll @sources
if ($LASTEXITCODE -ne 0) { throw 'Portable launcher compilation failed.' }
Copy-Item -LiteralPath $exe -Destination 'release/Zeedat POS Portable.exe' -Force
Get-Item -LiteralPath 'release/Zeedat POS Portable.exe' | Select-Object FullName,Length
