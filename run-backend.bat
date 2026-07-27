@echo off
setlocal
cd /d "%~dp0"
set "ENV_FILE=%ProgramData%\Aptora\aptora.env"
if not exist "%ENV_FILE%" (
  echo ERROR: Production configuration was not found at "%ENV_FILE%".
  exit /b 1
)
for /f "usebackq tokens=1,* delims==" %%A in ("%ENV_FILE%") do set "%%A=%%B"
if not exist "%ProgramData%\Aptora\logs" mkdir "%ProgramData%\Aptora\logs"
"%~dp0bin\node.exe" "%~dp0server\server.js" 1>>"%ProgramData%\Aptora\logs\server-out.log" 2>>"%ProgramData%\Aptora\logs\server-error.log"
exit /b %errorlevel%
