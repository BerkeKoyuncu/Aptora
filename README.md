# Aptora

Aptora is a Windows-oriented assessment and candidate grading application. It combines a React/Vite client, an Express API, and a local SQLite database in one deployable service.

## Repository structure

```text
.
|-- client/                  React frontend
|   |-- public/              Runtime branding assets
|   `-- src/                 Application source
|-- server/                  Express API, authentication, and SQLite schema
|-- scripts/                 Build/version helpers
|-- deployment/windows/      Installer, control panel, and Windows runtime scripts
|-- docs/                    Production and operations documentation
|-- dist/                    Generated release installers (ignored by Git)
`-- version.txt              Canonical application version
```

Dependencies, local databases, portable runtimes, frontend builds, and release artifacts are generated locally and excluded from source control.

## Development

Node.js 20.17 or newer is required on the development computer.

```powershell
npm run install:all
npm run dev
```

The development client runs through Vite and communicates with the local API. To validate a production frontend build:

```powershell
npm run build:client
```

## Windows production installer

Install Node.js 20.17 or newer and Inno Setup 6 on the build computer, then run either command:

```powershell
npm run build:installer
# or
.\deployment\windows\build-installer.bat
```

The builder uses an isolated `.build` staging directory. It does not delete or package the workspace's development dependencies. The output is `dist\AptoraSetup.exe` and contains only the compiled frontend, required backend production dependencies, SQLite native runtime, and a portable Node.js runtime. The destination Windows server does not need Node.js, npm, Git, or a separate database server.

Run the installer as Administrator on the destination server. It creates the first administrator with QR-based TOTP enrollment, writes protected runtime data under `%ProgramData%\Aptora`, opens TCP 9372, installs automatic startup, and starts the application.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for production configuration, security, operations, and verification steps.
