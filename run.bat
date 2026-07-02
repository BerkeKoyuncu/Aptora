@echo off
title Aptora Server
cd /d "%~dp0"
echo Starting Aptora Server...
echo The application is hosted at: http://localhost:9372
echo.
start http://localhost:9372
if exist "bin\node.exe" (
    bin\node.exe server/server.js
) else (
    node server/server.js
)
pause
