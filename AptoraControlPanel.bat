@echo off
title Aptora Management Control Panel
color 0F
cd /d "%~dp0"

:: Get ESC character for ANSI colors
for /F "tokens=1,2 delims=#" %%a in ('"prompt #$H#$E# & echo on & for %%b in (1) do rem"') do set "ESC=%%b"

:menu
cls
echo ===========================================================
echo             APTORA SERVICE CONTROL PANEL                  
echo ===========================================================
echo.

:: Check Server Status
netstat -aon | findstr :9372 | findstr LISTENING >nul 2>&1
if %errorlevel% neq 0 (
    echo  Server Status:   [%ESC%[91m STOPPED %ESC%[0m] - Offline
    set "SERVER_RUNNING=0"
) else (
    echo  Server Status:   [%ESC%[92m RUNNING %ESC%[0m] - Online on Port 9372
    set "SERVER_RUNNING=1"
)

:: Check Auto-Start registry key status
reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "AptoraServer" >nul 2>&1
if %errorlevel% neq 0 (
    echo  Auto-Start:      [%ESC%[91m DISABLED %ESC%[0m] - Will not run on Windows logon
    set "AUTO_START=0"
) else (
    echo  Auto-Start:      [%ESC%[92m ENABLED %ESC%[0m] - Will run silently on Windows logon
    set "AUTO_START=1"
)
echo.
echo ===========================================================
echo  1. Start Server (Silently in background)
echo  2. Stop Server (Release port 9372)
echo  3. Restart Server
echo  4. Enable Auto-Start on Windows Logon
echo  5. Disable Auto-Start
echo  6. Open Web Application (http://localhost:9372)
echo  7. Reset Admin Credentials / 2FA Settings
echo  8. Exit Panel
echo ===========================================================
echo.

set /p choice="Select an option (1-8): "

if "%choice%"=="1" goto start_server
if "%choice%"=="2" goto stop_server
if "%choice%"=="3" goto restart_server
if "%choice%"=="4" goto enable_autostart
if "%choice%"=="5" goto disable_autostart
if "%choice%"=="6" goto open_app
if "%choice%"=="7" goto reset_admin
if "%choice%"=="8" exit /b 0
goto menu

:start_server
if "%SERVER_RUNNING%"=="1" (
    echo Server is already running.
    timeout /t 2 >nul
    goto menu
)
echo Starting Aptora Server silently in the background...
start "" wscript.exe "%~dp0run-silent.vbs"
timeout /t 3 >nul
goto menu

:stop_server
if "%SERVER_RUNNING%"=="0" (
    echo Server is already stopped.
    timeout /t 2 >nul
    goto menu
)
echo Stopping Aptora Server...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :9372 ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1
echo Port 9372 released.
timeout /t 2 >nul
goto menu

:restart_server
echo Restarting server...
if "%SERVER_RUNNING%"=="1" (
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr :9372 ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1
)
start "" wscript.exe "%~dp0run-silent.vbs"
timeout /t 3 >nul
goto menu

:enable_autostart
echo Enabling Auto-Start on Windows Logon...
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "AptoraServer" /t REG_SZ /d "\"%~dp0run-silent.vbs\"" /f >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Failed to write to Registry. Try running this Control Panel as Administrator.
    pause
) else (
    echo Auto-Start enabled successfully.
    timeout /t 2 >nul
)
goto menu

:disable_autostart
echo Disabling Auto-Start...
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "AptoraServer" /f >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo Auto-Start registry key not found or failed to delete.
    timeout /t 2 >nul
) else (
    echo Auto-Start disabled successfully.
    timeout /t 2 >nul
)
goto menu

:open_app
if "%SERVER_RUNNING%"=="0" (
    echo Server is stopped. Launching server first...
    start "" wscript.exe "%~dp0run-silent.vbs"
    timeout /t 3 >nul
)
echo Launching default web browser...
start http://localhost:9372
goto menu

:reset_admin
cls
echo ===========================================================
echo       RESET ADMINISTRATOR CREDENTIALS OR 2FA SETTINGS
echo ===========================================================
echo.
:: Locate node execution command (prefer bundled node)
set "NODE_CMD=node"
if exist "%~dp0bin\node.exe" (
    set "NODE_CMD="%~dp0bin\node.exe""
)
call %NODE_CMD% "%~dp0server\reset-admin.js"
if %errorlevel% neq 0 (
    echo.
    echo Operation failed.
)
echo.
pause
goto menu
