# Zeedat ERP - Background Auto-Sync & Backup Daemon
# Monitors internet connection and automatically synchronizes local branch data to the cloud server.

param (
    [switch]$Loop = $false,
    [int]$IntervalMinutes = 15
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $scriptDir
$phpExe = "C:\xampp\php\php.exe"
if (-not (Test-Path $phpExe)) {
    $phpExe = "php.exe"
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Zeedat ERP - Local Offline & Auto Cloud Backup Service" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

function Run-ZeedatBackup {
    $now = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$now] Checking network and backing up local database..." -ForegroundColor Yellow
    
    # Test network connectivity
    $isOnline = $false
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $iar = $tcp.BeginConnect("8.8.8.8", 53, $null, $null)
        $wait = $iar.AsyncWaitHandle.WaitOne(2000, $false)
        if ($wait -and $tcp.Connected) {
            $isOnline = $true
            $tcp.EndConnect($iar)
        }
        $tcp.Close()
    } catch {
        $isOnline = $false
    }

    if ($isOnline) {
        Write-Host "[$now] Internet: CONNECTED (Will sync to cloud if remote URL is configured)" -ForegroundColor Green
    } else {
        Write-Host "[$now] Internet: OFFLINE (Saving full backup to local machine disk)" -ForegroundColor DarkYellow
    }

    & $phpExe "$projectDir\scripts\auto_backup.php"
}

if ($Loop) {
    Write-Host "Starting continuous background monitor (Runs every $IntervalMinutes minutes)..." -ForegroundColor Green
    while ($true) {
        Run-ZeedatBackup
        Start-Sleep -Seconds ($IntervalMinutes * 60)
    }
} else {
    Run-ZeedatBackup
}
