# Aptora - Test & Candidate Grading Management System

Aptora is a premium, secure monorepo application designed to manage automated exam generation, candidate invitations, and cybersecurity/networking grading analytics. It features robust Role-Based Access Control (RBAC), multi-factor authentication (2FA/TOTP), interactive sorting and filtering, and bulk question import/deletion flows.

---

## 🌟 Key Features

### 1. Advanced Test Generation & Runner
- **Randomized Drawing**: Dynamically draw test questionnaires based on selected domains, difficulty levels, and point distributions.
- **Manual Construction**: Hand-pick questions to form static exam sheets.
- **Dynamic Assessment Runner**: Seamless candidate interface to take tests online, tracking remaining time and submission status.

### 2. Bulk Question Import (Excel & JSON)
- **Validation-Embedded Excel Templates**: Auto-generates and downloads `.xlsx` templates preloaded with data verification constraints (dropdown selections for domain and difficulty) to guarantee schema-valid data.
- **Multi-locale CSV Delimiter Detection**: Smart scanner supporting Turkish/European semicolon (`;`) format as well as standard comma (`,`) delimiters.
- **Live Preview & Validation Engine**: Upload preview screens detailing valid/invalid questions before database insertion, safely filtering out empty rows.

### 3. Select-All & Bulk Deletion (Premium Admin UI)
- Integrated transaction-safe bulk delete handlers across all list views:
  - **Questions Table** (Admin custom delete)
  - **User Accounts** (Safely preventing self-deletion)
  - **Test Configurations** (Automatically cleans up child sessions)
  - **Test Execution History** (Permission-controlled bulk purge)
  - **Virtual Mailbox Outbox** (Simulated e-mail logs clean up)

### 4. Security & Authentication
- **Temporary Candidate Accounts**: Administrators create candidate access with an email address and freely chosen password, and can review or update active credentials from execution history. Candidates sign in from the standard login page, can review detailed results immediately after submission, and then their account is removed while the result remains available to administrators.
- **Per-Administrator SMTP**: Every administrator maintains an independent SMTP configuration.
- **Candidate Email Delivery**: Creating candidate access generates a separate E-Data subject and an editable Arial email body containing credentials, dynamic assessment instructions, and a generic session-link placeholder. After replacing the placeholder, the administrator can send it through their own SMTP configuration; the HTML email includes the standard color E-Data logo.
- **Two-Factor Authentication (2FA)**: Standard TOTP activation via QR code for Microsoft/Google Authenticator integration.

---

## 📂 Project Architecture

```
Aptora/
├── client/                 # React + Vite Frontend App
│   ├── src/
│   │   ├── components/     # UI Panel components (QuestionDb, VirtualMailbox, etc.)
│   │   ├── api.js          # Unified axios API connector
│   │   └── index.css       # Premium custom global styling with Light/Dark themes
│   └── vite.config.js
├── server/                 # Express.js + SQLite3 Backend App
│   ├── database.sqlite     # SQLite local relational database (git-ignored)
│   ├── db.js               # Database schema definition and seed scripts
│   ├── routes.js           # API route handlers & validators
│   ├── setup-admin.js      # Custom admin account setup CLI script
│   └── server.js           # Server initializer
├── setup.bat               # Windows offline installer script
├── run.bat                 # Desktop/Shortcut launcher script
├── installer.iss           # Inno Setup installation compiler schema
├── build-installer.bat     # One-click Windows setup builder
├── package.json            # Monorepo packages scripts configuration
└── .gitignore              # Global git ignore mappings
```

## 📦 Database Advantage (Zero Setup)
Aptora uses **SQLite3** as its database engine.
- **No MySQL, PostgreSQL, or SQL Server installation required.**
- The Windows server installer stores the database in `%ProgramData%\Aptora\database.sqlite`; it is created and schema-mapped automatically during first-time setup.

---

## ⚙️ Step-by-Step Installation from Scratch

If you are setting up on a brand new computer or server where nothing is installed:

### 1. Install Node.js (Runtime Environment)
Aptora requires Node.js v16 or newer (v18 or v20 is recommended).

