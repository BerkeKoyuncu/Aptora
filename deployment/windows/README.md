# Windows deployment tooling

This directory contains every Windows-specific build, installation, startup, and server-control entry point.

## Build-time files

- `build-installer.bat` creates an isolated production staging area and compiles the offline installer.
- `installer.iss` defines the Inno Setup package.
- `sign-installer.ps1` signs the installer when a suitable certificate is available.

Run the build from the repository root with `npm run build:installer`. The release is written to `dist\AptoraSetup.exe`; temporary staging files are removed automatically.

## Files installed on the server

- `setup.bat` performs first-run configuration and administrator enrollment.
- `AptoraControlPanel.bat` provides the interactive server control panel.
- `server-control.ps1` manages health checks, startup, stop, restart, and the scheduled task.
- `run-backend.bat` starts the packaged backend under the scheduled task.
- `run.bat` starts Aptora and opens its configured public URL.

These runtime scripts are stored together here in source control but are copied to the installed application root so their established runtime paths remain unchanged.
