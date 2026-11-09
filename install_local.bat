@echo off
title ZEEDAT ERP - Local Machine Installer
color 0A

echo =====================================================================
echo               ZEEDAT ERP - LOCAL MACHINE SETUP
echo       Works 100%% Offline + Auto Cloud Backup When Online
echo =====================================================================
echo.

set PHP_EXE=C:\xampp\php\php.exe
set MYSQL_EXE=C:\xampp\mysql\bin\mysql.exe

if not exist "%PHP_EXE%" (
    echo [ERROR] PHP was not found at C:\xampp\php\php.exe.
    echo Please install XAMPP with PHP 8.2+ to continue.
    pause
    exit /b 1
)

echo [1/4] Checking local MySQL service...
"%MYSQL_EXE%" -h 127.0.0.1 -u root -e "SELECT 1;" >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [WARNING] Local MySQL is not running or password required.
    echo Please start MySQL in XAMPP Control Panel.
    echo.
) else (
    echo [OK] MySQL is active!
)

echo [2/4] Running database migrations...
"%PHP_EXE%" database\migrations\add_backup_logs.php
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Migration failed. Check MySQL.
    pause
    exit /b 1
)

echo [3/4] Ensuring backups directory exists...
if not exist "backups" mkdir "backups"

echo [4/4] Creating Windows Auto-Backup Scheduled Task (Runs every 15 mins)...
schtasks /create /tn "ZeedatAutoBackup" /tr "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File \"%~dp0scripts\zeedat_auto_sync.ps1\"" /sc minute /mo 15 /f >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [OK] Windows Scheduled Task "ZeedatAutoBackup" registered!
    echo      The system will silently backup every 15 minutes and sync to the cloud.
) else (
    echo [INFO] Task Scheduler registration skipped (requires Run as Administrator).
    echo        Auto-backup can also run directly from within the app.
)

echo.
echo =====================================================================
echo           SETUP COMPLETE! ZEEDAT ERP IS READY LOCALLY!
echo =====================================================================
echo.
echo You can now double-click "start_zeedat.bat" to launch the system.
echo.
pause
