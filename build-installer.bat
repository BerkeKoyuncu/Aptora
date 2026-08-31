@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Aptora Offline Server Installer Builder

if not exist "version.txt" (
  echo ERROR: version.txt was not found.
  exit /b 1
)
set /p "APP_VERSION="<"version.txt"
echo %APP_VERSION%| findstr /r "^[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*$" >nul
if errorlevel 1 (
  echo ERROR: version.txt does not contain a valid semantic version.
  exit /b 1
)

set "ISCC_PATH=C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if not exist "%ISCC_PATH%" set "ISCC_PATH=C:\Program Files\Inno Setup 6\ISCC.exe"
if not exist "%ISCC_PATH%" for %%I in (ISCC.exe) do set "ISCC_PATH=%%~$PATH:I"
if not exist "%ISCC_PATH%" (
  echo ERROR: Inno Setup 6 compiler was not found.
  exit /b 1
)

for %%I in (node.exe) do set "SYSTEM_NODE=%%~$PATH:I"
if not defined SYSTEM_NODE if exist "C:\Program Files\nodejs\node.exe" set "SYSTEM_NODE=C:\Program Files\nodejs\node.exe"
if not exist "%SYSTEM_NODE%" (
  echo ERROR: Node.js 20.17 or newer was not found.
  exit /b 1
)

"%SYSTEM_NODE%" -e "const [major,minor]=process.versions.node.split('.').map(Number);if(major<20||(major===20&&minor<17))process.exit(1)"
if errorlevel 1 (
  echo ERROR: Node.js 20.17 or newer is required.
  exit /b 1
)

echo [1/6] Synchronizing application version %APP_VERSION%...
"%SYSTEM_NODE%" "scripts\sync-version.js"
if errorlevel 1 exit /b 1

echo [2/6] Installing deterministic production backend dependencies...
if not exist ".installer-npm-cache" mkdir ".installer-npm-cache"
if not exist "%CD%\server\package.json" (
  echo ERROR: Builder is not running from the Aptora workspace root.
  exit /b 1
)
if exist "%CD%\server\node_modules" rmdir /s /q "%CD%\server\node_modules"
call npm ci --prefix server --omit=dev --cache "%CD%\.installer-npm-cache"
if errorlevel 1 (
  echo ERROR: Backend dependency installation failed.
  exit /b 1
)

echo [3/6] Building the production frontend...
call npm run build --prefix client -- --outDir installer-dist --emptyOutDir
if errorlevel 1 exit /b 1

echo [4/6] Bundling the portable Node.js runtime...
if not exist "bin" mkdir "bin"
copy /y "%SYSTEM_NODE%" "bin\node.exe" >nul
if errorlevel 1 exit /b 1

echo [5/6] Verifying the packaged runtime...
"bin\node.exe" -e "require('./server/node_modules/sqlite3');require('./server/node_modules/express');require('./server/node_modules/exceljs');console.log('Runtime dependencies verified.')"
if errorlevel 1 exit /b 1

echo [6/6] Compiling AptoraSetup.exe...
"%ISCC_PATH%" "/DMyAppVersion=%APP_VERSION%" "installer.iss"
set "BUILD_RESULT=%ERRORLEVEL%"
if not "%BUILD_RESULT%"=="0" (
  if exist "client\installer-dist" rmdir /s /q "client\installer-dist"
  if exist ".installer-npm-cache" rmdir /s /q ".installer-npm-cache"
  echo ERROR: Installer compilation failed.
  exit /b %BUILD_RESULT%
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%CD%\sign-installer.ps1" -Path "%CD%\AptoraSetup.exe"
set "SIGN_RESULT=%ERRORLEVEL%"

if exist "client\installer-dist" rmdir /s /q "client\installer-dist"
if exist ".installer-npm-cache" rmdir /s /q ".installer-npm-cache"
if "%SIGN_RESULT%"=="1" (
  echo ERROR: Installer compilation succeeded, but digital signing failed.
  exit /b 1
)
if "%SIGN_RESULT%"=="2" echo WARNING: AptoraSetup.exe was built without a trusted digital signature.

echo ===========================================================
echo SUCCESS: AptoraSetup.exe is ready.
echo The installer contains Node.js, backend dependencies, and frontend assets.
echo ===========================================================
exit /b 0
