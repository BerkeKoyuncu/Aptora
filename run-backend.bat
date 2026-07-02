@echo off
cd /d "%~dp0"
if exist "bin\node.exe" (
    bin\node.exe server/server.js
) else (
    node server/server.js
)
