@echo off
setlocal
cd /d "%~dp0"
net session >nul 2>&1
if errorlevel 1 (
  set "APTORA_LAUNCHER=%~f0"
  powershell.exe -NoProfile -Command "Start-Process -FilePath $env:APTORA_LAUNCHER -Verb RunAs" 2>nul
  exit /b %errorlevel%
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0server-control.ps1" Start
if errorlevel 1 pause & exit /b 1
for /f "usebackq tokens=1,* delims==" %%A in ("%ProgramData%\Aptora\aptora.env") do if /i "%%A"=="PUBLIC_URL" set "APTORA_URL=%%B"
if defined APTORA_URL start "" "%APTORA_URL%"
