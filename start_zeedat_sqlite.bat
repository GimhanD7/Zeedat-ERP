@echo off
title ZEEDAT POS - Starting Local Offline Station
color 0B

echo =====================================================================
echo           ZEEDAT POS - LOCAL OFFLINE STATION (SQLITE)
echo       Zero MySQL / Zero XAMPP / 100%% Offline + Cloud Auto-Sync
echo =====================================================================
echo.

cd /d "%~dp0"

set PHP_EXE=C:\xampp\php\php.exe
if not exist "%PHP_EXE%" (
    set PHP_EXE=php.exe
)

rem 1. Ensure local SQLite database exists
if not exist "database\zeedat_local.db" (
    echo [INFO] First time initialization: creating local SQLite database
    "%PHP_EXE%" database\setup_sqlite.php
)

rem 2. Set DB_DRIVER to sqlite for this session
set DB_DRIVER=sqlite

rem 3. Start local backend server on port 8081 if not already running
netstat -ano | findstr "8081" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [INFO] Zeedat local backend is already active on port 8081.
) else (
    echo [INFO] Starting local PHP server on SQLite database
    start /B "" "%PHP_EXE%" -S 127.0.0.1:8081 router.php >nul 2>&1
    timeout /t 2 /nobreak >nul
)

rem 4. Run background auto-sync check once at startup
start /B "" "%PHP_EXE%" scripts\auto_sync_sqlite.php --quiet

rem 5. Launch Desktop POS
if exist "release\Zeedat POS.exe" (
    echo [OK] Launching Zeedat POS Desktop Application
    start "" "release\Zeedat POS.exe"
) else (
    echo [OK] Opening in your default browser
    start http://127.0.0.1:8081
)

echo.
echo Zeedat POS is running smoothly!
echo Data is saved directly in: database\zeedat_local.db
timeout /t 3 >nul
exit
