@echo off
title ZEEDAT ERP - Starting Local POS
color 0B

echo =====================================================================
echo                     ZEEDAT ERP - LOCAL LAUNCHER
echo =====================================================================
echo.

set PHP_EXE=C:\xampp\php\php.exe

rem Check if PHP server on 8081 is already running
netstat -ano | findstr "8081" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [INFO] Zeedat local backend is already active on port 8081.
) else (
    echo [INFO] Starting Zeedat local backend server...
    start /B "" "%PHP_EXE%" -S 127.0.0.1:8081 router.php >nul 2>&1
    timeout /t 2 /nobreak >nul
)

rem Trigger auto-sync once at startup
start /B "" "%PHP_EXE%" scripts\auto_backup.php --quiet

echo.
echo Opening Zeedat ERP in your default browser...
start http://127.0.0.1:8081

echo.
echo Zeedat ERP is running locally. You can close this window.
timeout /t 3 >nul
exit
