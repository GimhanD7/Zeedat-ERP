param([string]$InstallDir)

$ErrorActionPreference = 'Stop'
if (Get-Process -Name 'Zeedat POS' -ErrorAction SilentlyContinue) {
    throw 'Close Zeedat POS before running this script.'
}

$database = Join-Path $env:LOCALAPPDATA 'ZeedatPOS/data/zeedat_local.db'
if (-not (Test-Path -LiteralPath $database -PathType Leaf)) {
    throw 'The local Zeedat database was not found for this Windows user.'
}

if (-not $InstallDir) {
    foreach ($candidate in @(
        (Join-Path $env:LOCALAPPDATA 'Programs/Zeedat POS'),
        (Join-Path $env:ProgramFiles 'Zeedat POS')
    )) {
        if (Test-Path -LiteralPath (Join-Path $candidate 'resources/runtime/php/php.exe')) {
            $InstallDir = $candidate
            break
        }
    }
}
if (-not $InstallDir) {
    $InstallDir = (Read-Host 'Enter the folder containing the installed Zeedat POS.exe').Trim().Trim('"')
}
$phpDir = Join-Path $InstallDir 'resources/runtime/php'
$php = Join-Path $phpDir 'php.exe'
if (-not (Test-Path -LiteralPath $php -PathType Leaf)) {
    throw 'Bundled PHP was not found in that installation folder.'
}

$code = @'
<?php
$path = getenv('ZEEDAT_RECOVERY_DB');
if (!$path || !is_file($path)) exit(1);
$db = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$db->exec('PRAGMA busy_timeout=5000');
$password = bin2hex(random_bytes(14));
$update = $db->prepare("UPDATE users SET password_hash=? WHERE email='owner@zeedat.local' AND role='owner' AND active=1");
$update->execute([password_hash($password, PASSWORD_DEFAULT)]);
if ($update->rowCount() !== 1) {
    fwrite(STDERR, "Active local setup owner account was not found. No password was changed.\n");
    exit(1);
}
echo "Local email: owner@zeedat.local\nTemporary password: $password\n";
'@

$env:ZEEDAT_RECOVERY_DB = $database
try {
    $code | & $php -n -d "extension_dir=$(Join-Path $phpDir 'ext')" -d extension=pdo_sqlite
    if ($LASTEXITCODE -ne 0) { throw 'Local owner recovery failed.' }
} finally {
    Remove-Item Env:ZEEDAT_RECOVERY_DB -ErrorAction SilentlyContinue
}
