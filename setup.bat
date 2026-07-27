@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
title Aptora Windows Server Setup
color 0A

net session >nul 2>&1
if errorlevel 1 (
  echo ERROR: This setup must run with Administrator privileges.
  pause
  exit /b 1
)

set "DATA_DIR=%ProgramData%\Aptora"
set "ENV_FILE=%DATA_DIR%\aptora.env"
if exist "%DATA_DIR%\database.sqlite" (
  set "APTORA_DATA_DIR=%DATA_DIR%"
  "%~dp0bin\node.exe" "%~dp0server\has-admin.js" >nul 2>&1
  if not errorlevel 1 (
    echo ERROR: Aptora already has an administrator.
    echo Use Aptora Control Panel for the existing installation.
    pause
    exit /b 1
  )
)

set "APTORA_PORT=9372"
set "APTORA_SERVER_IP="
for /f "delims=" %%I in ('powershell.exe -NoProfile -Command "$configs=Get-NetIPConfiguration -ErrorAction SilentlyContinue; foreach($config in $configs){if($config.IPv4DefaultGateway -and $config.IPv4Address){$config.IPv4Address[0].IPAddress; break}}"') do if not defined APTORA_SERVER_IP set "APTORA_SERVER_IP=%%I"
if not defined APTORA_SERVER_IP (
  for /f "delims=" %%I in ('powershell.exe -NoProfile -Command "$addresses=[Net.Dns]::GetHostAddresses([Net.Dns]::GetHostName()); foreach($address in $addresses){if($address.AddressFamily -eq [Net.Sockets.AddressFamily]::InterNetwork -and -not $address.IPAddressToString.StartsWith('169.254.')){$address.IPAddressToString; break}}"') do if not defined APTORA_SERVER_IP set "APTORA_SERVER_IP=%%I"
)
if not defined APTORA_SERVER_IP set "APTORA_SERVER_IP=%COMPUTERNAME%"
set "PUBLIC_URL=http://%APTORA_SERVER_IP%:9372"

set "JWT_SECRET="
set "ENCRYPTION_KEY="
for /f "delims=" %%S in ('powershell.exe -NoProfile -Command "$rng=[Security.Cryptography.RandomNumberGenerator]::Create();$bytes=New-Object byte[] 32;$rng.GetBytes($bytes);$rng.Dispose();[BitConverter]::ToString($bytes).Replace('-','').ToLowerInvariant()"') do set "JWT_SECRET=%%S"
for /f "delims=" %%S in ('powershell.exe -NoProfile -Command "$rng=[Security.Cryptography.RandomNumberGenerator]::Create();$bytes=New-Object byte[] 24;$rng.GetBytes($bytes);$rng.Dispose();[Convert]::ToBase64String($bytes)"') do set "ENCRYPTION_KEY=%%S"
if not defined JWT_SECRET (
  echo ERROR: JWT secret generation failed.
  pause
  exit /b 1
)
if not defined ENCRYPTION_KEY (
  echo ERROR: Encryption key generation failed.
  pause
  exit /b 1
)

if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"
if not exist "%DATA_DIR%\logs" mkdir "%DATA_DIR%\logs"

>"%ENV_FILE%" (
  echo NODE_ENV=production
  echo PUBLIC_URL=%PUBLIC_URL%
  echo ALLOWED_ORIGINS=%PUBLIC_URL%
  echo JWT_SECRET=%JWT_SECRET%
  echo ENCRYPTION_KEY=%ENCRYPTION_KEY%
  echo TRUST_PROXY=false
  echo APTORA_LISTEN_HOST=0.0.0.0
  echo ALLOW_PUBLIC_NODE_BIND=true
  echo ALLOW_INSECURE_HTTP=true
  echo PORT=%APTORA_PORT%
  echo APTORA_DATA_DIR=%DATA_DIR%
  echo SESSION_LINK_TTL_HOURS=72
  echo RESULT_LINK_TTL_HOURS=168
  echo SESSION_SUBMIT_GRACE_SECONDS=30
  echo AUTH_RATE_LIMIT=15
  echo AUDIT_RETENTION_DAYS=180
)

icacls "%DATA_DIR%" /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" >nul
if errorlevel 1 (
  echo ERROR: Failed to secure the production data directory.
  pause
  exit /b 1
)

netsh advfirewall firewall delete rule name="Aptora Server (TCP 9372)" >nul 2>&1
netsh advfirewall firewall add rule name="Aptora Server (TCP 9372)" dir=in action=allow protocol=TCP localport=9372 profile=domain,private,public >nul
if errorlevel 1 (
  echo ERROR: Windows Firewall rule for TCP 9372 could not be created.
  pause
  exit /b 1
)

for /f "usebackq tokens=1,* delims==" %%A in ("%ENV_FILE%") do set "%%A=%%B"

echo.
echo ===========================================================
echo  Administrator and QR-based 2FA Setup
echo ===========================================================
"%~dp0bin\node.exe" "%~dp0server\setup-admin.js"
if errorlevel 1 (
  echo ERROR: Administrator setup failed.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0server-control.ps1" InstallTask
if errorlevel 1 (
  echo ERROR: Automatic startup task could not be installed.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0server-control.ps1" Start
if errorlevel 1 (
  echo ERROR: Aptora could not be started. Check "%DATA_DIR%\logs".
  pause
  exit /b 1
)

echo.
echo ===========================================================
echo  Aptora installation completed successfully
echo ===========================================================
echo Public URL: %PUBLIC_URL%
echo Data:       %DATA_DIR%
echo Logs:       %DATA_DIR%\logs
echo The application starts automatically when Windows starts.
echo ===========================================================
pause
exit /b 0