- **Windows Server / Desktop**:
  1. Download and run the Windows Installer from [Node.js Official Website](https://nodejs.org/).
  2. Follow the wizard steps (accept defaults, check the option to install tools for native modules if prompted).
  3. Open Command Prompt / PowerShell and verify:
     ```bash
     node -v
     npm -v
     ```

- **macOS**:
  - Install using the macOS Installer from the website, or via Homebrew:
    ```bash
    brew install node
    ```

- **Linux / Ubuntu Server**:
  Run the following commands in your SSH terminal to install Node.js v20:
  ```bash
  # Update package list and install prerequisites
  sudo apt update
  sudo apt install -y curl dirmngr apt-transport-https lsb-release ca-certificates

  # Add NodeSource official repository
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

  # Install Node.js
  sudo apt install -y nodejs

  # Verify installation
  node -v
  npm -v
  ```

---

### 2. Download Project & Install Dependencies

1. Download the code to the server (either via `git clone` or extracting a ZIP archive).
2. Open terminal/command prompt, navigate to the `Aptora` directory, and run the automated dependency script:
   ```bash
   # Navigates to the directory (e.g. on Linux)
   cd /path/to/Aptora

   # Installs dependencies for root, client, and server in one single command
   npm run install:all
   ```

---

## ⚡ Windows Setup.exe Installer Compilation & Setup

`AptoraSetup.exe` is an offline, single-file deployment package for the Windows server. Candidate computers do not install Aptora; candidates use the standard Aptora login page (and Safe Exam Browser when a session requires it).

### How to Create `AptoraSetup.exe` (For Developers):
1. On the build computer, install Node.js 20.17 or newer and **Inno Setup 6**.
2. Run **`build-installer.bat`** in the project root while internet access is available for dependency installation.
3. The builder performs clean production dependency installation, builds the client, bundles the exact Node runtime and native SQLite module, then creates **`AptoraSetup.exe`** in the project root.
4. Re-run the builder after code or dependency changes. The destination server does not need Node.js, npm, Git, a database server, or internet access for package installation.

---

### How to Install & Run (For Users / Servers):
1. Give the Windows server a fixed/reachable IP address.
2. Copy **`AptoraSetup.exe`** to the Windows server and run it as Administrator.
3. Setup detects the active server IPv4 address automatically and configures `http://SERVER_IP:9372`.
4. Create the first administrator. This is the first interactive screen. Setup displays a QR code, and it will not create the account until a valid current authenticator code is entered.
5. Setup generates production secrets, secures `%ProgramData%\Aptora`, creates the SQLite database, opens TCP 9372 in Windows Firewall, installs the automatic startup task, and starts the application on `0.0.0.0:9372`.
6. Use **Aptora Control Panel** to start, stop, restart, open the public URL, enable/disable startup, reset an administrator password or 2FA, and open logs.

Application updates preserve `%ProgramData%\Aptora`. Uninstall also leaves that directory intact so the database, configuration, and logs are not accidentally destroyed. The installer removes its Windows Firewall rule on uninstall. Router/NAT forwarding, upstream firewall policy, OS patching, backups, and optional future DNS/TLS configuration remain server-infrastructure responsibilities.

---

## 🚀 How to Run the Application

Depending on whether you are running locally for testing or deploying to a production server, choose one of the scenarios below:

### Scenario A: Development Mode (Local Testing)
Runs the React frontend (`http://localhost:5173`) and Express backend (`http://localhost:9372`) concurrently. Hot-reloads active components on edit.

From the project root:
```bash
npm run dev
```

---

### Scenario B: Production Mode (Server Deployment)
In production, the Express backend serves the React frontend statically. You only need to run a **single process** on port 9372 to host the entire website and API.

1. **Build the Frontend Assets**:
   Compile Vite's React bundle into optimized static files:
   ```bash
   npm run build:client
   ```
   This generates the files inside `client/dist`.

2. **Start the Production Web Server**:
   Start the Node server:
   ```bash
   npm start
   ```
   The application is now hosted and accessible at `http://YOUR_SERVER_IP:9372`.

---

## 🔄 Keeping the Server Running 24/7 (Production Deployment)

On Linux/Ubuntu servers, if you close your SSH terminal, the Node application will stop. Use **PM2** (Process Manager) to keep the app running in the background, auto-restart on crashes, and launch on server reboots.

1. **Install PM2 globally**:
   ```bash
   sudo npm install -g pm2
   ```

2. **Start the Aptora process**:
   From the project root:
   ```bash
   pm2 start server/server.js --name "aptora"
   ```

3. **Configure Auto-Start on System Boot**:
   ```bash
   # Generate startup scripts
   pm2 startup

   # (Copy and run the command printed by the command above in your terminal)

   # Save the current process list so it restarts on reboot
   pm2 save
   ```

4. **Useful PM2 Commands**:
   - View running logs: `pm2 logs aptora`
   - Check status: `pm2 status`
   - Restart server: `pm2 restart aptora`
   - Stop server: `pm2 stop aptora`

---

## 🔒 Security Configuration & Default Accounts
- **No default users**: The database is created completely empty.
- **Custom Administrator**: Created interactively during installation.
- **Forced 2FA**: The initial administrator has two-factor authentication enforced on creation. Add the printed Secret Key to your Authenticator app (e.g. Google Authenticator) to obtain 6-digit login codes.
- **Accessing the App**: Open browser at `http://localhost:9372`.
