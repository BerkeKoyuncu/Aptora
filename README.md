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
│   └── server.js           # Server initializer
├── package.json            # Monorepo packages scripts configuration
└── .gitignore              # Global git ignore mappings
```

---

## ⚙️ Installation & Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v16+)
- npm (installed with Node)

### Step 1: Install Dependencies
From the project root directory, install all dependencies for both the frontend and backend:
```bash
# Install root script configurations
npm install

# Install server packages
cd server
npm install

# Install client packages
cd ../client
npm install
```

### Step 2: Build the Client
To bundle Vite's production client assets:
```bash
cd ../client
npm run build
```

---

## 🚀 Running the Application Locally

Aptora contains automation scripts configured in the root `package.json` to start both projects simultaneously.

From the project root:
```bash
# Run both Backend Server & Vite Client Development Server simultaneously
npm run dev
```

- **Frontend client url**: `http://localhost:5173`
- **Backend API url**: `http://localhost:5000`

---

## 🔒 Security Mappings & Database Seeds
The application seeds a default administrative account on the first initialization of `server/database.sqlite`:

- **Default Admin Account**:
  - **Username**: `admin`
  - **Password**: `admin123`

- **Default Standard User Account**:
  - **Username**: `user`
  - **Password**: `user123`
