@echo off
title ZEEDAT POS - Standalone Desktop App Builder
color 0A

echo =====================================================================
echo          ZEEDAT POS - STANDALONE WINDOWS APP BUILDER (.EXE)
echo       Builds Standalone Executable (No XAMPP/MySQL on Cashier PC)
echo =====================================================================
echo.

cd /d "%~dp0"

set CSC_EXE=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe

if not exist "%CSC_EXE%" (
    echo [ERROR] Windows native C# compiler not found at:
    echo %CSC_EXE%
    pause
    exit /b 1
)

echo [1/3] Compiling React POS application...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo [ERROR] React build failed.
    pause
    exit /b 1
)

echo.
echo [2/3] Compiling Native Windows Executable (Zeedat POS.exe)...
if not exist "release" mkdir "release"

"%CSC_EXE%" /target:winexe /out:"release\Zeedat POS.exe" /reference:System.Windows.Forms.dll /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll launcher\ZeedatPOS.cs launcher\PortableRuntime.cs

if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to compile Zeedat POS.exe.
    pause
    exit /b 1
)

echo [OK] Compiled: release\Zeedat POS.exe

echo.
echo [3/3] Preparing Cashier Distribution Package...
if not exist "release\config.json" (
    (
        echo {
        echo   "server_url": "http://127.0.0.1:8081",
        echo   "window_width": 1280,
        echo   "window_height": 800,
        echo   "kiosk_mode": false
        echo }
    ) > "release\config.json"
)

(
    echo ================================================================
    echo ZEEDAT POS - CASHIER DESKTOP APP INSTRUCTIONS
    echo ================================================================
    echo.
    echo 1. HOW TO RUN:
    echo    Double-click "Zeedat POS.exe" to launch the POS.
    echo.
    echo 2. CONNECTING TO CLOUD / SERVER:
    echo    Open "config.json" in Notepad and change "server_url" to your
    echo    server address ^(for example: "https://your-cloud-url.com"^).
    echo.
    echo 3. OFFLINE CAPABILITY:
    echo    - Does NOT require XAMPP or MySQL on this cashier PC.
    echo    - If internet disconnects, billing and barcode scanning
    echo      continue normally.
    echo    - When internet reconnects, sales automatically sync!
    echo ================================================================
) > "release\README_CASHIER.txt"

echo.
echo =====================================================================
echo                       BUILD COMPLETE!
echo =====================================================================
echo.
echo The standalone cashier desktop app is ready in:
echo   %~dp0release\
echo.
echo Inside the release folder:
echo   - Zeedat POS.exe      ^(Standalone Desktop App^)
echo   - config.json         ^(Server URL config^)
echo   - README_CASHIER.txt  ^(Instructions^)
echo.
echo You can copy this "release" folder to any cashier computer!
echo.
explorer "%~dp0release"
pause
