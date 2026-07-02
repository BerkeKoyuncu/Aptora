@echo off
title Aptora Setup Builder
color 0E
cls
echo ===========================================================
echo            Aptora Setup Installer Builder                  
echo ===========================================================
echo.

:: Path to Inno Setup Compiler
set "ISCC_PATH=C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if not exist "%ISCC_PATH%" (
    set "ISCC_PATH=C:\Program Files\Inno Setup 6\ISCC.exe"
)
if not exist "%ISCC_PATH%" (
    for %%i in (ISCC.exe) do set "ISCC_PATH=%%~$PATH:i"
)

echo Checking Inno Setup 6 compiler...
if "%ISCC_PATH%"=="" (
    color 0C
    echo ERROR: Inno Setup 6 was not found on this system!
    echo Please download and install Inno Setup 6 from:
    echo https://jrsoftware.org/isdl.php
    echo.
    pause
    exit /b 1
)
if not exist "%ISCC_PATH%" (
    color 0C
    echo ERROR: Inno Setup 6 was not found at expected path!
    echo Path: "%ISCC_PATH%"
    echo Please install Inno Setup 6.
    echo.
    pause
    exit /b 1
)

echo Compiler found.
echo.

:: Build Client production bundle
echo [1/3] Building client production files...
call npm run build:client
if %errorlevel% neq 0 (
    color 0C
    echo ERROR: Client build failed! Cannot compile installer.
    pause
    exit /b 1
)
echo Client compiled.
echo.

:: Bundle Node.js binary
echo [2/3] Bundling portable Node.js binary...
if not exist "bin" mkdir bin
for %%i in (node.exe) do set "NODE_PATH=%%~$PATH:i"
if "%NODE_PATH%"=="" (
    if exist "C:\Program Files\nodejs\node.exe" set "NODE_PATH=C:\Program Files\nodejs\node.exe"
)
if exist "%NODE_PATH%" (
    echo Found Node.exe at: %NODE_PATH%
    copy /y "%NODE_PATH%" "bin\node.exe" >nul
    echo Node.js binary copied to bin\node.exe
) else (
    color 0C
    echo ERROR: node.exe was not found in your system path! Cannot build offline installer.
    pause
    exit /b 1
)
echo.

echo [3/3] Compiling AptoraSetup.exe (this will package all files)...
echo.

:: Run compiler
"%ISCC_PATH%" installer.iss

if %errorlevel% neq 0 (
    color 0C
    echo.
    echo ERROR: Compilation failed!
    pause
    exit /b 1
)

color 0A
echo.
echo ===========================================================
echo   🎉 SUCCESS: Installer AptoraSetup.exe created!
echo ===========================================================
echo You can find "AptoraSetup.exe" in this root folder.
echo Distribute this file to users for full Windows installation.
echo ===========================================================
echo.
pause
