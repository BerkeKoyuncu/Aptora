@echo off
setlocal EnableExtensions
cd /d "%~dp0"
net session >nul 2>&1
if errorlevel 1 (
  set "APTORA_CONTROL_PANEL=%~f0"
  powershell.exe -NoProfile -Command "Start-Process -FilePath $env:APTORA_CONTROL_PANEL -Verb RunAs" 2>nul
  exit /b %errorlevel%
)
title Aptora Server Control Panel
set "ENV_FILE=%ProgramData%\Aptora\aptora.env"

:menu
cls
echo ===========================================================
echo  APTORA SERVER CONTROL PANEL
echo ===========================================================
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0server-control.ps1" Status
echo.
echo  1. Start Server
echo  2. Stop Server
echo  3. Restart Server
echo  4. Open Public Application URL
echo  5. Enable Automatic Startup
echo  6. Disable Automatic Startup
echo  7. Reset Admin Password or 2FA
echo  8. Open Logs Folder
echo  9. Exit
echo ===========================================================
set /p "choice=Select an option [1-9]: "
if "%choice%"=="1" goto start_server
if "%choice%"=="2" goto stop_server
if "%choice%"=="3" goto restart_server
if "%choice%"=="4" goto open_app
if "%choice%"=="5" goto enable_startup
if "%choice%"=="6" goto disable_startup
if "%choice%"=="7" goto reset_admin
if "%choice%"=="8" start "" "%ProgramData%\Aptora\logs" & goto menu
if "%choice%"=="9" exit /b 0
goto menu

:start_server
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0server-control.ps1" Start
pause
goto menu

:stop_server
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0server-control.ps1" Stop
pause
goto menu

:restart_server
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0server-control.ps1" Restart
pause
goto menu

:enable_startup
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0server-control.ps1" EnableTask
pause
goto menu

:disable_startup
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0server-control.ps1" DisableTask
pause
goto menu

:open_app
for /f "usebackq tokens=1,* delims==" %%A in ("%ENV_FILE%") do if /i "%%A"=="PUBLIC_URL" set "APTORA_URL=%%B"
if defined APTORA_URL start "" "%APTORA_URL%"
goto menu

:reset_admin
for /f "usebackq tokens=1,* delims==" %%A in ("%ENV_FILE%") do set "%%A=%%B"
"%~dp0bin\node.exe" "%~dp0server\reset-admin.js"
pause
goto menu
