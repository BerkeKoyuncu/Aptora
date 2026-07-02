@echo off
title Aptora Setup Wizard for Windows
color 0A
cls
echo ===========================================================
echo            Aptora Installer and Setup Wizard               
echo ===========================================================
echo.

:: Clean legacy database for a fresh setup
echo [1/2] Initializing database environment...
if exist "server\database.sqlite" (
    echo Deleting existing default database...
    del /q "server\database.sqlite"
)
echo Database environment ready.
echo.

:: Run Administrative account setup using the bundled Node.js executable
echo [2/2] Configuring custom Administrator account...
if exist "bin\node.exe" (
    bin\node.exe server/setup-admin.js
) else (
    node server/setup-admin.js
)
if %errorlevel% neq 0 (
    color 0C
    echo ERROR: Administrative setup failed!
    pause
    exit /b 1
)
echo.

color 0B
echo ===========================================================
echo       INSTALLATION AND SETUP COMPLETED SUCCESSFULLY!        
echo ===========================================================
echo.
echo  - Port Configuration: Port 9372 is assigned.
echo  - The application is self-contained. No external Node.js required.
echo.
echo  - To start the server, simply use the created Desktop/Start Menu
echo    shortcuts, or double-click "run.bat" inside this folder:
echo      %~dp0
echo.
echo  - To access the app, open your browser and navigate to:
echo      http://localhost:9372
echo ===========================================================
echo.
pause
