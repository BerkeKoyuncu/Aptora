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
- **RBAC Privileges**: Separate Admin and Standard User actions.
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
- The database is stored in a single file (`server/database.sqlite`) which is automatically created, schema-mapped, and configured with your custom administrative user during the installation setup.

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

To distribute the application as a single **`AptoraSetup.exe`** wizard for Windows users:

### How to Create `AptoraSetup.exe` (For Developers):
1. Download and install **Inno Setup 6** (free compiler tool) from [Inno Setup Download Page](https://jrsoftware.org/isdl.php).
2. Double-click the **`build-installer.bat`** script in the project root.
3. The script will automatically trigger Inno Setup to pack the application source code and scripts into a single compiled installer named **`AptoraSetup.exe`** at the project root.
4. When you make code updates, simply run `build-installer.bat` again to output the updated installer file.

---

### How to Install & Run (For Users / Servers):
1. Copy the compiled **`AptoraSetup.exe`** file to the destination computer/server and run it.
2. The installation wizard will guide you through choosing a destination directory (e.g. `C:\Program Files\Aptora`).
3. **Auto-Post-Installation**: After copying files, a Command Prompt window will launch to:
   - Initialize the fresh SQLite database.
   - Run the custom interactive setup to configure your **Admin Username**, **Admin Email**, and **Admin Password** with forced 2FA security.
4. **Desktop Shortcuts Created**:
   - 🖥️ **Aptora Application**: Instantly opens `http://localhost:9372` in your default browser.
   - ⚙️ **Aptora Control Panel**: Opens a lightweight service control utility.
5. **Aptora Control Panel Features**:
   - **Start/Stop Server**: Run Node backend silently in the background (via VBScript to hide console windows) or terminate the process.
   - **Auto-Start on Logon**: Enable/disable automatic silent startup of the server when Windows boots up or wakes up.
   - **Diagnose status**: View real-time online/offline server port status.

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
