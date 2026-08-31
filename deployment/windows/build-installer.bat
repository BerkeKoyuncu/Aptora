@echo off
setlocal EnableExtensions DisableDelayedExpansion
for %%I in ("%~dp0..\..") do set "ROOT_DIR=%%~fI"
cd /d "%ROOT_DIR%"
title Aptora Offline Server Installer Builder

set "BUILD_DIR=%ROOT_DIR%\.build\installer"
set "BACKEND_STAGE=%BUILD_DIR%\server"
set "CLIENT_STAGE=%BUILD_DIR%\client\dist"
set "RUNTIME_STAGE=%BUILD_DIR%\bin"
set "NPM_CACHE=%ROOT_DIR%\.build\npm-cache"
set "RELEASE_DIR=%ROOT_DIR%\dist"

if not exist "%ROOT_DIR%\version.txt" (
  echo ERROR: version.txt was not found.
  exit /b 1
)
set /p "APP_VERSION="<"%ROOT_DIR%\version.txt"
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

if exist "%BUILD_DIR%" rmdir /s /q "%BUILD_DIR%"
mkdir "%BACKEND_STAGE%" "%CLIENT_STAGE%" "%RUNTIME_STAGE%" "%NPM_CACHE%" >nul
if errorlevel 1 (
  echo ERROR: Temporary installer staging directories could not be created.
  goto :fail
)

echo [1/7] Synchronizing application version %APP_VERSION%...
"%SYSTEM_NODE%" "%ROOT_DIR%\scripts\sync-version.js"
if errorlevel 1 goto :fail

echo [2/7] Staging production-only backend dependencies...
copy /y "%ROOT_DIR%\server\package.json" "%BACKEND_STAGE%\package.json" >nul
copy /y "%ROOT_DIR%\server\package-lock.json" "%BACKEND_STAGE%\package-lock.json" >nul
call npm ci --prefix "%BACKEND_STAGE%" --omit=dev --cache "%NPM_CACHE%"
if errorlevel 1 (
  echo ERROR: Production backend dependency staging failed.
  goto :fail
)

echo [3/7] Ensuring frontend development dependencies are available...
call npm ci --prefix "%ROOT_DIR%\client" --cache "%NPM_CACHE%"
if errorlevel 1 (
  echo ERROR: Frontend dependency installation failed.
  goto :fail
)

echo [4/7] Building the production frontend into staging...
call npm run build --prefix "%ROOT_DIR%\client" -- --outDir "%CLIENT_STAGE%" --emptyOutDir
if errorlevel 1 goto :fail

echo [5/7] Staging the portable Node.js runtime...
copy /y "%SYSTEM_NODE%" "%RUNTIME_STAGE%\node.exe" >nul
if errorlevel 1 goto :fail

echo [6/7] Verifying the staged runtime...
pushd "%BUILD_DIR%"
"%RUNTIME_STAGE%\node.exe" -e "require('./server/node_modules/sqlite3');require('./server/node_modules/express');require('./server/node_modules/exceljs');console.log('Runtime dependencies verified.')"
set "VERIFY_RESULT=%ERRORLEVEL%"
popd
if not "%VERIFY_RESULT%"=="0" goto :fail

echo [7/7] Compiling AptoraSetup.exe...
if not exist "%RELEASE_DIR%" mkdir "%RELEASE_DIR%"
"%ISCC_PATH%" "/DMyAppVersion=%APP_VERSION%" "/DSourceRoot=%ROOT_DIR%" "/DBuildRoot=%BUILD_DIR%" "/DReleaseDir=%RELEASE_DIR%" "%~dp0installer.iss"
if errorlevel 1 (
  echo ERROR: Installer compilation failed.
  goto :fail
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0sign-installer.ps1" -Path "%RELEASE_DIR%\AptoraSetup.exe"
set "SIGN_RESULT=%ERRORLEVEL%"
if "%SIGN_RESULT%"=="1" (
  echo ERROR: Installer compilation succeeded, but digital signing failed.
  goto :fail
)

if exist "%BUILD_DIR%" rmdir /s /q "%BUILD_DIR%"
if exist "%ROOT_DIR%\.build" rmdir /s /q "%ROOT_DIR%\.build"
if "%SIGN_RESULT%"=="2" echo WARNING: dist\AptoraSetup.exe was built without a trusted digital signature.

echo ===========================================================
echo SUCCESS: dist\AptoraSetup.exe is ready.
echo Only production runtime dependencies are included.
echo Development dependencies remain available in the workspace.
echo ===========================================================
exit /b 0

:fail
if exist "%BUILD_DIR%" rmdir /s /q "%BUILD_DIR%"
if exist "%ROOT_DIR%\.build" rmdir /s /q "%ROOT_DIR%\.build"
exit /b 1
